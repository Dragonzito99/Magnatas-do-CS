#!/usr/bin/env bash
# Chamado pelo site (usuário magnatas, via sudo) para desligar um servidor da Diversão que ficou vazio.
# Uso: sudo -n -u cs2 /home/cs2/bin/desligar_diversao.sh <nome>
set -euo pipefail

NOME=${1:-}

if [ "$(id -un)" != "cs2" ]; then
  echo "Rode como o usuário cs2." >&2
  exit 1
fi

# O nome vem do banco do site, mas é conferido de novo aqui antes de virar caminho ou comando.
if ! [[ "$NOME" =~ ^[a-z0-9-]{1,32}$ ]] || [ ! -f "/home/cs2/bin/diversao/$NOME.conf" ]; then
  echo "Servidor desconhecido." >&2
  exit 1
fi

cd /home/cs2

# Já desligado não é erro.
if ! tmux has-session -t "diversao-$NOME" 2>/dev/null; then
  exit 0
fi

tmux kill-session -t "diversao-$NOME"
