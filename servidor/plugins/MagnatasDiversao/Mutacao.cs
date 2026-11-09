using System.Drawing;
using CounterStrikeSharp.API;
using CounterStrikeSharp.API.Core;
using CounterStrikeSharp.API.Core.Attributes.Registration;
using CounterStrikeSharp.API.Modules.Commands;
using CounterStrikeSharp.API.Modules.Cvars;
using CounterStrikeSharp.API.Modules.Entities.Constants;
using CounterStrikeSharp.API.Modules.Timers;
using CounterStrikeSharp.API.Modules.Utils;

namespace MagnatasDiversao;

/// <summary>
/// O modo Mutação. Todos nascem humanos (CT), e virar mutante é passar para TR sem morrer. O jogo não decide
/// nada da rodada: quem sorteia, transforma e encerra é o plugin.
/// </summary>
public partial class ModoDeDiversao
{
    /// <summary>Os atributos ficam juntos para os mutantes de outros tipos entrarem aqui, sem reescrever o modo.</summary>
    private sealed record TipoDeMutante(string Nome, float SegundosParaRenascer, Color Cor, NivelDoMutante[] Niveis);

    /// <summary>O mutante sobe de nível conforme infecta, só durante a rodada. Quem morre volta no nível em que estava.</summary>
    private sealed record NivelDoMutante(int Nivel, int InfeccoesParaChegar, int Vida, float Velocidade, float Tamanho);

    // Nível, infecções para chegar, vida, velocidade e tamanho, aprovados pelo dono.
    private static readonly TipoDeMutante MutanteComum = new("Mutante", 3f, Color.FromArgb(255, 255, 255, 255), new NivelDoMutante[]
    {
        new(1, 0, 1000, 1.10f, 1.15f),
        new(2, 2, 1500, 1.15f, 1.25f),
        new(3, 5, 2000, 1.20f, 1.35f),
    });
    private static readonly Color CorDoHumano = Color.FromArgb(255, 255, 255, 255);
    private const int VidaDoHumano = 100;
    private const float IntervaloDaVelocidade = 0.5f;
    // A partir do nível 2, o mutante corre mais rápido por alguns segundos ao apertar G (o "largar arma" do jogo).
    private const int NivelDaCorrida = 2;
    private const float BonusDaCorrida = 0.5f;
    private const float SegundosDaCorrida = 3f;
    private const float SegundosDeRecargaDaCorrida = 12f;
    private const int SegundosDoAvisoDeMutante = 3;
    private const float SegundosParaEspalhar = 15f;
    // O som da contagem começa antes e termina junto com o sorteio. Na tela, só os últimos 10 segundos.
    private const string SomDaContagem = "magnatas.contagem_mutacao";
    // Gravados pelo dono: um para a vitória dos Magnatas (os humanos, CT) e outro para a dos mutantes.
    private const string SomDaVitoriaDosMagnatas = "magnatas.vitoria_magnatas";
    private const string SomDaVitoriaDosMutantes = "magnatas.vitoria_mutantes";
    private const float SegundosDoSomDaContagem = 11.5f;
    private const int SegundosDaContagemNaTela = 10;
    // Sozinho não há o que jogar: a rodada fica parada, sem contar, até chegar mais alguém.
    private const int MinimoDeJogadores = 2;
    private const float EsperaParaConferirOFim = 0.5f;
    // O teste com bots precisa de um mapa com o caminho que os bots seguem; os da Mutação não têm.
    private const string MapaDoTeste = "de_dust2";
    private const float IntervaloDoAvisoDeEspera = 2f;
    private const int SegundosParaComecar = 3;
    // 1 mutante para cada 4 jogadores, arredondando para cima: 2 a 4 jogadores, 1; 5 a 8, 2; e assim por diante.
    private const int JogadoresPorMutante = 4;
    private const int RodadasPorPartida = 10;
    private const int SegundosEntreRodadas = 5;
    private const float MinutosDaRodadaSeFaltarORelogio = 3;
    private const float ForcaDoEmpurrao = 5f;
    private const float EmpurraoMaximo = 300f;
    private const int MunicaoDeReservaInfinita = 2;
    private static readonly string[] ArmasDoHumano = { "weapon_ak47", "weapon_m4a1" };

    // O boneco vem num pacote da Oficina só dele, um item novo para cada versão, que nunca é atualizado: a Steam entrega
    // atualizações ao servidor e ao jogo de cada um em horas diferentes, e o mesmo boneco com esqueletos diferentes
    // fechava o jogo de quem virava mutante ("OnPreserveEntity", 08/11 às 23:02 e 23:05). Item novo, todos baixam igual.
    private const string PacoteDoMutante = "3836525270";
    private const string ModeloDoMutante = "models/magnatas/mutante_v1/mutante.vmdl";
    // Sem o zumbi no servidor (o pacote novo ainda não chegou), o mutante ficaria sem áreas de acerto e sem animação.
    // Trocar para outro boneco do jogo fazia o jogo de quem estava no servidor parar para carregar o modelo e cair
    // ("OnPreserveEntity"). Então, sem o zumbi, o mutante fica com o próprio boneco, verde e maior.
    private static readonly Color CorDaReserva = Color.FromArgb(255, 110, 255, 110);
    private bool? zumbiNoServidor;
    // Chave para desligar os bonecos do pacote de uma vez, se uma versão nova der problema.
    private static readonly bool UsarBonecosDoPacote = true;
    private bool? morteNoServidor;
    // Quando o mutante morre, o corpo some e no lugar cai o guerreiro de cena tocando a animação do Meshy. O CS2 não toca
    // animação de morte no jogador (o corpo vira boneco de pano), então a queda é um modelo à parte que some sozinho.
    private const string ModeloDaMorte = "models/magnatas/mutante_v1/morte/guerreiro_morte.vmdl";
    private const float SegundosDaCenaDaMorte = 4f;
    private const float TamanhoDoHumano = 1f;

