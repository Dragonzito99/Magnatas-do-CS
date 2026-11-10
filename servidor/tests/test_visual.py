"""O plugin MagnatasVisual aplica no chat o que o jogador comprou na Magnata Shop (cor, etiqueta, aviso de entrada)."""
import pathlib
import re

RAIZ = pathlib.Path(__file__).resolve().parents[1]
PASTA = RAIZ / "plugins" / "MagnatasVisual"
COMPILAR = (RAIZ / "scripts" / "compilar_plugin.sh").read_text(encoding="utf-8")


def codigo():
    return (PASTA / "MagnatasVisual.cs").read_text(encoding="utf-8")


def metodo(assinatura):
    texto = codigo()
    inicio = texto.index(assinatura)
    fim = texto.find("\n    }\n", inicio)
    return texto[inicio:fim]


def test_o_plugin_tem_projeto_proprio_como_o_da_lista():
    projeto = (PASTA / "MagnatasVisual.csproj").read_text(encoding="utf-8")
    assert "<TreatWarningsAsErrors>true</TreatWarningsAsErrors>" in projeto
    assert "$(CssApi)/CounterStrikeSharp.API.dll" in projeto


def test_sem_endereco_ou_token_o_plugin_nao_faz_nada():
    pedir = metodo("private async Task BuscarVisuais(")
    assert 'Config.SiteUrl == "" || Config.Token == ""' in pedir


def test_pergunta_ao_site_com_o_token_e_prazo_curto():
    texto = codigo()
    assert "/api/servidor/visuais?steamids=" in texto
    assert 'new AuthenticationHeaderValue("Bearer", Config.Token)' in texto
    prazo = re.search(r"TimeSpan\.FromSeconds\((\d+)\)", texto)
    assert prazo and int(prazo.group(1)) <= 3


def test_site_fora_do_ar_nao_derruba_nada():
    pedir = metodo("private async Task BuscarVisuais(")
    assert "catch (Exception" in pedir
    # O resultado só mexe no jogo no quadro seguinte, na linha principal do servidor.
    assert "Server.NextFrame" in pedir


def test_busca_ao_entrar_e_a_cada_rodada():
    texto = codigo()
    assert "EventPlayerConnectFull" in texto
    assert "EventRoundStart" in texto


def test_comandos_de_chat_passam_intactos():
    chat = metodo("private HookResult AoFalar(")
    assert "'.'" in chat and "'!'" in chat and "'/'" in chat
    comando = chat.index("'!'")
    assert chat.index("return HookResult.Continue", comando) < chat.index("return HookResult.Handled")


def test_sem_item_a_mensagem_segue_normal():
    chat = metodo("private HookResult AoFalar(")
    assert "visual.Cor == null && visual.Etiqueta == null" in chat


def test_chat_do_time_vai_so_para_o_time_e_morto_so_para_mortos():
    chat = metodo("private HookResult AoFalar(")
    assert "doTime && ouvinte.Team != jogador.Team) continue" in chat
    assert "sv_deadtalk" in codigo()
    assert "*MORTO*" in chat


def test_aviso_de_entrada_uma_vez_por_conexao():
    texto = codigo()
    assert "avisados.Add(" in texto
    assert "EventPlayerDisconnect" in texto
    assert "avisados.Remove(" in texto


def test_cores_vem_de_uma_lista_fechada():
    texto = codigo()
    for cor in ["Red", "Green", "Blue", "Purple", "Gold", "Orange", "Magenta", "LightBlue"]:
        assert f'["{cor}"] = ChatColors.{cor}' in texto


def test_compilar_instala_o_plugin_e_grava_a_config_protegida():
    assert 'cp -r "$ORIGEM/plugins/MagnatasVisual"' in COMPILAR
    assert "plugins/MagnatasVisual" in COMPILAR
    assert "configs/plugins/MagnatasVisual" in COMPILAR
    assert "chmod 600" in COMPILAR[COMPILAR.index("configs/plugins/MagnatasVisual"):]
    assert '"$SITE_URL"' in COMPILAR and '"$SERVIDOR_TOKEN"' in COMPILAR
