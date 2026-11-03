import pytest

from gameinfo import aplicar_metamod, aplicar_no_arquivo

ORIGINAL = "\t\t\tGame_LowViolence\tcsgo_lv // Perfect World content override\n\t\t\tGame\tcsgo\n"
LINHA = "Game\tcsgo/addons/metamod"


def test_insere_logo_abaixo_de_low_violence():
    linhas = aplicar_metamod(ORIGINAL).splitlines()
    assert "csgo_lv" in linhas[0] and LINHA in linhas[1] and linhas[2].strip() == "Game\tcsgo"


def test_mantem_a_indentacao_da_linha_de_referencia():
    assert aplicar_metamod(ORIGINAL).splitlines()[1] == "\t\t\t" + LINHA


def test_aplicar_duas_vezes_nao_duplica():
    assert aplicar_metamod(aplicar_metamod(ORIGINAL)).count("csgo/addons/metamod") == 1


def test_sem_a_linha_de_referencia_da_erro():
    with pytest.raises(ValueError, match="Game_LowViolence"):
        aplicar_metamod("Game\tcsgo\n")


def test_preserva_fim_de_linha_windows():
    assert "\r\n" in aplicar_metamod(ORIGINAL.replace("\n", "\r\n")).split("metamod")[1][:2]


def test_arquivo_so_e_gravado_quando_ha_mudanca(tmp_path):
    arquivo = tmp_path / "gameinfo.gi"
    arquivo.write_bytes(ORIGINAL.encode())
    assert aplicar_no_arquivo(str(arquivo)) is True
    conteudo = arquivo.read_bytes()
    assert b"csgo/addons/metamod\n" in conteudo and b"\r\n" not in conteudo
    assert aplicar_no_arquivo(str(arquivo)) is False
    assert arquivo.read_bytes() == conteudo