    // Um humano por rodada ganha a super Negev: não acaba a munição e empurra o mutante bem mais longe.
    private const string ArmaEspecial = "weapon_negev";
    private const int PenteDaSuperArma = 150;
    private const float EmpurraoDaSuperArma = 3f;
    private const float EmpurraoMaximoDaSuperArma = 600f;
    private static readonly Color CorDoPortador = Color.FromArgb(255, 255, 200, 40);
    private int? portadorDaSuperArma;
    private bool superArmaSorteada;

    private readonly TipoDeMutante mutanteDaRodada = MutanteComum;
    private CounterStrikeSharp.API.Modules.Timers.Timer? relogioDoSorteio;
    private CounterStrikeSharp.API.Modules.Timers.Timer? fimDaRodada;
    private CounterStrikeSharp.API.Modules.Timers.Timer? relogioDaContagem;
    private CounterStrikeSharp.API.Modules.Timers.Timer? somDaContagem;
    private int segundosAteOMutante;
    private bool esperandoJogadores;
    // Pedido pelo site, na aba Testes do Adm. Vale até o servidor desligar: troca o mapa, mas o plugin continua o mesmo.
    private bool testeComBots;
    // Infecções de cada mutante na rodada, pela vaga. Decidem o nível.
    private readonly Dictionary<int, int> infeccoes = new();
    // Por vaga: até quando a corrida vale e quando o G volta a funcionar, no relógio do servidor.
    private readonly Dictionary<int, (float Fim, float Recarga)> corridas = new();
    private bool rodadaEmAndamento;
    private bool sorteioFeito;
    private bool tempoDeEspalharAcabou;
    private int rodadasDaPartida;
    private int vitoriasDosHumanos;
    private int vitoriasDosMutantes;
    private int transformacoes;

    private void ComecarRodadaDaMutacao()
    {
        // O console recusa este comando, e o mapa pode reverter ao carregar. Por isso o plugin liga a cada rodada.
        var municao = ConVar<int>.Find("sv_infinite_ammo");
        if (municao != null) municao.Value = MunicaoDeReservaInfinita;
        // A troca de mapa volta as configurações ao padrão, e a super Negev de quem morria caía no chão.
        Server.ExecuteCommand("mp_death_drop_gun 0");
        Parar(ref relogioDoSorteio);
        Parar(ref fimDaRodada);
        Parar(ref relogioDaContagem);
        Parar(ref somDaContagem);
        infeccoes.Clear();
        corridas.Clear();
        if (testeComBots) ChamarBotsDoTeste();
        if (JogadoresNaRodada() < MinimoDeJogadores)
        {
            esperandoJogadores = true;
            rodadaEmAndamento = false;
            return;
        }
        esperandoJogadores = false;
        if (rodadasDaPartida == 0)
        {
            ZerarContagem();
            ZerarPlacarDasPessoas();
            inicioDaPartida = DateTime.UtcNow;
            vitoriasDosHumanos = 0;
            vitoriasDosMutantes = 0;
            MostrarPlacarDaMutacao();
            // A história do mapa, a mesma da página Jogo do site.
            if (Server.MapName == "zm_silent_village")
            {
                foreach (var pessoa in Pessoas()) pessoa.PrintToChat(" [Magnatas] Silent Village: o vírus vazou do laboratório debaixo da vila. Não confie em ninguém.");
            }
        }
        rodadaEmAndamento = true;
        sorteioFeito = false;
        tempoDeEspalharAcabou = false;
        superArmaSorteada = false;
        portadorDaSuperArma = null;

        relogioDoSorteio = AddTimer(SegundosParaEspalhar, () =>
        {
            relogioDoSorteio = null;
            tempoDeEspalharAcabou = true;
            SortearMutantes();
        });
        // O mesmo valor do relógio da tela, para os dois chegarem juntos ao fim.
        var minutos = ConVar<float>.Find("mp_roundtime")?.Value ?? MinutosDaRodadaSeFaltarORelogio;
        fimDaRodada = AddTimer(minutos * 60f, () =>
        {
            fimDaRodada = null;
            EncerrarRodadaDaMutacao(RoundEndReason.CTsWin);
        });

        segundosAteOMutante = (int)SegundosParaEspalhar;
        relogioDaContagem = AddTimer(1f, MostrarContagem, TimerFlags.REPEAT);
        somDaContagem = AddTimer(SegundosParaEspalhar - SegundosDoSomDaContagem, () =>
        {
            somDaContagem = null;
            TocarContagem();
        });
        foreach (var pessoa in Pessoas()) pessoa.PrintToChat($" [Magnatas] Espalhem-se: o mutante aparece em {SegundosParaEspalhar:0} segundos.");
    }

    /// <summary>Bots contam, para os testes com bots.</summary>
    private static int JogadoresNaRodada() =>
        Utilities.GetPlayers().Count(jogador => jogador is { IsValid: true, IsHLTV: false, Team: CsTeam.Terrorist or CsTeam.CounterTerrorist });

    private void MostrarContagem()
    {
        segundosAteOMutante--;
        if (!rodadaEmAndamento || sorteioFeito || segundosAteOMutante <= 0 || segundosAteOMutante > SegundosDaContagemNaTela) return;
        foreach (var pessoa in Pessoas())
        {
            pessoa.PrintToCenterHtml($"<font color='#ff4d4d' class='fontSize-xl'>{segundosAteOMutante}</font><br><font color='#ffffff'>O mutante vai aparecer</font>", 1);
        }
    }

    /// <summary>Cada um ouve o som no próprio ouvido, na mesma altura, onde quer que esteja no mapa.</summary>
    private void TocarParaTodos(string som)
    {
        foreach (var pessoa in Pessoas())
        {
            var soEle = new RecipientFilter();
            soEle.Add(pessoa);
            pessoa.EmitSound(som, soEle);
        }
    }

