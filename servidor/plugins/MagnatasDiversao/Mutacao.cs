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
    private const int SegundosDoAvisoDeMutante = 3;
    private const float SegundosParaEspalhar = 15f;
    // O som da contagem começa antes e termina junto com o sorteio. Na tela, só os últimos 10 segundos.
    private const string SomDaContagem = "magnatas.contagem_mutacao";
    private const float SegundosDoSomDaContagem = 11.5f;
    private const int SegundosDaContagemNaTela = 10;
    // Sozinho não há o que jogar: a rodada fica parada, sem contar, até chegar mais alguém.
    private const int MinimoDeJogadores = 2;
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

    // O zumbi vem no pacote da Oficina que todo jogador baixa ao entrar, junto com os sons.
    private const string ModeloDoMutante = "models/magnatas/mutante/mutante.vmdl";
    // Sem o zumbi no servidor (o pacote novo ainda não chegou), o mutante ficaria sem áreas de acerto e sem animação:
    // ninguém dava dano nele. Até o pacote chegar, vai um boneco do próprio jogo, verde para não confundir.
    private const string ModeloDeReserva = "agents/models/tm_phoenix/tm_phoenix.vmdl";
    private static readonly Color CorDaReserva = Color.FromArgb(255, 110, 255, 110);
    private const string PacoteDoServidor = "3835000213";
    private bool? zumbiNoServidor;
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
        relogioDoSorteio?.Kill();
        fimDaRodada?.Kill();
        relogioDaContagem?.Kill();
        somDaContagem?.Kill();
        infeccoes.Clear();
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
            MostrarNoPlacar();
        }
        rodadaEmAndamento = true;
        sorteioFeito = false;
        tempoDeEspalharAcabou = false;
        superArmaSorteada = false;
        portadorDaSuperArma = null;

        relogioDoSorteio = AddTimer(SegundosParaEspalhar, () =>
        {
            tempoDeEspalharAcabou = true;
            SortearMutantes();
        });
        // O mesmo valor do relógio da tela, para os dois chegarem juntos ao fim.
        var minutos = ConVar<float>.Find("mp_roundtime")?.Value ?? MinutosDaRodadaSeFaltarORelogio;
        fimDaRodada = AddTimer(minutos * 60f, () => EncerrarRodadaDaMutacao(RoundEndReason.CTsWin));

        segundosAteOMutante = (int)SegundosParaEspalhar;
        relogioDaContagem = AddTimer(1f, MostrarContagem, TimerFlags.REPEAT);
        somDaContagem = AddTimer(SegundosParaEspalhar - SegundosDoSomDaContagem, TocarContagem);
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
        jogador.GiveNamedItem(ArmaEspecial);
        jogador.ExecuteClientCommand("slot1");
        portadorDaSuperArma = jogador.Slot;
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

    private void EncerrarRodadaDaMutacao(RoundEndReason motivo)
    {
        if (!rodadaEmAndamento) return;
        rodadaEmAndamento = false;
        relogioDoSorteio?.Kill();
        fimDaRodada?.Kill();
        relogioDaContagem?.Kill();
        somDaContagem?.Kill();

        var humanosVenceram = motivo == RoundEndReason.CTsWin;
        if (humanosVenceram) vitoriasDosHumanos++;
        else vitoriasDosMutantes++;
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
        if (quem != null) infeccoes.Remove(quem.Slot);
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
        RegisterListener<Listeners.OnServerPrecacheResources>(manifesto =>
        {
            manifesto.AddResource(ModeloDoMutante);
            manifesto.AddResource(ModeloDeReserva);
        });
        // O pacote novo chega numa troca de mapa, então a conferência se refaz a cada mapa.
        RegisterListener<Listeners.OnMapStart>(_ => zumbiNoServidor = null);
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
        AplicarAtributosDoMutante(jogador);
        jogador.PrintToCenterHtml("<font color='#6eff6e' class='fontSize-l'>Você virou mutante!</font>", SegundosDoAvisoDeMutante);
        if (autor is { IsValid: true }) ContarTransformacao(autor);
        ConferirFimDaRodada();
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
        corpo.SetModel(zumbi ? ModeloDoMutante : ModeloDeReserva);
        MudarTamanho(corpo, nivel.Tamanho);
        corpo.Render = zumbi ? mutanteDaRodada.Cor : CorDaReserva;
        Utilities.SetStateChanged(corpo, "CBaseModelEntity", "m_clrRender");
        corpo.VelocityModifier = nivel.Velocidade;
    }

    /// <summary>
    /// O zumbi vem no pacote da Oficina, que o servidor baixa de novo só depois da aprovação da Steam.
    /// A lista de arquivos do pacote diz se ele já chegou.
    /// </summary>
    private bool ZumbiNoServidor()
    {
        if (zumbiNoServidor is bool sabido) return sabido;
        var achou = false;
        foreach (var raiz in new[] { Server.GameDirectory, Path.GetDirectoryName(Server.GameDirectory) ?? "" })
        {
            var lista = Path.Combine(raiz, "bin", "linuxsteamrt64", "steamapps", "workshop", "content", "730", PacoteDoServidor, $"{PacoteDoServidor}_dir.vpk");
            try
            {
                if (File.Exists(lista) && System.Text.Encoding.ASCII.GetString(File.ReadAllBytes(lista)).Contains("models/magnatas/mutante")) achou = true;
            }
            catch (Exception erro) when (erro is IOException or UnauthorizedAccessException)
            {
            }
        }
        zumbiNoServidor = achou;
        Console.WriteLine($"[Magnatas] Zumbi do pacote no servidor: {(achou ? "sim" : "não, vai o boneco do jogo")}.");
        return achou;
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
            corpo.VelocityModifier = novo.Velocidade;
            MudarTamanho(corpo, novo.Tamanho);
        }
        var nome = System.Net.WebUtility.HtmlEncode(mutante.PlayerName);
        foreach (var pessoa in Pessoas())
        {
            pessoa.PrintToCenterHtml($"<font color='#6eff6e' class='fontSize-l'>{nome} chegou ao nível {novo.Nivel}!</font>", SegundosDoAvisoDeMutante);
            pessoa.PrintToChat($" [Magnatas] {mutante.PlayerName} chegou ao nível {novo.Nivel} de mutação.");
        }
    }

    private static void MudarTamanho(CCSPlayerPawn corpo, float tamanho)
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
            if (corpo != null) corpo.VelocityModifier = NivelDe(mutante).Velocidade;
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
        relogioDaContagem?.Kill();
        somDaContagem?.Kill();
        infeccoes.Clear();
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
        if (!jaEstava || Server.MapName != "de_dust2") Server.ExecuteCommand("changelevel de_dust2");
    }

    private static void ChamarBotsDoTeste()
    {
        // Com "fill", a cota conta as pessoas: 1 pessoa e 9 bots.
        // Os bots entram sem esperar a pessoa escolher o time. Forçar um bot enquanto ela carregava fez o jogo tirar e
        // recriar bots sem parar, e o servidor caiu.
        foreach (var comando in new[] { "bot_difficulty 1", "bot_join_team any", "bot_join_after_player 0", "bot_quota_mode fill", "bot_quota 10" }) Server.ExecuteCommand(comando);
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
