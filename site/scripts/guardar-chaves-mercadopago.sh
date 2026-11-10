#!/usr/bin/env bash
# Guarda as chaves do Mercado Pago no .env.local do site, sem mostrar nenhuma na tela, e reinicia o site.
# Roda na VPS, como root:
#   bash /opt/magnatas/site/scripts/guardar-chaves-mercadopago.sh
# Pede duas coisas, do painel do Mercado Pago (Suas integrações > a aplicação do Magnatas):
#   1. o Access Token (Credenciais; de teste ou de produção);
#   2. a assinatura secreta dos avisos (Webhooks > Configurar notificações).
# Confere as duas antes de mudar qualquer coisa: ou guarda tudo, ou não mexe em nada.
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

read -r -s -p "Cole o Access Token do Mercado Pago e aperte Enter (não aparece na tela): " token || true
echo
token=$(printf '%s' "${token:-}" | tr -d '[:space:]')
if ! printf '%s' "$token" | grep -qE '^(TEST|APP_USR)-[A-Za-z0-9-]{20,}$'; then
  echo "Isso não parece um Access Token do Mercado Pago (começa com TEST- ou APP_USR-). Nada foi mudado." >&2
  exit 1
fi

read -r -s -p "Cole a assinatura secreta dos avisos (Webhooks) e aperte Enter (não aparece na tela): " segredo || true
echo
segredo=$(printf '%s' "${segredo:-}" | tr -d '[:space:]')
if ! printf '%s' "$segredo" | grep -qE '^[A-Za-z0-9]{16,}$'; then
  echo "Isso não parece a assinatura secreta dos avisos. Nada foi mudado." >&2
  exit 1
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

trocar MP_ACCESS_TOKEN "$token"
trocar MP_WEBHOOK_SECRET "$segredo"
case "$token" in
  TEST-*) echo "Chaves de teste guardadas: os pagamentos são de mentira." ;;
  *) echo "Chaves guardadas. Se forem de produção, os pagamentos são de verdade; se forem de um usuário de teste, de mentira." ;;
esac

if [ -z "$TESTE" ]; then
  chown magnatas:magnatas "$ARQUIVO"
  chmod 600 "$ARQUIVO"
  systemctl restart magnatas-site
  echo "Site reiniciado."
fi