    private void TocarContagem()
    {
        if (!rodadaEmAndamento || sorteioFeito) return;
        foreach (var pessoa in Pessoas())
        {
            var soEle = new RecipientFilter();
            soEle.Add(pessoa);
            pessoa.EmitSound(SomDaContagem, soEle);
        }
    }

    /// <summary>Repete enquanto a pessoa está sozinha, e começa a partida se alguém entrou sem passar pela escolha de time.</summary>
    private void AvisarQueFaltaJogador()
    {
        if (!esperandoJogadores) return;
        ColocarNaRodada(null);
        if (!esperandoJogadores) return;
        foreach (var pessoa in Pessoas())
        {
            pessoa.PrintToCenterHtml("<font color='#f5b301' class='fontSize-l'>Esperando mais um jogador</font><br><font color='#ffffff'>A partida começa com 2 ou mais</font>", (int)IntervaloDoAvisoDeEspera + 1);
        }
    }

    private void SortearMutantes()
    {
        if (!rodadaEmAndamento) return;
        var vivos = Utilities.GetPlayers().Where(jogador => jogador is { IsValid: true, PawnIsAlive: true, Team: CsTeam.CounterTerrorist }).ToList();
        // Sozinho no servidor não há o que jogar: quem chegar depois dispara este sorteio.
        if (vivos.Count < 2) return;

        sorteioFeito = true;
        var quantos = (vivos.Count + JogadoresPorMutante - 1) / JogadoresPorMutante;
        foreach (var sorteado in vivos.OrderBy(_ => Random.Shared.Next()).Take(quantos)) TransformarEmMutante(sorteado, null);
        foreach (var pessoa in Pessoas()) pessoa.PrintToChat(" [Magnatas] O mutante apareceu. Fujam!");
        SortearSuperArma();
    }

    /// <summary>Uma vez por rodada, entre os humanos que sobraram do sorteio dos mutantes.</summary>
    private void SortearSuperArma()
    {
        if (superArmaSorteada || !rodadaEmAndamento) return;
        var humanos = Utilities.GetPlayers().Where(jogador => jogador is { IsValid: true, PawnIsAlive: true, Team: CsTeam.CounterTerrorist }).ToList();
        if (humanos.Count == 0) return;
        superArmaSorteada = true;
        var sorteado = humanos[Random.Shared.Next(humanos.Count)];
        EntregarSuperArma(sorteado);
        var nome = System.Net.WebUtility.HtmlEncode(sorteado.PlayerName);
        foreach (var pessoa in Pessoas())
        {
            pessoa.PrintToCenterHtml($"<font color='#ffc828' class='fontSize-l'>{nome} pegou a super Negev!</font>", SegundosDoAvisoDeMutante);
        }
    }

    private void EntregarSuperArma(CCSPlayerController jogador)
    {
        var corpo = jogador.PlayerPawn.Value;
        if (corpo?.WeaponServices?.MyWeapons == null) return;
        foreach (var item in corpo.WeaponServices.MyWeapons.ToList())
        {
            var arma = item.Value;
            if (arma != null && ArmasDoHumano.Contains(arma.DesignerName)) arma.Remove();
        }
        portadorDaSuperArma = jogador.Slot;
        // O fuzil só sai de verdade no fim do quadro: com a vaga ainda ocupada, a Negev não entrava e o portador
        // ficava sem arma. Ela vem no quadro seguinte, se ele ainda for o portador e estiver vivo como humano.
        Server.NextFrame(() =>
        {
            if (jogador is not { IsValid: true, PawnIsAlive: true, Team: CsTeam.CounterTerrorist } || jogador.Slot != portadorDaSuperArma) return;
            jogador.GiveNamedItem(ArmaEspecial);
            jogador.ExecuteClientCommand("slot1");
        });
        corpo.Render = CorDoPortador;
        Utilities.SetStateChanged(corpo, "CBaseModelEntity", "m_clrRender");
    }

    /// <summary>A cada tiro do portador o pente volta a ficar cheio: a super Negev nunca recarrega.</summary>
    [GameEventHandler]
    public HookResult AoAtirarNaMutacao(EventWeaponFire evento, GameEventInfo informacao)
    {
        if (Config.Regra != "mutacao") return HookResult.Continue;
        var jogador = evento.Userid;
        if (jogador is not { IsValid: true } || jogador.Slot != portadorDaSuperArma || !evento.Weapon.Contains("negev")) return HookResult.Continue;
        Server.NextFrame(() =>
        {
            var arma = jogador.IsValid ? jogador.PlayerPawn.Value?.WeaponServices?.ActiveWeapon.Value : null;
            if (arma is not { IsValid: true } || arma.DesignerName != ArmaEspecial) return;
            arma.Clip1 = PenteDaSuperArma;
            Utilities.SetStateChanged(arma, "CBasePlayerWeapon", "m_iClip1");
        });
        return HookResult.Continue;
    }

    /// <summary>O encerrar da rodada pelo plugin não soma ponto para o time: o placar de cima mostra as rodadas de cada lado.</summary>
    private void MostrarPlacarDaMutacao()
    {
        foreach (var time in Utilities.FindAllEntitiesByDesignerName<CCSTeam>("cs_team_manager"))
        {
            if (time.TeamNum == (byte)CsTeam.CounterTerrorist) time.Score = vitoriasDosHumanos;
            else if (time.TeamNum == (byte)CsTeam.Terrorist) time.Score = vitoriasDosMutantes;
            else continue;
            Utilities.SetStateChanged(time, "CTeam", "m_iScore");
        }
    }

