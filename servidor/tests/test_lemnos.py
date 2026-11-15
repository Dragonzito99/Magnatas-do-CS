"""Ilha Lemnos, o modo extração (dono, 15/11/2026): configuração, scripts e o plugin MagnatasLemnos."""
import json
import pathlib
import re

import pytest

RAIZ = pathlib.Path(__file__).resolve().parents[1]
CONFIGS = RAIZ / "config" / "diversao"
INICIAR = (RAIZ / "scripts" / "iniciar_diversao.sh").read_text(encoding="utf-8")
INSTALADOR = (RAIZ / "scripts" / "instalar_cs2.sh").read_text(encoding="utf-8")
COMPILAR = (RAIZ / "scripts" / "compilar_plugin.sh").read_text(encoding="utf-8")
ARQUIVO_DO_MAPA = RAIZ / "config" / "lemnos" / "3649316235.json"
PLUGIN = RAIZ / "plugins" / "MagnatasLemnos"


def conf():
    campos = {}
    for linha in (CONFIGS / "ilha-lemnos.conf").read_text(encoding="utf-8").splitlines():
        if "=" in linha and not linha.startswith("#"):
            chave, texto = linha.split("=", 1)
            campos[chave] = texto
    return campos


def valor_no_cfg(comando):
    achadas = []
    for arquivo in [conf()["BASE"], "ilha-lemnos.cfg"]:
        for linha in (CONFIGS / arquivo).read_text(encoding="utf-8").splitlines():
            partes = linha.split(maxsplit=1)
            if partes and partes[0] == comando:
                achadas.append(partes[1] if len(partes) > 1 else "")
    assert achadas, f"{comando} não está na configuração da Ilha Lemnos"
    return achadas[-1]


def codigo():
    return "\n".join(arquivo.read_text(encoding="utf-8") for arquivo in sorted(PLUGIN.glob("*.cs")))


# Tarefa 11: configuração e scripts


def test_lemnos_usa_o_plugin_proprio():
    campos = conf()
    assert campos["PLUGIN_DO_MODO"] == "MagnatasLemnos"
    assert campos["PORTA"] == "27024"
    assert campos["VAGAS"] == "20"
    assert campos["OFICINA"] == "3649316235"
    assert campos["REGRA"] == "lemnos"
    assert campos["GAME_TYPE"] == "3" and campos["GAME_MODE"] == "0"
    assert campos["BASE"] == "lemnos_base.cfg"


def test_lemnos_porta_27024_aberta_no_ufw():
    assert "ufw allow 27024/udp" in INSTALADOR


@pytest.mark.parametrize(
    "comando, esperado",
    [
        ("mp_teammates_are_enemies", "1"),
        ("mp_ignore_round_win_conditions", "1"),
        ("mp_roundtime", "60"),
        ("mp_respawn_on_death_t", "0"),
        ("mp_respawn_on_death_ct", "0"),
        ("sv_buy_status_override", "3"),
        ("mp_death_drop_gun", "1"),
        ("bot_quota", "0"),
        ("mp_autokick", "0"),
    ],
)
def test_cfg_do_lemnos_tem_as_regras(comando, esperado):
    assert valor_no_cfg(comando) == esperado


def test_iniciar_nao_poe_o_plugin_da_diversao_no_lemnos():
    assert "PLUGIN_DO_MODO" in INICIAR
    # Com o plugin próprio, a pasta do MagnatasDiversao some da cópia desse servidor.
    assert re.search(r'rm -rf "\$PASTA_DOS_PLUGINS/MagnatasDiversao"', INICIAR)
    assert "MagnatasLemnos.dll" in INICIAR


def test_config_do_plugin_com_permissao_600():
    assert re.search(r'chmod 600 "\$CONFIG_DO_LEMNOS/MagnatasLemnos.json"', INICIAR)
    assert '"ArquivoDoMapa"' in INICIAR


def test_arquivo_do_mapa_e_json_valido():
    dados = json.loads(ARQUIVO_DO_MAPA.read_text(encoding="utf-8"))
    assert set(dados) == {"safeZones", "saidas", "caixas", "chao"}
    assert "config/lemnos" in INSTALADOR


def test_lemnos_mantem_visual_e_lista():
    # O personagem (MagnatasVisual) e a lista de membros (MagnatasLista) vêm do competitivo junto com os addons.
    assert 'cp -au "$SERVIDOR/csgo/addons" "$PASTA/csgo/"' in INICIAR
    assert 'rm -rf "$PASTA_DOS_PLUGINS/MagnatasVisual"' not in INICIAR
    assert 'rm -rf "$PASTA_DOS_PLUGINS/MagnatasLista"' not in INICIAR


def test_todos_nao_liga_a_ilha():
    assert "ilha-lemnos" in INICIAR.split('if [ "$NOME" = "todos" ]')[1].split("exit 0")[0]


def test_compilar_faz_o_plugin_da_ilha():
    assert "plugins/MagnatasLemnos" in COMPILAR
    assert "MagnatasLemnos.dll" in COMPILAR
