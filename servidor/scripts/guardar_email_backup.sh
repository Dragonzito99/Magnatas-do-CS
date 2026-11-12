#!/usr/bin/env bash
# Configura o envio diário da cópia do banco por e-mail (dono, 11/11/2026). Roda na VPS, como root:
#   bash /usr/local/bin/magnatas-guardar-email.sh
# Pede a senha da caixa de e-mail da Hostinger (que manda a cópia) e a senha que vai trancar a cópia (.7z). Nada aparece
# na tela e nada vai para o chat. No fim manda um e-mail de teste com a cópia de agora.
set -euo pipefail

EMAIL=${EMAIL_DO_DONO:-eduardo.arcanjo@forjadehefesto.online}

if [ "$(id -u)" -ne 0 ]; then
  echo "Rode como root." >&2
  exit 1
fi

read -r -s -p "Cole a senha do e-mail $EMAIL e aperte Enter (não aparece na tela): " SENHA_DO_EMAIL
echo
read -r -s -p "Escolha a senha que vai trancar a cópia (guarde ela!) e aperte Enter: " SENHA_DA_COPIA
echo
read -r -s -p "Digite a senha da cópia de novo: " DE_NOVO
echo
if [ -z "$SENHA_DO_EMAIL" ] || [ -z "$SENHA_DA_COPIA" ]; then
  echo "Senha vazia. Nada foi mudado." >&2
  exit 1
fi
if [ "$SENHA_DA_COPIA" != "$DE_NOVO" ]; then
  echo "As duas senhas da cópia não batem. Nada foi mudado." >&2
  exit 1
fi

umask 077
printf '%s' "$SENHA_DO_EMAIL" > /root/.magnatas-smtp-senha
chmod 600 /root/.magnatas-smtp-senha
{
  printf 'EMAIL_DESTINO=%q\n' "$EMAIL"
  printf 'SMTP_USUARIO=%q\n' "$EMAIL"
  printf 'SENHA_DA_COPIA=%q\n' "$SENHA_DA_COPIA"
} > /root/.magnatas-backup.env
chmod 600 /root/.magnatas-backup.env
cat > /etc/magnatas-msmtprc <<EOF
defaults
auth on
tls on
tls_starttls off
tls_trust_file /etc/ssl/certs/ca-certificates.crt
logfile /var/log/magnatas-msmtp.log

account hostinger
host smtp.hostinger.com
port 465
from $EMAIL
user $EMAIL
passwordeval "cat /root/.magnatas-smtp-senha"

account default : hostinger
EOF
chmod 600 /etc/magnatas-msmtprc

echo "Guardado. Mandando um e-mail de teste com a cópia de agora..."
bash /usr/local/bin/magnatas-backup-banco.sh