    private void EncerrarRodadaDaMutacao(RoundEndReason motivo)
    {
        if (!rodadaEmAndamento) return;
        rodadaEmAndamento = false;
        Parar(ref relogioDoSorteio);
        Parar(ref fimDaRodada);
        Parar(ref relogioDaContagem);
        Parar(ref somDaContagem);

        var humanosVenceram = motivo == RoundEndReason.CTsWin;
        if (humanosVenceram) vitoriasDosHumanos++;
        else vitoriasDosMutantes++;
        MostrarPlacarDaMutacao();
        TocarParaTodos(humanosVenceram ? SomDaVitoriaDosMagnatas : SomDaVitoriaDosMutantes);
        rodadasDaPartida++;

        if (rodadasDaPartida < RodadasPorPartida)
        {
            var aviso = humanosVenceram ? "Humanos venceram" : "Mutantes venceram";
            foreach (var pessoa in Pessoas()) pessoa.PrintToCenterHtml($"<font color='#f5b301' class='fontSize-l'>{aviso}</font>", SegundosEntreRodadas);
            RegrasDoJogo()?.TerminateRound(SegundosEntreRodadas, motivo);
            return;
        }

        AvisarFimDaPartida($"Humanos {vitoriasDosHumanos} x {vitoriasDosMutantes} Mutantes");
        FecharPartida(null, (float)Math.Max(0.01, (DateTime.UtcNow - inicioDaPartida).TotalMinutes));
        rodadasDaPartida = 0;
        RegrasDoJogo()?.TerminateRound(SegundosMostrandoOVencedor, motivo);
        // Sorteia o próximo mapa da rotação, como nos outros modos. O teste com bots fica na Dust 2.
        if (!testeComBots) AddTimer(SegundosMostrandoOVencedor - 1, TrocarDeMapa);
    }

    /// <summary>Para quem entrou no meio ou morreu antes do sorteio: ninguém fica esperando morto até a próxima rodada.</summary>
    private void ColocarNaRodada(CCSPlayerController? jogador)
    {
        if (esperandoJogadores)
        {
            if (JogadoresNaRodada() >= MinimoDeJogadores)
            {
                esperandoJogadores = false;
                foreach (var pessoa in Pessoas()) pessoa.PrintToChat(" [Magnatas] Chegou mais um jogador. A partida vai começar!");
                RegrasDoJogo()?.TerminateRound(SegundosParaComecar, RoundEndReason.RoundDraw);
                return;
            }
            // Sozinho, a pessoa anda pelo mapa como humano até alguém chegar.
            if (jogador is { IsValid: true, PawnIsAlive: false, Team: CsTeam.Terrorist or CsTeam.CounterTerrorist })
            {
                if (jogador.Team == CsTeam.Terrorist) jogador.SwitchTeam(CsTeam.CounterTerrorist);
                jogador.Respawn();
            }
            return;
        }
        if (!rodadaEmAndamento || jogador is not { IsValid: true, PawnIsAlive: false } || jogador.Team is not (CsTeam.Terrorist or CsTeam.CounterTerrorist)) return;
        if (sorteioFeito)
        {
            if (jogador.Team == CsTeam.CounterTerrorist) jogador.SwitchTeam(CsTeam.Terrorist);
            AddTimer(mutanteDaRodada.SegundosParaRenascer, () => RenascerComoMutante(jogador));
            return;
        }
        // Antes do sorteio todo mundo é humano, mesmo quem o jogo colocou do outro lado.
        if (jogador.Team == CsTeam.Terrorist) jogador.SwitchTeam(CsTeam.CounterTerrorist);
        jogador.Respawn();
        if (tempoDeEspalharAcabou) SortearMutantes();
    }

    [GameEventHandler]
    public HookResult AoEscolherTime(EventPlayerTeam evento, GameEventInfo informacao)
    {
        if (Config.Regra != "mutacao" || evento.Disconnect) return HookResult.Continue;
        var jogador = evento.Userid;
        AddTimer(EsperaAposNascer, () => ColocarNaRodada(jogador));
        return HookResult.Continue;
    }

    [GameEventHandler]
    public HookResult AoSairDaMutacao(EventPlayerDisconnect evento, GameEventInfo informacao)
    {
        if (Config.Regra != "mutacao") return HookResult.Continue;
        var quem = evento.Userid;
        if (quem != null)
        {
            infeccoes.Remove(quem.Slot);
            corridas.Remove(quem.Slot);
        }
        // Quem chegar depois não pode herdar uma partida que ninguém mais está jogando.
        if (!Pessoas().Any(pessoa => pessoa.Slot != quem?.Slot))
        {
            rodadasDaPartida = 0;
            Server.ExecuteCommand("mp_restartgame 1");
            return HookResult.Continue;
        }
        AddTimer(EsperaAposNascer, ConferirFimDaRodada);
        return HookResult.Continue;
    }

    private void LigarMutacao(bool hotReload)
    {
        AddTimer(IntervaloDaVelocidade, ManterVelocidadeDosMutantes, TimerFlags.REPEAT);
        AddTimer(IntervaloDoAvisoDeEspera, AvisarQueFaltaJogador, TimerFlags.REPEAT);
        RegisterListener<Listeners.OnEntityTakeDamagePre>(AoReceberDano);
        AddCommandListener("drop", AoApertarG, HookMode.Pre);
        RegisterListener<Listeners.OnServerPrecacheResources>(manifesto =>
        {
            if (!UsarBonecosDoPacote) return;
            manifesto.AddResource(ModeloDoMutante);
            manifesto.AddResource(ModeloDaMorte);
        });
        RegisterListener<Listeners.OnMapStart>(mapa =>
        {
            // O pacote novo chega numa troca de mapa, então a conferência se refaz a cada mapa.
            zumbiNoServidor = null;
            morteNoServidor = null;
            // Ao ligar, o servidor abre o mapa da Oficina por último: se o teste já tinha pedido a Dust 2, ela era trocada.
            if (testeComBots && mapa != MapaDoTeste) AddTimer(1f, () => Server.ExecuteCommand($"changelevel {MapaDoTeste}"));
        });
        // Recarregado no meio da rodada, o plugin não teria a rodada em andamento nem o relógio, e o servidor travaria.
        if (hotReload)
        {
            rodadasDaPartida = 0;
            Server.ExecuteCommand("mp_restartgame 1");
        }
    }

