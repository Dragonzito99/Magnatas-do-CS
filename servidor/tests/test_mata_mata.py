import pathlib

RAIZ = pathlib.Path(__file__).resolve().parents[1]
CONFIG = (RAIZ / "config" / "mata_mata.cfg").read_text(encoding="utf-8")
INICIAR = (RAIZ / "scripts" / "iniciar_mata_mata.sh").read_text(encoding="utf-8")
INSTALADOR = (RAIZ / "scripts" / "instalar_cs2.sh").read_text(encoding="utf-8")


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


def test_so_ak_e_desert():
    assert valor("mp_ct_default_primary") == "weapon_ak47"
    assert valor("mp_t_default_primary") == "weapon_ak47"
    assert valor("mp_ct_default_secondary") == "weapon_deagle"
    assert valor("mp_t_default_secondary") == "weapon_deagle"


def test_nao_da_para_comprar_nem_pegar_outra_arma():
    assert valor("mp_buytime") == "0"
    assert valor("mp_buy_anywhere") == "0"
    assert valor("mp_maxmoney") == "0"
    assert valor("mp_death_drop_gun") == "0"
    assert valor("mp_death_drop_grenade") == "0"
    assert valor("mp_dm_bonus_length_max") == "0"


def test_placar_zera_a_cada_20_minutos_sem_parar():
    assert valor("mp_timelimit") == "20"
    assert valor("mp_maxrounds") == "0"
    assert valor("mp_endmatch_votenextmap") == "0"


def test_sem_bot_e_sem_cheat():
    assert valor("bot_quota") == "0"
    assert valor("sv_cheats") == "0"


def test_inicia_na_dust_2_na_porta_propria_com_16_vagas():
    assert "+map de_dust2" in INICIAR
    assert "-port 27016" in INICIAR
    assert "-maxplayers 16" in INICIAR
    assert "+game_type 1 +game_mode 2" in INICIAR
    assert "+exec mata_mata.cfg" in INICIAR


def test_a_configuracao_vale_depois_que_o_mapa_carrega():
    # O jogo aplica as regras padrão do mata-mata ao carregar o mapa, por cima do que veio antes.
    assert "gamemode_deathmatch_server.cfg" in INICIAR


def test_nao_grava_a_partida():
    assert "tv_enable 0" in INICIAR


def test_sessao_propria_para_nao_encostar_nas_partidas():
    assert "tmux new-session -d -x 200 -y 50 -s mata-mata" in INICIAR
    assert "-s cs2" not in INICIAR


def test_nao_carrega_os_plugins_das_partidas():
    # O MatchZy forçaria o aquecimento e expulsaria quem não está em uma partida.
    assert "addons/metamod" in INICIAR
    assert "grep -v" in INICIAR


def test_instalador_leva_o_modo():
    assert "iniciar_mata_mata.sh" in INSTALADOR
    assert "mata_mata.cfg" in INSTALADOR
