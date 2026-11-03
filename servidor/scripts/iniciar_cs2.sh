#!/usr/bin/env bash
# Inicia o servidor de CS2 na sessão tmux "cs2". O console abre com: tmux attach -t cs2
# Uso: sudo -u cs2 bash /home/cs2/bin/iniciar_cs2.sh
set -euo pipefail

CASA=/home/cs2
SERVIDOR=$CASA/server
SEGREDOS=$CASA/cs2.env

if [ "$(id -un)" != "cs2" ]; then
  echo "Rode como o usuário cs2." >&2
  exit 1
fi

if [ "${1:-}" = "--executar" ]; then
  # shellcheck disable=SC1090
  source "$SEGREDOS"
  cd "$SERVIDOR"
  CONTA=()
  [ -n "${GSLT:-}" ] && CONTA=(+sv_setsteamaccount "$GSLT")
  # Sem -ip, o RCON escuta no endereço do nome da máquina, que no Linux costuma ser 127.0.1.1.
  [ -n "${RCON_PASSWORD:-}" ] && CONTA+=(-usercon -ip "${CS2_IP:-0.0.0.0}" +rcon_password "$RCON_PASSWORD")
  exec game/cs2.sh -dedicated -condebug -port 27015 \
    +game_type 0 +game_mode 1 +map de_mirage \
    "${CONTA[@]}" +sv_password "$SV_PASSWORD" \
    +tv_enable 1 +tv_delay 0 +tv_password "$(head -c 16 /dev/urandom | od -An -tx1 | tr -d ' \n')" +exec server.cfg
fi

if tmux has-session -t cs2 2>/dev/null; then
  echo "O servidor já está rodando. Console: tmux attach -t cs2"
  exit 0
fi

if [ ! -f "$SEGREDOS" ]; then
  echo "Crie $SEGREDOS com SV_PASSWORD e GSLT, com permissão 600." >&2
  exit 1
fi

if [ "$(stat -c %a "$SEGREDOS")" != "600" ]; then
  echo "$SEGREDOS precisa ter permissão 600." >&2
  exit 1
fi

# shellcheck disable=SC1090
source "$SEGREDOS"
if [ -z "${SV_PASSWORD:-}" ]; then
  echo "$SEGREDOS precisa definir SV_PASSWORD." >&2
  exit 1
fi
if [ -z "${GSLT:-}" ]; then
  echo "Aviso: sem GSLT, o servidor entra em modo anônimo. Use só em testes locais." >&2
fi

# A atualização do CS2 restaura o gameinfo.gi, e sem o Metamod a lista de membros deixa de valer.
if [ -d "$SERVIDOR/game/csgo/addons/metamod" ]; then
  python3 "$CASA/bin/gameinfo.py" "$SERVIDOR/game/csgo/gameinfo.gi"
fi

tmux new-session -d -x 200 -y 50 -s cs2 "bash $(printf %q "${BASH_SOURCE[0]}") --executar"
echo "Servidor iniciado. Console: tmux attach -t cs2. Para sair sem desligar: Ctrl+B e depois D."
