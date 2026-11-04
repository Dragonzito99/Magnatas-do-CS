using System.Text.Json.Serialization;
using CounterStrikeSharp.API;
using CounterStrikeSharp.API.Core;
using CounterStrikeSharp.API.Core.Attributes.Registration;
using CounterStrikeSharp.API.Modules.Commands;
using CounterStrikeSharp.API.Modules.Timers;
using CounterStrikeSharp.API.Modules.Utils;

namespace MagnatasDiversao;

/// <summary>Cada servidor tem o próprio arquivo, gravado pelo iniciar_diversao.sh.</summary>
public class ConfiguracaoDoModo : BasePluginConfig
{
    /// <summary>Vazio significa não entregar arma principal, como no servidor só de pistola.</summary>
    [JsonPropertyName("ArmaPrincipal")]
    public string ArmaPrincipal { get; set; } = "";
}

/// <summary>
/// O que o modo mata-mata do CS2 não faz sozinho nos servidores da aba Diversão:
/// entregar a arma principal, zerar o placar sem parar o jogo e dizer ao site quem está conectado.
/// </summary>
public class ModoDeDiversao : BasePlugin, IPluginConfig<ConfiguracaoDoModo>
{
    private const float EsperaAposNascer = 0.1f;
    private const float SegundosAteZerarOPlacar = 20 * 60;

    public override string ModuleName => "Magnatas: Diversão";
    public override string ModuleVersion => "1.0.0";

    public ConfiguracaoDoModo Config { get; set; } = new();

    public void OnConfigParsed(ConfiguracaoDoModo config)
    {
        Config = config;
    }

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
        AddTimer(EsperaAposNascer, () => EntregarArma(jogador));
        return HookResult.Continue;
    }

    private void EntregarArma(CCSPlayerController? jogador)
    {
        var arma = Config.ArmaPrincipal;
        if (arma == "") return;
        if (jogador is not { IsValid: true, PawnIsAlive: true }) return;
        if (jogador.Team is not (CsTeam.Terrorist or CsTeam.CounterTerrorist)) return;

        var armas = jogador.PlayerPawn.Value?.WeaponServices?.MyWeapons;
        if (armas == null) return;
        if (armas.Any(item => item.Value?.DesignerName == arma)) return;

        jogador.GiveNamedItem(arma);
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
