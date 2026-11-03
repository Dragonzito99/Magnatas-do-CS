import json
import subprocess
import sys
from pathlib import Path

import pytest

from membros import Membro, gerar_partida, gerar_whitelist, ler_membros

FERRAMENTA = Path(__file__).parents[1] / "ferramentas" / "membros.py"
ID1 = "76561198000000001"
ID2 = "76561198000000002"
ID_GM = "76561198000000099"
CABECALHO = "steamid64,apelido,papel\n"


def escrever(tmp_path, texto, codificacao="utf-8"):
    arquivo = tmp_path / "membros.csv"
    arquivo.write_bytes(texto.encode(codificacao))
    return str(arquivo)


def membro(steamid, papel="jogador", apelido="Bia"):
    return Membro(steamid, apelido, papel)


def dez_jogadores():
    return [membro(f"765611980000001{n:02d}", apelido=f"j{n}") for n in range(10)]


def test_le_membro_valido(tmp_path):
    arquivo = escrever(tmp_path, CABECALHO + f"{ID1},Bia,jogador\n")
    assert ler_membros(arquivo) == [Membro(ID1, "Bia", "jogador")]


def test_rejeita_formato_errado_dizendo_a_linha(tmp_path):
    arquivo = escrever(tmp_path, CABECALHO + "STEAM_0:1:123,Bia,jogador\n")
    with pytest.raises(ValueError, match=r"linha 2.*STEAM_0:1:123"):
        ler_membros(arquivo)


@pytest.mark.parametrize(
    "invalido",
    [
        "7656119800000000",
        "765611980000000011",
        "86561198000000001",
        "https://steamcommunity.com/id/bia",
    ],
)
def test_rejeita_id_que_nao_e_steamid64(tmp_path, invalido):
    arquivo = escrever(tmp_path, CABECALHO + f"{invalido},Bia,jogador\n")
    with pytest.raises(ValueError, match="linha 2"):
        ler_membros(arquivo)


def test_rejeita_id_duplicado(tmp_path):
    arquivo = escrever(tmp_path, CABECALHO + f"{ID1},Bia,jogador\n{ID1},Rafa,jogador\n")
    with pytest.raises(ValueError, match=r"linha 3.*duplicado"):
        ler_membros(arquivo)


def test_rejeita_papel_desconhecido(tmp_path):
    arquivo = escrever(tmp_path, CABECALHO + f"{ID1},Bia,rei\n")
    with pytest.raises(ValueError, match="papel"):
        ler_membros(arquivo)


def test_rejeita_apelido_vazio(tmp_path):
    arquivo = escrever(tmp_path, CABECALHO + f"{ID1},,jogador\n")
    with pytest.raises(ValueError, match="apelido"):
        ler_membros(arquivo)


def test_linha_incompleta_diz_a_linha(tmp_path):
    arquivo = escrever(tmp_path, CABECALHO + f"{ID1}\n")
    with pytest.raises(ValueError, match="linha 2"):
        ler_membros(arquivo)


def test_cabecalho_errado_da_erro(tmp_path):
    arquivo = escrever(tmp_path, f"id,nome,tipo\n{ID1},Bia,jogador\n")
    with pytest.raises(ValueError, match="steamid64"):
        ler_membros(arquivo)


def test_remove_espacos_em_volta(tmp_path):
    arquivo = escrever(tmp_path, CABECALHO + f" {ID1} , Bia , jogador \n")
    assert ler_membros(arquivo) == [Membro(ID1, "Bia", "jogador")]


def test_ignora_linhas_em_branco(tmp_path):
    arquivo = escrever(tmp_path, CABECALHO + f"{ID1},Bia,jogador\n\n")
    assert len(ler_membros(arquivo)) == 1


def test_aceita_csv_do_excel_brasileiro(tmp_path):
    texto = "steamid64;apelido;papel\r\n" + f"{ID1};João;jogador\r\n"
    arquivo = escrever(tmp_path, texto, "cp1252")
    assert ler_membros(arquivo) == [Membro(ID1, "João", "jogador")]


