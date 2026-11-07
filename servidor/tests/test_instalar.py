import pathlib
import re

INSTALADOR = (pathlib.Path(__file__).resolve().parents[1] / "scripts" / "instalar_cs2.sh").read_text(encoding="utf-8")


def test_agenda_a_atualizacao_da_lista_de_liberados():
    # Sem isso, o MatchZy segue com a lista antiga: membro novo não entra e conta punida não sai dela.
    assert re.search(r"\* \* \* \* \* \$USUARIO .*atualizar_lista\.sh", INSTALADOR)
    assert "/etc/cron.d/magnatas-lista" in INSTALADOR


def test_instala_o_agendador_quando_falta():
    assert re.search(r"PACOTES=\(.*\bcron\b", INSTALADOR)
    assert "cronie" in INSTALADOR


def test_instala_o_script_da_lista():
    assert "atualizar_lista.sh" in re.search(r"install -o .*iniciar_cs2\.sh.*", INSTALADOR).group(0)


def test_a_gravacao_das_partidas_nao_usa_porta_da_diversao():
    # Sem porta própria, o GOTV do servidor de partidas pega a 27020 (porta + 5), que é a da Mutação.
    texto = (pathlib.Path(__file__).resolve().parents[1] / "scripts" / "iniciar_cs2.sh").read_text(encoding="utf-8")
    assert "+tv_port 27030" in texto
    portas_da_diversao = range(27016, 27022)
    assert 27030 not in portas_da_diversao
