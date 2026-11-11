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
