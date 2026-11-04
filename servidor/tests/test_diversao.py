import pathlib

import pytest

RAIZ = pathlib.Path(__file__).resolve().parents[1]
CONFIGS = RAIZ / "config" / "diversao"
INICIAR = (RAIZ / "scripts" / "iniciar_diversao.sh").read_text(encoding="utf-8")
INSTALADOR = (RAIZ / "scripts" / "instalar_cs2.sh").read_text(encoding="utf-8")
COMPILAR = (RAIZ / "scripts" / "compilar_plugin.sh").read_text(encoding="utf-8")
CODIGO_DO_PLUGIN = (RAIZ / "plugins" / "MagnatasDiversao" / "MagnatasDiversao.cs").read_text(encoding="utf-8")
SERVIDORES = ["ak-desert", "pistola", "awp"]


def valor(comando, servidor):
    # A configuração do servidor vem depois da base, então a última linha é a que vale.
    achado = None
    for arquivo in ["cada_um_por_si.cfg", f"{servidor}.cfg"]:
        for linha in (CONFIGS / arquivo).read_text(encoding="utf-8").splitlines():
            partes = linha.split()
            if partes and partes[0] == comando:
                achado = partes[1]
    assert achado is not None, f"{comando} não está na configuração de {servidor}"
    return achado


def conf(servidor):
    campos = {}
    for linha in (CONFIGS / f"{servidor}.conf").read_text(encoding="utf-8").splitlines():
        if "=" in linha:
            chave, texto = linha.split("=", 1)
            campos[chave] = texto
    return campos


@pytest.mark.parametrize("servidor", SERVIDORES)
def test_cada_um_por_si(servidor):
    assert valor("mp_teammates_are_enemies", servidor) == "1"


@pytest.mark.parametrize("servidor", SERVIDORES)
def test_renasce_em_outro_lugar_do_mapa(servidor):
    assert valor("mp_randomspawn", servidor) == "1"
    assert valor("mp_respawn_on_death_ct", servidor) == "1"
    assert valor("mp_respawn_on_death_t", servidor) == "1"


@pytest.mark.parametrize("servidor", SERVIDORES)
def test_ninguem_pega_arma_do_chao(servidor):
    assert valor("mp_death_drop_gun", servidor) == "0"
    assert valor("mp_death_drop_grenade", servidor) == "0"
    assert valor("mp_weapons_allow_map_placed", servidor) == "0"


@pytest.mark.parametrize("servidor", SERVIDORES)
def test_sem_os_extras_do_modo_mata_mata(servidor):
    assert valor("mp_dm_bonus_length_max", servidor) == "0"
    assert int(valor("mp_dm_healthshot_killcount", servidor)) >= 1000
    assert valor("mp_weapons_allow_zeus", servidor) == "0"


@pytest.mark.parametrize("servidor", SERVIDORES)
def test_a_partida_nunca_acaba_pelo_tempo_do_jogo(servidor):
    # Neste modo, quem chega ao fim da partida fica sem time, e o jogo não recomeça.
    assert valor("mp_timelimit", servidor) == "0"
    assert valor("mp_roundtime", servidor) == "60"
    assert valor("mp_maxrounds", servidor) == "0"
    assert valor("mp_winlimit", servidor) == "0"


@pytest.mark.parametrize("servidor", SERVIDORES)
def test_sem_bot_e_sem_cheat(servidor):
    assert valor("bot_quota", servidor) == "0"
    assert valor("sv_cheats", servidor) == "0"


@pytest.mark.parametrize("servidor", SERVIDORES)
def test_cada_servidor_tem_nome_proprio(servidor):
    assert "Magnatas do CS" in (CONFIGS / f"{servidor}.cfg").read_text(encoding="utf-8")


def test_portas_diferentes():
    portas = [conf(servidor)["PORTA"] for servidor in SERVIDORES]
    assert portas == ["27016", "27017", "27018"]


def test_ak_e_desert_na_dust_2():
    campos = conf("ak-desert")
    assert campos["MAPA"] == "de_dust2"
    assert campos["ARMA_PRINCIPAL"] == "weapon_ak47"
    assert valor("mp_ct_default_secondary", "ak-desert") == "weapon_deagle"
    assert valor("mp_t_default_secondary", "ak-desert") == "weapon_deagle"
    assert valor("sv_buy_status_override", "ak-desert") == "3"


