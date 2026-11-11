import re
import pathlib

import pytest

RAIZ = pathlib.Path(__file__).resolve().parents[1]
CONFIGS = RAIZ / "config" / "diversao"
INICIAR = (RAIZ / "scripts" / "iniciar_diversao.sh").read_text(encoding="utf-8")
INSTALADOR = (RAIZ / "scripts" / "instalar_cs2.sh").read_text(encoding="utf-8")
COMPILAR = (RAIZ / "scripts" / "compilar_plugin.sh").read_text(encoding="utf-8")
CODIGO_DO_PLUGIN = (RAIZ / "plugins" / "MagnatasDiversao" / "MagnatasDiversao.cs").read_text(encoding="utf-8")
CODIGO_DO_FANTASMA = (RAIZ / "plugins" / "MagnatasDiversao" / "Fantasma.cs").read_text(encoding="utf-8")
CODIGO_DA_MUTACAO = (RAIZ / "plugins" / "MagnatasDiversao" / "Mutacao.cs").read_text(encoding="utf-8")
CADA_UM_POR_SI = ["ak-desert", "pistola", "awp"]
SERVIDORES = [*CADA_UM_POR_SI, "equipe", "mutacao", "fantasma"]


def conf(servidor):
    campos = {}
    for linha in (CONFIGS / f"{servidor}.conf").read_text(encoding="utf-8").splitlines():
        if "=" in linha:
            chave, texto = linha.split("=", 1)
            campos[chave] = texto
    return campos


def linhas_de(comando, servidor):
    # A configuração do servidor vem depois da base, então a última linha é a que vale.
    achadas = []
    for arquivo in [conf(servidor)["BASE"], f"{servidor}.cfg"]:
        for linha in (CONFIGS / arquivo).read_text(encoding="utf-8").splitlines():
            partes = linha.split(maxsplit=1)
            if partes and partes[0] == comando:
                achadas.append(partes[1] if len(partes) > 1 else "")
    assert achadas, f"{comando} não está na configuração de {servidor}"
    return achadas


def valor(comando, servidor):
    return linhas_de(comando, servidor)[-1]


@pytest.mark.parametrize("servidor", CADA_UM_POR_SI)
def test_cada_um_por_si(servidor):
    assert valor("mp_teammates_are_enemies", servidor) == "1"


@pytest.mark.parametrize("servidor", CADA_UM_POR_SI)
def test_renasce_em_outro_lugar_do_mapa(servidor):
    assert valor("mp_randomspawn", servidor) == "1"
    assert valor("mp_respawn_on_death_ct", servidor) == "1"
    assert valor("mp_respawn_on_death_t", servidor) == "1"


@pytest.mark.parametrize("servidor", SERVIDORES)
def test_ninguem_pega_arma_do_chao(servidor):
    assert valor("mp_death_drop_gun", servidor) == "0"
    assert valor("mp_death_drop_grenade", servidor) == "0"
    assert valor("mp_weapons_allow_map_placed", servidor) == "0"


@pytest.mark.parametrize("servidor", CADA_UM_POR_SI)
def test_sem_os_extras_do_modo_mata_mata(servidor):
    assert valor("mp_dm_bonus_length_max", servidor) == "0"
    assert int(valor("mp_dm_healthshot_killcount", servidor)) >= 1000
    assert valor("mp_weapons_allow_zeus", servidor) == "0"


@pytest.mark.parametrize("servidor", CADA_UM_POR_SI)
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
    assert portas == ["27016", "27017", "27018", "27019", "27020", "27021"]


@pytest.mark.parametrize("servidor", CADA_UM_POR_SI)
def test_cada_um_por_si_usa_o_modo_mata_mata_para_espalhar_quem_renasce(servidor):
    # Nos outros modos do jogo, o renascimento espalhado não vale e cada time volta para a própria base.
    campos = conf(servidor)
    assert campos["GAME_TYPE"] == "1"
    assert campos["GAME_MODE"] == "2"
    assert campos["BASE"] == "cada_um_por_si.cfg"
    assert campos["REGRAS_DO_JOGO"] == "gamemode_deathmatch_server.cfg"
    assert campos["REGRA"] == "cada_um"


def test_equipe_usa_o_modo_personalizado_e_o_mapa_da_oficina():
    # O modo personalizado entrega a arma principal e renasce na base.
    campos = conf("equipe")
    assert campos["GAME_TYPE"] == "3"
    assert campos["GAME_MODE"] == "0"
    assert campos["BASE"] == "equipe_base.cfg"
    assert campos["REGRAS_DO_JOGO"] == "gamemode_custom_server.cfg"
    assert campos["REGRA"] == "equipe"
    assert campos["OFICINA"] == "3122345065"
    assert campos["ARMA_PRINCIPAL"] == ""
    assert campos["VAGAS"] == "16"


def test_equipe_tem_times_de_verdade_e_renasce_na_base():
    assert valor("mp_teammates_are_enemies", "equipe") == "0"
    assert valor("mp_friendlyfire", "equipe") == "0"
    assert valor("mp_randomspawn", "equipe") == "0"
    assert valor("mp_respawn_on_death_ct", "equipe") == "1"
    assert valor("mp_respawn_on_death_t", "equipe") == "1"


def test_equipe_renasce_em_ate_um_segundo():
    # A câmera de morte segura cerca de 4 segundos antes de renascer, e o dono pediu no máximo 1.
    assert valor("spec_freeze_time", "equipe") == "0"
    assert valor("spec_freeze_deathanim_time", "equipe") == "0"
    assert valor("spec_freeze_traveltime", "equipe") == "0"
    assert valor("spec_freeze_time_lock", "equipe") == "0"


def test_equipe_com_times_equilibrados():
    assert valor("mp_autoteambalance", "equipe") == "1"
    assert valor("mp_limitteams", "equipe") == "1"


def test_equipe_com_m4_ak_pistola_padrao_e_kit_de_granadas():
    assert valor("mp_ct_default_primary", "equipe") == "weapon_m4a1"
    assert valor("mp_t_default_primary", "equipe") == "weapon_ak47"
    assert valor("mp_ct_default_secondary", "equipe") == "weapon_hkp2000"
    assert valor("mp_t_default_secondary", "equipe") == "weapon_glock"
    kit = '"weapon_smokegrenade weapon_flashbang weapon_hegrenade"'
    assert valor("mp_ct_default_grenades", "equipe") == kit
    assert valor("mp_t_default_grenades", "equipe") == kit


def test_equipe_sem_compra_e_sem_bomba():
    assert valor("sv_buy_status_override", "equipe") == "3"
    assert valor("mp_buy_during_immunity", "equipe") == "0"
    assert valor("mp_give_player_c4", "equipe") == "0"


def test_equipe_quem_encerra_a_partida_e_o_plugin():
    # O relógio da tela mostra os 5 minutos, e o jogo não encerra a rodada sozinho ao chegar em zero.
    assert valor("mp_ignore_round_win_conditions", "equipe") == "1"
    assert valor("mp_roundtime", "equipe") == "5"
    assert valor("mp_roundtime_defuse", "equipe") == "0"
    assert valor("mp_maxrounds", "equipe") == "1"
    assert valor("mp_timelimit", "equipe") == "0"
    assert valor("mp_match_end_restart", "equipe") == "1"


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
    assert '"equipe"' in CODIGO_DO_PLUGIN


def test_a_partida_dura_o_tempo_do_relogio_da_tela():
    # Um valor só: mudar o tempo é mudar uma linha da configuração, e o relógio e o fim continuam combinando.
    assert 'ConVar<float>.Find("mp_roundtime")' in CODIGO_DO_PLUGIN
    assert "MinutosDaPartida" not in CODIGO_DO_PLUGIN


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
    assert CODIGO_DO_PLUGIN.index("Parar(ref fimDaPartida)") < CODIGO_DO_PLUGIN.index("fimDaPartida = AddTimer")


def test_zerar_o_placar_a_cada_20_minutos_so_no_cada_um_por_si():
    regra = CODIGO_DO_PLUGIN.index('Config.Regra == "cada_um"')
    assert regra < CODIGO_DO_PLUGIN.index("mp_restartgame")


def test_o_plugin_envia_o_resultado_ao_site():
    assert "/api/servidor/diversao/resultado" in CODIGO_DO_PLUGIN
    assert "HttpClient" in CODIGO_DO_PLUGIN
    assert "Config.SiteUrl" in CODIGO_DO_PLUGIN
    assert "Config.Token" in CODIGO_DO_PLUGIN


def test_quem_calcula_o_xp_e_o_site():
    # O plugin envia só os números. Se enviasse o XP pronto, um servidor conseguiria inventar XP.
    assert "abates =" in CODIGO_DO_PLUGIN
    assert "xp =" not in CODIGO_DO_PLUGIN.lower()


def test_conta_os_abates_por_conta_nas_duas_regras():
    assert "SteamID" in CODIGO_DO_PLUGIN
    assert ".Abates++" in CODIGO_DO_PLUGIN


def test_mostra_o_xp_no_centro_da_tela_e_no_chat():
    assert "PrintToCenterHtml" in CODIGO_DO_PLUGIN
    assert "PrintToChat" in CODIGO_DO_PLUGIN
    # O nome da patente vem do site e entra em HTML.
    assert "HtmlEncode" in CODIGO_DO_PLUGIN


def test_a_tela_so_e_mexida_de_volta_no_jogo():
    # O envio roda fora do jogo, e o CS2 quebra se a tela for mexida de lá.
    assert "Server.NextFrameAsync" in CODIGO_DO_PLUGIN or "Server.NextFrame(" in CODIGO_DO_PLUGIN
    assert "Task.Run" in CODIGO_DO_PLUGIN


def test_site_fora_do_ar_nao_atrapalha_o_jogo():
    # O fim da partida não espera a resposta, e o mesmo id evita contar duas vezes ao tentar de novo.
    assert "TentativasDeEnvio = 3" in CODIGO_DO_PLUGIN
    assert "PrazoDoEnvio" in CODIGO_DO_PLUGIN
    assert "catch" in CODIGO_DO_PLUGIN
    assert "await " not in CODIGO_DO_PLUGIN[: CODIGO_DO_PLUGIN.index("Task.Run")]


def test_sem_endereco_ou_token_nao_tenta_enviar():
    assert 'Config.SiteUrl == ""' in CODIGO_DO_PLUGIN
    assert 'Config.Token == ""' in CODIGO_DO_PLUGIN


def test_o_token_nunca_vai_para_o_registro():
    assert "Console.WriteLine" in CODIGO_DO_PLUGIN
    for linha in CODIGO_DO_PLUGIN.splitlines():
        if "Console.WriteLine" in linha:
            assert "Token" not in linha


def test_avisa_que_a_partida_acabou_quem_venceu_e_que_vai_recomecar():
    assert "Partida encerrada" in CODIGO_DO_PLUGIN
    assert '"CT venceu"' in CODIGO_DO_PLUGIN
    assert '"TR venceu"' in CODIGO_DO_PLUGIN
    assert '"Empate"' in CODIGO_DO_PLUGIN
    assert "venceu com" in CODIGO_DO_PLUGIN
    assert "Aguarde" in CODIGO_DO_PLUGIN
    assert "{SegundosMostrandoOVencedor} segundos" in CODIGO_DO_PLUGIN


def test_o_aviso_nao_depende_do_site():
    # O aviso sai na hora do fim. Sem site, sem token ou sem jogador registrado, ele aparece do mesmo jeito.
    fim = CODIGO_DO_PLUGIN.index("private void EncerrarPartidaDeEquipe")
    fechar = CODIGO_DO_PLUGIN.index("FecharPartida(vencedor, minutos);")
    assert "AvisarFimDaPartida(" in CODIGO_DO_PLUGIN[fim:fechar]


def test_o_quadro_de_xp_nao_apaga_o_aviso():
    # Só um quadro aparece por vez no centro da tela, então o de XP repete o aviso.
    assert "avisoDoFim" in CODIGO_DO_PLUGIN[CODIGO_DO_PLUGIN.index("private void MostrarGanhos") :]


def test_o_nome_de_quem_venceu_e_escapado_no_quadro():
    # O apelido da Steam vem de fora e entra em HTML.
    aviso = CODIGO_DO_PLUGIN[CODIGO_DO_PLUGIN.index("private void AvisarFimDaPartida") :]
    assert "HtmlEncode" in aviso


def test_quinze_segundos_para_ler_o_resultado():
    assert "SegundosMostrandoOVencedor = 15" in CODIGO_DO_PLUGIN
    assert "mp_restartgame 15" in CODIGO_DO_PLUGIN


def test_o_script_entrega_site_e_token_ao_plugin_com_arquivo_protegido():
    assert '"SiteUrl": "%s"' in INICIAR
    assert '"Token": "%s"' in INICIAR
    assert '"Porta": %s' in INICIAR
    assert '"$SITE_URL"' in INICIAR
    assert '"$SERVIDOR_TOKEN"' in INICIAR
    assert 'chmod 600 "$CONFIG_DO_PLUGIN/MagnatasDiversao.json"' in INICIAR


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


def test_o_modo_do_jogo_vem_da_configuracao():
    assert '+game_type "$GAME_TYPE" +game_mode "$GAME_MODE"' in INICIAR


def test_abre_o_mapa_da_oficina_depois_do_mapa_inicial():
    # Só com host_workshop_map, o servidor liga e fica parado, sem mapa.
    assert '+map "$MAPA"' in INICIAR
    assert 'OFICINA:-' in INICIAR
    assert "+host_workshop_map" in INICIAR


def test_a_configuracao_vale_depois_que_o_mapa_carrega():
    # O jogo aplica as regras do modo ao carregar o mapa, por cima do que veio antes.
    assert '"$PASTA/csgo/cfg/$REGRAS_DO_JOGO"' in INICIAR


