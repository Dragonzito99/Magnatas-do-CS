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
    assert CODIGO_DO_PLUGIN.index("fimDaPartida?.Kill()") < CODIGO_DO_PLUGIN.index("fimDaPartida = AddTimer")


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
    assert 'new("Mutante", 2000, 1.1f, 3f' in CODIGO_DA_MUTACAO


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


def test_vinte_segundos_para_espalhar():
    assert "SegundosParaEspalhar = 20f" in CODIGO_DA_MUTACAO


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
    assert CODIGO_DA_MUTACAO.index("fimDaRodada?.Kill()") < CODIGO_DA_MUTACAO.index("fimDaRodada = AddTimer")
    assert CODIGO_DA_MUTACAO.index("relogioDoSorteio?.Kill()") < CODIGO_DA_MUTACAO.index("relogioDoSorteio = AddTimer")


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


def test_o_sorteio_da_arma_vale_para_cada_rodada():
    # Quem sobreviveu ainda está com a arma da rodada anterior.
    trecho = CODIGO_DA_MUTACAO[CODIGO_DA_MUTACAO.index("void EntregarArmaDoHumano"):]
    assert trecho.index(".Remove()") < trecho.index("GiveNamedItem(")


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
    assert campos["OFICINA"] == "3223106683"
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
    assert valor("mm_extra_addons", servidor) == f'"{PACOTE_DE_SONS}"'
    # Sem isso, cada troca de mapa do Equipe x Equipe faria todo mundo reconectar para conferir o pacote.
    assert valor("mm_cache_clients_with_addons", servidor) == "1"


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


def test_a_super_negev_nao_acaba_a_municao_e_empurra_mais():
    trecho = CODIGO_DA_MUTACAO[CODIGO_DA_MUTACAO.index("EventWeaponFire"):]
    assert '"m_iClip1"' in trecho
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


def test_o_mutante_usa_o_boneco_blindado_e_fica_maior():
    assert 'ModeloDoMutante = "characters/models/tm_phoenix_heavy/tm_phoenix_heavy.vmdl"' in CODIGO_DA_MUTACAO
    assert "AddResource(ModeloDoMutante)" in CODIGO_DA_MUTACAO
    trecho = CODIGO_DA_MUTACAO[CODIGO_DA_MUTACAO.index("void AplicarAtributosDoMutante"):]
    assert "SetModel(ModeloDoMutante)" in trecho
    assert "TamanhoDoMutante" in trecho
    prepara = CODIGO_DA_MUTACAO[CODIGO_DA_MUTACAO.index("EventRoundPrestart"):]
    assert "TamanhoDoHumano" in prepara


def test_mutacao_roda_biochemical_hotel_e_silent_village():
    rotacao = conf("mutacao")["ROTACAO"].split(",")
    assert rotacao[0] == conf("mutacao")["OFICINA"]
    assert rotacao == ["3223106683", "3222984182"]


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
    assert "fimDaPartida?.Kill()" in inicio


def test_alaska_tira_o_jogador_da_escada_falsa_das_portas():
    # As portas das bases do Alaska prendem o jogador como se fosse escada: o tiro sai torto e ele não passa.
    codigo = codigo_do_alaska()
    assert "Listeners.OnTick" in codigo
    trecho = codigo[codigo.index("void SoltarDaEscada"):]
    assert "MoveType_t.MOVETYPE_LADDER" in trecho
    assert "MoveType_t.MOVETYPE_WALK" in trecho
    assert '"m_MoveType"' in trecho
