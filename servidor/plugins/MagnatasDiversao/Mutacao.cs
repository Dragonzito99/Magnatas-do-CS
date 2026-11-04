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
    private sealed record TipoDeMutante(string Nome, int Vida, float Velocidade, float SegundosParaRenascer, Color Cor);

    private static readonly TipoDeMutante MutanteComum = new("Mutante", 2000, 1.1f, 3f, Color.FromArgb(255, 110, 255, 110));
    private static readonly Color CorDoHumano = Color.FromArgb(255, 255, 255, 255);
    private const int VidaDoHumano = 100;
    private const float IntervaloDaVelocidade = 0.5f;
    private const int SegundosDoAvisoDeMutante = 3;
    private const float SegundosParaEspalhar = 20f;
    private const int JogadoresPorMutante = 8;
    private const int RodadasPorPartida = 10;
    private const int SegundosEntreRodadas = 5;
    private const float MinutosDaRodadaSeFaltarORelogio = 3;
    private const float ForcaDoEmpurrao = 5f;
    private const float EmpurraoMaximo = 300f;
    private const int MunicaoDeReservaInfinita = 2;
    private static readonly string[] ArmasDoHumano = { "weapon_ak47", "weapon_m4a1" };

    private readonly TipoDeMutante mutanteDaRodada = MutanteComum;
    private CounterStrikeSharp.API.Modules.Timers.Timer? relogioDoSorteio;
    private CounterStrikeSharp.API.Modules.Timers.Timer? fimDaRodada;
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
        if (rodadasDaPartida == 0)
        {
            ZerarContagem();
            inicioDaPartida = DateTime.UtcNow;
            vitoriasDosHumanos = 0;
            vitoriasDosMutantes = 0;
            MostrarNoPlacar();
        }
        rodadaEmAndamento = true;
        sorteioFeito = false;
        tempoDeEspalharAcabou = false;

        relogioDoSorteio?.Kill();
        relogioDoSorteio = AddTimer(SegundosParaEspalhar, () =>
        {
            tempoDeEspalharAcabou = true;
            SortearMutantes();
        });
        // O mesmo valor do relógio da tela, para os dois chegarem juntos ao fim.
        var minutos = ConVar<float>.Find("mp_roundtime")?.Value ?? MinutosDaRodadaSeFaltarORelogio;
        fimDaRodada?.Kill();
        fimDaRodada = AddTimer(minutos * 60f, () => EncerrarRodadaDaMutacao(RoundEndReason.CTsWin));

        foreach (var pessoa in Pessoas()) pessoa.PrintToChat(" [Magnatas] Espalhem-se: o mutante aparece em 20 segundos.");
    }

    private void SortearMutantes()
    {
        if (!rodadaEmAndamento) return;
        var vivos = Utilities.GetPlayers().Where(jogador => jogador is { IsValid: true, PawnIsAlive: true, Team: CsTeam.CounterTerrorist }).ToList();
        // Sozinho no servidor não há o que jogar: quem chegar depois dispara este sorteio.
        if (vivos.Count < 2) return;

        sorteioFeito = true;
        var quantos = Math.Max(1, vivos.Count / JogadoresPorMutante);
        foreach (var sorteado in vivos.OrderBy(_ => Random.Shared.Next()).Take(quantos)) TransformarEmMutante(sorteado, null);
        foreach (var pessoa in Pessoas()) pessoa.PrintToChat(" [Magnatas] O mutante apareceu. Fujam!");
    }

    private void EncerrarRodadaDaMutacao(RoundEndReason motivo)
    {
        if (!rodadaEmAndamento) return;
        rodadaEmAndamento = false;
        relogioDoSorteio?.Kill();
        fimDaRodada?.Kill();

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
        if (!rodadaEmAndamento || jogador is not { IsValid: true, PawnIsAlive: false } || jogador.Team is not (CsTeam.Terrorist or CsTeam.CounterTerrorist)) return;
        if (sorteioFeito)
        {
            if (jogador.Team == CsTeam.CounterTerrorist) jogador.SwitchTeam(CsTeam.Terrorist);
            AddTimer(mutanteDaRodada.SegundosParaRenascer, () => RenascerComoMutante(jogador));
            return;
        }
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

    private void LigarMutacao()
    {
        AddTimer(IntervaloDaVelocidade, ManterVelocidadeDosMutantes, TimerFlags.REPEAT);
        RegisterListener<Listeners.OnEntityTakeDamagePre>(AoReceberDano);
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
        jogador.SwitchTeam(CsTeam.Terrorist);
        transformacoes++;
        AplicarAtributosDoMutante(jogador);
        jogador.PrintToCenterHtml("<font color='#6eff6e' class='fontSize-l'>Você virou mutante!</font>", SegundosDoAvisoDeMutante);
        if (autor is { IsValid: true }) ContarTransformacao(autor);
        ConferirFimDaRodada();
    }

    private void ContarTransformacao(CCSPlayerController autor)
    {
        Registrar(autor);
        if (!partidaEncerrada && naPartida.TryGetValue(autor.SteamID, out var dados)) dados.Abates++;
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
        corpo.MaxHealth = mutanteDaRodada.Vida;
        corpo.Health = mutanteDaRodada.Vida;
        Utilities.SetStateChanged(corpo, "CBaseEntity", "m_iMaxHealth");
        Utilities.SetStateChanged(corpo, "CBaseEntity", "m_iHealth");
        corpo.Render = mutanteDaRodada.Cor;
        Utilities.SetStateChanged(corpo, "CBaseModelEntity", "m_clrRender");
        corpo.VelocityModifier = mutanteDaRodada.Velocidade;
    }

    /// <summary>O dano pode zerar o modificador de velocidade, por isso ele é reaplicado de tempos em tempos.</summary>
    private void ManterVelocidadeDosMutantes()
    {
        foreach (var mutante in Utilities.GetPlayers().Where(jogador => jogador is { IsValid: true, PawnIsAlive: true, Team: CsTeam.Terrorist }))
        {
            var corpo = mutante.PlayerPawn.Value;
            if (corpo != null) corpo.VelocityModifier = mutanteDaRodada.Velocidade;
        }
    }

    /// <summary>Quem sobreviveu ainda está com a arma da rodada anterior, e o sorteio vale para cada rodada.</summary>
    private void EntregarArmaDoHumano(CCSPlayerController? jogador)
    {
        if (jogador is not { IsValid: true, PawnIsAlive: true, Team: CsTeam.CounterTerrorist }) return;
        var armas = jogador.PlayerPawn.Value?.WeaponServices?.MyWeapons;
        if (armas == null) return;
        foreach (var item in armas.ToList())
        {
            var arma = item.Value;
            if (arma != null && ArmasDoHumano.Contains(arma.DesignerName)) arma.Remove();
        }
        jogador.GiveNamedItem(ArmasDoHumano[Random.Shared.Next(ArmasDoHumano.Length)]);
        jogador.ExecuteClientCommand("slot1");
    }

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

        var forca = Math.Min(evento.DmgHealth * ForcaDoEmpurrao, EmpurraoMaximo);
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
        foreach (var jogador in Utilities.GetPlayers().Where(jogador => jogador is { IsValid: true, Team: CsTeam.Terrorist }))
        {
            jogador.SwitchTeam(CsTeam.CounterTerrorist);
            var corpo = jogador.PlayerPawn.Value;
            if (corpo == null) continue;
            corpo.MaxHealth = VidaDoHumano;
            corpo.Render = CorDoHumano;
            Utilities.SetStateChanged(corpo, "CBaseModelEntity", "m_clrRender");
        }
        return HookResult.Continue;
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
            comando.ReplyToCommand($"vaga={jogador.Slot} time={jogador.Team} vivo={jogador.PawnIsAlive} vida={corpo?.Health}/{corpo?.MaxHealth} velocidade={corpo?.AbsVelocity.Length():0} modificador={corpo?.VelocityModifier:0.00} armas={string.Join(",", armas)}");
        }
        comando.ReplyToCommand($"em_andamento={rodadaEmAndamento} sorteio={sorteioFeito} rodadas={rodadasDaPartida} humanos={vitoriasDosHumanos} mutantes={vitoriasDosMutantes} transformacoes={transformacoes} municao={ConVar<int>.Find("sv_infinite_ammo")?.Value}");
    }
}