def test_junta_a_base_com_a_configuracao_do_servidor_nessa_ordem():
    assert 'cat "$CONFIGS/$BASE" "$CONFIGS/$NOME.cfg"' in INICIAR


def test_mapas_da_oficina_baixam_uma_vez_so():
    assert 'OFICINA_COMPARTILHADA=$CASA/diversao/oficina' in INICIAR
    assert 'ln -sfn "$OFICINA_COMPARTILHADA" "$PASTA/bin/linuxsteamrt64/steamapps"' in INICIAR


def test_grava_a_arma_para_o_plugin():
    assert "MagnatasDiversao.json" in INICIAR
    assert "$ARMA_PRINCIPAL" in INICIAR
    assert "$REGRA" in INICIAR
    assert '"Regra"' in INICIAR


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


def test_fantasma_so_liga_na_regra_dele():
    assert 'Config.Regra == "fantasma"' in CODIGO_DO_PLUGIN
    assert "LigarFantasma(hotReload)" in CODIGO_DO_PLUGIN


def test_fantasma_nao_zera_a_contagem_a_cada_rodada():
    # A partida tem 13 rodadas: zerar em todas perderia os abates e o XP.
    assert "TotalRoundsPlayed == 0" in CODIGO_DO_FANTASMA
    assert 'Config.Regra == "fantasma"' in CODIGO_DO_PLUGIN[CODIGO_DO_PLUGIN.index("AoComecarRodada"):]


def test_fantasma_troca_a_tela_chinesa_das_regras_pelo_texto_do_magnatas():
    # A tela em chinês é uma partícula do mapa; o plugin a apaga e mostra a imagem do site no lugar.
    assert '"crossfire_ghost_rule00"' in CODIGO_DO_FANTASMA
    assert '"DestroyImmediately"' in CODIGO_DO_FANTASMA
    # O jogo não mostrou a imagem vinda do site, então as regras vão em texto, com as frases da arte do dono.
    assert "<img" not in CODIGO_DO_FANTASMA
    assert "MODO FANTASMA" in CODIGO_DO_FANTASMA and "PROTEJA-SE" in CODIGO_DO_FANTASMA
    assert "revele sua posição" in CODIGO_DO_FANTASMA


def test_fantasma_fecha_a_partida_uma_vez_quando_o_jogo_acaba():
    assert "EventCsWinPanelMatch" in CODIGO_DO_FANTASMA
    assert "partidaEncerrada" in CODIGO_DO_FANTASMA
    assert "FecharPartida(" in CODIGO_DO_FANTASMA


def test_fantasma_decide_o_vencedor_pelas_rodadas_dos_times():
    assert "CCSTeam" in CODIGO_DO_FANTASMA
    assert '"ct"' in CODIGO_DO_FANTASMA and '"tr"' in CODIGO_DO_FANTASMA and '"empate"' in CODIGO_DO_FANTASMA
    assert "venceu por" in CODIGO_DO_FANTASMA


def test_fantasma_envia_o_time_de_cada_conta():
    assert 'Config.Regra != "cada_um" ? time : null' in CODIGO_DO_PLUGIN


def test_abate_de_colega_nao_conta_nos_modos_com_time():
    assert 'Config.Regra != "cada_um" && quem.Team == alvo.Team' in CODIGO_DO_PLUGIN


def test_placar_de_abates_continua_so_no_equipe():
    # No Fantasma, o placar é de rodadas e quem cuida dele é o jogo.
    trecho = CODIGO_DO_PLUGIN[CODIGO_DO_PLUGIN.index("AoMorrer"):]
    assert trecho.index('Config.Regra == "equipe"') < trecho.index("MostrarNoPlacar()")


def test_fantasma_recomeca_quando_a_ultima_pessoa_sai():
    assert "EventPlayerDisconnect" in CODIGO_DO_FANTASMA
    assert "mp_restartgame 1" in CODIGO_DO_FANTASMA


def test_fantasma_fica_so_com_faca_e_bomba():
    trecho = CODIGO_DO_FANTASMA[CODIGO_DO_FANTASMA.index("void DeixarSoAFaca"):]
    assert "CsTeam.Terrorist" in trecho
    assert "weapon_c4" in trecho
    assert "knife" in trecho


def test_fantasma_nao_fica_com_arma_pega_do_chao():
    assert "EventItemPickup" in CODIGO_DO_FANTASMA
    assert "DeixarSoAFaca(" in CODIGO_DO_FANTASMA[CODIGO_DO_FANTASMA.index("EventItemPickup"):]


def test_fantasma_fica_so_com_faca_ao_nascer():
    assert "DeixarSoAFaca(" in CODIGO_DO_PLUGIN[CODIGO_DO_PLUGIN.index("AoNascer"):]


def test_um_kit_de_defuse_sorteado_por_rodada():
    trecho = CODIGO_DO_FANTASMA[CODIGO_DO_FANTASMA.index("void SortearKitDeDefuse"):]
    # Quem sobreviveu ainda carrega o kit da rodada anterior.
    assert trecho.index("DefinirKit(jogador, false)") < trecho.index("DefinirKit(sorteado, true)")
    assert trecho.count("DefinirKit(sorteado, true)") == 1
    assert "Random.Shared" in trecho
    assert "PawnIsAlive" in trecho


def test_o_kit_nao_depende_de_pegar_no_chao():
    # Entregue como item, o kit demorava a chegar, e em uma rodada de 13 não chegou.
    assert "item_defuser" not in CODIGO_DO_FANTASMA
    assert "HasDefuser = temKit" in CODIGO_DO_FANTASMA


def test_sem_ct_vivo_o_sorteio_nao_quebra():
    trecho = CODIGO_DO_FANTASMA[CODIGO_DO_FANTASMA.index("void SortearKitDeDefuse"):]
    assert "Count == 0" in trecho


def test_avisa_quem_recebeu_o_kit():
    assert "kit de defuse" in CODIGO_DO_FANTASMA


def test_reconhece_os_tres_sons_da_respiracao():
    for som in ["2454124772", "2525673644", "3258385741"]:
        assert som in CODIGO_DO_FANTASMA
    assert "HookUserMessage(" in CODIGO_DO_FANTASMA


def test_bloqueia_respiracao_de_corpo_e_do_mundo():
    assert "entidade == 0" in CODIGO_DO_FANTASMA
    assert "mortos.Contains(entidade)" in CODIGO_DO_FANTASMA
    assert "HookResult.Stop" in CODIGO_DO_FANTASMA


def test_a_morte_corta_o_som_duas_vezes():
    trecho = CODIGO_DO_FANTASMA[CODIGO_DO_FANTASMA.index("EventPlayerDeath"):]
    assert "HookMode.Pre" in CODIGO_DO_FANTASMA
    assert "Cortar(entidade)" in trecho
    assert "AddTimer(RepassarCorte" in trecho
    assert "SosStopSoundEvent" in CODIGO_DO_FANTASMA


def test_copias_com_o_volume_aprovado():
    assert "CopiasDaRespiracao = 3" in CODIGO_DO_FANTASMA
    assert "IntervaloDaRespiracao = 2.5f" in CODIGO_DO_FANTASMA
    assert '"CrossFire_ghost_Breath01"' in CODIGO_DO_FANTASMA


def test_copias_so_em_fantasma_vivo():
    trecho = CODIGO_DO_FANTASMA[CODIGO_DO_FANTASMA.index("void TocarCopiasDaRespiracao"):]
    assert "PawnIsAlive" in trecho
    assert "CsTeam.Terrorist" in trecho


def test_a_lista_de_mortos_limpa_a_cada_rodada():
    assert "mortos.Clear()" in CODIGO_DO_FANTASMA[CODIGO_DO_FANTASMA.index("void ComecarRodadaDoFantasma"):]


def test_fantasma_que_cai_nao_deixa_respiracao():
    assert "Cortar(" in CODIGO_DO_FANTASMA[CODIGO_DO_FANTASMA.index("EventPlayerDisconnect"):]


def test_troca_de_lados_nao_leva_a_respiracao():
    # A rodada anterior ainda pode estar tocando: o som dura 17 segundos.
    assert "EventRoundPrestart" in CODIGO_DO_FANTASMA
    assert "tocando.Clear()" in CODIGO_DO_FANTASMA


def test_a_lista_de_sons_nao_cresce_sem_limite():
    assert "RemoveRange" in CODIGO_DO_FANTASMA


def test_o_diagnostico_e_so_do_servidor_e_nao_mostra_contas():
    trecho = CODIGO_DO_FANTASMA[CODIGO_DO_FANTASMA.index('"magnatas_fantasma_ver"'):]
    assert "CommandUsage.SERVER_ONLY" in trecho
    assert "SteamID" not in trecho


def test_fantasma_no_mapa_certo_e_no_modo_do_teste():
    campos = conf("fantasma")
    assert campos["PORTA"] == "27021"
    assert campos["VAGAS"] == "16"
    assert campos["OFICINA"] == "3582464448"
    assert campos["GAME_TYPE"] == "0"
    assert campos["GAME_MODE"] == "1"
    assert campos["REGRAS_DO_JOGO"] == "gamemode_competitive_server.cfg"
    assert campos["REGRA"] == "fantasma"
    assert campos["ARMA_PRINCIPAL"] == ""


def test_fantasma_treze_rodadas_com_troca_e_sete_vitorias():
    assert valor("mp_maxrounds", "fantasma") == "13"
    assert valor("mp_halftime", "fantasma") == "1"
    assert valor("mp_match_can_clinch", "fantasma") == "1"
    assert valor("mp_overtime_enable", "fantasma") == "0"


def test_fantasma_recomeca_sozinho_com_tempo_de_ler_o_resultado():
    assert valor("mp_match_end_restart", "fantasma") == "1"
    assert valor("mp_match_restart_delay", "fantasma") == "15"
    assert valor("mp_endmatch_votenextmap", "fantasma") == "0"
    assert valor("mp_match_end_changelevel", "fantasma") == "0"


def test_fantasma_ct_com_kit_fixo():
    assert valor("mp_ct_default_primary", "fantasma") == "weapon_m4a1_silencer"
    assert valor("mp_ct_default_secondary", "fantasma") == "weapon_usp_silencer"
    assert valor("mp_ct_default_grenades", "fantasma") == '"weapon_smokegrenade weapon_flashbang weapon_hegrenade"'


def test_fantasma_tr_so_com_faca():
    assert valor("mp_t_default_primary", "fantasma") == '""'
    assert valor("mp_t_default_secondary", "fantasma") == "null"
    assert valor("mp_t_default_grenades", "fantasma") == '""'
    assert valor("mp_t_default_melee", "fantasma") == "weapon_knife"


def test_fantasma_ninguem_compra():
    assert valor("sv_buy_status_override", "fantasma") == "3"
    assert valor("mp_weapons_allow_map_placed", "fantasma") == "0"


def test_fantasma_arma_de_quem_morre_nao_vai_para_o_chao():
    assert valor("mp_death_drop_gun", "fantasma") == "0"
    assert valor("mp_death_drop_grenade", "fantasma") == "0"


def test_fantasma_tem_bomba():
    assert valor("mp_give_player_c4", "fantasma") == "1"


def test_fantasma_oito_de_cada_lado():
    assert valor("mp_autoteambalance", "fantasma") == "1"
    assert valor("mp_limitteams", "fantasma") == "1"
    assert valor("mp_friendlyfire", "fantasma") == "0"


def test_ct_fica_com_a_usp_e_a_m4_silenciadas():
    # O jogo dá a pistola do inventário, e o nome interno da USP é igual ao da P2000. Só o número do item separa.
    trecho = CODIGO_DO_FANTASMA[CODIGO_DO_FANTASMA.index("void CompletarKitDoCt"):]
    assert "CsTeam.CounterTerrorist" in trecho
    assert "ItemDefinitionIndex" in trecho
    assert "NumeroDaUsp = 61" in CODIGO_DO_FANTASMA
    assert "NumeroDaM4Silenciada = 60" in CODIGO_DO_FANTASMA
    assert '"weapon_usp_silencer"' in CODIGO_DO_FANTASMA
    assert '"weapon_m4a1_silencer"' in CODIGO_DO_FANTASMA


def test_ct_recebe_de_volta_as_granadas_que_usou():
    # Quem sobrevive continua com o que tinha, e o jogo não devolve a granada jogada.
    for granada in ["weapon_smokegrenade", "weapon_flashbang", "weapon_hegrenade"]:
        assert f'"{granada}"' in CODIGO_DO_FANTASMA


def test_ct_completa_o_kit_ao_nascer():
    assert "CompletarKitDoCt(" in CODIGO_DO_PLUGIN[CODIGO_DO_PLUGIN.index("AoNascer"):]


def test_fantasma_sem_aquecimento_entre_as_partidas():
    # Sem isso, o jogo faz 1 minuto de aquecimento em vez dos 15 segundos do aviso.
    assert valor("mp_warmuptime_all_players_connected", "fantasma") == "0"
    assert valor("mp_warmup_online_enabled", "fantasma") == "0"


def test_morte_pela_bomba_nao_conta_abate():
    # O dono pediu: a explosão da bomba não é abate do fantasma, nem para o XP.
    trecho = CODIGO_DO_PLUGIN[CODIGO_DO_PLUGIN.index("AoMorrer"):]
    assert 'evento.Weapon.Contains("c4")' in trecho
    assert trecho.index('evento.Weapon.Contains("c4")') < trecho.index(".Abates++")