def test_aceita_csv_utf8_com_bom(tmp_path):
    arquivo = escrever(tmp_path, CABECALHO + f"{ID1},João,jogador\n", "utf-8-sig")
    assert ler_membros(arquivo) == [Membro(ID1, "João", "jogador")]


def test_whitelist_tem_um_id_por_linha():
    assert gerar_whitelist([membro(ID1), membro(ID2)]) == f"{ID1}\n{ID2}\n"


def test_partida_divide_dez_jogadores_em_dois_times():
    partida = gerar_partida(dez_jogadores() + [membro(ID_GM, papel="gm")], "de_mirage", semente=1)
    assert len(partida["team1"]["players"]) == 5 and len(partida["team2"]["players"]) == 5
    assert not set(partida["team1"]["players"]) & set(partida["team2"]["players"])
    assert partida["maplist"] == ["de_mirage"] and partida["num_maps"] == 1
    assert partida["players_per_team"] == 5 and partida["skip_veto"] is True
    assert list(partida["spectators"]["players"]) == [ID_GM]


def test_partida_exige_dez_jogadores():
    with pytest.raises(ValueError, match="10"):
        gerar_partida(dez_jogadores()[:9], "de_mirage")


def test_equipe_nao_conta_como_jogador():
    with pytest.raises(ValueError, match="10"):
        gerar_partida(dez_jogadores()[:9] + [membro(ID_GM, papel="adm")], "de_mirage")


def test_partida_guarda_o_apelido_de_cada_jogador():
    partida = gerar_partida(dez_jogadores(), "de_mirage", semente=1)
    jogadores = {**partida["team1"]["players"], **partida["team2"]["players"]}
    assert jogadores["76561198000000100"] == "j0" and len(jogadores) == 10


def test_partida_sem_equipe_nao_tem_espectadores():
    assert "spectators" not in gerar_partida(dez_jogadores(), "de_mirage", semente=1)


def test_mesma_semente_repete_os_times():
    assert gerar_partida(dez_jogadores(), "de_mirage", semente=7) == gerar_partida(dez_jogadores(), "de_mirage", semente=7)


def test_sementes_diferentes_mudam_os_times():
    primeiros = {frozenset(gerar_partida(dez_jogadores(), "de_mirage", semente=s)["team1"]["players"]) for s in range(5)}
    assert len(primeiros) > 1


def rodar(*argumentos):
    return subprocess.run([sys.executable, str(FERRAMENTA), *argumentos], capture_output=True)


def test_comando_whitelist_usa_fim_de_linha_do_linux(tmp_path):
    arquivo = escrever(tmp_path, CABECALHO + f"{ID1},Bia,jogador\n{ID2},Rafa,gm\n")
    resultado = rodar("whitelist", arquivo)
    assert resultado.returncode == 0
    assert resultado.stdout == f"{ID1}\n{ID2}\n".encode()


def test_comando_partida_gera_json_com_acentos(tmp_path):
    linhas = "".join(f"765611980000001{n:02d},João{n},jogador\n" for n in range(10))
    arquivo = escrever(tmp_path, CABECALHO + linhas)
    resultado = rodar("partida", arquivo, "de_mirage")
    assert resultado.returncode == 0
    partida = json.loads(resultado.stdout.decode("utf-8"))
    assert partida["team1"]["name"] != partida["team2"]["name"]
    assert "João" in resultado.stdout.decode("utf-8")


def test_comando_com_arquivo_errado_nao_mostra_traceback(tmp_path):
    arquivo = escrever(tmp_path, CABECALHO + "STEAM_0:1:123,Bia,jogador\n")
    resultado = rodar("whitelist", arquivo)
    assert resultado.returncode == 1
    assert b"linha 2" in resultado.stderr and b"Traceback" not in resultado.stderr