def test_so_pistola_na_mirage_escolhida_no_menu():
    campos = conf("pistola")
    assert campos["MAPA"] == "de_mirage"
    assert campos["ARMA_PRINCIPAL"] == ""
    assert valor("mp_buy_allow_guns", "pistola") == "1"
    assert valor("sv_buy_status_override", "pistola") == "-1"
    assert valor("mp_buy_anywhere", "pistola") == "1"
    assert valor("mp_buy_during_immunity", "pistola") == "1"


def test_so_awp_na_mirage_sem_pistola_e_sem_compra():
    campos = conf("awp")
    assert campos["MAPA"] == "de_mirage"
    assert campos["ARMA_PRINCIPAL"] == "weapon_awp"
    assert valor("mp_ct_default_secondary", "awp") == '""'
    assert valor("mp_t_default_secondary", "awp") == '""'
    assert valor("sv_buy_status_override", "awp") == "3"


@pytest.mark.parametrize("servidor", ["ak-desert", "awp"])
def test_nao_compra_nem_durante_a_protecao_de_quem_renasce(servidor):
    # Com esta regra ligada, o jogo libera a compra e ignora o tempo de compra zerado.
    assert valor("mp_buy_during_immunity", servidor) == "0"


def test_o_plugin_entrega_a_arma_definida_na_configuracao():
    # O modo mata-mata do jogo ignora a arma principal padrão, e cada servidor tem a sua.
    assert "ArmaPrincipal" in CODIGO_DO_PLUGIN
    assert "IPluginConfig" in CODIGO_DO_PLUGIN
    assert "EventPlayerSpawn" in CODIGO_DO_PLUGIN
    assert "GiveNamedItem" in CODIGO_DO_PLUGIN
    assert '"weapon_ak47"' not in CODIGO_DO_PLUGIN


def test_o_plugin_nao_entrega_uma_segunda_arma():
    assert "MyWeapons" in CODIGO_DO_PLUGIN


def test_placar_zera_a_cada_20_minutos_pelo_plugin():
    assert "SegundosAteZerarOPlacar = 20 * 60" in CODIGO_DO_PLUGIN
    assert "mp_restartgame" in CODIGO_DO_PLUGIN
    assert "TimerFlags.REPEAT" in CODIGO_DO_PLUGIN


def test_o_plugin_informa_as_contas_conectadas_so_ao_servidor():
    # O status_json do CS2 só olha as primeiras vagas, e quem está em uma vaga alta fica de fora.
    assert '"magnatas_jogadores"' in CODIGO_DO_PLUGIN
    assert "CommandUsage.SERVER_ONLY" in CODIGO_DO_PLUGIN
    assert "magnatas_jogadores=[" in CODIGO_DO_PLUGIN


def test_a_regra_de_equipe_vem_da_configuracao():
    assert '"Regra"' in CODIGO_DO_PLUGIN
    assert '"MinutosDaPartida"' in CODIGO_DO_PLUGIN
    assert '"equipe"' in CODIGO_DO_PLUGIN


def test_so_abate_de_inimigo_conta_ponto():
    # Suicídio, queda e abate de colega não podem dar ponto ao time.
    assert "quem == alvo" in CODIGO_DO_PLUGIN
    assert "quem.Team == alvo.Team" in CODIGO_DO_PLUGIN


def test_abates_aparecem_no_placar():
    assert "CCSTeam" in CODIGO_DO_PLUGIN
    assert '"m_iScore"' in CODIGO_DO_PLUGIN
    assert "SetStateChanged" in CODIGO_DO_PLUGIN


def test_a_partida_decide_vitoria_ou_empate_por_abates():
    # Sem isso, o jogo daria a vitória ao CT por tempo.
    assert "TerminateRound" in CODIGO_DO_PLUGIN
    assert "RoundEndReason.CTsWin" in CODIGO_DO_PLUGIN
    assert "RoundEndReason.TerroristsWin" in CODIGO_DO_PLUGIN
    assert "RoundEndReason.RoundDraw" in CODIGO_DO_PLUGIN


def test_aquecimento_nao_inicia_a_contagem():
    assert "WarmupPeriod" in CODIGO_DO_PLUGIN


