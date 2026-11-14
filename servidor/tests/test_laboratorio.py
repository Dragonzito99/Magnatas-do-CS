"""Laboratório (dono, 13/11/2026): dois servidores da Diversão só para o Adm testar personagens e mutantes sozinho."""
import pathlib
import re

import pytest

RAIZ = pathlib.Path(__file__).resolve().parents[1]
CONFIGS = RAIZ / "config" / "diversao"
INICIAR = (RAIZ / "scripts" / "iniciar_diversao.sh").read_text(encoding="utf-8")
INSTALADOR = (RAIZ / "scripts" / "instalar_cs2.sh").read_text(encoding="utf-8")
GUARDAR_TOKEN = RAIZ / "scripts" / "guardar_token_steam.sh"
DIVERSAO = RAIZ / "plugins" / "MagnatasDiversao"
VISUAL = RAIZ / "plugins" / "MagnatasVisual" / "MagnatasVisual.cs"
LABORATORIOS = ["laboratorio-personagens", "laboratorio-mutantes"]


def conf(servidor):
    campos = {}
    for linha in (CONFIGS / f"{servidor}.conf").read_text(encoding="utf-8").splitlines():
        if "=" in linha and not linha.startswith("#"):
            chave, texto = linha.split("=", 1)
            campos[chave] = texto
    return campos


def valor(comando, servidor):
    achadas = []
    for arquivo in [conf(servidor)["BASE"], f"{servidor}.cfg"]:
        for linha in (CONFIGS / arquivo).read_text(encoding="utf-8").splitlines():
            partes = linha.split(maxsplit=1)
            if partes and partes[0] == comando:
                achadas.append(partes[1] if len(partes) > 1 else "")
    assert achadas, f"{comando} não está na configuração de {servidor}"
    return achadas[-1]


def codigo_da_diversao():
    return "\n".join(arquivo.read_text(encoding="utf-8") for arquivo in sorted(DIVERSAO.glob("*.cs")))


def laboratorio_cs():
    return (DIVERSAO / "Laboratorio.cs").read_text(encoding="utf-8")


def metodo(texto, assinatura):
    inicio = texto.index(assinatura)
    fim = texto.find("\n    }\n", inicio)
    return texto[inicio:fim]


# --- Configuração dos servidores ---


def test_personagens_e_mutantes_em_portas_proprias_fora_das_da_diversao():
    portas = {servidor: int(conf(servidor)["PORTA"]) for servidor in LABORATORIOS}
    assert portas == {"laboratorio-personagens": 27022, "laboratorio-mutantes": 27023}
    outras = [int(conf(arquivo.stem)["PORTA"]) for arquivo in CONFIGS.glob("*.conf") if arquivo.stem not in LABORATORIOS]
    assert not set(portas.values()) & set(outras)
    # A gravação das partidas usa a 27030.
    assert 27030 not in portas.values()


@pytest.mark.parametrize("servidor", LABORATORIOS)
def test_na_dust_2_sem_mapa_da_oficina_nem_rotacao(servidor):
    # Os bots só andam em mapa com o caminho deles; a Dust 2 tem.
    campos = conf(servidor)
    # O de personagens pode abrir um mapa da Oficina em teste (o cassino, 13/11/2026); lá os bots podem ficar parados.
    assert campos["MAPA"] == "de_dust2"
    if servidor != "laboratorio-personagens":
        assert campos.get("OFICINA", "") == ""
    assert campos.get("ROTACAO", "") == ""


@pytest.mark.parametrize("servidor", LABORATORIOS)
def test_e_laboratorio_e_usa_o_token_do_laboratorio(servidor):
    campos = conf(servidor)
    assert campos["LABORATORIO"] == "1"
    assert campos["NOME_DO_TOKEN"] == "LABORATORIO"


def test_personagens_e_mata_mata_inerte_e_mutantes_e_a_mutacao():
    personagens = conf("laboratorio-personagens")
    assert personagens["REGRA"] == "laboratorio"
    assert personagens["BASE"] == "cada_um_por_si.cfg"
    mutantes = conf("laboratorio-mutantes")
    assert mutantes["REGRA"] == "mutacao"
    assert mutantes["BASE"] == "mutacao_base.cfg"


@pytest.mark.parametrize("servidor", LABORATORIOS)
def test_com_cheats_para_terceira_pessoa_e_bots_parados_sem_atirar(servidor):
    assert valor("sv_cheats", servidor) == "1"
    assert valor("bot_stop", servidor) == "1"
    assert valor("bot_dont_shoot", servidor) == "1"
    # Com "normal", cada bot_add soma um bot; com "fill" a cota contaria as pessoas.
    assert valor("bot_quota_mode", servidor) == "normal"
    assert valor("mp_autokick", servidor) == "0"


@pytest.mark.parametrize("servidor", LABORATORIOS)
def test_nome_proprio_na_lista_de_servidores(servidor):
    assert "Laboratório" in valor("hostname", servidor)


