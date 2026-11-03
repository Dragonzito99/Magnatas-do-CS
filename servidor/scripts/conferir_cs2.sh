#!/usr/bin/env bash
# Confere se a lista de membros está valendo depois de iniciar o servidor. Se não estiver, desliga o servidor.
# Uso: sudo -u cs2 bash /home/cs2/bin/conferir_cs2.sh
set -uo pipefail

CONFIG=/home/cs2/server/game/csgo/cfg/MatchZy/config.cfg

desligar() {
  echo "ERRO: $1 O servidor foi desligado para não ficar aberto." >&2
  tmux send-keys -t cs2 "quit" Enter 2>/dev/null
  sleep 5
  tmux kill-session -t cs2 2>/dev/null
  exit 1
}

for _ in $(seq 1 60); do
  tmux has-session -t cs2 2>/dev/null || desligar "o servidor não está rodando."
  tmux send-keys -t cs2 "css_plugins list" Enter
  sleep 3
  if tmux capture-pane -p -S -60 -t cs2 | grep 'LOADED' | grep -q 'MatchZy'; then
    if [ "$(grep -E '^matchzy_whitelist_enabled_default' "$CONFIG" | tail -1 | awk '{print $2}')" != "true" ]; then
      desligar "a lista de membros está desativada em $CONFIG."
    fi
    echo "Conferido: MatchZy carregado e lista de membros ativa."
    exit 0
  fi
done

desligar "o MatchZy não carregou em 3 minutos."
