"""Cópia do banco e proteção do SSH (dono, 11/11/2026)."""
import os
import pathlib
import shutil
import subprocess

import pytest

RAIZ = pathlib.Path(__file__).resolve().parents[1]
BACKUP = RAIZ / "scripts" / "backup_banco.sh"
CRON = RAIZ / "config" / "cron" / "magnatas-backup"
FAIL2BAN = RAIZ / "config" / "fail2ban" / "magnatas-ssh.conf"


def test_a_copia_do_banco_e_diaria_e_guarda_30_dias():
    cron = CRON.read_text(encoding="utf-8")
    assert "root bash /usr/local/bin/magnatas-backup-banco.sh" in cron
    codigo = BACKUP.read_text(encoding="utf-8")
    assert "set -euo pipefail" in codigo
    assert "pg_dump" in codigo and "gzip" in codigo
    assert "DIAS_DE_BACKUP:-30" in codigo
    # Só root lê as cópias: elas têm tudo do site.
    assert 'chmod 700 "$PASTA"' in codigo and "chmod 600" in codigo


@pytest.mark.skipif(shutil.which("bash") is None, reason="precisa do bash")
def test_a_copia_que_falha_nao_deixa_arquivo_pela_metade(tmp_path):
    # Um pg_dump que falha no meio não pode virar uma "cópia" quebrada que parece boa.
    falso = tmp_path / "bin"
    falso.mkdir()
    (falso / "pg_dump").write_text("#!/usr/bin/env bash\necho parte\nexit 1\n", encoding="utf-8")
    (falso / "sudo").write_text('#!/usr/bin/env bash\nshift 2\n"$@"\n', encoding="utf-8")
    for arquivo in falso.iterdir():
        arquivo.chmod(0o755)
    pasta = tmp_path / "copias"
    ambiente = {**os.environ, "PATH": f"{falso}{os.pathsep}{os.environ['PATH']}", "PASTA_DOS_BACKUPS": str(pasta)}
    resultado = subprocess.run(["bash", str(BACKUP)], env=ambiente, capture_output=True, text=True)
    assert resultado.returncode != 0
    assert list(pasta.glob("*")) == []


def test_o_ssh_bloqueia_quem_erra_a_senha_varias_vezes():
    # 10.109 tentativas de senha em 24 h no root (11/11/2026). O login por senha continua, a pedido do dono.
    jail = FAIL2BAN.read_text(encoding="utf-8")
    assert "[sshd]" in jail and "enabled = true" in jail
    assert "maxretry = 5" in jail
    assert "findtime = 10m" in jail
    assert "bantime = 1h" in jail


EMAIL = RAIZ / "scripts" / "guardar_email_backup.sh"


def test_a_copia_vai_por_email_trancada_com_senha_e_avisa_o_disco():
    # Pedido do dono (11/11/2026): a cópia no e-mail dele, com o disco junto; trancada porque tem os dados de todos.
    codigo = BACKUP.read_text(encoding="utf-8")
    assert "7z a -t7z -mhe=on" in codigo and '-p"$SENHA_DA_COPIA"' in codigo
    assert "msmtp -C /etc/magnatas-msmtprc -t" in codigo
    assert "df --output=pcent /" in codigo
    assert "ATENÇÃO" in codigo and "LIMITE_DO_DISCO:-90" in codigo
    # Sem a configuração do e-mail, a cópia continua sendo feita, só não é enviada.
    assert '[ -f "$CONFIG_DO_EMAIL" ]' in codigo
    # Falha no envio não apaga a cópia nem passa em silêncio.
    assert "e-mail não saiu" in codigo


def test_as_senhas_do_email_sao_lidas_sem_aparecer_e_ficam_so_para_o_root():
    codigo = EMAIL.read_text(encoding="utf-8")
    assert codigo.count("read -r -s") >= 2
    assert "chmod 600" in codigo
    assert 'passwordeval "cat /root/.magnatas-smtp-senha"' in codigo
    assert "smtp.hostinger.com" in codigo and "port 465" in codigo
    # A senha da cópia é pedida duas vezes: errar e trancar com uma senha que ninguém sabe seria perder a cópia.
    assert "As duas senhas da cópia não batem" in codigo
