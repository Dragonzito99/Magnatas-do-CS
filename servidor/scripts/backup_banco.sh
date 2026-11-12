#!/usr/bin/env bash
# Cópia diária do banco do site (dono, 11/11/2026). Roda como root pelo cron (config/cron/magnatas-backup) e guarda
# 30 dias em /opt/magnatas/backups. Só root lê: as cópias têm tudo do site.
# Com o e-mail configurado (guardar_email_backup.sh), manda a cópia trancada num .7z com senha para o dono, junto com
# o uso do disco da VPS; acima de 90% o assunto vem com ATENÇÃO.
# Para voltar uma cópia: gunzip -c <arquivo> | sudo -u postgres psql magnatas  (num banco vazio).
set -euo pipefail

PASTA=${PASTA_DOS_BACKUPS:-/opt/magnatas/backups}
DIAS=${DIAS_DE_BACKUP:-30}
BANCO=${BANCO_DO_SITE:-magnatas}
CONFIG_DO_EMAIL=${CONFIG_DO_EMAIL:-/root/.magnatas-backup.env}
LIMITE=${LIMITE_DO_DISCO:-90}

mkdir -p "$PASTA"
chmod 700 "$PASTA"
ARQUIVO="$PASTA/$BANCO-$(date +%F-%H%M).sql.gz"
TEMPORARIO="$ARQUIVO.parcial"
TEMPORARIA_DO_EMAIL=""
# Cópia que falha no meio não fica parecendo uma cópia boa; a trancada só existe para o e-mail.
trap 'rm -f "$TEMPORARIO"; if [ -n "$TEMPORARIA_DO_EMAIL" ]; then rm -rf "$TEMPORARIA_DO_EMAIL"; fi' EXIT

sudo -u postgres pg_dump --no-owner "$BANCO" | gzip -9 > "$TEMPORARIO"
mv "$TEMPORARIO" "$ARQUIVO"
chmod 600 "$ARQUIVO"
find "$PASTA" -name "$BANCO-*.sql.gz" -mtime +"$DIAS" -delete
TAMANHO=$(du -h "$ARQUIVO" | cut -f1)
echo "$(date '+%F %T') cópia feita: $ARQUIVO ($TAMANHO)"

[ -f "$CONFIG_DO_EMAIL" ] || exit 0
# shellcheck disable=SC1090
source "$CONFIG_DO_EMAIL"

USO=$(df --output=pcent / | tail -1 | tr -dc '0-9')
DISCO=$(df -h --output=used,size / | tail -1 | awk '{print $1 " de " $2}')
ASSUNTO="Magnatas: cópia do banco de $(date +%d/%m/%Y) · disco ${USO}%"
[ "$USO" -ge "$LIMITE" ] && ASSUNTO="ATENÇÃO: disco da VPS em ${USO}% · $ASSUNTO"

TEMPORARIA_DO_EMAIL=$(mktemp -d)
TRANCADA="$TEMPORARIA_DO_EMAIL/$(basename "$ARQUIVO" .sql.gz).7z"
7z a -t7z -mhe=on -p"$SENHA_DA_COPIA" "$TRANCADA" "$ARQUIVO" > /dev/null

CORPO="Cópia do banco do site Magnatas do CS, feita em $(date '+%d/%m/%Y às %H:%M').

Arquivo: $(basename "$TRANCADA") ($TAMANHO antes de trancar), aberto com o 7-Zip e a senha da cópia.
Disco da VPS: ${USO}% usado ($DISCO).
A VPS também guarda as cópias dos últimos $DIAS dias."
[ "$USO" -ge "$LIMITE" ] && CORPO="ATENÇÃO: o disco da VPS passou de ${LIMITE}%. Sem espaço, o site e os servidores param.

$CORPO"

SEPARADOR="magnatas-$(date +%s)"
assunto_codificado() { printf '=?UTF-8?B?%s?=' "$(printf '%s' "$1" | base64 -w0)"; }
{
  echo "From: Magnatas do CS <$SMTP_USUARIO>"
  echo "To: $EMAIL_DESTINO"
  echo "Subject: $(assunto_codificado "$ASSUNTO")"
  echo "MIME-Version: 1.0"
  echo "Content-Type: multipart/mixed; boundary=\"$SEPARADOR\""
  echo
  echo "--$SEPARADOR"
  echo "Content-Type: text/plain; charset=UTF-8"
  echo "Content-Transfer-Encoding: base64"
  echo
  printf '%s\n' "$CORPO" | base64
  echo "--$SEPARADOR"
  echo "Content-Type: application/x-7z-compressed; name=\"$(basename "$TRANCADA")\""
  echo "Content-Transfer-Encoding: base64"
  echo "Content-Disposition: attachment; filename=\"$(basename "$TRANCADA")\""
  echo
  base64 "$TRANCADA"
  echo "--$SEPARADOR--"
} | msmtp -C /etc/magnatas-msmtprc -t || { echo "$(date '+%F %T') a cópia ficou na VPS, mas o e-mail não saiu" >&2; exit 1; }
echo "$(date '+%F %T') e-mail enviado para $EMAIL_DESTINO"
