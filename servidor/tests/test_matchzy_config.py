import pathlib
import sys

import pytest

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1] / "ferramentas"))

import matchzy_config as mc

TOKEN = "abc_DEF-123"
ORIGINAL = """// comentario
matchzy_kick_when_no_match_loaded false
matchzy_autostart_mode 1
matchzy_demo_upload_url ""
"""


def test_grava_os_enderecos_do_site():
    texto = mc.aplicar(ORIGINAL, "https://magnatas.test/", TOKEN)
    assert f'matchzy_demo_upload_url "https://magnatas.test/api/servidor/gravacoes/{TOKEN}"' in texto
    assert 'matchzy_remote_log_url "https://magnatas.test/api/servidor/eventos"' in texto
    assert f'matchzy_remote_log_header_value "Bearer {TOKEN}"' in texto


def test_liga_a_expulsao_de_quem_nao_esta_na_partida():
    texto = mc.aplicar(ORIGINAL, "http://127.0.0.1:3000", TOKEN)
    assert "matchzy_kick_when_no_match_loaded true" in texto
    assert "matchzy_kick_when_no_match_loaded false" not in texto


def test_mantem_o_resto_do_arquivo():
    texto = mc.aplicar(ORIGINAL, "http://127.0.0.1:3000", TOKEN)
    assert "// comentario" in texto
    assert "matchzy_autostart_mode 1" in texto


def test_nao_deixa_linha_antiga_que_passaria_por_cima():
    antigo = ORIGINAL + 'matchzy_remote_log_url "http://127.0.0.1:8770/eventos"\n'
    texto = mc.aplicar(antigo, "http://127.0.0.1:3000", TOKEN)
    assert "8770" not in texto


def test_aplicar_duas_vezes_da_o_mesmo_resultado():
    uma = mc.aplicar(ORIGINAL, "http://127.0.0.1:3000", TOKEN)
    assert mc.aplicar(uma, "http://127.0.0.1:3000", TOKEN) == uma


@pytest.mark.parametrize("token", ['a"; quit', "a b", ""])
def test_token_estranho_e_recusado(token):
    with pytest.raises(ValueError):
        mc.aplicar(ORIGINAL, "http://127.0.0.1:3000", token)


def test_site_sem_protocolo_e_recusado():
    with pytest.raises(ValueError):
        mc.aplicar(ORIGINAL, "magnatas.test", TOKEN)


def test_le_o_arquivo_de_ambiente():
    valores = mc.ler_ambiente('# nota\nSITE_URL="http://x"\nSERVIDOR_TOKEN=abc\n')
    assert valores == {"SITE_URL": "http://x", "SERVIDOR_TOKEN": "abc"}


def test_principal_nao_mostra_o_token_e_grava(tmp_path, capsys):
    config = tmp_path / "config.cfg"
    config.write_text(ORIGINAL, encoding="utf-8")
    env = tmp_path / "cs2.env"
    env.write_text(f"SITE_URL=http://127.0.0.1:3000\nSERVIDOR_TOKEN={TOKEN}\n", encoding="utf-8")
    assert mc.principal([str(config), str(env)]) == 0
    saida = capsys.readouterr()
    assert TOKEN not in saida.out + saida.err
    assert TOKEN in config.read_text(encoding="utf-8")


def test_principal_avisa_o_que_falta(tmp_path, capsys):
    config = tmp_path / "config.cfg"
    config.write_text(ORIGINAL, encoding="utf-8")
    env = tmp_path / "cs2.env"
    env.write_text("SERVIDOR_TOKEN=abc\n", encoding="utf-8")
    assert mc.principal([str(config), str(env)]) == 1
    assert "SITE_URL" in capsys.readouterr().err
    assert config.read_text(encoding="utf-8") == ORIGINAL