def test_andar_no_shift_deixa_o_fantasma_invisivel():
    # O script do mapa deixa 50% visível nessa velocidade, e o dono pediu 100% invisível.
    assert "VelocidadeDoShift = 140f" in CODIGO_DO_FANTASMA
    trecho = CODIGO_DO_FANTASMA[CODIGO_DO_FANTASMA.index("void AjustarInvisibilidade"):]
    assert "CsTeam.Terrorist" in trecho
    assert "VelocidadeDoShift" in trecho
    assert '"alpha"' in trecho
    assert "AjustarInvisibilidade, TimerFlags.REPEAT" in CODIGO_DO_FANTASMA


def test_no_ar_o_fantasma_fica_invisivel():
    # O dono pediu: no bhop ele continua invisível.
    trecho = CODIGO_DO_FANTASMA[CODIGO_DO_FANTASMA.index("void AjustarInvisibilidade"):]
    assert "FL_ONGROUND" in trecho


def test_correndo_o_fantasma_aparece_como_no_mapa():
    assert 'AlfaDevagar = "128"' in CODIGO_DO_FANTASMA
    assert 'AlfaCorrendo = "176"' in CODIGO_DO_FANTASMA
    assert "VelocidadeDevagar = 160f" in CODIGO_DO_FANTASMA


def test_o_mapa_cria_a_respiracao_antes_de_o_plugin_assumir():
    # Com o time desligado no script, ele não cria a respiração. Por isso liga antes da rodada e só desliga depois do início.
    assert '"invisTeamModifyTTrue"' in CODIGO_DO_FANTASMA[CODIGO_DO_FANTASMA.index("AoPrepararRodada"):]
    assert "AssumirInvisibilidade" in CODIGO_DO_FANTASMA[CODIGO_DO_FANTASMA.index("void ComecarRodadaDoFantasma"):]
    assert '"invisTeamModifyTFalse"' in CODIGO_DO_FANTASMA[CODIGO_DO_FANTASMA.index("void AssumirInvisibilidade"):]


def test_sem_o_script_do_mapa_o_plugin_nao_mexe_na_transparencia():
    # Se o autor do mapa renomear o script, os dois não podem ficar disputando e fazer o fantasma piscar.
    assert "if (!invisibilidadeNoPlugin) return;" in CODIGO_DO_FANTASMA
    assert "invisibilidadeNoPlugin = ChamarScriptDoMapa(" in CODIGO_DO_FANTASMA


def test_fantasma_com_bhop():
    assert valor("sv_autobunnyhopping", "fantasma") == "1"
    assert valor("sv_staminajumpcost", "fantasma") == "0"
    assert valor("sv_staminalandcost", "fantasma") == "0"


def test_ao_ligar_o_servidor_nao_procura_o_script_antes_do_mapa():
    # Antes de o mapa abrir, procurar uma entidade derruba o plugin inteiro, e o servidor fica sem regra nenhuma.
    trecho = CODIGO_DO_FANTASMA[CODIGO_DO_FANTASMA.index("void LigarFantasma"):CODIGO_DO_FANTASMA.index("bool ChamarScriptDoMapa")]
    assert 'if (hotReload) ChamarScriptDoMapa("invisTeamModifyTTrue");' in trecho


def test_mutacao_so_liga_na_regra_dela():
    assert 'Config.Regra == "mutacao"' in CODIGO_DO_PLUGIN
    assert "LigarMutacao(hotReload)" in CODIGO_DO_PLUGIN


def test_os_atributos_do_mutante_ficam_em_um_lugar_so():
    # Os mutantes de outros tipos entram aqui, sem reescrever o modo.
    assert "record TipoDeMutante" in CODIGO_DA_MUTACAO
    assert "record NivelDoMutante" in CODIGO_DA_MUTACAO
    assert 'new("Mutante", 3f' in CODIGO_DA_MUTACAO


def test_o_golpe_transforma_sem_causar_dano():
    assert "RegisterListener<Listeners.OnEntityTakeDamagePre>(AoReceberDano)" in CODIGO_DA_MUTACAO
    assert "HookResult.Handled" in CODIGO_DA_MUTACAO


def test_erro_ao_olhar_o_dano_nao_derruba_o_jogo():
    # Roda a cada dano do servidor. Um erro aqui, numa atualização do jogo, só pode deixar o dano seguir.
    trecho = CODIGO_DA_MUTACAO[CODIGO_DA_MUTACAO.index("HookResult AoReceberDano"):]
    assert trecho.index("try") < trecho.index("catch") < trecho.index("return HookResult.Continue;", trecho.index("catch"))


def test_humano_que_morre_vira_mutante():
    # Queda, ou golpe se o gancho quebrar numa atualização do jogo.
    trecho = CODIGO_DA_MUTACAO[CODIGO_DA_MUTACAO.index("EventPlayerDeath"):]
    assert "SwitchTeam(CsTeam.Terrorist)" in trecho
    assert "SegundosParaRenascer" in trecho
    assert ".Respawn()" in trecho


def test_dois_golpes_nao_transformam_duas_vezes():
    trecho = CODIGO_DA_MUTACAO[CODIGO_DA_MUTACAO.index("void TransformarEmMutante"):]
    assert "PawnIsAlive: true, Team: CsTeam.CounterTerrorist" in trecho
    assert trecho.index("Team: CsTeam.CounterTerrorist") < trecho.index("SwitchTeam(CsTeam.Terrorist)")


def test_quem_vira_mutante_fica_so_com_a_faca():
    assert "DeixarSoAFaca(" in CODIGO_DA_MUTACAO[CODIGO_DA_MUTACAO.index("void AplicarAtributosDoMutante"):]


def test_mutante_nao_fica_com_arma_do_chao():
    assert '"mutacao"' in CODIGO_DO_FANTASMA[CODIGO_DO_FANTASMA.index("AoPegarItem"):]


def test_o_mutante_tem_vida_velocidade_e_cor():
    trecho = CODIGO_DA_MUTACAO[CODIGO_DA_MUTACAO.index("void AplicarAtributosDoMutante"):]
    for campo in ['"m_iHealth"', '"m_iMaxHealth"', '"m_clrRender"', "VelocityModifier"]:
        assert campo in trecho


def test_o_mutante_mantem_a_velocidade():
    assert "ManterVelocidadeDosMutantes, TimerFlags.REPEAT" in CODIGO_DA_MUTACAO


def test_todos_voltam_a_ser_humanos_na_rodada_seguinte():
    trecho = CODIGO_DA_MUTACAO[CODIGO_DA_MUTACAO.index("EventRoundPrestart"):]
    assert "SwitchTeam(CsTeam.CounterTerrorist)" in trecho
    assert "MaxHealth = VidaDoHumano" in trecho


def test_quinze_segundos_para_espalhar():
    # Do tamanho da contagem com o som, aprovado pelo dono.
    assert "SegundosParaEspalhar = 15f" in CODIGO_DA_MUTACAO


