import pathlib

RAIZ = pathlib.Path(__file__).resolve().parents[1]
CONFIG = (RAIZ / "config" / "mata_mata.cfg").read_text(encoding="utf-8")
INICIAR = (RAIZ / "scripts" / "iniciar_mata_mata.sh").read_text(encoding="utf-8")
INSTALADOR = (RAIZ / "scripts" / "instalar_cs2.sh").read_text(encoding="utf-8")
PASTA_DO_PLUGIN = RAIZ / "plugins" / "MagnatasMataMata"


def valor(comando):
    for linha in CONFIG.splitlines():
        partes = linha.split()
        if partes and partes[0] == comando:
            return partes[1]
    raise AssertionError(f"{comando} não está na configuração")


def test_cada_um_por_si():
    assert valor("mp_teammates_are_enemies") == "1"


def test_renasce_em_outro_lugar_do_mapa():
    assert valor("mp_randomspawn") == "1"
    assert valor("mp_respawn_on_death_ct") == "1"
    assert valor("mp_respawn_on_death_t") == "1"


def test_so_desert_e_faca_vem_da_configuracao():
    assert valor("mp_ct_default_secondary") == "weapon_deagle"
    assert valor("mp_t_default_secondary") == "weapon_deagle"
    assert valor("mp_ct_default_melee") == "weapon_knife"
    assert valor("mp_t_default_melee") == "weapon_knife"


def test_o_plugin_entrega_a_ak_a_cada_renascimento():
    # O modo mata-mata do jogo ignora a arma principal padrão, e todo mundo nasceria só com a Desert.
    codigo = (PASTA_DO_PLUGIN / "MagnatasMataMata.cs").read_text(encoding="utf-8")
    assert "EventPlayerSpawn" in codigo
    assert '"weapon_ak47"' in codigo
    assert "GiveNamedItem" in codigo


def test_o_plugin_nao_entrega_uma_segunda_ak():
    codigo = (PASTA_DO_PLUGIN / "MagnatasMataMata.cs").read_text(encoding="utf-8")
    assert "MyWeapons" in codigo


def test_nao_da_para_comprar_nem_pegar_outra_arma():
    assert valor("mp_buytime") == "0"
    assert valor("mp_maxmoney") == "0"
    assert valor("mp_death_drop_gun") == "0"
    assert valor("mp_death_drop_grenade") == "0"
    assert valor("mp_weapons_allow_map_placed") == "0"


def test_nao_compra_nem_durante_a_protecao_de_quem_renasce():
    # Com esta regra ligada, o jogo libera a compra e ignora o tempo de compra zerado.
    assert valor("mp_buy_during_immunity") == "0"
    assert valor("sv_buy_status_override") == "3"


def test_sem_os_extras_do_modo_mata_mata():
    assert valor("mp_dm_bonus_length_max") == "0"
    assert int(valor("mp_dm_healthshot_killcount")) >= 1000
    assert valor("mp_weapons_allow_zeus") == "0"


def test_placar_zera_a_cada_20_minutos_pelo_plugin():
    codigo = (PASTA_DO_PLUGIN / "MagnatasMataMata.cs").read_text(encoding="utf-8")
    assert "SegundosAteZerarOPlacar = 20 * 60" in codigo
    assert "mp_restartgame" in codigo
    assert "TimerFlags.REPEAT" in codigo


def test_a_partida_nunca_acaba_pelo_tempo_do_jogo():
    # Neste modo, quem chega ao fim da partida fica sem time, e o jogo não recomeça.
    assert valor("mp_timelimit") == "0"
    assert valor("mp_roundtime") == "60"
    assert valor("mp_maxrounds") == "0"
    assert valor("mp_winlimit") == "0"


def test_o_plugin_informa_as_contas_conectadas_so_ao_servidor():
    # O status_json do CS2 só olha as primeiras vagas, e quem está em uma vaga alta fica de fora.
    codigo = (PASTA_DO_PLUGIN / "MagnatasMataMata.cs").read_text(encoding="utf-8")
    assert '"magnatas_jogadores"' in codigo
    assert "CommandUsage.SERVER_ONLY" in codigo
    assert "magnatas_jogadores=[" in codigo


def test_sem_bot_e_sem_cheat():
    assert valor("bot_quota") == "0"
    assert valor("sv_cheats") == "0"


def test_inicia_na_dust_2_na_porta_propria_com_16_vagas():
    assert "+map de_dust2" in INICIAR
    assert "-port 27016" in INICIAR
    assert "-maxplayers 16" in INICIAR
    assert "+exec mata_mata.cfg" in INICIAR


def test_usa_o_modo_mata_mata_para_espalhar_quem_renasce():
    # Nos outros modos do jogo, o renascimento espalhado não vale e cada time volta para a própria base.
    assert "+game_type 1 +game_mode 2" in INICIAR
    assert "+game_type 3" not in INICIAR


def test_a_configuracao_vale_depois_que_o_mapa_carrega():
    # O jogo aplica as regras do modo ao carregar o mapa, por cima do que veio antes.
    assert "gamemode_deathmatch_server.cfg" in INICIAR
    assert "gamemode_custom_server.cfg" not in INICIAR


def test_nao_grava_a_partida():
    assert "tv_enable 0" in INICIAR


def test_sessao_propria_para_nao_encostar_nas_partidas():
    assert "tmux new-session -d -x 200 -y 50 -s mata-mata" in INICIAR
    assert "-s cs2" not in INICIAR


def test_nao_carrega_os_plugins_das_partidas():
    # O MatchZy forçaria o aquecimento e expulsaria quem não está em uma partida.
    assert 'rm -rf "$MATA_MATA/csgo/addons/counterstrikesharp/plugins/MatchZy"' in INICIAR


def test_carrega_o_plugin_da_ak():
    assert "PASTA_DOS_PLUGINS=$MATA_MATA/csgo/addons/counterstrikesharp/plugins" in INICIAR
    assert 'cp "$PLUGIN" "$PASTA_DOS_PLUGINS/MagnatasMataMata/MagnatasMataMata.dll"' in INICIAR
    assert 'grep -v' not in INICIAR


def test_nao_inicia_sem_o_plugin_da_ak():
    # Sem o plugin o modo sobe, mas todo mundo nasce só com a Desert.
    assert '[ ! -f "$PLUGIN" ]' in INICIAR


def test_instalador_leva_o_modo():
    assert "iniciar_mata_mata.sh" in INSTALADOR
    assert "mata_mata.cfg" in INSTALADOR


def test_instalador_compila_o_plugin():
    assert "compilar_plugin.sh" in INSTALADOR
    assert (RAIZ / "scripts" / "compilar_plugin.sh").is_file()
