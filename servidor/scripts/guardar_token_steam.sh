#!/usr/bin/env bash
# Guarda um token de servidor da Steam (GSLT) no cs2.env, sem mostrar na tela. Roda na VPS, como root:
#   bash /usr/local/sbin/guardar_token_steam.sh LABORATORIO
# Fica fora da pasta do cs2: um script que o root roda não pode ser alterável pelo usuário dos servidores.
# Vira a variável GSLT_<NOME>. O token se cria em steamcommunity.com/dev/managegameservers, com o app 730.
# Vale na próxima vez que o servidor ligar.
set -euo pipefail

ARQUIVO=${ARQUIVO_DOS_SEGREDOS:-/home/cs2/cs2.env}
NOME=${1:-}

if [ -z "${MODO_DE_TESTE:-}" ] && [ "$(id -u)" -ne 0 ]; then
  echo "Rode como root." >&2
  exit 1
fi
if ! [[ "$NOME" =~ ^[A-Z_]{1,32}$ ]]; then
  echo "Diga o nome do token em letras maiúsculas, ex.: LABORATORIO." >&2
  exit 1
fi
if [ ! -f "$ARQUIVO" ]; then
  echo "Não achei $ARQUIVO." >&2
  exit 1
fi

read -rs -p "Cole o token da Steam e aperte Enter (não aparece na tela): " TOKEN || true
echo >&2
TOKEN=$(printf '%s' "${TOKEN:-}" | tr -d '[:space:]')

if ! [[ "$TOKEN" =~ ^[A-Fa-f0-9]{32}$ ]]; then
  echo "Isso não parece um token da Steam (32 letras e números). Nada foi mudado." >&2
  exit 1
fi

# Arquivo sem quebra de linha no fim grudaria a linha nova na última variável.
if [ -s "$ARQUIVO" ] && [ -n "$(tail -c1 "$ARQUIVO")" ]; then
  echo >> "$ARQUIVO"
fi
sed -i "/^GSLT_${NOME}=/d" "$ARQUIVO"
printf 'GSLT_%s=%s\n' "$NOME" "$TOKEN" >> "$ARQUIVO"
if [ -z "${MODO_DE_TESTE:-}" ]; then
  chown cs2:cs2 "$ARQUIVO"
fi
chmod 600 "$ARQUIVO"
echo "Token GSLT_$NOME guardado. Vale na próxima vez que o servidor ligar."