def test_personagens_tem_dinheiro_e_municao_sem_fim():
    assert valor("mp_startmoney", "laboratorio-personagens") == "16000"
    assert valor("mp_maxmoney", "laboratorio-personagens") == "16000"
    assert valor("sv_infinite_ammo", "laboratorio-personagens") == "1"
    assert int(valor("mp_buytime", "laboratorio-personagens")) >= 9999
    # A base do mata-mata trava a compra; no laboratório ela fica liberada.
    assert valor("sv_buy_status_override", "laboratorio-personagens") == "-1"
    assert valor("mp_buy_anywhere", "laboratorio-personagens") == "1"
    # Se o tempo do mata-mata acabar, a partida recomeça em vez de deixar todo mundo parado.
    assert valor("mp_match_end_restart", "laboratorio-personagens") == "1"


def test_personagens_baixa_o_pacote_dos_personagens():
    assert "3837571705" in valor("mm_extra_addons", "laboratorio-personagens")


def test_mutantes_tem_rodada_longa():
    assert valor("mp_roundtime", "laboratorio-mutantes") == "60"
    assert valor("mp_ignore_round_win_conditions", "laboratorio-mutantes") == "1"


# --- Scripts ---


def test_o_plugin_recebe_se_e_laboratorio():
    assert '"Laboratorio": %s' in INICIAR
    assert "LABORATORIO" in INICIAR


def test_o_conf_escolhe_a_variavel_do_token():
    assert 'VARIAVEL_DO_TOKEN=GSLT_$(echo "${NOME_DO_TOKEN:-$NOME}"' in INICIAR


def test_ligar_todos_nao_liga_os_laboratorios():
    todos = INICIAR[INICIAR.index('if [ "$NOME" = "todos" ]'):INICIAR.index("exit 0", INICIAR.index('if [ "$NOME" = "todos" ]'))]
    assert "laboratorio-*" in todos


def test_instalador_libera_as_portas_do_laboratorio():
    assert "ufw allow 27022:27023/udp" in INSTALADOR


def test_guardar_o_token_pede_sem_mostrar_e_mantem_o_arquivo_fechado():
    texto = GUARDAR_TOKEN.read_text(encoding="utf-8")
    assert "read -rs" in texto
    assert "chmod 600" in texto
    assert "chown cs2:cs2" in texto
    # O nome vira variável: só letras maiúsculas e sublinhado.
    assert "^[A-Z_]{1,32}$" in texto
    # O token nunca vai para a tela nem para o registro.
    assert not re.search(r"echo[^\n]*\$TOKEN", texto)
    # O root roda este script: ele não pode ficar na pasta que o usuário cs2 altera.
    assert "install -o root -g root -m 700 \"$ORIGEM/scripts/guardar_token_steam.sh\" /usr/local/sbin/" in INSTALADOR


# --- Plugin da Diversão ---


def test_config_do_plugin_tem_o_campo_laboratorio():
    texto = (DIVERSAO / "MagnatasDiversao.cs").read_text(encoding="utf-8")
    assert '[JsonPropertyName("Laboratorio")]' in texto
    assert "public bool Laboratorio" in texto


def test_laboratorio_nunca_manda_resultado_ao_site():
    fechar = metodo(codigo_da_diversao(), "private void FecharPartida(")
    assert "Config.Laboratorio" in fechar.split("\n")[2] + fechar.split("\n")[3] + fechar.split("\n")[4]


def test_desliga_sozinho_depois_de_10_minutos_vazio():
    texto = laboratorio_cs()
    assert re.search(r"MinutosVazioParaDesligar = 10\b", texto)
    conferir = metodo(texto, "private void ConferirLaboratorioVazio(")
    assert 'Server.ExecuteCommand("quit")' in conferir
    assert "Pessoas()" in conferir
    carregar = metodo(codigo_da_diversao(), "public override void Load(")
    assert "if (Config.Laboratorio) LigarLaboratorio();" in carregar


def test_na_mutacao_de_laboratorio_a_rodada_fica_sempre_aberta_e_sem_sorteio():
    comecar = metodo(codigo_da_diversao(), "private void ComecarRodadaDaMutacao(")
    inicio = comecar.index("if (Config.Laboratorio)")
    # Antes de esperar jogadores, sortear ou ligar relógios.
    assert inicio < comecar.index("JogadoresNaRodada()")
    assert inicio < comecar.index("relogioDoSorteio = AddTimer")
    texto = laboratorio_cs()
    abrir = metodo(texto, "private void AbrirRodadaDoLaboratorio(")
    for marca in ["rodadaEmAndamento = true", "sorteioFeito = true", "tempoDeEspalharAcabou = true", "superArmaSorteada = true", "esperandoJogadores = false"]:
        assert marca in abrir


def test_no_laboratorio_a_rodada_nunca_acaba():
    conferir = metodo(codigo_da_diversao(), "private void ConferirFimDaRodada(")
    assert "Config.Laboratorio" in conferir.split("\n")[2]


