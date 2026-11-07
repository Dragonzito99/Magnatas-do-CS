#!/usr/bin/env bash
# Guarda a chave da Anthropic (tradução das notícias do CS2) e o contato da Liquipedia no .env.local do site,
# sem mostrar a chave na tela, e reinicia o site. Roda na VPS, como root:
#   bash /opt/magnatas/site/scripts/guardar-segredos-portal.sh <e-mail de contato da Liquipedia>
set -euo pipefail

ARQUIVO=/opt/magnatas/site/.env.local
CONTATO=${1:-}

if [ "$(id -u)" -ne 0 ]; then
  echo "Rode como root." >&2
  exit 1
fi
if [ ! -f "$ARQUIVO" ]; then
  echo "Não achei $ARQUIVO." >&2
  exit 1
fi

trocar() {
  local nome=$1 valor=$2
  sed -i "/^${nome}=/d" "$ARQUIVO"
  printf '%s=%s\n' "$nome" "$valor" >> "$ARQUIVO"
}

if [ -n "$CONTATO" ]; then
  if ! printf '%s' "$CONTATO" | grep -qE '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'; then
    echo "Esse contato não parece um e-mail. Nada foi mudado." >&2
    exit 1
  fi
  trocar LIQUIPEDIA_CONTATO "$CONTATO"
  echo "Contato da Liquipedia guardado."
fi

read -r -s -p "Cole a chave da Anthropic e aperte Enter (ela não aparece na tela; Enter vazio pula): " chave
echo
chave=$(printf '%s' "$chave" | tr -d '[:space:]')
if [ -n "$chave" ]; then
  if ! printf '%s' "$chave" | grep -qE '^sk-ant-[A-Za-z0-9_-]{20,}$'; then
    echo "Isso não parece uma chave da Anthropic (começa com sk-ant-). Nada foi mudado." >&2
    exit 1
  fi
  trocar ANTHROPIC_API_KEY "$chave"
  echo "Chave da Anthropic guardada."
fi

chown magnatas:magnatas "$ARQUIVO"
chmod 600 "$ARQUIVO"
systemctl restart magnatas-site
echo "Site reiniciado. Em até 30 minutos as notícias do CS2 aparecem traduzidas, e em até 10 o quadro Tier S."
