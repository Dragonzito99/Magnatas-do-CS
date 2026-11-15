"""Ilha Lemnos, o modo extração (dono, 15/11/2026): configuração, scripts e o plugin MagnatasLemnos."""
import json
import pathlib
import re

import pytest

RAIZ = pathlib.Path(__file__).resolve().parents[1]
CONFIGS = RAIZ / "config" / "diversao"
INICIAR = (RAIZ / "scripts" / "iniciar_diversao.sh").read_text(encoding="utf-8")
INSTALADOR = (RAIZ / "scripts" / "instalar_cs2.sh").read_text(encoding="utf-8")
COMPILAR = (RAIZ / "scripts" / "compilar_plugin.sh").read_text(encoding="utf-8")
ARQUIVO_DO_MAPA = RAIZ / "config" / "lemnos" / "3649316235.json"
PLUGIN = RAIZ / "plugins" / "MagnatasLemnos"


def conf():
    campos = {}
    for linha in (CONFIGS / "ilha-lemnos.conf").read_text(encoding="utf-8").splitlines():
        if "=" in linha and not linha.startswith("#"):
            chave, texto = linha.split("=", 1)
            campos[chave] = texto
    return campos


def valor_no_cfg(comando):
    achadas = []
    for arquivo in [conf()["BASE"], "ilha-lemnos.cfg"]:
        for linha in (CONFIGS / arquivo).read_text(encoding="utf-8").splitlines():
            partes = linha.split(maxsplit=1)
            if partes and partes[0] == comando:
                achadas.append(partes[1] if len(partes) > 1 else "")
    assert achadas, f"{comando} não está na configuração da Ilha Lemnos"
    return achadas[-1]


def codigo():
    return "\n".join(arquivo.read_text(encoding="utf-8") for arquivo in sorted(PLUGIN.glob("*.cs")))


# Tarefa 11: configuração e scripts


def test_lemnos_usa_o_plugin_proprio():
    campos = conf()
    assert campos["PLUGIN_DO_MODO"] == "MagnatasLemnos"
    assert campos["PORTA"] == "27024"
    assert campos["VAGAS"] == "20"
    assert campos["OFICINA"] == "3649316235"
    assert campos["REGRA"] == "lemnos"
    assert campos["GAME_TYPE"] == "3" and campos["GAME_MODE"] == "0"
    assert campos["BASE"] == "lemnos_base.cfg"


def test_lemnos_porta_27024_aberta_no_ufw():
    assert "ufw allow 27024/udp" in INSTALADOR


@pytest.mark.parametrize(
    "comando, esperado",
    [
        ("mp_teammates_are_enemies", "1"),
        ("mp_ignore_round_win_conditions", "1"),
        ("mp_roundtime", "60"),
        ("mp_respawn_on_death_t", "0"),
        ("mp_respawn_on_death_ct", "0"),
        ("sv_buy_status_override", "3"),
        ("mp_death_drop_gun", "1"),
        ("bot_quota", "0"),
        ("mp_autokick", "0"),
    ],
)
def test_cfg_do_lemnos_tem_as_regras(comando, esperado):
    assert valor_no_cfg(comando) == esperado


def test_iniciar_nao_poe_o_plugin_da_diversao_no_lemnos():
    assert "PLUGIN_DO_MODO" in INICIAR
    # Com o plugin próprio, a pasta do MagnatasDiversao some da cópia desse servidor.
    assert re.search(r'rm -rf "\$PASTA_DOS_PLUGINS/MagnatasDiversao"', INICIAR)
    assert "MagnatasLemnos.dll" in INICIAR


def test_config_do_plugin_com_permissao_600():
    assert re.search(r'chmod 600 "\$CONFIG_DO_LEMNOS/MagnatasLemnos.json"', INICIAR)
    assert '"ArquivoDoMapa"' in INICIAR


def test_arquivo_do_mapa_e_json_valido():
    dados = json.loads(ARQUIVO_DO_MAPA.read_text(encoding="utf-8"))
    assert set(dados) == {"safeZones", "saidas", "caixas", "chao"}
    assert "config/lemnos" in INSTALADOR


def test_lemnos_mantem_visual_e_lista():
    # O personagem (MagnatasVisual) e a lista de membros (MagnatasLista) vêm do competitivo junto com os addons.
    assert 'cp -au "$SERVIDOR/csgo/addons" "$PASTA/csgo/"' in INICIAR
    assert 'rm -rf "$PASTA_DOS_PLUGINS/MagnatasVisual"' not in INICIAR
    assert 'rm -rf "$PASTA_DOS_PLUGINS/MagnatasLista"' not in INICIAR


