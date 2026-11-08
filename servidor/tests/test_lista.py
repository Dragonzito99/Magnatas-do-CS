from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
COMPILAR = (RAIZ / "scripts" / "compilar_plugin.sh").read_text(encoding="utf-8")
PLUGIN = (RAIZ / "plugins" / "MagnatasLista" / "MagnatasLista.cs").read_text(encoding="utf-8")


def test_plugin_da_lista_responde_como_o_da_diversao_e_so_para_o_servidor():
    assert '[ConsoleCommand("magnatas_jogadores"' in PLUGIN
    assert "CommandUsage.SERVER_ONLY" in PLUGIN
    assert 'magnatas_jogadores=[{string.Join(",", contas)}] mapa={Server.MapName}' in PLUGIN
    assert "IsBot: false" in PLUGIN and "IsHLTV: false" in PLUGIN


def test_compilar_instala_a_lista_no_servidor_do_competitivo():
    assert '"$OBRA/lista"' in COMPILAR
    assert "$CASA/server/game/csgo/addons/counterstrikesharp/plugins/MagnatasLista" in COMPILAR
    assert '"$OBRA/saida-lista/MagnatasLista.dll" "$PASTA_DA_LISTA/"' in COMPILAR
