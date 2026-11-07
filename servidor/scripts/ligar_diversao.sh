#!/usr/bin/env bash
# Chamado pelo site (usuário magnatas, via sudo) para ligar um servidor da Diversão.
# Uso: sudo -n -u cs2 /home/cs2/bin/ligar_diversao.sh <nome>
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

# O sudo mantém a pasta de quem chamou, que o cs2 nem sempre pode ler.
cd /home/cs2

# Sem nenhuma sessão do cs2 (a máquina acabou de reiniciar), o tmux nasceria dentro do serviço do site,
# e reiniciar o site derrubaria todos os servidores, inclusive o de partidas. Primeiro: iniciar_cs2.sh.
if ! tmux list-sessions >/dev/null 2>&1; then
  echo "Os servidores de jogo não estão no ar. Rode antes: sudo -u cs2 bash /home/cs2/bin/iniciar_cs2.sh" >&2
  exit 1
fi

if tmux has-session -t "diversao-$NOME" 2>/dev/null; then
  exit 0
fi

bash /home/cs2/bin/iniciar_diversao.sh "$NOME"
