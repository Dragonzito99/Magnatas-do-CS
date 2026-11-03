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
  exec game/bin/linuxsteamrt64/cs2 -dedicated -condebug -port 27015 \
    +game_type 0 +game_mode 1 +map de_mirage \
    +sv_setsteamaccount "$GSLT" +sv_password "$SV_PASSWORD" \
    +tv_enable 1 +tv_delay 0 +exec server.cfg
fi

if tmux has-session -t cs2 2>/dev/null; then
  echo "O servidor já está rodando. Console: tmux attach -t cs2"
  exit 0
fi

if [ ! -f "$SEGREDOS" ]; then
  echo "Crie $SEGREDOS com GSLT e SV_PASSWORD, com permissão 600." >&2
  exit 1
fi

if [ "$(stat -c %a "$SEGREDOS")" != "600" ]; then
  echo "$SEGREDOS precisa ter permissão 600." >&2
  exit 1
fi

# shellcheck disable=SC1090
source "$SEGREDOS"
if [ -z "${GSLT:-}" ] || [ -z "${SV_PASSWORD:-}" ]; then
  echo "$SEGREDOS precisa definir GSLT e SV_PASSWORD." >&2
  exit 1
fi

tmux new-session -d -s cs2 "bash $(printf %q "${BASH_SOURCE[0]}") --executar"
echo "Servidor iniciado. Console: tmux attach -t cs2. Para sair sem desligar: Ctrl+B e depois D."
