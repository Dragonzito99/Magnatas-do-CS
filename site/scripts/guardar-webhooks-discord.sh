#!/usr/bin/env bash
# Guarda os dois webhooks do Discord (#notícias e #resultados) no .env.local do site, sem mostrar na tela, e reinicia
# o site. Roda na VPS, como root:
#   bash /opt/magnatas/site/scripts/guardar-webhooks-discord.sh
# Enter vazio pula o webhook. Confere os dois antes de mudar qualquer coisa: ou guarda tudo, ou não mexe em nada.
set -euo pipefail

ARQUIVO=${ARQUIVO_DO_AMBIENTE:-/opt/magnatas/site/.env.local}
TESTE=${MODO_DE_TESTE:-}

if [ -z "$TESTE" ] && [ "$(id -u)" -ne 0 ]; then
  echo "Rode como root." >&2
  exit 1
fi
if [ ! -f "$ARQUIVO" ]; then
  echo "Não achei $ARQUIVO." >&2
  exit 1
fi

FORMATO='^https://(discord|discordapp)\.com/api/webhooks/[0-9]+/[A-Za-z0-9_-]+$'

ler() {
  local canal=$1 valor
  read -r -s -p "Cole o webhook do $canal e aperte Enter (não aparece na tela; Enter vazio pula): " valor || true
  echo >&2
  printf '%s' "${valor:-}" | tr -d '[:space:]'
}

noticias=$(ler '#notícias')
resultados=$(ler '#resultados')

for valor in "$noticias" "$resultados"; do
  if [ -n "$valor" ] && ! printf '%s' "$valor" | grep -qE "$FORMATO"; then
    echo "Isso não parece um webhook do Discord (começa com https://discord.com/api/webhooks/). Nada foi mudado." >&2
    exit 1
  fi
done

if [ -z "$noticias" ] && [ -z "$resultados" ]; then
  echo "Nada para guardar."
  exit 0
fi

# Arquivo sem quebra de linha no fim grudaria a linha nova na última variável.
if [ -s "$ARQUIVO" ] && [ -n "$(tail -c1 "$ARQUIVO")" ]; then
  echo >> "$ARQUIVO"
fi

trocar() {
  local nome=$1 valor=$2
  sed -i "/^${nome}=/d" "$ARQUIVO"
  printf '%s=%s\n' "$nome" "$valor" >> "$ARQUIVO"
}

if [ -n "$noticias" ]; then
  trocar DISCORD_WEBHOOK_NOTICIAS "$noticias"
  echo "Webhook do #notícias guardado."
fi
if [ -n "$resultados" ]; then
  trocar DISCORD_WEBHOOK_RESULTADOS "$resultados"
  echo "Webhook do #resultados guardado."
fi

if [ -z "$TESTE" ]; then
  chown magnatas:magnatas "$ARQUIVO"
  chmod 600 "$ARQUIVO"
  systemctl restart magnatas-site
  echo "Site reiniciado. A próxima notícia e o próximo resultado já vão para o Discord."
fi
