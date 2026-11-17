"""Reinício automático (dono, 16/11/2026): servidor ligado por uns 3 dias fica em câmera lenta."""
import os
import pathlib
import shutil
import subprocess

import pytest

RAIZ = pathlib.Path(__file__).resolve().parents[1]
SCRIPT = RAIZ / "scripts" / "reiniciar_servidores.sh"
CRON = RAIZ / "config" / "cron" / "magnatas-reiniciar"
HORA = 3600
AGORA = 1_800_000_000

precisa_de_bash = pytest.mark.skipif(shutil.which("bash") is None, reason="precisa do bash")


def test_roda_a_cada_30_minutos_como_root():
    assert "*/30 * * * * root bash /usr/local/bin/magnatas-reiniciar.sh" in CRON.read_text(encoding="utf-8")
    codigo = SCRIPT.read_text(encoding="utf-8")
    assert "set -euo pipefail" in codigo and "flock -n" in codigo


def rodar(tmp_path, sessoes: dict[str, tuple[int, str]], hora: str = "15", partidas: str = "0"):
    """sessoes: nome -> (horas ligado, quantas pessoas; "" quando o status não responde)."""
    falso = tmp_path / "bin"
    falso.mkdir()
    chamadas = tmp_path / "chamadas.txt"
    lista = "\\n".join(f"{nome} {AGORA - horas * HORA}" for nome, (horas, _) in sessoes.items())
    casos = "".join(
        f'  *"capture-pane -p -t {nome} "*) echo "players  : {gente} humans, 0 bots (0 max)";;\n'
        for nome, (_, gente) in sessoes.items()
        if gente != ""
    )
    (falso / "sudo").write_text(
        f'#!/usr/bin/env bash\necho "$*" >> "{chamadas.as_posix()}"\n'
        f'case "$*" in\n'
        f'  *list-sessions*) printf "{lista}\\n";;\n'
        f'  *"count(*)"*) echo {partidas};;\n'
        f'  *has-session*) exit 1;;\n'
        f"{casos}"
        f"esac\nexit 0\n",
        encoding="utf-8",
    )
    for nome in ("flock", "sleep"):
        (falso / nome).write_text("#!/usr/bin/env bash\nexit 0\n", encoding="utf-8")
    for arquivo in falso.iterdir():
        arquivo.chmod(0o755)
    ambiente = {
        **os.environ,
        "PATH": f"{falso}{os.pathsep}{os.environ['PATH']}",
        "TRAVA": str(tmp_path / "trava"),
        "AGORA": str(AGORA),
        "HORA": hora,
    }
    resultado = subprocess.run(["bash", str(SCRIPT)], env=ambiente, capture_output=True, text=True)
    assert resultado.returncode == 0, resultado.stderr
    return chamadas.read_text(encoding="utf-8") if chamadas.exists() else ""


def reiniciou(chamadas: str, nome: str) -> bool:
    if nome == "cs2":
        return "bash /home/cs2/bin/iniciar_cs2.sh" in chamadas
    nome = nome.removeprefix("diversao-")
    return f"desligar_diversao.sh {nome}" in chamadas and f"ligar_diversao.sh {nome}" in chamadas


@precisa_de_bash
def test_vazio_de_madrugada_reinicia(tmp_path):
    chamadas = rodar(tmp_path, {"cs2": (21, "0"), "diversao-mutacao": (30, "0")}, hora="05")
    assert reiniciou(chamadas, "cs2") and reiniciou(chamadas, "diversao-mutacao")
    # O de partidas sobe antes dos da Diversão.
    assert chamadas.index("iniciar_cs2.sh") < chamadas.index("desligar_diversao.sh mutacao")


@precisa_de_bash
def test_vazio_de_tarde_espera_a_madrugada(tmp_path):
    chamadas = rodar(tmp_path, {"diversao-mutacao": (30, "0")}, hora="15")
    assert not reiniciou(chamadas, "diversao-mutacao")


@precisa_de_bash
def test_ligado_ha_pouco_nao_mexe(tmp_path):
    chamadas = rodar(tmp_path, {"diversao-mutacao": (10, "0")}, hora="05")
    assert not reiniciou(chamadas, "diversao-mutacao")


@precisa_de_bash
def test_vazio_ha_dois_dias_reinicia_a_qualquer_hora(tmp_path):
    chamadas = rodar(tmp_path, {"diversao-mutacao": (49, "0")}, hora="15")
    assert reiniciou(chamadas, "diversao-mutacao")


@precisa_de_bash
def test_com_gente_espera_ate_perto_dos_3_dias(tmp_path):
    chamadas = rodar(tmp_path, {"diversao-mutacao": (50, "3")}, hora="05")
    assert not reiniciou(chamadas, "diversao-mutacao")


@precisa_de_bash
def test_com_gente_perto_dos_3_dias_avisa_e_reinicia(tmp_path):
    chamadas = rodar(tmp_path, {"diversao-mutacao": (67, "3")}, hora="15")
    assert "say O servidor vai reiniciar em 5 minutos" in chamadas
    assert reiniciou(chamadas, "diversao-mutacao")


@precisa_de_bash
def test_status_que_nao_responde_conta_como_ocupado(tmp_path):
    chamadas = rodar(tmp_path, {"diversao-mutacao": (49, "")}, hora="05")
    assert not reiniciou(chamadas, "diversao-mutacao")


@precisa_de_bash
def test_partida_do_mix_rolando_nao_derruba(tmp_path):
    chamadas = rodar(tmp_path, {"cs2": (70, "0")}, hora="05", partidas="1")
    assert not reiniciou(chamadas, "cs2")


@precisa_de_bash
def test_ilha_com_gente_fica_com_o_plugin(tmp_path):
    chamadas = rodar(tmp_path, {"diversao-ilha-lemnos": (70, "2")}, hora="15")
    assert not reiniciou(chamadas, "ilha-lemnos")


@precisa_de_bash
def test_ilha_vazia_reinicia_como_as_outras(tmp_path):
    chamadas = rodar(tmp_path, {"diversao-ilha-lemnos": (30, "0")}, hora="05")
    assert reiniciou(chamadas, "ilha-lemnos")
