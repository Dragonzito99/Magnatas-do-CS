import subprocess
import sys
from pathlib import Path

import pytest

from stats import calcular_kd, exportar, hs_pct, ler_partida

FIXTURE = str(Path(__file__).parent / "fixtures" / "match_data_map0_12.csv")
FERRAMENTA = Path(__file__).parents[1] / "ferramentas" / "stats.py"


def test_kd_arredonda_em_duas_casas():
    assert calcular_kd(20, 15) == 1.33


def test_kd_sem_mortes_vale_os_abates():
    assert calcular_kd(7, 0) == 7.0


def test_kd_sem_abates_e_sem_mortes_vale_zero():
    assert calcular_kd(0, 0) == 0.0


def test_hs_sem_abates_vale_zero():
    assert hs_pct(0, 0) == 0.0


def test_hs_em_porcentagem():
    assert hs_pct(5, 20) == 25.0


def test_csv_vazio_da_erro_claro(tmp_path):
    arquivo = tmp_path / "vazio.csv"
    arquivo.write_text("")
    with pytest.raises(ValueError, match="vazio"):
        ler_partida(str(arquivo))


def test_csv_so_com_cabecalho_da_erro_claro(tmp_path):
    arquivo = tmp_path / "cabecalho.csv"
    arquivo.write_text("steamid64,team,name,kills,deaths,assists,damage,head_shot_kills\n")
    with pytest.raises(ValueError, match="vazio"):
        ler_partida(str(arquivo))


def test_coluna_faltando_diz_qual(tmp_path):
    arquivo = tmp_path / "x.csv"
    arquivo.write_text("steamid64,name,kills\n1,a,1\n")
    with pytest.raises(ValueError, match="deaths"):
        ler_partida(str(arquivo))


def test_ler_partida_devolve_uma_linha_por_jogador():
    linhas = ler_partida(FIXTURE)
    assert [linha["name"] for linha in linhas] == ["Bia", "Rafa"]


def test_exportar_gera_as_colunas_da_ficha(tmp_path):
    saida = tmp_path / "saida.csv"
    exportar(FIXTURE, str(saida))
    assert saida.read_text(encoding="utf-8").splitlines() == [
        "steamid64,apelido,time,abates,mortes,assistencias,kd,hs_pct,dano",
        "76561198000000001,Bia,team1,20,15,4,1.33,25.0,2500",
        "76561198000000002,Rafa,team2,7,0,1,7.0,0.0,900",
    ]


CABECALHO = "steamid64,team,name,kills,deaths,assists,damage,head_shot_kills\n"


def test_linha_curta_diz_a_linha_e_a_coluna(tmp_path):
    arquivo = tmp_path / "curta.csv"
    arquivo.write_text(CABECALHO + "1,team1,Bia,3,1,0,100,1\n2,team2,Rafa\n", encoding="utf-8")
    with pytest.raises(ValueError, match=r"linha 3.*kills"):
        ler_partida(str(arquivo))


@pytest.mark.parametrize("valor", ["abc", "1.0", ""])
def test_valor_que_nao_e_inteiro_diz_a_linha_e_a_coluna(tmp_path, valor):
    arquivo = tmp_path / "ruim.csv"
    arquivo.write_text(CABECALHO + f"1,team1,Bia,{valor},1,0,100,1\n", encoding="utf-8")
    with pytest.raises(ValueError, match=r"linha 2.*kills"):
        ler_partida(str(arquivo))


def test_saida_anterior_fica_intacta_quando_uma_linha_e_ruim(tmp_path):
    entrada = tmp_path / "ruim.csv"
    entrada.write_text(CABECALHO + "1,team1,Bia,3,1,0,100,1\n2,team2,Rafa,abc,1,0,100,1\n", encoding="utf-8")
    saida = tmp_path / "saida.csv"
    saida.write_text("conteudo anterior", encoding="utf-8")
    with pytest.raises(ValueError):
        exportar(str(entrada), str(saida))
    assert saida.read_text(encoding="utf-8") == "conteudo anterior"
    assert sorted(item.name for item in tmp_path.iterdir()) == ["ruim.csv", "saida.csv"]


def test_exportar_troca_a_saida_anterior(tmp_path):
    saida = tmp_path / "saida.csv"
    saida.write_text("conteudo anterior", encoding="utf-8")
    exportar(FIXTURE, str(saida))
    assert "conteudo anterior" not in saida.read_text(encoding="utf-8")
    assert sorted(item.name for item in tmp_path.iterdir()) == ["saida.csv"]


def test_comando_com_linha_ruim_nao_mostra_traceback(tmp_path):
    entrada = tmp_path / "curta.csv"
    entrada.write_text(CABECALHO + "2,team2,Rafa\n", encoding="utf-8")
    resultado = subprocess.run(
        [sys.executable, str(FERRAMENTA), str(entrada), str(tmp_path / "saida.csv")],
        capture_output=True,
    )
    assert resultado.returncode == 1
    assert b"linha 2" in resultado.stderr and b"Traceback" not in resultado.stderr
