#!/usr/bin/env bash
# Fila de notícias (dono, 13/11/2026: "uma por dia"): publica a próxima da fila, a de nome menor, e avisa no Discord.
# O cron (/etc/cron.d/magnatas-noticias) chama uma vez por dia; com a fila vazia, não faz nada.
# Para pôr na fila: um arquivo .md em /opt/magnatas/noticias/fila (primeira linha é o título), com o número da ordem
# no começo do nome (01-..., 02-...).
# Uso: sudo -u magnatas bash /opt/magnatas/site/scripts/publicar-proxima-noticia.sh
set -euo pipefail
# Chamado de uma pasta que o usuário do site não lê (ex.: /root), o find falhava e o script parava calado (13/11/2026).
cd /

FILA=${FILA_DE_NOTICIAS:-/opt/magnatas/noticias/fila}
FEITAS=${NOTICIAS_PUBLICADAS:-/opt/magnatas/noticias/publicadas}
SITE=${PASTA_DO_SITE:-/opt/magnatas/site}

PROXIMA=$(find "$FILA" -maxdepth 1 -type f -name '*.md' 2>/dev/null | sort | head -n 1)
if [ -z "$PROXIMA" ]; then
  exit 0
fi

mkdir -p "$FEITAS"
cd "$SITE"
# Só sai da fila depois de publicada: se o site estiver fora, tenta de novo no dia seguinte.
npm run --silent noticia:publicar -- --discord "$PROXIMA"
mv "$PROXIMA" "$FEITAS/"
echo "$(date '+%d/%m/%Y %H:%M') publicada: $(basename "$PROXIMA")"