    /// <summary>
    /// O golpe do mutante não causa dano: transforma. Sem isso, uma facada pelas costas mataria antes.
    /// Se isto parar de funcionar numa atualização do jogo, o golpe volta a matar, e quem morre vira mutante do mesmo jeito.
    /// </summary>
    private HookResult AoReceberDano(CBaseEntity alvo, CTakeDamageInfo dano)
    {
        try
        {
            if (alvo.DesignerName != "player") return HookResult.Continue;
            var autor = dano.Attacker.Value;
            if (autor == null || autor.DesignerName != "player") return HookResult.Continue;

            var corpo = new CCSPlayerPawn(alvo.Handle);
            if (corpo.TeamNum != (byte)CsTeam.CounterTerrorist || autor.TeamNum != (byte)CsTeam.Terrorist) return HookResult.Continue;

            var controleDoAlvo = corpo.Controller.Value;
            var controleDoAutor = new CCSPlayerPawn(autor.Handle).Controller.Value;
            if (rodadaEmAndamento && controleDoAlvo != null)
            {
                var jogador = new CCSPlayerController(controleDoAlvo.Handle);
                var quem = controleDoAutor == null ? null : new CCSPlayerController(controleDoAutor.Handle);
                Server.NextFrame(() => TransformarEmMutante(jogador, quem));
            }
            return HookResult.Handled;
        }
        catch (Exception erro)
        {
            Console.WriteLine($"[Magnatas] Falha no gancho de dano: {erro.GetType().Name}.");
            return HookResult.Continue;
        }
    }

    private void TransformarEmMutante(CCSPlayerController? jogador, CCSPlayerController? autor)
    {
        // A conferência vale também para dois golpes no mesmo instante: só o primeiro transforma e conta abate.
        if (jogador is not { IsValid: true, PawnIsAlive: true, Team: CsTeam.CounterTerrorist }) return;
        // A super Negev se perde com quem vira mutante, e ninguém mais ganha nesta rodada.
        if (jogador.Slot == portadorDaSuperArma)
        {
            portadorDaSuperArma = null;
            foreach (var pessoa in Pessoas()) pessoa.PrintToChat(" [Magnatas] A super Negev caiu!");
        }
        jogador.SwitchTeam(CsTeam.Terrorist);
        transformacoes++;
        infeccoes.Remove(jogador.Slot);
        corridas.Remove(jogador.Slot);
        AplicarAtributosDoMutante(jogador);
        jogador.PrintToCenterHtml("<font color='#6eff6e' class='fontSize-l'>Você virou mutante!</font>", SegundosDoAvisoDeMutante);
        if (autor is { IsValid: true }) ContarTransformacao(autor);
        // Encerrar a rodada no mesmo instante em que as armas do infectado saem, ainda dentro do golpe, derrubava o jogo
        // de quem estava no servidor ("OnPreserveEntity") na infecção do último humano. O fim vem logo depois.
        AddTimer(EsperaParaConferirOFim, ConferirFimDaRodada);
    }

    private void ContarTransformacao(CCSPlayerController autor)
    {
        Registrar(autor);
        if (!partidaEncerrada && naPartida.TryGetValue(autor.SteamID, out var dados)) dados.Abates++;
        var antes = NivelDe(autor);
        infeccoes[autor.Slot] = infeccoes.GetValueOrDefault(autor.Slot) + 1;
        var depois = NivelDe(autor);
        if (depois.Nivel > antes.Nivel) SubirDeNivel(autor, antes, depois);
        var estatisticas = autor.ActionTrackingServices?.MatchStats;
        if (estatisticas == null) return;
        estatisticas.Kills++;
        Utilities.SetStateChanged(autor, "CCSPlayerController", "m_pActionTrackingServices");
    }

    private void AplicarAtributosDoMutante(CCSPlayerController jogador)
    {
        var corpo = jogador.PlayerPawn.Value;
        if (corpo == null) return;
        DeixarSoAFaca(jogador);
        var nivel = NivelDe(jogador);
        corpo.MaxHealth = nivel.Vida;
        corpo.Health = nivel.Vida;
        Utilities.SetStateChanged(corpo, "CBaseEntity", "m_iMaxHealth");
        Utilities.SetStateChanged(corpo, "CBaseEntity", "m_iHealth");
        var zumbi = ZumbiNoServidor();
        if (zumbi) corpo.SetModel(ModeloDoMutante);
        MudarTamanho(corpo, nivel.Tamanho);
        corpo.Render = zumbi ? mutanteDaRodada.Cor : CorDaReserva;
        Utilities.SetStateChanged(corpo, "CBaseModelEntity", "m_clrRender");
        corpo.VelocityModifier = VelocidadeDe(jogador);
    }

    /// <summary>O zumbi vem no pacote da Oficina, que o servidor baixa ao ligar. A lista de arquivos do pacote diz se ele já chegou.</summary>
    private bool ZumbiNoServidor()
    {
        if (!UsarBonecosDoPacote) return false;
        if (zumbiNoServidor is bool sabido) return sabido;
        zumbiNoServidor = NoPacote(PacoteDoMutante, "models/magnatas/mutante_v1");
        Console.WriteLine($"[Magnatas] Zumbi do pacote no servidor: {(zumbiNoServidor.Value ? "sim" : "não, o mutante fica com o próprio boneco")}.");
        return zumbiNoServidor.Value;
    }

    /// <summary>A queda do guerreiro veio depois do zumbi: com o pacote antigo no servidor, o corpo cai do jeito normal.</summary>
    private bool MorteNoServidor()
    {
        if (!UsarBonecosDoPacote) return false;
        if (morteNoServidor is bool sabido) return sabido;
        morteNoServidor = NoPacote(PacoteDoMutante, "models/magnatas/mutante_v1/morte");
        Console.WriteLine($"[Magnatas] Queda do guerreiro no servidor: {(morteNoServidor.Value ? "sim" : "não")}.");
        return morteNoServidor.Value;
    }

