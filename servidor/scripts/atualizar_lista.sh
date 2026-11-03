#!/usr/bin/env bash
# Baixa do site a lista de liberados. Se algo der errado, a lista atual continua valendo.
# Lê LISTA_URL e SERVIDOR_TOKEN de /home/cs2/cs2.env.
# Uso: sudo -u cs2 bash /home/cs2/bin/atualizar_lista.sh
set -euo pipefail

CASA=/home/cs2
DESTINO=$CASA/server/game/csgo/cfg/MatchZy/whitelist.cfg

# shellcheck disable=SC1091
source "$CASA/cs2.env"

TEMPORARIO=$(mktemp "$DESTINO.XXXXXX")
trap 'rm -f "$TEMPORARIO"' EXIT

curl -fsS --max-time 15 -H "Authorization: Bearer $SERVIDOR_TOKEN" "$LISTA_URL" -o "$TEMPORARIO"

if [ ! -s "$TEMPORARIO" ]; then
  echo "O site devolveu uma lista vazia. Mantive a lista atual." >&2
  exit 1
fi
if grep -qvE '^7656119[0-9]{10}$' "$TEMPORARIO"; then
  echo "A resposta do site não é uma lista de SteamIDs. Mantive a lista atual." >&2
  exit 1
fi

chmod 644 "$TEMPORARIO"
mv "$TEMPORARIO" "$DESTINO"
trap - EXIT
echo "Lista atualizada: $(wc -l < "$DESTINO") membros."
