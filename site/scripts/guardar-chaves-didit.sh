#!/usr/bin/env bash
# Guarda as chaves da Didit (verificação de identidade) no .env.local do site, sem mostrar na tela, liga a Didit no
# lugar do simulador e reinicia o site. Roda na VPS, como root:
#   bash /opt/magnatas/site/scripts/guardar-chaves-didit.sh
# Pede três coisas do painel da Didit (business.didit.me): a API key, o Workflow ID e o segredo do webhook.
# Confere as três antes de mudar qualquer coisa: ou guarda tudo, ou não mexe em nada.
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

ler() {
  local nome=$1 valor
  read -r -s -p "Cole $nome e aperte Enter (não aparece na tela): " valor || true
  echo >&2
  printf '%s' "${valor:-}" | tr -d '[:space:]'
}

chave=$(ler 'a API key da Didit')
fluxo=$(ler 'o Workflow ID')
segredo=$(ler 'o segredo do webhook (Webhook secret)')

if [ ${#chave} -lt 20 ]; then
  echo "Isso não parece uma API key da Didit. Nada foi mudado." >&2
  exit 1
fi
if ! printf '%s' "$fluxo" | grep -qiE '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'; then
  echo "O Workflow ID tem o formato 8-4-4-4-12 (letras e números com traços). Nada foi mudado." >&2
  exit 1
fi
if [ ${#segredo} -lt 16 ]; then
  echo "O segredo do webhook parece curto demais. Nada foi mudado." >&2
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

trocar DIDIT_API_KEY "$chave"
trocar DIDIT_WORKFLOW_ID "$fluxo"
trocar DIDIT_WEBHOOK_SECRET "$segredo"
trocar VERIFICADOR didit
sed -i '/^VERIFICADOR_SIMULADOR_EM_PRODUCAO=/d' "$ARQUIVO"
echo "Chaves da Didit guardadas. A verificação agora é de verdade."

if [ -z "$TESTE" ]; then
  systemctl restart magnatas-site
  echo "Site reiniciado."
fi