    private static bool NoPacote(string pacote, string caminho)
    {
        foreach (var raiz in new[] { Server.GameDirectory, Path.GetDirectoryName(Server.GameDirectory) ?? "" })
        {
            var lista = Path.Combine(raiz, "bin", "linuxsteamrt64", "steamapps", "workshop", "content", "730", pacote, $"{pacote}_dir.vpk");
            try
            {
                if (File.Exists(lista) && System.Text.Encoding.ASCII.GetString(File.ReadAllBytes(lista)).Contains(caminho)) return true;
            }
            catch (Exception erro) when (erro is IOException or UnauthorizedAccessException)
            {
            }
        }
        return false;
    }

    private static NivelDoMutante NivelPelasInfeccoes(NivelDoMutante[] niveis, int infeccoes) =>
        niveis.LastOrDefault(nivel => infeccoes >= nivel.InfeccoesParaChegar) ?? niveis[0];

    private NivelDoMutante NivelDe(CCSPlayerController jogador) =>
        NivelPelasInfeccoes(mutanteDaRodada.Niveis, infeccoes.GetValueOrDefault(jogador.Slot));

    /// <summary>Ganha só a diferença de vida: quem estava ferido continua ferido. Morto, o nível vale quando renascer.</summary>
    private void SubirDeNivel(CCSPlayerController mutante, NivelDoMutante antigo, NivelDoMutante novo)
    {
        var corpo = mutante.PlayerPawn.Value;
        if (corpo != null && mutante.PawnIsAlive)
        {
            corpo.MaxHealth = novo.Vida;
            corpo.Health = corpo.Health + novo.Vida - antigo.Vida;
            Utilities.SetStateChanged(corpo, "CBaseEntity", "m_iMaxHealth");
            Utilities.SetStateChanged(corpo, "CBaseEntity", "m_iHealth");
            corpo.VelocityModifier = VelocidadeDe(mutante);
            MudarTamanho(corpo, novo.Tamanho);
        }
        var nome = System.Net.WebUtility.HtmlEncode(mutante.PlayerName);
        foreach (var pessoa in Pessoas())
        {
            pessoa.PrintToCenterHtml($"<font color='#6eff6e' class='fontSize-l'>{nome} chegou ao nível {novo.Nivel}!</font>", SegundosDoAvisoDeMutante);
            pessoa.PrintToChat($" [Magnatas] {mutante.PlayerName} chegou ao nível {novo.Nivel} de mutação.");
        }
        if (novo.Nivel == NivelDaCorrida) mutante.PrintToChat(" [Magnatas] Aperte G para correr mais rápido por alguns segundos.");
    }

    /// <summary>A velocidade do nível, mais o bônus enquanto a corrida do G vale.</summary>
    private float VelocidadeDe(CCSPlayerController jogador)
    {
        var correndo = corridas.TryGetValue(jogador.Slot, out var corrida) && Server.CurrentTime < corrida.Fim;
        return NivelDe(jogador).Velocidade + (correndo ? BonusDaCorrida : 0f);
    }

    /// <summary>
    /// O G do mutante a partir do nível 2 é a corrida, e não larga a faca. Para os humanos, o G continua largando a arma.
    /// O fim da corrida vem pelo ManterVelocidadeDosMutantes, que reaplica a velocidade a cada meio segundo.
    /// </summary>
    private HookResult AoApertarG(CCSPlayerController? jogador, CommandInfo comando)
    {
        if (jogador == null || !EhMutanteDeVerdade(jogador)) return HookResult.Continue;
        if (NivelDe(jogador).Nivel < NivelDaCorrida) return HookResult.Handled;
        var agora = Server.CurrentTime;
        if (corridas.TryGetValue(jogador.Slot, out var corrida) && agora < corrida.Recarga)
        {
            jogador.PrintToCenterHtml($"<font color='#f5b301'>Corrida em {Math.Ceiling(corrida.Recarga - agora)} s</font>", 1);
            return HookResult.Handled;
        }
        corridas[jogador.Slot] = (agora + SegundosDaCorrida, agora + SegundosDeRecargaDaCorrida);
        var corpo = jogador.PlayerPawn.Value;
        if (corpo != null) corpo.VelocityModifier = VelocidadeDe(jogador);
        jogador.PrintToCenterHtml("<font color='#6eff6e' class='fontSize-l'>Correndo!</font>", (int)SegundosDaCorrida);
        return HookResult.Handled;
    }

    private static void MudarTamanho(CBaseEntity corpo, float tamanho)
    {
        var esqueleto = corpo.CBodyComponent?.SceneNode?.GetSkeletonInstance();
        if (esqueleto == null) return;
        esqueleto.Scale = tamanho;
        Utilities.SetStateChanged(corpo, "CBaseEntity", "m_CBodyComponent");
    }

    /// <summary>O dano pode zerar o modificador de velocidade, por isso ele é reaplicado de tempos em tempos.</summary>
    private void ManterVelocidadeDosMutantes()
    {
        foreach (var mutante in Utilities.GetPlayers().Where(jogador => jogador is { IsValid: true, PawnIsAlive: true, Team: CsTeam.Terrorist }))
        {
            var corpo = mutante.PlayerPawn.Value;
            if (corpo != null) corpo.VelocityModifier = VelocidadeDe(mutante);
        }
    }

    /// <summary>
    /// Quem já tem AK ou M4 fica com ela: tirar e dar de novo a arma logo depois de a rodada reiniciar derruba o jogo de
    /// quem está no servidor ("missing client entity"). Só a super Negev sai, e só quem está sem nenhuma das duas ganha uma.
    /// </summary>
    private void EntregarArmaDoHumano(CCSPlayerController? jogador)
    {
        if (jogador is not { IsValid: true, PawnIsAlive: true, Team: CsTeam.CounterTerrorist }) return;
        var armas = jogador.PlayerPawn.Value?.WeaponServices?.MyWeapons;
        if (armas == null) return;
        var jaTem = false;
        foreach (var item in armas.ToList())
        {
            var arma = item.Value;
            if (arma == null) continue;
            if (arma.DesignerName == ArmaEspecial) arma.Remove();
            else if (ArmasDoHumano.Contains(arma.DesignerName)) jaTem = true;
        }
        if (jaTem) return;
        jogador.GiveNamedItem(ArmasDoHumano[Random.Shared.Next(ArmasDoHumano.Length)]);
        jogador.ExecuteClientCommand("slot1");
    }

