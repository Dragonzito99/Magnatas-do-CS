using CounterStrikeSharp.API;
using CounterStrikeSharp.API.Core;
using CounterStrikeSharp.API.Core.Attributes.Registration;
using CounterStrikeSharp.API.Modules.Commands;
using CounterStrikeSharp.API.Modules.Timers;
using CounterStrikeSharp.API.Modules.Utils;

namespace MagnatasMataMata;

/// <summary>
/// O que o modo mata-mata do CS2 não faz sozinho no Cada um por si:
/// entregar a AK, zerar o placar sem parar o jogo e dizer ao site quem está conectado.
/// </summary>
public class ModoCadaUmPorSi : BasePlugin
{
    private const string Ak = "weapon_ak47";
    private const float EsperaAposNascer = 0.1f;
    private const float SegundosAteZerarOPlacar = 20 * 60;

    public override string ModuleName => "Magnatas: Cada um por si";
    public override string ModuleVersion => "1.0.0";

    public override void Load(bool hotReload)
    {
        // Se a partida acabar pelo tempo do jogo, este modo não recomeça e deixa todo mundo sem time.
        AddTimer(SegundosAteZerarOPlacar, () => Server.ExecuteCommand("mp_restartgame 5"), TimerFlags.REPEAT);
    }

    /// <summary>Este modo do jogo espalha quem renasce, mas ignora a arma principal padrão.</summary>
    [GameEventHandler]
    public HookResult AoNascer(EventPlayerSpawn evento, GameEventInfo informacao)
    {
        var jogador = evento.Userid;
        // No momento do evento, o jogo ainda está montando o jogador e as armas dele.
        AddTimer(EsperaAposNascer, () => EntregarAk(jogador));
        return HookResult.Continue;
    }

    private static void EntregarAk(CCSPlayerController? jogador)
    {
        if (jogador is not { IsValid: true, PawnIsAlive: true }) return;
        if (jogador.Team is not (CsTeam.Terrorist or CsTeam.CounterTerrorist)) return;

        var armas = jogador.PlayerPawn.Value?.WeaponServices?.MyWeapons;
        if (armas == null) return;
        if (armas.Any(arma => arma.Value?.DesignerName == Ak)) return;

        jogador.GiveNamedItem(Ak);
    }

    /// <summary>O status_json do CS2 só olha as primeiras vagas, e quem está em uma vaga alta ficaria de fora.</summary>
    [ConsoleCommand("magnatas_jogadores", "Lista as contas conectadas para o site")]
    [CommandHelper(whoCanExecute: CommandUsage.SERVER_ONLY)]
    public void ListarJogadores(CCSPlayerController? chamador, CommandInfo comando)
    {
        var contas = Utilities.GetPlayers()
            .Where(jogador => jogador is { IsValid: true, IsBot: false, IsHLTV: false, Connected: PlayerConnectedState.Connected })
            .Where(jogador => jogador.SteamID > 0)
            .Select(jogador => jogador.SteamID.ToString());
        comando.ReplyToCommand($"magnatas_jogadores=[{string.Join(",", contas)}]");
    }
}
