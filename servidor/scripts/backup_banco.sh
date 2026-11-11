#!/usr/bin/env bash
# Cópia diária do banco do site (dono, 11/11/2026). Roda como root pelo cron (config/cron/magnatas-backup) e guarda
# 30 dias em /opt/magnatas/backups. Só root lê: as cópias têm tudo do site.
# Para voltar uma cópia: gunzip -c <arquivo> | sudo -u postgres psql magnatas  (num banco vazio).
set -euo pipefail

PASTA=${PASTA_DOS_BACKUPS:-/opt/magnatas/backups}
DIAS=${DIAS_DE_BACKUP:-30}
BANCO=${BANCO_DO_SITE:-magnatas}

mkdir -p "$PASTA"
chmod 700 "$PASTA"
ARQUIVO="$PASTA/$BANCO-$(date +%F-%H%M).sql.gz"
TEMPORARIO="$ARQUIVO.parcial"
# Cópia que falha no meio não fica parecendo uma cópia boa.
trap 'rm -f "$TEMPORARIO"' EXIT

sudo -u postgres pg_dump --no-owner "$BANCO" | gzip -9 > "$TEMPORARIO"
mv "$TEMPORARIO" "$ARQUIVO"
chmod 600 "$ARQUIVO"
find "$PASTA" -name "$BANCO-*.sql.gz" -mtime +"$DIAS" -delete
echo "$(date '+%F %T') cópia feita: $ARQUIVO ($(du -h "$ARQUIVO" | cut -f1))"
