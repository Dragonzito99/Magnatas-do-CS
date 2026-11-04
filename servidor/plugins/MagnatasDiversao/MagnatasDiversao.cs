using System.Text.Json.Serialization;
using CounterStrikeSharp.API;
using CounterStrikeSharp.API.Core;
using CounterStrikeSharp.API.Core.Attributes.Registration;
using CounterStrikeSharp.API.Modules.Commands;
using CounterStrikeSharp.API.Modules.Cvars;
using CounterStrikeSharp.API.Modules.Entities.Constants;
using CounterStrikeSharp.API.Modules.Timers;
using CounterStrikeSharp.API.Modules.Utils;

namespace MagnatasDiversao;

/// <summary>Cada servidor tem o próprio arquivo, gravado pelo iniciar_diversao.sh.</summary>
public class ConfiguracaoDoModo : BasePluginConfig
{
    /// <summary>Vazio significa não entregar arma principal, como no servidor só de pistola.</summary>
    [JsonPropertyName("ArmaPrincipal")]
    public string ArmaPrincipal { get; set; } = "";

    /// <summary>cada_um ou equipe.</summary>
    [JsonPropertyName("Regra")]
    public string Regra { get; set; } = "cada_um";
}

/// <summary>
/// O que o CS2 não faz sozinho nos servidores da aba Diversão: entregar a arma principal, zerar o placar
/// sem parar o jogo, decidir a partida por abates e dizer ao site quem está conectado.
/// </summary>
public class ModoDeDiversao : BasePlugin, IPluginConfig<ConfiguracaoDoModo>
{
    private const float EsperaAposNascer = 0.1f;
    private const float SegundosAteZerarOPlacar = 20 * 60;
    private const float SegundosMostrandoOVencedor = 5;
    private const float MinutosSeFaltarORelogio = 5;

    private int abatesCt, abatesTr;
    private bool partidaEncerrada;
    private CounterStrikeSharp.API.Modules.Timers.Timer? fimDaPartida;

    public override string ModuleName => "Magnatas: Diversão";
    public override string ModuleVersion => "1.0.0";

    public ConfiguracaoDoModo Config { get; set; } = new();

    public void OnConfigParsed(ConfiguracaoDoModo config)
    {
        Config = config;
    }

    public override void Load(bool hotReload)
    {
        if (Config.Regra == "cada_um")
        {
            // Se a partida acabar pelo tempo do jogo, este modo não recomeça e deixa todo mundo sem time.
            AddTimer(SegundosAteZerarOPlacar, () => Server.ExecuteCommand("mp_restartgame 5"), TimerFlags.REPEAT);
        }
        // Recarregado no meio da partida, o plugin não veria o início da rodada e o jogo nunca terminaria.
        else if (Config.Regra == "equipe" && hotReload)
        {
            ComecarPartida();
        }
    }

    private static CCSGameRules? RegrasDoJogo() =>
        Utilities.FindAllEntitiesByDesignerName<CCSGameRulesProxy>("cs_gamerules").FirstOrDefault()?.GameRules;

    private void ComecarPartida()
    {
        abatesCt = 0;
        abatesTr = 0;
        partidaEncerrada = false;
        MostrarNoPlacar();
        fimDaPartida?.Kill();
        // O mesmo valor do relógio da tela, para os dois chegarem juntos ao fim.
        var minutos = ConVar.Find("mp_roundtime")?.GetPrimitiveValue<float>() ?? MinutosSeFaltarORelogio;
        fimDaPartida = AddTimer(minutos * 60f, EncerrarPartida);
    }

    private void MostrarNoPlacar()
    {
        foreach (var time in Utilities.FindAllEntitiesByDesignerName<CCSTeam>("cs_team_manager"))
        {
            if (time.TeamNum == (byte)CsTeam.CounterTerrorist) time.Score = abatesCt;
            else if (time.TeamNum == (byte)CsTeam.Terrorist) time.Score = abatesTr;
            else continue;
            Utilities.SetStateChanged(time, "CTeam", "m_iScore");
        }
    }

    /// <summary>Sem isso, o jogo daria a vitória ao CT por tempo. A rodada seguinte zera o placar.</summary>
    private void EncerrarPartida()
    {
        partidaEncerrada = true;
        var motivo = abatesCt > abatesTr
            ? RoundEndReason.CTsWin
            : abatesTr > abatesCt ? RoundEndReason.TerroristsWin : RoundEndReason.RoundDraw;
        RegrasDoJogo()?.TerminateRound(SegundosMostrandoOVencedor, motivo);
    }

    [GameEventHandler]
    public HookResult AoComecarRodada(EventRoundStart evento, GameEventInfo informacao)
    {
        if (Config.Regra != "equipe") return HookResult.Continue;
        var regras = RegrasDoJogo();
        if (regras == null || regras.WarmupPeriod) return HookResult.Continue;
        ComecarPartida();
        return HookResult.Continue;
    }

    [GameEventHandler]
    public HookResult AoMorrer(EventPlayerDeath evento, GameEventInfo informacao)
    {
        if (Config.Regra != "equipe" || partidaEncerrada || RegrasDoJogo()?.WarmupPeriod != false) return HookResult.Continue;
        var quem = evento.Attacker;
        var alvo = evento.Userid;
        if (quem == null || alvo == null || quem == alvo || quem.Team == alvo.Team) return HookResult.Continue;
        if (quem.Team == CsTeam.CounterTerrorist) abatesCt++;
        else if (quem.Team == CsTeam.Terrorist) abatesTr++;
        MostrarNoPlacar();
        return HookResult.Continue;
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
