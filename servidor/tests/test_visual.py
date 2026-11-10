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


BONECO_DO_MARFIOSO = "models/magnatas/marfioso_v1/mutante.vmdl"


def test_boneco_proprio_so_de_uma_lista_fechada_e_carregado_com_o_mapa():
    texto = codigo()
    assert f'["{BONECO_DO_MARFIOSO}"] = new(PacoteDosPersonagens, null)' in texto
    assert '["models/magnatas/adm_v1/mutante.vmdl"] = new(PacoteDosPersonagens, "models/magnatas/adm_v1/gestos/gestos.vmdl")' in texto
    assert "OnServerPrecacheResources" in texto
    vestir = metodo("private void VestirBoneco(")
    # Caminho que o site mandar e não estiver na lista não vira modelo (um modelo desconhecido derruba o jogo de quem vê).
    assert "Bonecos.TryGetValue(visual.Boneco" in vestir
    assert "BonecoNoServidor(" in vestir
    assert "NoPacote(" in metodo("private Boneco? BonecoNoServidor(")
    assert ".SetModel(visual.Boneco)" in vestir


def test_veste_o_boneco_ao_nascer_e_logo_depois_de_entrar():
    assert "EventPlayerSpawn" in codigo()
    nascer = metodo("private HookResult AoNascer(")
    # Antes da Mutação (0,1 s depois de nascer), para o mutante que renasce ficar com o zumbi.
    assert "Server.NextFrame(() => VestirBoneco(" in nascer
    guardar = metodo("private void Guardar(")
    assert "VestirBoneco(" in guardar
    # A busca de cada rodada não troca o boneco de ninguém (o mutante ficaria com o boneco próprio).
    assert guardar.index("if (!avisar) return;") < guardar.index("VestirBoneco(")


def test_gestos_do_boneco_proprio_por_comando_que_da_para_por_numa_tecla():
    texto = codigo()
    for gesto in ["danca", "flexao", "mortal"]:
        assert f'AddCommand("css_{gesto}"' in texto
    fazer = metodo("private void FazerGesto(")
    # Só quem tem boneco com gestos, vivo, e um gesto por vez.
    assert "boneco.Gestos == null" in fazer
    assert "PawnIsAlive" in fazer
    assert "gestos.ContainsKey(jogador.Slot)" in fazer
    # O corpo some e para; no lugar, o modelo de cena toca o gesto, criado já com tudo (como a queda do mutante).
    assert 'valores.SetString("DefaultAnim", gesto)' in fazer
    assert "MoveType_t.MOVETYPE_NONE" in fazer
    assert "AddTimer(" in fazer


def test_o_gesto_acaba_ao_tomar_dano_morrer_ou_trocar_de_rodada_e_devolve_o_que_tinha():
    texto = codigo()
    for evento in ["EventPlayerHurt", "EventPlayerDeath", "EventRoundPrestart"]:
        assert evento in texto
    encerrar = metodo("private void EncerrarGesto(")
    assert "gesto.Cena.Remove()" in encerrar
    # Volta a cor e o modo de desenho de antes (a Mutação pinta mutante e portador).
    assert "gesto.Cor" in encerrar and "gesto.ModoDeDesenho" in encerrar
    assert "MoveType_t.MOVETYPE_WALK" in encerrar


def test_confere_de_novo_a_cada_mapa_se_o_pacote_chegou():
    # O pacote novo chega numa troca de mapa: sem limpar, o "não chegou" da primeira conferência ficava para sempre.
    texto = codigo()
    assert "Listeners.OnMapStart" in texto
    assert "bonecosNoServidor.Clear()" in texto


def test_na_mutacao_nao_troca_boneco_nem_faz_gesto():
    # Na Mutação a troca para o boneco próprio, seguida 0,1 s depois da troca para o zumbi, derrubou o servidor
    # (WriteEnterPVS, 10/11/2026 19:54). Lá o corpo fica com a Mutação.
    texto = codigo()
    assert '"/diversao/mutacao/"' in texto
    assert "NaMutacao()" in metodo("private void VestirBoneco(")
    assert "NaMutacao()" in metodo("private void FazerGesto(")
    # Nem carrega os modelos lá: a Mutação não baixa o pacote dos personagens (OnPreserveEntity no jogo do Adm, 20:01).
    precarga = texto[texto.index("OnServerPrecacheResources"):]
    assert precarga.index("NaMutacao()") < precarga.index("manifesto.AddResource(modelo)")