def test_no_laboratorio_quem_chega_ou_morre_volta_no_proprio_lado():
    colocar = metodo(codigo_da_diversao(), "private void ColocarNaRodada(")
    assert "if (Config.Laboratorio)" in colocar.split("\n")[2]
    morrer = metodo(codigo_da_diversao(), "public HookResult AoMorrerNaMutacao(")
    assert "Config.Laboratorio" in morrer
    # Humano que cai no laboratório volta humano, não vira mutante.
    assert morrer.index("Config.Laboratorio") < morrer.index("jogador.SwitchTeam(CsTeam.Terrorist)")


def test_nivel_fixo_do_laboratorio_vale_mais_que_as_infeccoes():
    nivel = metodo(codigo_da_diversao(), "private NivelDoMutante NivelDe(")
    assert "niveisDoLaboratorio" in nivel


def test_comandos_dos_mutantes_so_no_laboratorio_de_mutantes():
    texto = laboratorio_cs()
    ligar = metodo(texto, "private void LigarLaboratorio(")
    assert 'Config.Regra == "mutacao"' in ligar
    for comando in ["css_mutante", "css_humano", "css_recarga", "css_bot", "css_parar", "css_limpar", "css_ajuda"]:
        assert f'"{comando}"' in ligar


def test_mutante_vivo_nunca_troca_de_boneco_vivo():
    # Trocar o boneco de um mutante vivo fechou jogos (10/11/2026): ele volta humano e renasce, e a transformação veste.
    virar = metodo(laboratorio_cs(), "private void VirarMutante(")
    assert "SetModel" not in virar
    assert "SwitchTeam(CsTeam.CounterTerrorist)" in virar
    assert "transformarAoNascer[" in virar
    assert "TransformarEmMutante(" in virar


def test_tipos_e_niveis_aceitos():
    texto = laboratorio_cs()
    assert re.search(r'TiposDeMutante = \{ "comum", "blindado", "fumaca", "healix" \}', texto)
    pedido = metodo(texto, "private static (string Tipo, int Nivel)? LerPedido(")
    assert "Math.Clamp" not in pedido  # nível fora de 1 a 3 é recusado, não arredondado
    assert "nivel is < 1 or > 3" in pedido


def test_bot_mutante_entra_humano_e_vira_pela_transformacao():
    texto = laboratorio_cs()
    chamar = metodo(texto, "private void ChamarBot(")
    assert 'Server.ExecuteCommand("bot_add_ct")' in chamar
    nascer = metodo(texto, "private void AoNascerNoLaboratorio(")
    assert "TransformarEmMutante(" in nascer


def test_recarga_zera_os_poderes_da_vaga():
    recarga = metodo(laboratorio_cs(), "private void Recarregar(")
    for mapa in ["corridas", "escudos", "fumacas", "curas", "puloDuploUsado"]:
        assert f"{mapa}.Remove(jogador.Slot)" in recarga


# --- Plugin Visual ---


def visual():
    return "\n".join(arquivo.read_text(encoding="utf-8") for arquivo in sorted(VISUAL.parent.glob("*.cs")))


def test_visual_reconhece_os_laboratorios_pela_pasta():
    texto = visual()
    assert '"/diversao/laboratorio-personagens/"' in texto
    # O de mutantes conta como Mutação: sem o pacote dos personagens.
    na_mutacao = metodo(texto, "private static bool NaMutacao(")
    assert '"/diversao/laboratorio-mutantes/"' in na_mutacao


def test_quem_nao_e_adm_sai_do_laboratorio():
    texto = visual()
    guardar = metodo(texto, "private void Guardar(")
    assert "ConferirAdmNoLaboratorio(" in guardar
    conferir = metodo(texto, "private void ConferirAdmNoLaboratorio(")
    assert ".Adm" in conferir
    assert "kickid" in conferir
    # Sem resposta do site também sai: o laboratório fecha na dúvida.
    entrar = metodo(texto, "private HookResult AoEntrar(")
    assert "SegundosParaConfirmarAdm" in entrar


def test_personagem_novo_so_veste_no_laboratorio():
    texto = visual()
    assert "bool SoNoLaboratorio = false" in texto
    assert '["models/magnatas/heroi_v1/mutante.vmdl"] = new(PacoteDosPersonagens, null, SoNoLaboratorio: true)' in texto
    no_servidor = metodo(texto, "private Boneco? BonecoNoServidor(")
    assert "SoNoLaboratorio" in no_servidor


def test_comandos_dos_personagens_so_no_laboratorio_de_personagens():
    texto = visual()
    carregar = metodo(texto, "public override void Load(")
    assert "if (NoLaboratorioDePersonagens()) LigarLaboratorio();" in carregar
    ligar = metodo(texto, "private void LigarLaboratorio(")
    for comando in ["css_vestir", "css_tirar", "css_bot", "css_botgesto", "css_parar", "css_limpar", "css_ajuda"]:
        assert f'"{comando}"' in ligar


def test_vestir_nunca_troca_o_boneco_de_quem_esta_vivo():
    vestir = metodo(visual(), "private void Vestir(")
    assert "SetModel" not in vestir
    assert "Renascer(" in vestir


def test_gesto_usa_o_personagem_do_laboratorio():
    gesto = metodo(visual(), "private void FazerGesto(")
    assert "BonecoDe(jogador)" in gesto
