#!/usr/bin/env bash
# Pedido do dono (11/11/2026): sempre que a Valve lançar atualização do CS2, o servidor atualiza sozinho. Sem isso, quem
# já atualizou o jogo recebe "O seu cliente está desatualizado" e não entra.
# Roda pelo cron, como root, a cada 15 minutos. Partida do mix em andamento: espera ela acabar e tenta na próxima.
set -euo pipefail

INF=${INF:-/home/cs2/server/game/csgo/steam.inf}
TRAVA=${TRAVA:-/run/magnatas-atualizar-cs2.lock}
CONFIG_DO_EMAIL=${CONFIG_DO_EMAIL:-/root/.magnatas-backup.env}

# Duas rodadas ao mesmo tempo baixariam a atualização duas vezes por cima uma da outra.
exec 9>"$TRAVA"
flock -n 9 || exit 0

banco() { sudo -u postgres psql -tA magnatas -c "$1"; }

# O aviso "servidores em manutenção" do site (dono, 11/11/2026): ligado sozinho por aqui, apaga sozinho quando o
# servidor de partidas volta a ficar de pé. O ligado na mão pelo Adm fica como está.
aviso=$(banco "select ligada and automatica from manutencao_dos_servidores where id = 1" 2>/dev/null | tr -d '[:space:]' || true)
if [ "$aviso" = "t" ] && sudo -u cs2 tmux has-session -t cs2 2>/dev/null; then
  banco "update manutencao_dos_servidores set ligada = false, desde = now() where id = 1 and automatica" >/dev/null
  echo "$(date '+%F %T') servidores de volta: aviso de manutenção apagado"
fi

versao=$(sed -n 's/^PatchVersion=//p' "$INF" | tr -d '\r')
[ -n "$versao" ] || { echo "$(date '+%F %T') sem PatchVersion em $INF" >&2; exit 1; }

# Steam fora do ar não é motivo para mexer em nada.
resposta=$(curl -fsS --max-time 20 "https://api.steampowered.com/ISteamApps/UpToDateCheck/v1/?appid=730&version=$versao") || exit 0
printf '%s' "$resposta" | grep -q '"up_to_date":false' || exit 0

em_jogo=$(banco "select count(*) from partidas where estado in ('aguardando_servidor', 'carregando', 'aguardando_jogadores', 'ao_vivo')" | tr -d '[:space:]')
if [ "${em_jogo:-0}" != "0" ]; then
  echo "$(date '+%F %T') há atualização do CS2, esperando a partida do mix acabar"
  exit 0
fi

# Os servidores da Diversão ligados agora voltam ligados depois, já com o jogo novo.
ligados=$(sudo -u cs2 tmux list-sessions -F '#S' 2>/dev/null | sed -n 's/^diversao-//p' || true)

echo "$(date '+%F %T') atualizando o CS2 da versão $versao"
# Em 11/11/2026 a atualização travou porque cfg e addons tinham outro dono e a Steam não conseguia gravar neles.
chown cs2:cs2 /home/cs2/server/game/csgo/cfg /home/cs2/server/game/csgo/addons /home/cs2/server/game/csgo/addons/metamod 2>/dev/null || true
resultado="ok"
if ! sudo -u cs2 bash /home/cs2/bin/atualizar_cs2.sh; then
  resultado="falhou"
fi
for nome in $ligados; do
  sudo -u cs2 bash /home/cs2/bin/desligar_diversao.sh "$nome" || true
  sudo -u cs2 bash /home/cs2/bin/ligar_diversao.sh "$nome" || resultado="falhou"
done
nova=$(sed -n 's/^PatchVersion=//p' "$INF" | tr -d '\r')
echo "$(date '+%F %T') CS2 de $versao para $nova: $resultado"
if [ "$resultado" != "ok" ]; then
  banco "insert into manutencao_dos_servidores (id, ligada, automatica, motivo, desde) values (1, true, true, 'O CS2 foi para a versão $nova e os plugins ainda não voltaram', now()) on conflict (id) do update set ligada = true, automatica = true, motivo = excluded.motivo, desde = now(), ator_id = null" >/dev/null || true
fi

# Aviso por e-mail para o dono, no mesmo endereço da cópia do banco.
# Sem e-mail configurado, a saída ainda diz se deu certo, para o registro do cron.
[ -f "$CONFIG_DO_EMAIL" ] || { [ "$resultado" = "ok" ]; exit; }
# shellcheck disable=SC1090
source "$CONFIG_DO_EMAIL"
if [ "$resultado" = "ok" ]; then
  ASSUNTO="CS2 atualizado para $nova"
  CORPO="A Valve lançou uma atualização do CS2 e o servidor do Magnatas atualizou sozinho: $versao para $nova. Servidores da Diversão religados: ${ligados:-nenhum}."
else
  ASSUNTO="ATENÇÃO: a atualização do CS2 falhou"
  CORPO="A Valve lançou uma atualização do CS2 ($versao), mas algo falhou ao atualizar ou religar os servidores. Versão agora: $nova. Peça para conferir."
fi
assunto_codificado() { printf '=?UTF-8?B?%s?=' "$(printf '%s' "$1" | base64 -w0)"; }
{
  echo "From: Magnatas do CS <$SMTP_USUARIO>"
  echo "To: $EMAIL_DESTINO"
  echo "Subject: $(assunto_codificado "$ASSUNTO")"
  echo "MIME-Version: 1.0"
  echo "Content-Type: text/plain; charset=UTF-8"
  echo "Content-Transfer-Encoding: base64"
  echo
  printf '%s\n' "$CORPO" | base64
} | msmtp -C /etc/magnatas-msmtprc -t || echo "$(date '+%F %T') o aviso por e-mail não saiu" >&2
[ "$resultado" = "ok" ]