def test_um_mutante_para_cada_quatro_arredondando_para_cima():
    # 2 a 4 jogadores: 1 mutante; 5 a 8: 2; 9 a 12: 3; 13 a 16: 4.
    assert "JogadoresPorMutante = 4" in CODIGO_DA_MUTACAO
    assert "(vivos.Count + JogadoresPorMutante - 1) / JogadoresPorMutante" in CODIGO_DA_MUTACAO
    tabela = {n: (n + 4 - 1) // 4 for n in range(2, 17)}
    assert [tabela[n] for n in (2, 4, 5, 8, 9, 12, 13, 16)] == [1, 1, 2, 2, 3, 3, 4, 4]


def test_sozinho_ninguem_vira_mutante():
    assert "vivos.Count < 2" in CODIGO_DA_MUTACAO[CODIGO_DA_MUTACAO.index("void SortearMutantes"):]


def test_mutantes_vencem_quando_nao_sobra_humano():
    assert "RoundEndReason.TerroristsWin" in CODIGO_DA_MUTACAO[CODIGO_DA_MUTACAO.index("void ConferirFimDaRodada"):]


def test_humanos_vencem_no_fim_do_tempo():
    assert "RoundEndReason.CTsWin" in CODIGO_DA_MUTACAO
    assert 'ConVar<float>.Find("mp_roundtime")' in CODIGO_DA_MUTACAO


def test_so_um_relogio_por_rodada():
    assert CODIGO_DA_MUTACAO.index("Parar(ref fimDaRodada)") < CODIGO_DA_MUTACAO.index("fimDaRodada = AddTimer")
    assert CODIGO_DA_MUTACAO.index("Parar(ref relogioDoSorteio)") < CODIGO_DA_MUTACAO.index("relogioDoSorteio = AddTimer")


def test_a_rodada_nao_termina_duas_vezes():
    trecho = CODIGO_DA_MUTACAO[CODIGO_DA_MUTACAO.index("void EncerrarRodadaDaMutacao"):]
    assert "if (!rodadaEmAndamento) return;" in trecho


def test_dez_rodadas_sao_uma_partida():
    assert "RodadasPorPartida = 10" in CODIGO_DA_MUTACAO
    assert "FecharPartida(null," in CODIGO_DA_MUTACAO
    assert "SegundosMostrandoOVencedor" in CODIGO_DA_MUTACAO[CODIGO_DA_MUTACAO.index("void EncerrarRodadaDaMutacao"):]


def test_a_partida_nao_zera_a_cada_rodada():
    assert "rodadasDaPartida == 0" in CODIGO_DA_MUTACAO[CODIGO_DA_MUTACAO.index("void ComecarRodadaDaMutacao"):]


def test_o_aviso_mostra_o_placar_das_rodadas():
    assert "Humanos {" in CODIGO_DA_MUTACAO
    assert "AvisarFimDaPartida(" in CODIGO_DA_MUTACAO


def test_quem_entra_no_meio_nao_fica_morto():
    assert "EventPlayerTeam" in CODIGO_DA_MUTACAO
    assert "ColocarNaRodada(" in CODIGO_DA_MUTACAO[CODIGO_DA_MUTACAO.index("EventPlayerTeam"):]


def test_quem_chega_depois_dispara_o_sorteio_que_faltou():
    assert "SortearMutantes()" in CODIGO_DA_MUTACAO[CODIGO_DA_MUTACAO.index("void ColocarNaRodada"):]


def test_se_o_ultimo_mutante_sai_outro_e_sorteado():
    assert "SortearMutantes()" in CODIGO_DA_MUTACAO[CODIGO_DA_MUTACAO.index("void ConferirFimDaRodada"):]


def test_quem_sai_pode_encerrar_a_rodada():
    assert "ConferirFimDaRodada" in CODIGO_DA_MUTACAO[CODIGO_DA_MUTACAO.index("EventPlayerDisconnect"):]


def test_se_a_ultima_pessoa_sai_a_partida_recomeca():
    trecho = CODIGO_DA_MUTACAO[CODIGO_DA_MUTACAO.index("EventPlayerDisconnect"):]
    assert "mp_restartgame 1" in trecho
    assert "rodadasDaPartida = 0" in trecho


def test_humano_recebe_ak_ou_m4_por_sorteio():
    trecho = CODIGO_DA_MUTACAO[CODIGO_DA_MUTACAO.index("void EntregarArmaDoHumano"):]
    assert "CsTeam.CounterTerrorist" in trecho
    assert "Random.Shared" in trecho
    assert '"weapon_ak47"' in CODIGO_DA_MUTACAO and '"weapon_m4a1"' in CODIGO_DA_MUTACAO


def test_quem_ja_tem_ak_ou_m4_fica_com_ela():
    # Tirar e dar de novo a arma logo depois de a rodada reiniciar derruba o jogo de quem está no servidor
    # ("missing client entity"). Só a super Negev sai, e só quem está sem AK nem M4 ganha uma.
    trecho = CODIGO_DA_MUTACAO[CODIGO_DA_MUTACAO.index("void EntregarArmaDoHumano"):]
    trecho = trecho[:trecho.index(FIM_DO_METODO)]
    assert "arma.DesignerName == ArmaEspecial) arma.Remove()" in trecho
    assert "ArmasDoHumano.Contains(arma.DesignerName) ||" not in trecho
    assert trecho.index("if (jaTem) return;") < trecho.index("GiveNamedItem(")


def test_so_quem_virou_mutante_perde_as_armas_ao_nascer():
    # Bot que entra como TR antes do sorteio não é mutante: tirar as armas dele junto do reinício também derruba o jogo.
    nasce = CODIGO_DO_PLUGIN[CODIGO_DO_PLUGIN.index('else if (Config.Regra == "mutacao")', CODIGO_DO_PLUGIN.index("HookResult AoNascer")):]
    assert "EhMutanteDeVerdade(jogador)) AplicarAtributosDoMutante(jogador)" in nasce[:500]
    confere = CODIGO_DA_MUTACAO[CODIGO_DA_MUTACAO.index("bool EhMutanteDeVerdade"):]
    assert "rodadaEmAndamento && sorteioFeito" in confere[:400]


def test_a_rodada_nova_so_mexe_em_quem_era_mutante_ou_tinha_a_super_negev():
    prepara = CODIGO_DA_MUTACAO[CODIGO_DA_MUTACAO.index("EventRoundPrestart"):]
    prepara = prepara[:prepara.index(FIM_DO_METODO)]
    assert "if (!eraMutante && jogador.Slot != portadorAnterior) continue;" in prepara


def test_o_humano_recebe_a_arma_ao_nascer():
    assert "EntregarArmaDoHumano(" in CODIGO_DO_PLUGIN[CODIGO_DO_PLUGIN.index("AoNascer"):]


def test_municao_de_reserva_infinita():
    # O console recusa, e o mapa pode reverter ao carregar. Por isso o plugin liga a cada rodada.
    trecho = CODIGO_DA_MUTACAO[CODIGO_DA_MUTACAO.index("void ComecarRodadaDaMutacao"):]
    assert 'ConVar<int>.Find("sv_infinite_ammo")' in trecho
    assert "MunicaoDeReservaInfinita = 2" in CODIGO_DA_MUTACAO


def test_tiro_empurra_o_mutante():
    trecho = CODIGO_DA_MUTACAO[CODIGO_DA_MUTACAO.index("EventPlayerHurt"):]
    assert "ForcaDoEmpurrao" in trecho
    assert "EmpurraoMaximo" in trecho
    assert "Teleport(" in trecho
    assert "ForcaDoEmpurrao = 5f" in CODIGO_DA_MUTACAO
    assert "EmpurraoMaximo = 300f" in CODIGO_DA_MUTACAO


def test_o_diagnostico_da_mutacao_e_so_do_servidor_e_nao_mostra_contas():
    trecho = CODIGO_DA_MUTACAO[CODIGO_DA_MUTACAO.index('"magnatas_mutacao_ver"'):]
    assert "CommandUsage.SERVER_ONLY" in trecho
    assert "SteamID" not in trecho


def test_mutacao_no_mapa_certo_e_no_modo_personalizado():
    campos = conf("mutacao")
    assert campos["PORTA"] == "27020"
    assert campos["VAGAS"] == "16"
    assert campos["OFICINA"] == "3222984182"
    assert campos["GAME_TYPE"] == "3"
    assert campos["GAME_MODE"] == "0"
    assert campos["REGRAS_DO_JOGO"] == "gamemode_custom_server.cfg"
    assert campos["REGRA"] == "mutacao"
    assert campos["ARMA_PRINCIPAL"] == ""


def test_mutacao_rodada_de_tres_minutos_quem_encerra_e_o_plugin():
    assert valor("mp_roundtime", "mutacao") == "3"
    assert valor("mp_ignore_round_win_conditions", "mutacao") == "1"
    assert valor("mp_maxrounds", "mutacao") == "1"
    assert valor("mp_timelimit", "mutacao") == "0"


def test_mutacao_todos_comecam_humanos():
    assert valor("mp_humanteam", "mutacao") == "ct"
    assert valor("mp_autoteambalance", "mutacao") == "0"
    assert valor("mp_limitteams", "mutacao") == "0"


def test_mutacao_arma_principal_vem_do_plugin():
    assert valor("mp_ct_default_primary", "mutacao") == '""'
    assert valor("mp_ct_default_secondary", "mutacao") == "weapon_hkp2000"
    assert valor("mp_ct_default_grenades", "mutacao") == '""'


def test_mutacao_mutante_so_com_faca():
    assert valor("mp_t_default_primary", "mutacao") == '""'
    assert valor("mp_t_default_secondary", "mutacao") == "null"
    assert valor("mp_t_default_grenades", "mutacao") == '""'
    assert valor("mp_t_default_melee", "mutacao") == "weapon_knife"


def test_mutacao_sem_colete_sem_compra_sem_bomba():
    assert valor("mp_free_armor", "mutacao") == "0"
    assert valor("sv_buy_status_override", "mutacao") == "3"
    assert valor("mp_give_player_c4", "mutacao") == "0"


def test_mutacao_quem_renasce_e_o_plugin():
    # Se o jogo também renascesse, os dois disputariam.
    assert valor("mp_respawn_on_death_t", "mutacao") == "0"
    assert valor("mp_respawn_on_death_ct", "mutacao") == "0"


def test_mutacao_sem_aquecimento():
    assert valor("mp_warmuptime", "mutacao") == "0"
    assert valor("mp_warmup_online_enabled", "mutacao") == "0"
    assert valor("mp_warmuptime_all_players_connected", "mutacao") == "0"


def test_antes_do_sorteio_ninguem_nasce_mutante():
    # O jogo pode colocar quem entra em TR. Antes do sorteio, todo mundo é humano.
    trecho = CODIGO_DA_MUTACAO[CODIGO_DA_MUTACAO.index("void ColocarNaRodada"):]
    assert trecho.index("SwitchTeam(CsTeam.CounterTerrorist)") < trecho.index("jogador.Respawn()")


def test_mutacao_recarregada_no_meio_recomeca_a_partida():
    # Sem a rodada em andamento nem o relógio, o servidor ficaria travado até todos saírem.
    trecho = CODIGO_DA_MUTACAO[CODIGO_DA_MUTACAO.index("void LigarMutacao"):CODIGO_DA_MUTACAO.index("HookResult AoReceberDano")]
    assert "if (hotReload)" in trecho
    assert "rodadasDaPartida = 0" in trecho
    assert "mp_restartgame 1" in trecho


def test_equipe_recomeca_quando_a_ultima_pessoa_sai():
    # Quem chegar depois não pode herdar o placar e o relógio de uma partida que ninguém mais está jogando.
    trecho = CODIGO_DO_PLUGIN[CODIGO_DO_PLUGIN.index("EventPlayerDisconnect"):]
    assert 'Config.Regra != "equipe"' in trecho
    assert "mp_restartgame 1" in trecho


def test_placar_das_pessoas_zera_a_cada_partida_nova():
    # O dono pediu: K/D da tabela começa do zero em cada partida. Equipe e Mutação emendam partidas sem reiniciar o jogo.
    trecho = CODIGO_DO_PLUGIN[CODIGO_DO_PLUGIN.index("void ZerarPlacarDasPessoas"):]
    for campo in ["Kills = 0", "Deaths = 0", "Assists = 0", '"m_pActionTrackingServices"', '"m_iScore"']:
        assert campo in trecho
    assert "ZerarPlacarDasPessoas()" in CODIGO_DO_PLUGIN[CODIGO_DO_PLUGIN.index("private void ComecarPartida"):]
    assert "ZerarPlacarDasPessoas()" in CODIGO_DA_MUTACAO[CODIGO_DA_MUTACAO.index("rodadasDaPartida == 0"):]


def test_equipe_roda_varios_mapas():
    # O dono preferiu um servidor com vários mapas a vários servidores, para gastar a memória de um só.
    rotacao = conf("equipe")["ROTACAO"].split(",")
    assert rotacao[0] == conf("equipe")["OFICINA"]
    assert "3122345065" in rotacao and "3070259469" in rotacao
    # O Alaska saiu: as portas das bases prendem o jogador e o dono desistiu do mapa.
    assert "3258817421" not in rotacao
    # Egypt, do CrossFire, no mesmo mata-mata dos outros. O 3155594017 foi engano do dono.
    assert "3138753451" in rotacao and "3155594017" not in rotacao


def test_o_script_entrega_a_rotacao_ao_plugin():
    assert '"Rotacao"' in INICIAR
    assert "${ROTACAO:-}" in INICIAR


def test_o_proximo_mapa_e_sorteado_depois_do_resultado():
    trecho = CODIGO_DO_PLUGIN[CODIGO_DO_PLUGIN.index("void TrocarDeMapa"):]
    assert "Random.Shared" in trecho
    assert "host_workshop_map" in trecho
    # Nunca repete o mapa que acabou de ser jogado.
    assert "!= mapaAtualDaOficina" in trecho
    assert "TrocarDeMapa" in CODIGO_DO_PLUGIN[CODIGO_DO_PLUGIN.index("void EncerrarPartidaDeEquipe"):]
    assert "SegundosMostrandoOVencedor" in CODIGO_DO_PLUGIN[CODIGO_DO_PLUGIN.index("void EncerrarPartidaDeEquipe"):]


def test_com_um_mapa_so_nao_troca():
    trecho = CODIGO_DO_PLUGIN[CODIGO_DO_PLUGIN.index("void TrocarDeMapa"):]
    assert "Count < 2" in trecho


def test_o_plugin_conta_ao_site_o_mapa_atual():
    trecho = CODIGO_DO_PLUGIN[CODIGO_DO_PLUGIN.index('"magnatas_jogadores"'):]
    assert "mapa={Server.MapName}" in trecho


def test_equipe_nunca_dorme_com_varios_mapas():
    # Ao acordar do modo de espera, o jogo recarrega o pacote da Oficina e pode abrir o mapa auxiliar
    # que vem junto (o de_luxville_skybox), e o servidor cai. Acordado, só o plugin troca de mapa.
    assert valor("sv_hibernate_when_empty", "equipe") == "0"


SONS_DE_ABATE = RAIZ / "plugins" / "MagnatasDiversao" / "SonsDeAbate.cs"
PACOTE_DE_SONS = "3835000213"
# Cada versão do boneco é um item novo da Oficina, que nunca é atualizado (ver servidor/ferramentas/mutante/LEIAME.md).
PACOTE_DO_MUTANTE = "3836643990"
PACOTE_DO_BLINDADO = "3837109609"
PACOTE_DA_FUMACA = "3837859077"
# Personagens próprios (MagnatasVisual) e o herói da super Negev: baixados em todo servidor.
PACOTE_DOS_PERSONAGENS = "3837571705"


def codigo_dos_sons():
    return SONS_DE_ABATE.read_text(encoding="utf-8")


def test_o_som_segue_a_sequencia_e_o_time_de_quem_matou():
    codigo = codigo_dos_sons()
    trecho = codigo[codigo.index("string? SomDoAbate"):]
    # De 2 a 7 abates sem morrer. Do 8 em diante fica em silêncio, a pedido do dono.
    assert "sequencia > MaiorSequenciaComSom) return null" in trecho
    assert "MaiorSequenciaComSom = 7;" in codigo
    assert "sequencia >= 2" in trecho
    assert '"magnatas.killmark_' in trecho
    # O tiro na cabeça só toca no primeiro abate: a sequência tem a vez.
    assert '"magnatas.headshot_' in trecho
    assert '? "ct" : "tr"' in trecho


def test_so_quem_matou_ouve_o_som():
    codigo = codigo_dos_sons()
    assert "new RecipientFilter" in codigo
    assert "EmitSound(" in codigo


def test_a_sequencia_zera_ao_morrer_e_em_partida_nova():
    codigo = codigo_dos_sons()
    trecho = codigo[codigo.index("HookResult TocarSomDoAbate"):]
    assert "sequencias.Remove(alvo.SteamID)" in trecho
    # Morte pela bomba, por queda ou de alguém do próprio time não conta para a sequência.
    assert 'Contains("c4")' in trecho
    assert "quem.Team == alvo.Team" in trecho
    assert "sequencias.Clear()" in CODIGO_DO_PLUGIN[CODIGO_DO_PLUGIN.index("void ZerarContagem"):]


def test_o_servidor_carrega_os_sons_do_pacote():
    assert "OnServerPrecacheResources" in codigo_dos_sons()
    assert "soundevents/soundevents_addon.vsndevts" in codigo_dos_sons()


@pytest.mark.parametrize("servidor", SERVIDORES)
def test_todo_servidor_da_diversao_manda_baixar_o_pacote_de_sons(servidor):
    # A Mutação também manda baixar os pacotes do mutante comum e dos mutantes da loja, que só ela usa.
    esperado = (
        f'"{PACOTE_DE_SONS},{PACOTE_DO_MUTANTE},{PACOTE_DO_BLINDADO},{PACOTE_DOS_PERSONAGENS},{PACOTE_DA_FUMACA}"'
        if servidor == "mutacao"
        else f'"{PACOTE_DE_SONS},{PACOTE_DOS_PERSONAGENS}"'
    )
    assert valor("mm_extra_addons", servidor) == esperado
    # Sem isso, cada troca de mapa do Equipe x Equipe faria todo mundo reconectar para conferir o pacote.
    assert valor("mm_cache_clients_with_addons", servidor) == "1"


@pytest.mark.parametrize("servidor", SERVIDORES)
def test_o_servidor_baixa_a_versao_nova_do_pacote_ao_montar(servidor):
    # Sem isso, quem já tinha o pacote ficava para sempre com a versão antiga, e o mutante novo nunca chegava.
    assert valor("mm_addon_mount_download", servidor) == "1"


def test_o_plugin_lembra_o_mapa_atual_depois_de_recarregar():
    # Recarregado no Luxville, o plugin achava que estava no primeiro mapa da lista e sorteava o Luxville
    # de novo. Recarregar o mesmo pacote abre o mapa auxiliar dele, e o servidor cai.
    carregar = CODIGO_DO_PLUGIN[CODIGO_DO_PLUGIN.index("public override void Load"):]
    assert "LembrarDoMapaAtual(hotReload)" in carregar
    lembrar = CODIGO_DO_PLUGIN[CODIGO_DO_PLUGIN.index("void LembrarDoMapaAtual"):]
    assert "File.ReadAllText" in lembrar
    assert "mapas.Contains(" in lembrar
    trocar = CODIGO_DO_PLUGIN[CODIGO_DO_PLUGIN.index("void TrocarDeMapa"):]
    assert "GuardarMapaAtual(" in trocar[:trocar.index("host_workshop_map")]


LIGAR = RAIZ / "scripts" / "ligar_diversao.sh"
DESLIGAR = RAIZ / "scripts" / "desligar_diversao.sh"
SUDOERS = RAIZ / "config" / "sudoers-magnatas-diversao"


@pytest.mark.parametrize("script", [LIGAR, DESLIGAR], ids=["ligar", "desligar"])
def test_scripts_do_site_conferem_usuario_nome_e_conf_antes_de_tudo(script):
    texto = script.read_text(encoding="utf-8")
    assert texto.startswith("#!/usr/bin/env bash\n")
    assert "set -euo pipefail" in texto
    assert '"$(id -un)" != "cs2"' in texto
    assert "^[a-z0-9-]{1,32}$" in texto
    assert '[ ! -f "/home/cs2/bin/diversao/$NOME.conf" ]' in texto
    # As conferências vêm antes de qualquer comando que mexe no servidor.
    primeira_acao = min(texto.index(c) for c in ("tmux kill-session", "iniciar_diversao.sh \"$NOME\"") if c in texto)
    assert texto.index("^[a-z0-9-]{1,32}$") < primeira_acao
    assert texto.index(".conf\" ]") < primeira_acao


def test_ligar_nao_liga_duas_vezes_e_chama_o_iniciar():
    texto = LIGAR.read_text(encoding="utf-8")
    assert 'tmux has-session -t "diversao-$NOME"' in texto
    assert 'bash /home/cs2/bin/iniciar_diversao.sh "$NOME"' in texto


def test_desligar_fecha_so_a_sessao_do_modo_e_sem_sessao_sai_bem():
    texto = DESLIGAR.read_text(encoding="utf-8")
    assert 'tmux kill-session -t "diversao-$NOME"' in texto
    assert 'tmux has-session -t "diversao-$NOME"' in texto


def test_sudoers_deixa_o_site_rodar_so_os_dois_scripts_como_cs2():
    linhas = [linha for linha in SUDOERS.read_text(encoding="utf-8").splitlines() if linha.strip() and not linha.startswith("#")]
    assert linhas == ["magnatas ALL=(cs2) NOPASSWD: /home/cs2/bin/ligar_diversao.sh, /home/cs2/bin/desligar_diversao.sh"]


def test_instalador_poe_os_scripts_e_valida_o_sudoers_antes_de_instalar():
    assert "ligar_diversao.sh" in INSTALADOR and "desligar_diversao.sh" in INSTALADOR
    assert "visudo -cf" in INSTALADOR
    assert "/etc/sudoers.d/magnatas-diversao" in INSTALADOR
    assert INSTALADOR.index("visudo -cf") < INSTALADOR.index("/etc/sudoers.d/magnatas-diversao")


def test_ligar_nao_cria_o_tmux_do_cs2_de_dentro_do_site():
    # Se o site criasse o servidor tmux do cs2, ele ficaria no grupo do serviço do site,
    # e reiniciar o site derrubaria todos os servidores, inclusive o de partidas.
    texto = LIGAR.read_text(encoding="utf-8")
    assert "tmux list-sessions" in texto
    assert texto.index("tmux list-sessions") < texto.index('bash /home/cs2/bin/iniciar_diversao.sh "$NOME"')


def test_um_humano_sorteado_ganha_a_super_negev_junto_com_o_sorteio_dos_mutantes():
    assert 'ArmaEspecial = "weapon_negev"' in CODIGO_DA_MUTACAO
    trecho = CODIGO_DA_MUTACAO[CODIGO_DA_MUTACAO.index("void SortearMutantes"):CODIGO_DA_MUTACAO.index("void EncerrarRodadaDaMutacao")]
    assert "SortearSuperArma()" in trecho
    sorteio = CODIGO_DA_MUTACAO[CODIGO_DA_MUTACAO.index("void SortearSuperArma"):]
    # Uma vez por rodada: se o mutante sai e outro é sorteado, a arma não sai de novo.
    assert "superArmaSorteada" in sorteio
    assert "pegou a super Negev" in sorteio


def test_a_super_negev_recarrega_normal_e_empurra_mais():
    # Munição infinita ficava forte demais (dono, 10/11/2026), e encher o pente a cada tiro já tinha fechado jogos
    # ("CopyExistingEntity", 09/11). A Negev agora gasta e recarrega como qualquer arma.
    assert "EventWeaponFire" not in CODIGO_DA_MUTACAO
    assert "m_iClip1" not in CODIGO_DA_MUTACAO
    assert "munição infinita" not in CODIGO_DA_MUTACAO
    empurrao = CODIGO_DA_MUTACAO[CODIGO_DA_MUTACAO.index("HookResult AoAtingirMutante"):]
    assert "EmpurraoDaSuperArma" in empurrao


def test_o_portador_brilha_e_perde_a_arma_ao_virar_mutante():
    entrega = CODIGO_DA_MUTACAO[CODIGO_DA_MUTACAO.index("void EntregarSuperArma"):]
    assert "CorDoPortador" in entrega
    transforma = CODIGO_DA_MUTACAO[CODIGO_DA_MUTACAO.index("void TransformarEmMutante"):]
    assert "portadorDaSuperArma = null" in transforma


def test_a_super_negev_some_na_rodada_seguinte():
    prepara = CODIGO_DA_MUTACAO[CODIGO_DA_MUTACAO.index("EventRoundPrestart"):]
    assert "portadorDaSuperArma = null" in prepara
    assert "superArmaSorteada = false" in CODIGO_DA_MUTACAO[CODIGO_DA_MUTACAO.index("void ComecarRodadaDaMutacao"):]
    humano = CODIGO_DA_MUTACAO[CODIGO_DA_MUTACAO.index("void EntregarArmaDoHumano"):]
    assert "ArmaEspecial" in humano


def test_o_mutante_usa_o_zumbi_do_pacote_e_fica_maior():
    # O boneco blindado do jogo virou um arquivo vazio numa atualização do CS2. O zumbi vem no pacote da Oficina.
    assert 'ModeloDoNivel(int nivel) => $"{PastaDoMutante}/nivel{nivel}/mutante.vmdl"' in CODIGO_DA_MUTACAO
    # Sem tingir: a cor é a do próprio zumbi.
    assert "Color.FromArgb(255, 255, 255, 255), new NivelDoMutante[]" in CODIGO_DA_MUTACAO
    assert "manifesto.AddResource(ModeloDoNivel(nivel.Nivel))" in CODIGO_DA_MUTACAO
    trecho = CODIGO_DA_MUTACAO[CODIGO_DA_MUTACAO.index("void AplicarAtributosDoMutante"):]
    assert "nivel.Tamanho" in trecho
    prepara = CODIGO_DA_MUTACAO[CODIGO_DA_MUTACAO.index("EventRoundPrestart"):]
    assert "TamanhoDoHumano" in prepara


def test_sem_o_zumbi_no_servidor_o_mutante_nao_troca_de_boneco():
    # Sem o arquivo no servidor, o mutante ficava sem áreas de acerto e sem animação. Trocar para outro boneco do jogo
    # fazia o jogo de quem estava no servidor parar para carregar o modelo e cair ("OnPreserveEntity").
    # Então, sem o zumbi, o mutante fica com o próprio boneco, verde e maior.
    assert "ModeloDeReserva" not in CODIGO_DA_MUTACAO
    confere = CODIGO_DA_MUTACAO[CODIGO_DA_MUTACAO.index("bool ZumbiNoServidor"):]
    confere = confere[:confere.index(FIM_DO_METODO)]
    assert 'NoPacote(PacoteDoMutante, PastaDoMutante)' in confere
    assert "_dir.vpk" in CODIGO_DA_MUTACAO[CODIGO_DA_MUTACAO.index("static bool NoPacote("):][:600]
    aplica = CODIGO_DA_MUTACAO[CODIGO_DA_MUTACAO.index("void AplicarAtributosDoMutante"):]
    aplica = aplica[:aplica.index(FIM_DO_METODO)]
    assert "if (zumbi) corpo.SetModel(ModeloDe(jogador, nivel.Nivel));" in aplica
    assert "zumbi ? mutanteDaRodada.Cor : CorDaReserva" in aplica
    assert "zumbiNoServidor = null" in CODIGO_DA_MUTACAO[CODIGO_DA_MUTACAO.index("void LigarMutacao"):]


def test_mutacao_roda_biochemical_hotel_e_silent_village():
    rotacao = conf("mutacao")["ROTACAO"].split(",")
    assert rotacao[0] == conf("mutacao")["OFICINA"]
    # O dono pediu o Silent Village primeiro, por enquanto: é o mapa que abre ao ligar.
    assert rotacao == ["3222984182", "3223106683"]


ALASKA = RAIZ / "plugins" / "MagnatasDiversao" / "Alaska.cs"


def codigo_do_alaska():
    return ALASKA.read_text(encoding="utf-8")


def test_alaska_tem_regra_propria_dentro_do_equipe():
    codigo = codigo_do_alaska()
    assert 'MapasDeRodadas = new() { "alaska" }' in codigo
    assert 'Config.Regra == "equipe" && MapasDeRodadas.Contains(Server.MapName)' in codigo
    # Fora do Alaska, o Equipe segue como mata-mata.
    assert "if (NoMapaDeRodadas) ComecarRodadaDeAlaska();" in CODIGO_DO_PLUGIN
    assert 'Config.Regra == "equipe" && !NoMapaDeRodadas' in CODIGO_DO_PLUGIN


def test_alaska_sem_renascer_e_com_vitoria_por_eliminacao():
    codigo = codigo_do_alaska()
    for comando in ["mp_respawn_on_death_ct 0", "mp_respawn_on_death_t 0", "mp_ignore_round_win_conditions 0", "mp_weapons_allow_map_placed 1"]:
        assert comando in codigo


def test_alaska_partida_de_dez_rodadas_e_quem_faz_seis_vence():
    codigo = codigo_do_alaska()
    assert "RodadasDaPartidaDeRodadas = 10" in codigo
    assert "VitoriasParaVencer = 6" in codigo
    fim = codigo[codigo.index("HookResult AoTerminarRodadaDeAlaska"):]
    assert "FecharPartida(" in fim and "TrocarDeMapa" in fim


def test_alaska_da_faca_e_pistola_depois_do_equipamento_do_mapa():
    codigo = codigo_do_alaska()
    kit = codigo[codigo.index("void EntregarKitDoAlaska"):]
    assert "weapon_knife" in kit and "weapon_glock" in kit and "weapon_hkp2000" in kit
    # O game_player_equip do mapa tira as armas ao nascer: o kit vem depois dele.
    assert "SegundosAteEntregarKit = 0.5f" in codigo


def test_alaska_nao_cria_nem_apaga_entidades():
    # Criar armas e apagar peças do mapa derrubou o servidor (segfault no libserver) quando o dono entrou.
    # As armas do chão ficam por conta do próprio jogo, com mp_weapons_allow_map_placed 1.
    codigo = codigo_do_alaska()
    assert "CreateEntityByName" not in codigo
    assert "OnEntitySpawned" not in codigo
    assert ".Remove()" not in codigo


def test_o_relogio_do_mata_mata_nao_encerra_o_alaska():
    # O relógio da partida anterior do Equipe continuaria correndo e trocaria de mapa no meio do Alaska.
    inicio = codigo_do_alaska()[codigo_do_alaska().index("void ComecarRodadaDeAlaska"):]
    assert "Parar(ref fimDaPartida)" in inicio


def test_alaska_tira_o_jogador_da_escada_falsa_das_portas():
    # As portas das bases do Alaska prendem o jogador como se fosse escada: o tiro sai torto e ele não passa.
    codigo = codigo_do_alaska()
    assert "Listeners.OnTick" in codigo
    trecho = codigo[codigo.index("void SoltarDaEscada"):]
    assert "MoveType_t.MOVETYPE_LADDER" in trecho
    assert "MoveType_t.MOVETYPE_WALK" in trecho
    assert '"m_MoveType"' in trecho


def test_resultado_leva_mapa_placar_e_mortes_para_a_tabela_do_perfil():
    assert "public int? mortes { get; init; }" in CODIGO_DO_PLUGIN
    assert "doAlvo.Mortes++" in CODIGO_DO_PLUGIN
    assert "mapa = Server.MapName" in CODIGO_DO_PLUGIN
    assert "placar = PlacarDaPartida()" in CODIGO_DO_PLUGIN
    # Equipe x Equipe sem rodadas soma os abates de cada time; nos modos de rodada vale o placar do jogo.
    assert '"cs_team_manager"' in CODIGO_DO_PLUGIN


FIM_DO_METODO = chr(10) + "    }" + chr(10)


def test_tres_niveis_de_mutante_com_mais_vida_velocidade_e_tamanho():
    # Nível, infecções para chegar, vida, velocidade e tamanho, aprovados pelo dono.
    for nivel in ["new(1, 0, 1000, 1.10f, 1.15f)", "new(2, 2, 1500, 1.15f, 1.25f)", "new(3, 5, 2000, 1.20f, 1.35f)"]:
        assert nivel in CODIGO_DA_MUTACAO


def test_o_nivel_e_o_maior_alcancado_pelas_infeccoes():
    trecho = CODIGO_DA_MUTACAO[CODIGO_DA_MUTACAO.index("static NivelDoMutante NivelPelasInfeccoes"):]
    assert "LastOrDefault(nivel => infeccoes >= nivel.InfeccoesParaChegar)" in trecho[:400]


def test_infectar_sobe_o_nivel_com_a_vida_extra_e_aviso_para_todos():
    trecho = CODIGO_DA_MUTACAO[CODIGO_DA_MUTACAO.index("void ContarTransformacao"):]
    assert "SubirDeNivel(autor" in trecho[:900]
    sobe = CODIGO_DA_MUTACAO[CODIGO_DA_MUTACAO.index("void SubirDeNivel"):]
    sobe = sobe[:sobe.index(FIM_DO_METODO)]
    # Ganha só a diferença de vida: quem estava ferido continua ferido.
    assert "corpo.Health + novo.Vida - antigo.Vida" in sobe
    assert "MudarTamanho(corpo, novo.Tamanho)" in sobe
    assert "chegou ao nível" in sobe
    assert "HtmlEncode" in sobe


def test_quem_morre_volta_no_mesmo_nivel_e_a_velocidade_segue_o_nivel():
    aplica = CODIGO_DA_MUTACAO[CODIGO_DA_MUTACAO.index("void AplicarAtributosDoMutante"):]
    aplica = aplica[:aplica.index(FIM_DO_METODO)]
    assert "NivelDe(jogador)" in aplica
    assert "nivel.Vida" in aplica and "VelocidadeDe(jogador)" in aplica and "MudarTamanho(corpo, nivel.Tamanho)" in aplica
    mantem = CODIGO_DA_MUTACAO[CODIGO_DA_MUTACAO.index("void ManterVelocidadeDosMutantes"):]
    assert "VelocidadeDe(mutante)" in mantem[:600]
    velocidade = CODIGO_DA_MUTACAO[CODIGO_DA_MUTACAO.index("float VelocidadeDe("):][:400]
    assert "NivelDe(jogador).Velocidade" in velocidade


def test_o_nivel_zera_a_cada_rodada_e_com_quem_sai():
    for inicio in ["void ComecarRodadaDaMutacao", "EventRoundPrestart"]:
        assert "infeccoes.Clear()" in CODIGO_DA_MUTACAO[CODIGO_DA_MUTACAO.index(inicio):]
    assert "infeccoes.Remove(" in CODIGO_DA_MUTACAO[CODIGO_DA_MUTACAO.index("EventPlayerDisconnect"):]


def test_quem_vira_mutante_comeca_no_nivel_um():
    trecho = CODIGO_DA_MUTACAO[CODIGO_DA_MUTACAO.index("void TransformarEmMutante"):]
    assert trecho.index("infeccoes.Remove(jogador.Slot)") < trecho.index("AplicarAtributosDoMutante(jogador)")


def test_a_contagem_toca_o_som_para_todos_e_acaba_quando_o_mutante_aparece():
    assert 'SomDaContagem = "magnatas.contagem_mutacao"' in CODIGO_DA_MUTACAO
    comeca = CODIGO_DA_MUTACAO[CODIGO_DA_MUTACAO.index("void ComecarRodadaDaMutacao"):CODIGO_DA_MUTACAO.index("void SortearMutantes")]
    # O som termina junto com o sorteio.
    assert "AddTimer(SegundosParaEspalhar - SegundosDoSomDaContagem, () =>" in comeca and "TocarContagem();" in comeca
    assert "MostrarContagem, TimerFlags.REPEAT" in comeca
    toca = CODIGO_DA_MUTACAO[CODIGO_DA_MUTACAO.index("void TocarContagem"):]
    toca = toca[:toca.index(FIM_DO_METODO)]
    assert "new RecipientFilter" in toca and "EmitSound(SomDaContagem" in toca


def test_a_contagem_nao_sobra_de_uma_rodada_para_outra():
    for timer in ["relogioDaContagem", "somDaContagem"]:
        assert CODIGO_DA_MUTACAO.index(f"Parar(ref {timer})") < CODIGO_DA_MUTACAO.index(f"{timer} = AddTimer")
        for trecho in ["void EncerrarRodadaDaMutacao", "EventRoundPrestart"]:
            assert f"Parar(ref {timer})" in CODIGO_DA_MUTACAO[CODIGO_DA_MUTACAO.index(trecho):]


def test_a_partida_so_comeca_com_dois_jogadores():
    assert "MinimoDeJogadores = 2" in CODIGO_DA_MUTACAO
    comeca = CODIGO_DA_MUTACAO[CODIGO_DA_MUTACAO.index("void ComecarRodadaDaMutacao"):]
    espera = comeca.index("JogadoresNaRodada() < MinimoDeJogadores")
    # Sozinho, nem conta rodada, nem abre partida, nem liga o relógio.
    assert espera < comeca.index("rodadasDaPartida == 0")
    assert espera < comeca.index("relogioDoSorteio = AddTimer")
    assert espera < comeca.index("fimDaRodada = AddTimer")
    assert "esperandoJogadores = true" in comeca[espera:comeca.index("rodadasDaPartida == 0")]


def test_quem_chega_para_o_que_estava_sozinho_comeca_a_partida():
    trecho = CODIGO_DA_MUTACAO[CODIGO_DA_MUTACAO.index("void ColocarNaRodada"):]
    trecho = trecho[:trecho.index(FIM_DO_METODO)]
    espera = trecho[trecho.index("if (esperandoJogadores)"):trecho.index("if (!rodadaEmAndamento")]
    assert "JogadoresNaRodada() >= MinimoDeJogadores" in espera
    assert "TerminateRound(" in espera
    assert "esperandoJogadores = false" in espera


def test_quem_morre_esperando_volta_a_nascer():
    trecho = CODIGO_DA_MUTACAO[CODIGO_DA_MUTACAO.index("HookResult AoMorrerNaMutacao"):]
    assert "if (esperandoJogadores)" in trecho[:900]


def test_quem_esta_sozinho_ve_que_falta_jogador():
    assert "AvisarQueFaltaJogador, TimerFlags.REPEAT" in CODIGO_DA_MUTACAO
    aviso = CODIGO_DA_MUTACAO[CODIGO_DA_MUTACAO.index("void AvisarQueFaltaJogador"):]
    assert "if (!esperandoJogadores) return;" in aviso[:300]


def test_teste_com_bots_so_pelo_site_e_na_dust_2():
    trecho = CODIGO_DA_MUTACAO[CODIGO_DA_MUTACAO.index('"magnatas_teste_bots"'):]
    assert "CommandUsage.SERVER_ONLY" in trecho[:300]
    assert "testeComBots = true" in trecho
    # Os mapas da Mutação não têm o caminho dos bots. A Dust 2 tem.
    assert 'changelevel {MapaDoTeste}' in trecho


def test_teste_com_bots_poe_os_bots_a_cada_rodada():
    comeca = CODIGO_DA_MUTACAO[CODIGO_DA_MUTACAO.index("void ComecarRodadaDaMutacao"):]
    # Antes da espera: são os bots que completam os 2 jogadores.
    assert comeca.index("if (testeComBots) ChamarBotsDoTeste()") < comeca.index("JogadoresNaRodada() < MinimoDeJogadores")
    bots = CODIGO_DA_MUTACAO[CODIGO_DA_MUTACAO.index("void ChamarBotsDoTeste"):]
    for comando in ["bot_quota_mode fill", "bot_quota 10", "bot_join_team any"]:
        assert comando in bots[:600]


def test_teste_com_bots_nao_vale_xp():
    fecha = CODIGO_DO_PLUGIN[CODIGO_DO_PLUGIN.index("void FecharPartida"):]
    assert fecha.index("if (testeComBots) return;") < fecha.index("Config.SiteUrl")


def test_teste_com_bots_nao_forca_bot_e_deixa_entrar_antes_da_pessoa():
    # Forçar um bot enquanto a pessoa ainda carregava fez o jogo tirar e recriar bots sem parar, e o servidor caiu.
    # Com os bots liberados antes da pessoa escolher o time, a cota sozinha completa o servidor.
    bots = CODIGO_DA_MUTACAO[CODIGO_DA_MUTACAO.index("void ChamarBotsDoTeste"):]
    bots = bots[:bots.index(FIM_DO_METODO)]
    assert "bot_join_after_player 0" in bots
    assert "bot_add" not in bots


def test_mutacao_troca_de_mapa_no_fim_da_partida_menos_no_teste():
    # O Silent Village estava na rotação, mas a Mutação nunca trocava de mapa: rodava sempre o Biochemical Hotel.
    trecho = CODIGO_DA_MUTACAO[CODIGO_DA_MUTACAO.index("void EncerrarRodadaDaMutacao"):]
    trecho = trecho[:trecho.index(FIM_DO_METODO)]
    fim = trecho[trecho.index("AvisarFimDaPartida("):]
    assert "if (!testeComBots) AddTimer(SegundosMostrandoOVencedor - 1, TrocarDeMapa);" in fim


def test_a_partida_no_silent_village_comeca_com_a_historia_do_mapa():
    comeca = CODIGO_DA_MUTACAO[CODIGO_DA_MUTACAO.index("void ComecarRodadaDaMutacao"):]
    inicio = comeca[comeca.index("if (rodadasDaPartida == 0)"):comeca.index("rodadaEmAndamento = true;")]
    assert 'Server.MapName == "zm_silent_village"' in inicio
    assert "o vírus vazou do laboratório debaixo da vila. Não confie em ninguém." in inicio


def metodo_da_mutacao(assinatura):
    trecho = CODIGO_DA_MUTACAO[CODIGO_DA_MUTACAO.index(assinatura):]
    return trecho[:trecho.index(FIM_DO_METODO)]


def test_o_mutante_corre_mais_rapido_ao_apertar_g_a_partir_do_nivel_dois():
    assert "NivelDaCorrida = 2;" in CODIGO_DA_MUTACAO
    assert 'AddCommandListener("drop", AoApertarG' in CODIGO_DA_MUTACAO
    g = metodo_da_mutacao("HookResult AoApertarG")
    assert "EhMutanteDeVerdade(jogador)" in g
    assert "return UsarPoder(jogador);" in g
    assert "NivelDe(jogador).Nivel < NivelDaCorrida" in metodo_da_mutacao("private HookResult UsarPoder(")
    # O humano continua largando a arma no G; o G do mutante não larga a faca.
    assert "return HookResult.Continue;" in g
    assert "return HookResult.Handled;" in g


def test_a_corrida_dura_pouco_e_tem_recarga():
    assert "SegundosDaCorrida = 3f;" in CODIGO_DA_MUTACAO
    assert "SegundosDeRecargaDaCorrida = 12f;" in CODIGO_DA_MUTACAO
    g = metodo_da_mutacao("private HookResult UsarPoder(")
    assert "Server.CurrentTime" in g
    assert "Corrida em" in g
    velocidade = CODIGO_DA_MUTACAO[CODIGO_DA_MUTACAO.index("float VelocidadeDe("):][:400]
    assert "BonusDaCorrida" in velocidade and "Server.CurrentTime" in velocidade


def test_a_corrida_vale_tambem_na_subida_de_nivel_e_quem_chega_ao_dois_fica_sabendo():
    sobe = metodo_da_mutacao("void SubirDeNivel")
    assert "VelocidadeDe(mutante)" in sobe
    assert "novo.Nivel == NivelDaCorrida" in sobe
    assert "Aperte E" in sobe


def test_a_corrida_zera_junto_com_o_nivel():
    for inicio in ["void ComecarRodadaDaMutacao", "EventRoundPrestart"]:
        assert "corridas.Clear()" in CODIGO_DA_MUTACAO[CODIGO_DA_MUTACAO.index(inicio):]
    assert "corridas.Remove(" in CODIGO_DA_MUTACAO[CODIGO_DA_MUTACAO.index("EventPlayerDisconnect"):]
    trecho = CODIGO_DA_MUTACAO[CODIGO_DA_MUTACAO.index("void TransformarEmMutante"):]
    assert trecho.index("corridas.Remove(jogador.Slot)") < trecho.index("AplicarAtributosDoMutante(jogador)")


def test_o_teste_volta_para_a_dust_2_se_o_mapa_da_oficina_abrir_por_cima():
    # Ao ligar, o servidor abre o mapa da Oficina por último, e isso passava por cima da troca do teste.
    inicio = CODIGO_DA_MUTACAO.index("RegisterListener<Listeners.OnMapStart>")
    ouvinte = CODIGO_DA_MUTACAO[inicio:inicio + 600]
    assert "testeComBots && mapa != MapaDoTeste" in ouvinte
    assert 'changelevel {MapaDoTeste}' in ouvinte
    assert 'MapaDoTeste = "de_dust2";' in CODIGO_DA_MUTACAO


def test_o_fim_da_rodada_nao_acontece_no_mesmo_instante_da_infeccao():
    # Tirar as armas de quem virou mutante e encerrar a rodada no mesmo instante, dentro do golpe, derrubava o jogo
    # de quem estava no servidor ("OnPreserveEntity") na infecção do último humano.
    transforma = metodo_da_mutacao("void TransformarEmMutante")
    assert "ConferirFimDaRodada();" not in transforma
    assert "AddTimer(EsperaParaConferirOFim, ConferirFimDaRodada)" in transforma
    assert "EsperaParaConferirOFim = 0.5f;" in CODIGO_DA_MUTACAO


def test_o_adm_desliga_o_zumbi_so_pelo_console_do_servidor():
    # Para testar com bots se a queda vem do boneco do zumbi.
    trecho = CODIGO_DA_MUTACAO[CODIGO_DA_MUTACAO.index('"magnatas_mutacao_sem_zumbi"'):][:700]
    assert "CommandUsage.SERVER_ONLY" in trecho
    assert "zumbiNoServidor = false" in trecho


CODIGO_DO_ALASKA = (RAIZ / "plugins" / "MagnatasDiversao" / "Alaska.cs").read_text(encoding="utf-8")
TODO_O_PLUGIN = CODIGO_DO_PLUGIN + CODIGO_DA_MUTACAO + CODIGO_DO_ALASKA + CODIGO_DO_FANTASMA


def test_nenhum_temporizador_e_parado_sem_passar_pelo_parar():
    # Parar um temporizador de uma vez só que já disparou estraga a memória e derruba o servidor (provado com bots).
    import re
    assert re.findall(r"\w+\?\.Kill\(\)", TODO_O_PLUGIN) == []
    parar = CODIGO_DO_PLUGIN[CODIGO_DO_PLUGIN.index("static void Parar(ref"):][:400]
    # Parar um temporizador enquanto o servidor roda os temporizadores derruba o servidor (provado com bots):
    # a parada de verdade fica para o quadro seguinte, fora dessa hora.
    assert "relogio = null;" in parar
    assert "Server.NextFrame(parado.Kill)" in parar


def test_temporizador_de_uma_vez_so_se_esquece_ao_disparar():
    import re
    for campo in ["relogioDoSorteio", "fimDaRodada", "somDaContagem", "empateDoAlaska", "fimDaPartida"]:
        criacao = re.search(campo + r" = AddTimer\([^;]*?=>\s*\{\s*" + campo + r" = null;", TODO_O_PLUGIN, re.S)
        assert criacao, campo


def test_o_comando_de_teste_dos_jeitos_de_encerrar_saiu():
    assert "magnatas_teste_fim" not in CODIGO_DA_MUTACAO


def test_ninguem_larga_arma_ao_morrer_mesmo_depois_de_trocar_de_mapa():
    # A troca de mapa volta as configurações do jogo ao padrão, e a super Negev caía no chão.
    comeca = metodo_da_mutacao("void ComecarRodadaDaMutacao")
    assert 'Server.ExecuteCommand("mp_death_drop_gun 0")' in comeca


def test_a_super_negev_entra_depois_que_o_fuzil_saiu():
    # O fuzil só sai de verdade no fim do quadro: dar a Negev no mesmo instante deixava o portador sem ela.
    entrega = metodo_da_mutacao("void EntregarSuperArma")
    assert entrega.index("arma.Remove()") < entrega.index("Server.NextFrame(") < entrega.index("GiveNamedItem(ArmaEspecial)")
    proximo = entrega[entrega.index("Server.NextFrame("):]
    assert "portadorDaSuperArma" in proximo and "PawnIsAlive: true" in proximo


def test_mutante_que_morre_cai_com_a_animacao_do_guerreiro():
    assert '$"{PastaDoMutante}/nivel1/morte/guerreiro_morte.vmdl",' in CODIGO_DA_MUTACAO
    precache = CODIGO_DA_MUTACAO[CODIGO_DA_MUTACAO.index("OnServerPrecacheResources"):][:600]
    assert "if (queda != null) manifesto.AddResource(queda);" in precache
    morte = metodo_da_mutacao("HookResult AoMorrerNaMutacao")
    # Só quem já era mutante: humano que morre de queda vira mutante sem a cena.
    assert "var eraMutante = jogador.Team == CsTeam.Terrorist;" in morte
    assert "if (eraMutante) MostrarQuedaDoMutante(jogador);" in morte


def test_a_cena_da_morte_esconde_o_corpo_e_some_sozinha():
    cena = metodo_da_mutacao("void MostrarQuedaDoMutante")
    assert "if (!MorteNoServidor()) return null;" in metodo_da_mutacao("private string? QuedaDe(")
    assert 'CreateEntityByName<CDynamicProp>("prop_dynamic")' in cena
    # Trocar o modelo antes de a entidade nascer dava erro interno no servidor a cada morte (SetupModel, entidade
    # ainda "em preparo"): o modelo, o lugar e a animação vão junto na criação.
    assert "SetModel(" not in cena and "Teleport(" not in cena
    assert 'valores.SetString("model", modeloDaQueda);' in cena
    assert "if (modeloDaQueda == null) return;" in cena
    assert 'valores.SetString("DefaultAnim", "morte");' in cena
    assert "queda.DispatchSpawn(valores);" in cena
    assert "Color.FromArgb(0," in cena and "m_clrRender" in cena
    assert "MudarTamanho(queda, NivelDe(jogador).Tamanho)" in cena
    assert "AddTimer(SegundosDaCenaDaMorte" in cena and ".Remove()" in cena


def test_a_cena_da_morte_so_aparece_quando_o_pacote_do_servidor_tem_o_modelo():
    assert 'NoPacote(PacoteDoMutante, $"{PastaDoMutante}/nivel3/morte")' in CODIGO_DA_MUTACAO
    assert 'NoPacote(PacoteDoMutante, PastaDoMutante)' in CODIGO_DA_MUTACAO


def test_a_chave_dos_bonecos_do_pacote_desliga_o_boneco_e_a_queda_de_uma_vez():
    # Se uma versão nova do boneco der problema, a chave volta o mutante ao próprio boneco e o corpo cai do jeito normal.
    assert "private static readonly bool UsarBonecosDoPacote = true;" in CODIGO_DA_MUTACAO
    for metodo in ["bool ZumbiNoServidor", "bool MorteNoServidor"]:
        assert "if (!UsarBonecosDoPacote) return false;" in metodo_da_mutacao(metodo)
    precache = CODIGO_DA_MUTACAO[CODIGO_DA_MUTACAO.index("OnServerPrecacheResources"):][:400]
    assert "if (!UsarBonecosDoPacote) return;" in precache


def test_no_fantasma_ninguem_ve_o_nome_do_inimigo_ao_mirar():
    assert valor("mp_playerid", "fantasma") == "1"
    comeca = CODIGO_DO_FANTASMA[CODIGO_DO_FANTASMA.index("void ComecarRodadaDoFantasma"):]
    comeca = comeca[:comeca.index(FIM_DO_METODO)]
    # A troca de mapa volta as configurações ao padrão: o plugin religa a cada rodada.
    assert 'Server.ExecuteCommand("mp_playerid 1")' in comeca


def test_o_placar_de_cima_conta_as_rodadas_da_mutacao():
    encerra = metodo_da_mutacao("void EncerrarRodadaDaMutacao")
    assert encerra.index("vitoriasDosMutantes++") < encerra.index("MostrarPlacarDaMutacao()")
    placar = metodo_da_mutacao("void MostrarPlacarDaMutacao")
    assert "time.Score = vitoriasDosHumanos" in placar and "time.Score = vitoriasDosMutantes" in placar
    assert 'SetStateChanged(time, "CTeam", "m_iScore")' in placar
    zera = CODIGO_DA_MUTACAO[CODIGO_DA_MUTACAO.index("vitoriasDosMutantes = 0;"):][:120]
    assert "MostrarPlacarDaMutacao();" in zera


def test_o_fim_da_rodada_toca_o_som_de_quem_venceu():
    # Os arquivos do pacote ficaram trocados: o dono ouviu o som dos Magnatas quando os mutantes venceram.
    assert 'SomDaVitoriaDosMagnatas = "magnatas.vitoria_mutantes";' in CODIGO_DA_MUTACAO
    assert 'SomDaVitoriaDosMutantes = "magnatas.vitoria_magnatas";' in CODIGO_DA_MUTACAO
    encerra = metodo_da_mutacao("void EncerrarRodadaDaMutacao")
    assert "TocarParaTodos(humanosVenceram ? SomDaVitoriaDosMagnatas : SomDaVitoriaDosMutantes);" in encerra
    toca = metodo_da_mutacao("void TocarParaTodos")
    assert "foreach (var pessoa in Pessoas())" in toca and "EmitSound(som, soEle)" in toca


def test_o_boneco_vem_do_pacote_proprio_da_versao():
    assert f'PacoteDoMutante = "{PACOTE_DO_MUTANTE}";' in CODIGO_DA_MUTACAO
    assert 'PastaDoMutante = "models/magnatas/mutante_v2";' in CODIGO_DA_MUTACAO


def test_cada_nivel_do_mutante_tem_o_proprio_boneco_e_queda():
    sobe = metodo_da_mutacao("void SubirDeNivel")
    # O boneco do nível vem ao renascer, não ao subir (CopyExistingEntity, 10/11/2026).
    assert "SetModel(" not in sobe
    quedas = CODIGO_DA_MUTACAO[CODIGO_DA_MUTACAO.index("QuedaDoNivel ="):][:300]
    assert "nivel1/morte" in quedas and "nivel2/morte" in quedas and "nivel3/morte" in quedas
    # O nível 3 usa a queda do nível 2 (o dono escolheu, 09/11). A conferência do pacote olha a queda do nível 3, a
    # última a entrar: se o servidor ainda tiver o pacote de antes, nenhum nível mostra a queda, em vez de faltar uma.
    assert 'NoPacote(PacoteDoMutante, $"{PastaDoMutante}/nivel3/morte")' in CODIGO_DA_MUTACAO


def test_teste_sem_mudar_o_tamanho_dos_bonecos_durante_o_jogo():
    # Suspeita das quedas do jogo na transformação e no reinício da rodada: mexer no esqueleto para mudar o tamanho.
    assert "private static readonly bool MudarTamanhoEmJogo = false;" in CODIGO_DA_MUTACAO
    muda = metodo_da_mutacao("static void MudarTamanho(")
    assert "if (!MudarTamanhoEmJogo) return;" in muda
    assert muda.index("if (!MudarTamanhoEmJogo) return;") < muda.index("GetSkeletonInstance()")


def test_comando_de_teste_sobe_um_bot_mutante_de_nivel_para_o_dono_ver():
    # O dono queria ver o boneco de cada nível sem precisar fazer 5 infecções numa rodada (09/11).
    # Só pelo servidor (RCON) e só em bot: não mexe no nível de gente de verdade.
    trecho = CODIGO_DA_MUTACAO[CODIGO_DA_MUTACAO.index('"magnatas_mutacao_nivel"'):]
    trecho = trecho[:trecho.index(FIM_DO_METODO)]
    assert "CommandUsage.SERVER_ONLY" in trecho
    assert "IsBot" in trecho
    assert "Team: CsTeam.Terrorist" in trecho
    assert "infeccoes[bot.Slot] = novo.InfeccoesParaChegar;" in trecho
    assert "SubirDeNivel(bot, antes, novo);" in trecho


# Mutante da loja: Blindado (Cyber Hulk), aprovado pelo dono em 10/11/2026.
def test_o_blindado_tem_boneco_pacote_proprio_e_escudo_de_2_4_6_segundos():
    assert 'private const string PastaDoBlindado = "models/magnatas/blindado_v1";' in CODIGO_DA_MUTACAO
    assert "private static readonly float[] SegundosDoEscudo = { 2f, 4f, 6f };" in CODIGO_DA_MUTACAO
    assert "private const float SegundosDeRecargaDoEscudo = 15f;" in CODIGO_DA_MUTACAO
    assert "private static readonly int[] NiveisComBonecoDoBlindado = { 1, 2, 3 };" in CODIGO_DA_MUTACAO


def test_o_plugin_pergunta_ao_site_qual_mutante_cada_um_comprou():
    busca = metodo_da_mutacao("private async Task BuscarMutantesDaLoja(")
    assert "/api/servidor/visuais?steamids=" in busca
    assert '"mutante"' in busca
    assert "Server.NextFrame" in busca
    assert "catch (Exception" in busca
    assert "BuscarMutantesDaLoja(" in metodo_da_mutacao("private void ComecarRodadaDaMutacao(")


def test_o_blindado_so_vale_com_o_pacote_dele_no_servidor():
    skin = metodo_da_mutacao("private string? SkinDe(")
    assert "BlindadoNoServidor()" in skin
    confere = metodo_da_mutacao("private bool BlindadoNoServidor(")
    assert "NoPacote(PacoteDoBlindado, PastaDoBlindado)" in confere


def test_o_mutante_da_loja_usa_o_proprio_boneco_e_a_propria_queda():
    assert "corpo.SetModel(ModeloDe(jogador, nivel.Nivel))" in metodo_da_mutacao("private void AplicarAtributosDoMutante(")
    assert "SetModel(" not in metodo_da_mutacao("private void SubirDeNivel(")
    assert "QuedaDe(jogador)" in metodo_da_mutacao("private void MostrarQuedaDoMutante(")


def test_o_g_do_blindado_liga_o_escudo_desde_o_nivel_1_com_recarga():
    g = metodo_da_mutacao("private HookResult UsarPoder(")
    assert g.index('SkinDe(jogador) == "blindado"') < g.index("NivelDaCorrida")
    escudo = metodo_da_mutacao("private HookResult LigarEscudo(")
    assert "SegundosDoEscudo[" in escudo
    assert "SegundosDeRecargaDoEscudo" in escudo
    assert "CorDoEscudo" in escudo


def test_o_escudo_bloqueia_o_dano_no_mutante():
    dano = metodo_da_mutacao("private HookResult AoReceberDano(")
    assert dano.index("EscudoLigado(") < dano.index("corpo.TeamNum != (byte)CsTeam.CounterTerrorist")


def test_a_mutacao_baixa_o_pacote_do_blindado_que_o_plugin_usa():
    pacote = re.search(r'PacoteDoBlindado = "(\d+)"', CODIGO_DA_MUTACAO).group(1)
    assert pacote in valor("mm_extra_addons", "mutacao").strip('"').split(",")


def test_quem_pega_a_super_negev_vira_o_heroi_quando_o_pacote_chegou():
    assert 'PastaDoHeroi = "models/magnatas/heroi_v1"' in CODIGO_DA_MUTACAO
    entregar = metodo_da_mutacao("private void EntregarSuperArma(")
    assert "HeroiNoServidor()" in entregar
    assert ".SetModel(ModeloDoHeroi)" in entregar
    # Sem o pacote, o portador continua dourado como antes.
    assert "CorDoPortador" in entregar
    assert "manifesto.AddResource(ModeloDoHeroi)" in CODIGO_DA_MUTACAO


def test_o_heroi_aponta_para_o_pacote_dos_personagens():
    assert f'PacoteDosPersonagens = "{PACOTE_DOS_PERSONAGENS}"' in CODIGO_DA_MUTACAO


def test_o_competitivo_tambem_baixa_o_pacote_dos_personagens():
    competitivo = (RAIZ / "config" / "server.cfg").read_text(encoding="utf-8")
    assert f'mm_extra_addons "{PACOTE_DOS_PERSONAGENS}"' in competitivo
    assert "mm_cache_clients_with_addons 1" in competitivo
    visual = (RAIZ / "plugins" / "MagnatasVisual" / "MagnatasVisual.cs").read_text(encoding="utf-8")
    assert f'PacoteDosPersonagens = "{PACOTE_DOS_PERSONAGENS}"' in visual


def test_a_super_negev_vem_sem_apagar_o_fuzil_que_esta_na_mao():
    # Apagar o fuzil na mão e dar a Negev no quadro seguinte fechou o jogo do Adm (OnPreserveEntity, 10/11 20:01).
    entregar = metodo_da_mutacao("private void EntregarSuperArma(")
    assert entregar.index('ExecuteClientCommand("slot3")') < entregar.index("arma.Remove()")
    assert "AddTimer(EsperaParaTrocarDeArma" in entregar
    assert entregar.index("arma.Remove()") < entregar.index("GiveNamedItem(ArmaEspecial)")


def test_na_mutacao_so_o_heroi_troca_de_boneco_os_humanos_ficam_com_o_do_jogo():
    # Dono, 10/11/2026: trocar um boneco nosso por outro com o jogador vivo fechou o jogo três vezes no dia. Na Mutação
    # fica só o herói; o ADM e o do Marfioso valem nos outros modos e no competitivo.
    assert "private static readonly bool UsarHeroi = true;" in CODIGO_DA_MUTACAO
    for proibido in ["adm_v1", "marfioso_v1", "VestirBonecoProprio", "magnatas_mutacao_boneco", 'TryGetProperty("boneco"']:
        assert proibido not in CODIGO_DA_MUTACAO
        assert proibido not in CODIGO_DO_PLUGIN
    assert "manifesto.AddResource(ModeloDoHeroi)" in CODIGO_DA_MUTACAO


def test_quem_chega_depois_do_sorteio_assiste_de_ct_ate_a_proxima_rodada():
    # Pedido do dono (10/11/2026): com a partida rolando, quem chega fica no CT assistindo, em vez de nascer mutante.
    escolher = metodo_da_mutacao("public HookResult AoEscolherTime(")
    # Só quem chega (vinha de nenhum time ou do espectador); as trocas que o próprio plugin faz não contam.
    assert "evento.Oldteam <= (int)CsTeam.Spectator" in escolher
    assert "ColocarNaRodada(jogador, chegando)" in escolher
    trecho = CODIGO_DA_MUTACAO[CODIGO_DA_MUTACAO.index("void ColocarNaRodada"):]
    trecho = trecho[:trecho.index(FIM_DO_METODO)]
    sorteio = trecho[trecho.index("if (sorteioFeito)"):trecho.index("Antes do sorteio")]
    assistir = sorteio[sorteio.index("if (chegando)"):]
    assert "SwitchTeam(CsTeam.CounterTerrorist)" in assistir
    assert assistir.index("return;") < assistir.index("RenascerComoMutante")
    # Quem já jogava e morreu de humano continua voltando como mutante.
    assert "AddTimer(mutanteDaRodada.SegundosParaRenascer, () => RenascerComoMutante(jogador))" in sorteio


def test_quem_vira_mutante_ve_na_tela_o_que_o_mutante_faz():
    # Pedido do dono (10/11/2026): o G parecia não funcionar, porque a corrida só libera no nível 2 e nada avisava.
    virar = metodo_da_mutacao("private void TransformarEmMutante(")
    assert "AvisarOQueOMutanteFaz(jogador)" in virar
    aviso = metodo_da_mutacao("private void AvisarOQueOMutanteFaz(")
    assert "MostrarCartao(" in aviso and "PrintToChat(" in aviso
    assert "Faca" in aviso and "E:" in aviso
    assert 'skin == "blindado"' in aviso and 'skin == "fumaca"' in aviso
    assert "NivelDaCorrida" in aviso
    g = metodo_da_mutacao("private HookResult UsarPoder(")
    corrida = g[g.index("NivelDe(jogador).Nivel < NivelDaCorrida"):]
    assert corrida.index("PrintToCenterHtml(") < corrida.index("return HookResult.Handled")


def test_o_heroi_fica_com_a_negev_na_mao_e_ve_que_e_o_heroi():
    entregar = metodo_da_mutacao("private void EntregarSuperArma(")
    dar = entregar[entregar.index("GiveNamedItem(ArmaEspecial)"):]
    # A troca para a Negev espera ela chegar na mão; antes ia no mesmo quadro e o herói ficava de faca.
    assert dar.index("AddTimer(EsperaParaTrocarDeArma") < dar.index('ExecuteClientCommand("slot1")')
    assert "Você é o HERÓI" in entregar
    # O aviso de quem pegou a Negev não cobre o aviso de quem acabou de virar mutante.
    sortear = metodo_da_mutacao("private void SortearSuperArma(")
    assert "Team == CsTeam.Terrorist" in sortear


def test_subir_de_nivel_nao_troca_o_corpo_com_o_mutante_vivo():
    # Trocar o boneco do Blindado ao chegar no nível 2, vivo e de faca na mão, fechou o jogo do Adm
    # ("CopyExistingEntity: missing client entity 125", 10/11/2026). O boneco do nível vem quando ele renascer.
    subir = metodo_da_mutacao("private void SubirDeNivel(")
    assert "SetModel(" not in subir
    assert "corpo.SetModel(ModeloDe(jogador, nivel.Nivel))" in metodo_da_mutacao("private void AplicarAtributosDoMutante(")


def test_o_heroi_troca_de_corpo_junto_com_a_saida_do_fuzil():
    # Como na infecção: as armas saem e o boneco troca no mesmo instante; a arma nova vem depois.
    entregar = metodo_da_mutacao("private void EntregarSuperArma(")
    assert entregar.index("arma.Remove()") < entregar.index(".SetModel(ModeloDoHeroi)") < entregar.index("GiveNamedItem(ArmaEspecial)")


def test_hud_do_poder_do_g_fica_na_tela_do_mutante():
    # Pedido do dono (10/11/2026): ver sempre se o poder está pronto, sendo gasto ou carregando.
    assert "AddTimer(IntervaloDaBarra, AtualizarTelaDaMutacao, TimerFlags.REPEAT)" in CODIGO_DA_MUTACAO
    tela = metodo_da_mutacao("private void AtualizarTelaDaMutacao(")
    assert "Team: CsTeam.Terrorist" in tela
    assert "HudDoPoder(" in tela
    # O cartão de quem acabou de virar mutante fica por cima do HUD enquanto vale.
    assert tela.index("cartoes.TryGetValue(") < tela.index("HudDoPoder(")
    hud = metodo_da_mutacao("private string HudDoPoder(")
    assert "agora < fim" in hud and "agora < recarga" in hud
    assert "E PRONTO" in hud
    assert "NivelDaCorrida" in hud
    assert "BlocosDaBarra" in metodo_da_mutacao("private static string BarraDePoder(")


def test_o_aviso_do_mutante_e_do_heroi_e_um_cartao_que_fica_na_tela():
    # O CS2 apaga logo a mensagem do meio da tela; o dono viu só o texto no chat (10/11/2026). O cartão é reenviado
    # junto com a barra do G até o tempo dele acabar.
    assert "MostrarCartao(jogador," in metodo_da_mutacao("private void AvisarOQueOMutanteFaz(")
    assert "MostrarCartao(jogador," in metodo_da_mutacao("private void EntregarSuperArma(")
    cartao = metodo_da_mutacao("private static string Cartao(")
    assert "━" in cartao and "fontSize-xl" in cartao
    tela = metodo_da_mutacao("private void AtualizarTelaDaMutacao(")
    assert "cartoes" in tela


def test_o_g_do_mutante_chega_ao_servidor_mesmo_so_com_a_faca():
    # Com mp_drop_knife_enable desligado, o jogo nem mandava o G de quem só tem a faca: o poder não funcionava
    # (dono, 10/11/2026). Ligado, o plugin pega o G do mutante, e o humano não larga a faca.
    assert valor("mp_drop_knife_enable", "mutacao") == "1"
    g = metodo_da_mutacao("private HookResult AoApertarG(")
    humano = g[:g.index("if (!EhMutanteDeVerdade(jogador)) return HookResult.Continue;")]
    assert 'Contains("knife")' in humano and "return HookResult.Handled" in humano


def test_o_hud_e_repetido_a_cada_tick_para_nao_piscar_nem_sumir():
    # A cada quarto de segundo piscava; a cada 1,5 s sumia (dono, 10/11/2026): o CS2 só mantém a mensagem do meio da
    # tela enquanto ela chega. O plugin calcula 4 vezes por segundo e repete o mesmo texto a cada tick do servidor.
    assert "RegisterListener<Listeners.OnTick>(RepetirTelas)" in CODIGO_DA_MUTACAO
    repetir = metodo_da_mutacao("private void RepetirTelas(")
    assert "telas" in repetir and "PrintToCenterHtml(" in repetir
    atualizar = metodo_da_mutacao("private void AtualizarTelaDaMutacao(")
    assert "telas[" in atualizar
    assert "PrintToCenterHtml(" not in atualizar
    assert "<br>" not in metodo_da_mutacao("private static string BarraDePoder(")


def test_o_senhor_do_vazio_tem_pacote_proprio_e_fumaca_de_8_10_12_segundos():
    assert 'private const string PastaDaFumaca = "models/magnatas/fumaca_v2";' in CODIGO_DA_MUTACAO
    assert "private static readonly float[] SegundosDaFumaca = { 8f, 10f, 12f };" in CODIGO_DA_MUTACAO
    assert "private const float SegundosDeRecargaDaFumaca = 15f;" in CODIGO_DA_MUTACAO
    assert "private const float VidaPorFumaca = 0.10f;" in CODIGO_DA_MUTACAO
    # Um boneco por nível (dono, 11/11/2026): Voidforged Warlord, Voidreaver Titan e Abyssal Void Titan.
    assert "private static readonly int[] NiveisComBonecoDaFumaca = { 1, 2, 3 };" in CODIGO_DA_MUTACAO
    confere = metodo_da_mutacao("private bool FumacaNoServidor(")
    assert "NoPacote(PacoteDaFumaca, PastaDaFumaca)" in confere
    assert 'PacoteDaFumaca == ""' in confere


def test_o_g_do_senhor_do_vazio_solta_fumaca_desde_o_nivel_1_e_custa_vida():
    g = metodo_da_mutacao("private HookResult UsarPoder(")
    assert g.index('SkinDe(jogador) == "fumaca"') < g.index("NivelDaCorrida")
    fumaca = metodo_da_mutacao("private HookResult SoltarFumaca(")
    assert fumaca.index("agora < fumaca.Recarga") < fumaca.index("corpo.Health -= custo")
    assert "corpo.Health <= custo" in fumaca
    assert '"smokegrenade_projectile"' in fumaca
    assert "SmokeColor" in fumaca
    assert "AddTimer(segundos, () => ApagarFumaca(alca))" in fumaca


def test_o_senhor_do_vazio_usa_o_proprio_boneco_e_aparece_no_hud():
    assert '"fumaca" => ModeloDaFumaca(nivel)' in CODIGO_DA_MUTACAO
    assert 'if (SkinDe(jogador) == "fumaca") return QuedaDaFumaca(nivel);' in CODIGO_DA_MUTACAO
    assert '"FUMAÇA"' in metodo_da_mutacao("private string HudDoPoder(")
    assert '"fumaca" when FumacaNoServidor()' in metodo_da_mutacao("private string? SkinDe(")


def test_a_mutacao_baixa_o_pacote_do_senhor_do_vazio_que_o_plugin_usa():
    pacote = re.search(r'PacoteDaFumaca = "(\d+)"', CODIGO_DA_MUTACAO).group(1)
    assert pacote == "3837859077"
    assert pacote in valor("mm_extra_addons", "mutacao").strip('"').split(",")


def test_a_fumaca_some_pela_alca_e_nunca_apaga_outra_coisa():
    # Queda de 11/11/2026 (CopyExistingEntity) no reinício da rodada: o relógio de 8 a 12 s apagava a fumaça pelo
    # objeto guardado, e depois do reinício o número dele podia já ser de outra coisa.
    fumaca = metodo_da_mutacao("private HookResult SoltarFumaca(")
    assert "nuvem.EntityHandle" in fumaca
    apagar = metodo_da_mutacao("private void ApagarFumaca(")
    assert "entidade.EntityHandle.Raw == alca" in apagar and 'DesignerName == "smokegrenade_projectile"' in apagar
    assert "if (nuvem.IsValid) nuvem.Remove();" not in fumaca
    # No reinício da rodada as fumaças do G saem junto com o tempo delas.
    preparar = metodo_da_mutacao("public HookResult AoPrepararRodadaDaMutacao(")
    assert "fumacas.Clear();" in preparar
    assert "ApagarFumacasDoG()" in preparar


def test_o_g_fica_no_registro_do_servidor_para_conferir():
    # O dono apertava G e nada acontecia; sem registro não dava para saber se o G chegava (11/11/2026).
    g = metodo_da_mutacao("private HookResult AoApertarG(")
    assert 'Console.WriteLine($"[Magnatas] G de ' in g
    fumaca = metodo_da_mutacao("private HookResult SoltarFumaca(")
    assert 'Console.WriteLine($"[Magnatas] Fumaça de ' in fumaca


def test_o_poder_do_mutante_vale_no_e_porque_o_g_nem_chegava_ao_servidor():
    # O dono, mutante e de faca na mão, apertava G e o servidor não recebia nada (11/11/2026). O E chega junto com o
    # movimento: o plugin olha a tecla a cada tick e usa o poder só na hora em que ela é apertada.
    assert "RegisterListener<Listeners.OnTick>(PoderNoE)" in CODIGO_DA_MUTACAO
    e = metodo_da_mutacao("private void PoderNoE(")
    assert "PlayerButtons.Use" in e
    assert "segurandoE.Add(jogador.Slot)" in e and "segurandoE.Remove(jogador.Slot)" in e
    assert e.index("EhMutanteDeVerdade(jogador)") < e.index("UsarPoder(jogador)")
    assert "IsBot: false" in e
    assert 'Console.WriteLine($"[Magnatas] E de ' in e
