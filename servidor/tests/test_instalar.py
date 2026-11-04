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
