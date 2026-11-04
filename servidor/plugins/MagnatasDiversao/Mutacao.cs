using System.Drawing;
using CounterStrikeSharp.API;
using CounterStrikeSharp.API.Core;
using CounterStrikeSharp.API.Core.Attributes.Registration;
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

    private readonly TipoDeMutante mutanteDaRodada = MutanteComum;
    private bool rodadaEmAndamento;

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

    private void ConferirFimDaRodada()
    {
    }

    [GameEventHandler]
    public HookResult AoMorrerNaMutacao(EventPlayerDeath evento, GameEventInfo informacao)
    {
        if (Config.Regra != "mutacao") return HookResult.Continue;
        var jogador = evento.Userid;
        if (jogador is not { IsValid: true }) return HookResult.Continue;

        // Queda, ou o golpe se o gancho quebrar numa atualização do jogo: humano morto também vira mutante.
        if (jogador.Team == CsTeam.CounterTerrorist && rodadaEmAndamento)
        {
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
}
