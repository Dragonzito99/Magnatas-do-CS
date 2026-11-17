#!/usr/bin/env bash
# Pedido do dono (16/11/2026): reiniciar os servidores sozinho. O CS2 ligado direto por uns 3 dias perde precisão no
# relógio e o jogo fica em câmera lenta (a Mutação chegou a 3 dias e 5 horas). Roda pelo cron, como root, a cada 30 min.
#   - vazio, ligado há 20 h ou mais, entre 4h e 6h59: reinicia (o reinício de todo dia);
#   - vazio, ligado há 48 h ou mais: reinicia em qualquer hora;
#   - com gente, ligado há 66 h ou mais: avisa no chat, espera 5 minutos e reinicia.
# Nunca derruba partida do mix em andamento. A Ilha Lemnos com gente fica por conta do próprio plugin (o kit de quem
# está em campo precisa voltar para o baú antes).
set -euo pipefail
export LANG=C.UTF-8

TRAVA=${TRAVA:-/run/magnatas-reiniciar.lock}
AGORA=${AGORA:-$(date +%s)}
HORA=${HORA:-$(date +%H)}
ESPERA_DO_STATUS=${ESPERA_DO_STATUS:-2}
ESPERA_DO_AVISO=${ESPERA_DO_AVISO:-240}
ESPERA_DO_ULTIMO_AVISO=${ESPERA_DO_ULTIMO_AVISO:-60}

HORAS=3600
DIARIO=$((20 * HORAS))
VAZIO_A_QUALQUER_HORA=$((48 * HORAS))
COM_GENTE=$((66 * HORAS))

# Duas rodadas ao mesmo tempo reiniciariam o mesmo servidor duas vezes.
exec 9>"$TRAVA"
flock -n 9 || exit 0

registro() { echo "$(date '+%F %T') $*"; }
banco() { sudo -u postgres psql -tA magnatas -c "$1"; }
tmux_cs2() { sudo -u cs2 tmux "$@"; }

# Quantas pessoas estão no servidor, pelo "status" do console. Vazio quando não deu para ler.
gente_em() {
  tmux_cs2 send-keys -t "$1" "status" Enter >/dev/null 2>&1 || return 0
  sleep "$ESPERA_DO_STATUS"
  tmux_cs2 capture-pane -p -t "$1" -S -40 2>/dev/null | sed -n 's/^players *: *\([0-9][0-9]*\) humans.*/\1/p' | tail -1
}

avisar() { tmux_cs2 send-keys -t "$1" -l "say $2" >/dev/null 2>&1 && tmux_cs2 send-keys -t "$1" Enter >/dev/null 2>&1 || true; }

reiniciar() {
  local sessao=$1
  if [ "$sessao" = "cs2" ]; then
    tmux_cs2 send-keys -t cs2 "quit" Enter || true
    for _ in $(seq 1 30); do
      tmux_cs2 has-session -t cs2 2>/dev/null || break
      sleep 1
    done
    tmux_cs2 kill-session -t cs2 2>/dev/null || true
    sudo -u cs2 bash /home/cs2/bin/iniciar_cs2.sh
  else
    local nome=${sessao#diversao-}
    sudo -u cs2 bash /home/cs2/bin/desligar_diversao.sh "$nome"
    sudo -u cs2 bash /home/cs2/bin/ligar_diversao.sh "$nome"
  fi
}

sessoes=$(tmux_cs2 list-sessions -F '#S #{session_created}' 2>/dev/null || true)
[ -n "$sessoes" ] || exit 0

# O servidor de partidas sobe primeiro: os da Diversão precisam dele de pé para religar.
ordenadas=$(printf '%s\n' "$sessoes" | awk '$1 == "cs2" { print; next } { resto = resto $0 "\n" } END { printf "%s", resto }')

# O laço lê pelo descritor 3: o tmux e o sudo de dentro não podem comer a lista.
while read -r -u 3 sessao criada; do
  [ -n "$sessao" ] || continue
  [ "$sessao" = "cs2" ] || [[ "$sessao" == diversao-* ]] || continue
  ligado=$((AGORA - criada))
  [ "$ligado" -ge "$DIARIO" ] || continue

  if [ "$sessao" = "cs2" ]; then
    em_jogo=$(banco "select count(*) from partidas where estado in ('aguardando_servidor', 'carregando', 'aguardando_jogadores', 'ao_vivo')" 2>/dev/null | tr -d '[:space:]' || true)
    if [ "${em_jogo:-1}" != "0" ]; then
      registro "$sessao ligado há $((ligado / HORAS)) h, mas tem partida do mix: fica para depois"
      continue
    fi
  fi

  gente=$(gente_em "$sessao")
  if [ "$gente" = "0" ]; then
    if [ "$ligado" -ge "$VAZIO_A_QUALQUER_HORA" ] || { [ "$((10#$HORA))" -ge 4 ] && [ "$((10#$HORA))" -lt 7 ]; }; then
      registro "$sessao vazio e ligado há $((ligado / HORAS)) h: reiniciando"
      reiniciar "$sessao" || registro "$sessao: o reinício falhou"
    fi
    continue
  fi

  [ "$ligado" -ge "$COM_GENTE" ] || continue
  if [ "$sessao" = "diversao-ilha-lemnos" ]; then
    registro "$sessao ligado há $((ligado / HORAS)) h com gente: o plugin da ilha reinicia às 5h"
    continue
  fi
  registro "$sessao ligado há $((ligado / HORAS)) h com ${gente:-?} pessoas: avisando e reiniciando em 5 minutos"
  avisar "$sessao" "O servidor vai reiniciar em 5 minutos para não ficar lento. É só entrar de novo."
  sleep "$ESPERA_DO_AVISO"
  avisar "$sessao" "O servidor reinicia em 1 minuto."
  sleep "$ESPERA_DO_ULTIMO_AVISO"
  reiniciar "$sessao" || registro "$sessao: o reinício falhou"
done 3<<< "$ordenadas"