    /// <summary>Bot que entra como TR antes do sorteio não é mutante, e não pode perder as armas junto do reinício da rodada.</summary>
    private bool EhMutanteDeVerdade(CCSPlayerController jogador) =>
        rodadaEmAndamento && sorteioFeito && jogador is { IsValid: true, PawnIsAlive: true, Team: CsTeam.Terrorist };

    [GameEventHandler]
    public HookResult AoAtingirMutante(EventPlayerHurt evento, GameEventInfo informacao)
    {
        if (Config.Regra != "mutacao") return HookResult.Continue;
        var alvo = evento.Userid;
        var quem = evento.Attacker;
        if (alvo is not { IsValid: true, Team: CsTeam.Terrorist } || quem is not { IsValid: true, Team: CsTeam.CounterTerrorist }) return HookResult.Continue;
        var corpo = alvo.PlayerPawn.Value;
        var corpoDeQuem = quem.PlayerPawn.Value;
        if (corpo?.AbsOrigin == null || corpoDeQuem?.AbsOrigin == null) return HookResult.Continue;

        var x = corpo.AbsOrigin.X - corpoDeQuem.AbsOrigin.X;
        var y = corpo.AbsOrigin.Y - corpoDeQuem.AbsOrigin.Y;
        var distancia = MathF.Sqrt(x * x + y * y);
        if (distancia < 1f) return HookResult.Continue;

        var daSuperArma = quem.Slot == portadorDaSuperArma && evento.Weapon.Contains("negev");
        var forca = daSuperArma
            ? Math.Min(evento.DmgHealth * ForcaDoEmpurrao * EmpurraoDaSuperArma, EmpurraoMaximoDaSuperArma)
            : Math.Min(evento.DmgHealth * ForcaDoEmpurrao, EmpurraoMaximo);
        var velocidade = corpo.AbsVelocity;
        corpo.Teleport(null, null, new Vector(velocidade.X + x / distancia * forca, velocidade.Y + y / distancia * forca, velocidade.Z));
        return HookResult.Continue;
    }

    private void ConferirFimDaRodada()
    {
        if (!rodadaEmAndamento || !sorteioFeito) return;
        var jogadores = Utilities.GetPlayers().Where(jogador => jogador is { IsValid: true }).ToList();
        if (!jogadores.Any(jogador => jogador is { PawnIsAlive: true, Team: CsTeam.CounterTerrorist }))
        {
            EncerrarRodadaDaMutacao(RoundEndReason.TerroristsWin);
        }
        else if (!jogadores.Any(jogador => jogador.Team == CsTeam.Terrorist))
        {
            // O último mutante saiu do servidor, e a rodada não pode seguir sem nenhum.
            SortearMutantes();
        }
    }

    [GameEventHandler]
    public HookResult AoMorrerNaMutacao(EventPlayerDeath evento, GameEventInfo informacao)
    {
        if (Config.Regra != "mutacao") return HookResult.Continue;
        var jogador = evento.Userid;
        if (jogador is not { IsValid: true }) return HookResult.Continue;
        var eraMutante = jogador.Team == CsTeam.Terrorist;
        if (eraMutante) MostrarQuedaDoMutante(jogador);
        if (esperandoJogadores)
        {
            AddTimer(mutanteDaRodada.SegundosParaRenascer, () => ColocarNaRodada(jogador));
            return HookResult.Continue;
        }

        // Queda, ou o golpe se o gancho quebrar numa atualização do jogo: humano morto também vira mutante.
        // Antes do sorteio ainda não há mutante, então ele só volta humano.
        if (jogador.Team == CsTeam.CounterTerrorist && rodadaEmAndamento)
        {
            if (!sorteioFeito)
            {
                AddTimer(mutanteDaRodada.SegundosParaRenascer, () => ColocarNaRodada(jogador));
                return HookResult.Continue;
            }
            jogador.SwitchTeam(CsTeam.Terrorist);
            ConferirFimDaRodada();
        }
        if (jogador.Team == CsTeam.Terrorist) AddTimer(mutanteDaRodada.SegundosParaRenascer, () => RenascerComoMutante(jogador));
        return HookResult.Continue;
    }

    /// <summary>
    /// O corpo do mutante fica invisível e, no mesmo lugar e do mesmo tamanho, o guerreiro de cena toca a queda.
    /// Quando o mutante renasce, a cor volta pelo AplicarAtributosDoMutante.
    /// </summary>
    private void MostrarQuedaDoMutante(CCSPlayerController jogador)
    {
        if (!MorteNoServidor()) return;
        var corpo = jogador.PlayerPawn.Value;
        if (corpo is not { IsValid: true } || corpo.AbsOrigin == null || corpo.AbsRotation == null) return;
        var lugar = new Vector(corpo.AbsOrigin.X, corpo.AbsOrigin.Y, corpo.AbsOrigin.Z);
        var giro = new QAngle(0, corpo.AbsRotation.Y, 0);

        corpo.RenderMode = RenderMode_t.kRenderTransAlpha;
        corpo.Render = Color.FromArgb(0, 255, 255, 255);
        Utilities.SetStateChanged(corpo, "CBaseModelEntity", "m_nRenderMode");
        Utilities.SetStateChanged(corpo, "CBaseModelEntity", "m_clrRender");

        var queda = Utilities.CreateEntityByName<CDynamicProp>("prop_dynamic");
        if (queda == null) return;
        queda.SetModel(ModeloDaMorte);
        queda.DispatchSpawn();
        queda.Teleport(lugar, giro, new Vector(0, 0, 0));
        MudarTamanho(queda, NivelDe(jogador).Tamanho);
        queda.AcceptInput("SetAnimation", value: "morte");
        AddTimer(SegundosDaCenaDaMorte, () =>
        {
            if (queda.IsValid) queda.Remove();
        });
    }