def test_todos_nao_liga_a_ilha():
    assert "ilha-lemnos" in INICIAR.split('if [ "$NOME" = "todos" ]')[1].split("exit 0")[0]


def test_compilar_faz_o_plugin_da_ilha():
    assert "plugins/MagnatasLemnos" in COMPILAR
    assert "MagnatasLemnos.dll" in COMPILAR


# Tarefa 12: a base do plugin (site, kit e postos)


def test_lemnos_nao_registra_OnEntityDeleted():
    # Derrubou a Mutação em 13/11/2026: nunca registrar.
    assert "OnEntityDeleted" not in codigo()


def test_toda_chamada_ao_site_passa_pela_fila():
    fonte = codigo()
    assert fonte.count("SendAsync(") == 1, "só a fila fala com o site"
    for aviso in ["inicio", "entrada", "renascer", "extracao", "morte", "saida"]:
        assert f'Avisar("{aviso}"' in fonte


def test_referencia_com_prefixo_lemnos():
    assert re.search(r'\$"lemnos:\{Config\.Porta\}:\{Guid\.NewGuid\(\)', codigo())


def test_fila_reenvia_ate_10_minutos():
    fonte = codigo()
    assert "PrazoDaFila = TimeSpan.FromMinutes(10)" in fonte
    # Recusa do site (4xx) não se repete; erro do site (5xx) e falha de rede, sim.
    assert "< 500" in fonte


def test_safe_zone_bloqueia_dano():
    fonte = codigo()
    assert "Listeners.OnEntityTakeDamagePre" in fonte
    assert "NoPosto(" in fonte


def test_arma_magcoin_some_do_chao_na_morte():
    fonte = codigo()
    assert "TirarDoChaoAsQueNaoCaem" in fonte
    assert re.search(r"Magcoin \|\| .*Gratis", fonte)


def test_arma_magcoin_nao_se_larga():
    assert 'AddCommandListener("drop"' in codigo()


def test_avisa_inicio_ao_carregar():
    fonte = codigo()
    load = fonte.split("public override void Load")[1].split("\n    }")[0]
    assert 'Avisar("inicio"' in load


def test_nome_e_versao_do_plugin():
    fonte = codigo()
    assert 'ModuleName => "Magnatas: Ilha Lemnos"' in fonte
    assert 'ModuleVersion => "0.1.0"' in fonte


def test_classe_da_m4_silenciada_e_da_usp_pelo_numero_do_item():
    fonte = codigo()
    assert '"weapon_m4a1_silencer"' in fonte and '"weapon_usp_silencer"' in fonte


# Tarefa 13: saque, mochila e extração


def test_extracao_espera_10_segundos_parado():
    assert "SegundosParaExtrair = 10" in codigo()


def test_mochila_respeita_espacos():
    fonte = codigo()
    assert "Mochila cheia" in fonte
    assert re.search(r"Count >= .*Espacos", fonte)


def test_mochila_cai_ao_morrer_e_some_em_5_minutos():
    fonte = codigo()
    assert "DeixarMochilaNoChao" in fonte
    assert "MinutosDaMochilaNoChao = 5" in fonte


def test_saque_reaparece():
    fonte = codigo()
    assert "MinutosParaReaparecerMin = 5" in fonte and "MinutosParaReaparecerMax = 10" in fonte


def test_pegar_com_use():
    fonte = codigo()
    assert "PlayerButtons.Use" in fonte
    assert "DistanciaParaPegar = 80" in fonte


def test_extracao_mostra_o_texto_do_dono():
    assert "Você extraiu da Ilha Lemnos" in codigo()


# Tarefa 14: vigia, saída e reinício diário


def test_afk_3_minutos_mais_30_segundos():
    fonte = codigo()
    assert "SegundosAteAvisoAfk = 180" in fonte and "SegundosAteKickAfk = 210" in fonte


def test_acampar_10_minutos_300_unidades():
    fonte = codigo()
    assert "SegundosAteAvisoAcampar = 600" in fonte and "SegundosAteKickAcampar = 660" in fonte
    assert "RaioDeAcampar = 300" in fonte


def test_kick_manda_motivo_antes_de_desconectar():
    fonte = codigo()
    kick = fonte.split("private void Expulsar(")[1].split("\n    }")[0]
    assert kick.index('Avisar("saida"') < kick.index("kickid")


def test_reinicio_as_5_de_brasilia_com_avisos():
    fonte = codigo()
    assert '"America/Sao_Paulo"' in fonte
    assert "HoraDoReinicio = 5" in fonte
    assert "MinutosDeAviso = [10, 5, 1]" in fonte
    assert 'ExecuteCommand("quit")' in fonte


# Tarefa 15: marcar o mapa andando por ele


