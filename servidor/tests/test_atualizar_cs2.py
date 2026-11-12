"""Atualização automática do CS2 (dono, 11/11/2026): sempre que sair versão nova, o servidor atualiza sozinho."""
import os
import pathlib
import shutil
import subprocess

import pytest

RAIZ = pathlib.Path(__file__).resolve().parents[1]
SCRIPT = RAIZ / "scripts" / "atualizar_cs2_se_preciso.sh"
CRON = RAIZ / "config" / "cron" / "magnatas-cs2"


def test_confere_a_cada_15_minutos_como_root():
    assert "*/15 * * * * root bash /usr/local/bin/magnatas-atualizar-cs2.sh" in CRON.read_text(encoding="utf-8")
    codigo = SCRIPT.read_text(encoding="utf-8")
    assert "set -euo pipefail" in codigo
    assert "UpToDateCheck" in codigo and "flock -n" in codigo
    # Pasta com outro dono travou a atualização de 11/11/2026.
    assert "chown cs2:cs2 /home/cs2/server/game/csgo/cfg" in codigo


def rodar(tmp_path, steam: str, partidas_em_jogo: str):
    falso = tmp_path / "bin"
    falso.mkdir()
    chamadas = tmp_path / "chamadas.txt"
    (falso / "curl").write_text(f"#!/usr/bin/env bash\necho '{steam}'\n", encoding="utf-8")
    (falso / "flock").write_text("#!/usr/bin/env bash\nexit 0\n", encoding="utf-8")
    (falso / "sudo").write_text(
        f'#!/usr/bin/env bash\necho "$*" >> "{chamadas.as_posix()}"\n'
        f'case "$*" in *psql*) echo {partidas_em_jogo};; esac\nexit 0\n',
        encoding="utf-8",
    )
    for arquivo in falso.iterdir():
        arquivo.chmod(0o755)
    inf = tmp_path / "steam.inf"
    inf.write_text("ServerVersion=2000942\nPatchVersion=1.41.9.6\n", encoding="utf-8")
    ambiente = {
        **os.environ,
        "PATH": f"{falso}{os.pathsep}{os.environ['PATH']}",
        "INF": str(inf),
        "TRAVA": str(tmp_path / "trava"),
        "CONFIG_DO_EMAIL": str(tmp_path / "sem-email.env"),
    }
    resultado = subprocess.run(["bash", str(SCRIPT)], env=ambiente, capture_output=True, text=True)
    return resultado, chamadas.read_text(encoding="utf-8") if chamadas.exists() else ""


@pytest.mark.skipif(shutil.which("bash") is None, reason="precisa do bash")
def test_versao_em_dia_nao_mexe_em_nada(tmp_path):
    resultado, chamadas = rodar(tmp_path, '{"response":{"success":true,"up_to_date":true}}', "0")
    assert resultado.returncode == 0
    assert chamadas == ""


@pytest.mark.skipif(shutil.which("bash") is None, reason="precisa do bash")
def test_com_partida_do_mix_rolando_espera(tmp_path):
    resultado, chamadas = rodar(tmp_path, '{"response":{"success":true,"up_to_date":false}}', "1")
    assert resultado.returncode == 0
    assert "esperando a partida" in resultado.stdout
    assert "atualizar_cs2.sh" not in chamadas


@pytest.mark.skipif(shutil.which("bash") is None, reason="precisa do bash")
def test_versao_velha_sem_partida_atualiza(tmp_path):
    resultado, chamadas = rodar(tmp_path, '{"response":{"success":true,"up_to_date":false}}', "0")
    assert resultado.returncode == 0, resultado.stderr
    assert "-u cs2 bash /home/cs2/bin/atualizar_cs2.sh" in chamadas