    private void RenascerComoMutante(CCSPlayerController jogador)
    {
        if (!rodadaEmAndamento || jogador is not { IsValid: true, Team: CsTeam.Terrorist } || jogador.PawnIsAlive) return;
        jogador.Respawn();
    }

    [GameEventHandler]
    public HookResult AoPrepararRodadaDaMutacao(EventRoundPrestart evento, GameEventInfo informacao)
    {
        if (Config.Regra != "mutacao") return HookResult.Continue;
        rodadaEmAndamento = false;
        var portadorAnterior = portadorDaSuperArma;
        portadorDaSuperArma = null;
        Parar(ref relogioDaContagem);
        Parar(ref somDaContagem);
        infeccoes.Clear();
        corridas.Clear();
        // Os mutantes e o portador dourado voltam à cor e ao tamanho normais. Os outros ficam como estão: mexer em todo
        // mundo junto do reinício da rodada só aumenta a chance de derrubar o jogo de quem está no servidor.
        foreach (var jogador in Utilities.GetPlayers().Where(jogador => jogador is { IsValid: true, Team: CsTeam.Terrorist or CsTeam.CounterTerrorist }))
        {
            var eraMutante = jogador.Team == CsTeam.Terrorist;
            if (eraMutante) jogador.SwitchTeam(CsTeam.CounterTerrorist);
            if (!eraMutante && jogador.Slot != portadorAnterior) continue;
            var corpo = jogador.PlayerPawn.Value;
            if (corpo == null) continue;
            corpo.MaxHealth = VidaDoHumano;
            corpo.Render = CorDoHumano;
            Utilities.SetStateChanged(corpo, "CBaseModelEntity", "m_clrRender");
            MudarTamanho(corpo, TamanhoDoHumano);
        }
        return HookResult.Continue;
    }

    /// <summary>
    /// O teste do Adm com bots. Os mapas da Mutação não têm o caminho que os bots seguem, e a Dust 2 tem.
    /// A configuração do modo zera os bots a cada mapa, então eles são chamados de novo a cada rodada.
    /// </summary>
    [ConsoleCommand("magnatas_teste_bots", "Liga o teste com bots do Adm, na Dust 2 e sem XP")]
    [CommandHelper(whoCanExecute: CommandUsage.SERVER_ONLY)]
    public void LigarTesteComBots(CCSPlayerController? chamador, CommandInfo comando)
    {
        if (Config.Regra != "mutacao")
        {
            comando.ReplyToCommand("teste_bots=0");
            return;
        }
        var jaEstava = testeComBots;
        testeComBots = true;
        comando.ReplyToCommand("teste_bots=1");
        if (!jaEstava || Server.MapName != MapaDoTeste) Server.ExecuteCommand($"changelevel {MapaDoTeste}");
    }

    private static void ChamarBotsDoTeste()
    {
        // Com "fill", a cota conta as pessoas: 1 pessoa e 9 bots.
        // Os bots entram sem esperar a pessoa escolher o time. Forçar um bot enquanto ela carregava fez o jogo tirar e
        // recriar bots sem parar, e o servidor caiu.
        foreach (var comando in new[] { "bot_difficulty 1", "bot_join_team any", "bot_join_after_player 0", "bot_quota_mode fill", "bot_quota 10" }) Server.ExecuteCommand(comando);
    }

    /// <summary>Só para teste: o mutante fica com o próprio boneco até o próximo mapa, para ver se a queda vem do zumbi.</summary>
    [ConsoleCommand("magnatas_mutacao_sem_zumbi", "Teste: mutante sem o boneco do zumbi até trocar de mapa")]
    [CommandHelper(whoCanExecute: CommandUsage.SERVER_ONLY)]
    public void DesligarZumbiParaTeste(CCSPlayerController? chamador, CommandInfo comando)
    {
        zumbiNoServidor = false;
        comando.ReplyToCommand("zumbi=False");
    }

    [ConsoleCommand("magnatas_mutacao_ver", "Mostra humanos, mutantes e a rodada, para conferir o modo")]
    [CommandHelper(whoCanExecute: CommandUsage.SERVER_ONLY)]
    public void VerMutacao(CCSPlayerController? chamador, CommandInfo comando)
    {
        if (Config.Regra != "mutacao") return;
        foreach (var jogador in Utilities.GetPlayers().Where(jogador => jogador is { IsValid: true }))
        {
            var corpo = jogador.PlayerPawn.Value;
            var armas = corpo?.WeaponServices?.MyWeapons.Select(item => item.Value?.DesignerName ?? "?") ?? Enumerable.Empty<string>();
            comando.ReplyToCommand($"vaga={jogador.Slot} time={jogador.Team} vivo={jogador.PawnIsAlive} vida={corpo?.Health}/{corpo?.MaxHealth} velocidade={corpo?.AbsVelocity.Length():0} modificador={corpo?.VelocityModifier:0.00} nivel={(jogador.Team == CsTeam.Terrorist ? NivelDe(jogador).Nivel : 0)} armas={string.Join(",", armas)}");
        }
        comando.ReplyToCommand($"em_andamento={rodadaEmAndamento} esperando={esperandoJogadores} teste_bots={testeComBots} zumbi={ZumbiNoServidor()} sorteio={sorteioFeito} rodadas={rodadasDaPartida} humanos={vitoriasDosHumanos} mutantes={vitoriasDosMutantes} transformacoes={transformacoes} municao={ConVar<int>.Find("sv_infinite_ammo")?.Value}");
    }
}