def test_so_um_relogio_por_partida():
    # Sem desligar o anterior, recarregar o plugin ou reiniciar a rodada deixaria dois relógios rodando.
    assert CODIGO_DO_PLUGIN.index("fimDaPartida?.Kill()") < CODIGO_DO_PLUGIN.index("fimDaPartida = AddTimer")


def test_zerar_o_placar_a_cada_20_minutos_so_no_cada_um_por_si():
    regra = CODIGO_DO_PLUGIN.index('Config.Regra == "cada_um"')
    assert regra < CODIGO_DO_PLUGIN.index("mp_restartgame")


def test_a_compilacao_gera_o_plugin_da_diversao():
    assert "plugins/MagnatasDiversao" in COMPILAR
    assert "MagnatasDiversao.dll" in COMPILAR
    assert "MagnatasMataMata" not in COMPILAR


def test_recusa_servidor_desconhecido():
    assert '[ ! -f "$CONFIGS/$NOME.conf" ]' in INICIAR


def test_aceita_ligar_todos():
    assert '"$NOME" = "todos"' in INICIAR


def test_le_porta_mapa_e_vagas_da_configuracao():
    assert '-port "$PORTA"' in INICIAR
    assert '-maxplayers "$VAGAS"' in INICIAR
    assert '+map "$MAPA"' in INICIAR


def test_usa_o_modo_mata_mata_para_espalhar_quem_renasce():
    # Nos outros modos do jogo, o renascimento espalhado não vale e cada time volta para a própria base.
    assert "+game_type 1 +game_mode 2" in INICIAR


def test_a_configuracao_vale_depois_que_o_mapa_carrega():
    # O jogo aplica as regras do modo ao carregar o mapa, por cima do que veio antes.
    assert "gamemode_deathmatch_server.cfg" in INICIAR


def test_junta_a_base_com_a_configuracao_do_servidor_nessa_ordem():
    assert 'cat "$CONFIGS/cada_um_por_si.cfg" "$CONFIGS/$NOME.cfg"' in INICIAR


def test_grava_a_arma_para_o_plugin():
    assert "MagnatasDiversao.json" in INICIAR
    assert "$ARMA_PRINCIPAL" in INICIAR


def test_nao_grava_a_partida():
    assert "tv_enable 0" in INICIAR


def test_sessao_e_pasta_proprias_para_nao_encostar_nas_partidas():
    assert 'tmux new-session -d -x 200 -y 50 -s "diversao-$NOME"' in INICIAR
    assert 'tmux has-session -t "diversao-$NOME"' in INICIAR
    assert "PASTA=$CASA/diversao/$NOME/game" in INICIAR
    assert "-s cs2" not in INICIAR


def test_o_programa_nao_ocupa_espaco_duplicado():
    assert 'cp -al "$SERVIDOR/bin" "$PASTA/"' in INICIAR


def test_nao_carrega_os_plugins_das_partidas():
    # O MatchZy forçaria o aquecimento e expulsaria quem não está em uma partida.
    assert 'rm -rf "$PASTA_DOS_PLUGINS/MatchZy"' in INICIAR


def test_carrega_o_plugin_da_diversao():
    assert "PASTA_DOS_PLUGINS=$PASTA/csgo/addons/counterstrikesharp/plugins" in INICIAR
    assert 'cp "$PLUGIN" "$PASTA_DOS_PLUGINS/MagnatasDiversao/MagnatasDiversao.dll"' in INICIAR


def test_nao_inicia_sem_o_plugin():
    # Sem o plugin o servidor sobe, mas a arma principal não vem e o site não enxerga ninguém.
    assert '[ ! -f "$PLUGIN" ]' in INICIAR


def test_cada_servidor_usa_o_proprio_token_da_steam():
    assert "GSLT_" in INICIAR
    assert "tr 'a-z-' 'A-Z_'" in INICIAR
    assert "GSLT_MATA_MATA" not in INICIAR


def test_instalador_leva_os_servidores():
    assert "iniciar_diversao.sh" in INSTALADOR
    assert "config/diversao" in INSTALADOR
    assert "mata_mata" not in INSTALADOR


def test_instalador_compila_o_plugin():
    assert "compilar_plugin.sh" in INSTALADOR
    assert (RAIZ / "scripts" / "compilar_plugin.sh").is_file()
