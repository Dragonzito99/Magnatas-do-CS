#!/usr/bin/env bash
# Atualiza o CS2 e reaplica o Metamod, porque a atualização restaura o gameinfo.gi.
# Uso: sudo -u cs2 bash /home/cs2/bin/atualizar_cs2.sh
set -euo pipefail

CASA=/home/cs2
SERVIDOR=$CASA/server

if [ "$(id -un)" != "cs2" ]; then
  echo "Rode como o usuário cs2." >&2
  exit 1
fi

if tmux has-session -t cs2 2>/dev/null; then
  tmux send-keys -t cs2 "quit" Enter
  for _ in $(seq 1 30); do
    tmux has-session -t cs2 2>/dev/null || break
    sleep 1
  done
  tmux kill-session -t cs2 2>/dev/null || true
fi

"$CASA/steamcmd/steamcmd.sh" +force_install_dir "$SERVIDOR" +login anonymous +app_update 730 validate +quit
python3 "$CASA/bin/gameinfo.py" "$SERVIDOR/game/csgo/gameinfo.gi"
bash "$CASA/bin/iniciar_cs2.sh"

echo "Confira no console (tmux attach -t cs2) se 'meta list' mostra o CounterStrikeSharp."