def test_marcar_so_adm():
    fonte = codigo()
    marcar = fonte.split("private void ComandoMarcar(")[1].split("\n    }")[0]
    assert "Adm" in marcar
    for comando in ['"css_marcar"', '"css_marcados"', '"css_desmarcar"']:
        assert comando in fonte


def test_marcar_grava_no_arquivo_do_mapa():
    fonte = codigo()
    assert "Config.ArquivoDoMapa" in fonte
    assert "File.WriteAllText" in fonte
    assert "RaioDoPosto = 600" in fonte and "RaioDaSaida = 150" in fonte


# Revisão final (15/11/2026)


def test_arma_que_nao_cai_some_se_sair_da_mao_do_dono():
    # Pegar outra arma com E troca e larga a atual sem passar pelo comando drop.
    fonte = codigo()
    assert "PrenderArmasQueNaoCaem" in fonte
    passo = fonte.split("private void Passo()")[1].split("\n    }")[0]
    assert "PrenderArmasQueNaoCaem()" in passo


def test_arma_de_outro_kit_nao_vira_achada():
    fonte = codigo()
    mao = fonte.split("private List<ArmaNaMao> ArmasNaMao(")[1].split("\n    }")[0]
    assert "DeOutroKit(" in mao


def test_ligar_o_kit_tenta_de_novo_ate_ligar_tudo():
    assert "TentativasDeLigarOKit" in codigo()


def test_tirar_do_chao_confere_a_classe_da_entidade():
    fonte = codigo()
    tirar = fonte.split("TirarDoChaoAsQueNaoCaem(List<")[1].split("\n    }")[0]
    assert "ClasseDe(arma)" in tirar


def test_erro_na_resposta_nao_mata_a_fila():
    fonte = codigo()
    fila = fonte.split("private async Task EsvaziarFila(")[1].split("\n    }")[0]
    assert fila.count("catch (Exception") >= 2


def test_reinicio_fecha_como_queda_sem_avisar_saida():
    # O site fecha como queda no próximo início: as armas voltam ao baú (projeto).
    fonte = codigo()
    reiniciar = fonte.split("private void ReiniciarAgora()")[1].split("\n    }")[0]
    assert 'Avisar("saida"' not in reiniciar
    assert "JaSaiu = true" in reiniciar
    assert "volte a um posto" not in fonte


def test_quem_sai_antes_da_resposta_da_entrada_nao_deixa_sessao_aberta():
    fonte = codigo()
    entrada = fonte.split("private HookResult AoEntrar(")[1].split("\n    }")[0]
    assert 'Avisar("saida"' in entrada


def test_kit_espera_o_jogo_e_entrega_de_novo_o_que_sumiu():
    # O jogo monta o jogador logo depois de nascer e tirava as armas entregues cedo demais (dono, 15/11/2026).
    fonte = codigo()
    nascer = fonte.split("private HookResult AoNascer(")[1].split("\n    }")[0]
    assert "AddTimer(EsperaAposNascer" in nascer
    assert "Server.NextFrame" not in nascer
    ligar = fonte.split("private void LigarArmasAoKit(")[1].split("\n    }")[0]
    assert "GiveNamedItem(peca.Classe)" in ligar


@pytest.mark.parametrize("comando", ["mp_warmuptime_all_players_connected", "mp_warmup_online_enabled"])
def test_ilha_sem_aquecimento(comando):
    # Sem estas, o jogo fazia aquecimento e, no fim dele, tirava as armas de todo mundo (dono, 15/11/2026).
    assert valor_no_cfg(comando) == "0"


def test_rodada_reiniciada_devolve_o_kit_de_quem_estava_vivo():
    fonte = codigo()
    nascer = fonte.split("private HookResult AoNascer(")[1].split("\n    }")[0]
    assert "KitAtual" in nascer
    assert "Morto" in nascer


def test_posto_novo_nao_prende_quem_esta_dentro():
    # Marcar um posto onde o Adm estava fazia o plugin empurrá-lo "para fora" para o mesmo lugar, sem parar (15/11/2026).
    fonte = codigo()
    posto = fonte.split("private void ConferirPosto(")[1].split("\n    }")[0]
    assert "NoPosto(fora)" in posto


def test_ao_pegar_mostra_o_item_com_raridade_e_valor():
    # O dono não via o que tinha saído da caixa (15/11/2026): o item pego aparece em destaque e no chat.
    fonte = codigo()
    pegar = fonte.split("private void TentarPegar(")[1].split("\n    }")[0]
    assert "MostrarOQuePegou(" in pegar
    mostrar = fonte.split("private static void MostrarOQuePegou(")[1].split("\n    }")[0]
    assert "Você pegou" in mostrar and "PrintToChat" in mostrar and "PrintToCenterHtml" in mostrar
