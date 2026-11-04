using CounterStrikeSharp.API;
using CounterStrikeSharp.API.Core;
using CounterStrikeSharp.API.Core.Attributes.Registration;
using CounterStrikeSharp.API.Modules.Utils;

namespace MagnatasDiversao;

/// <summary>
/// O modo Fantasma. A invisibilidade, os áudios e a bomba são do script do mapa gm_laboratory, e as 13 rodadas
/// com a troca de lados são do próprio jogo. Aqui fica o que nenhum dos dois faz.
/// </summary>
public partial class ModoDeDiversao
{
    private DateTime inicioDaPartida = DateTime.UtcNow;

    private void LigarFantasma()
    {
    }

    private void ComecarRodadaDoFantasma(CCSGameRules regras)
    {
        if (regras.TotalRoundsPlayed == 0)
        {
            ZerarContagem();
            inicioDaPartida = DateTime.UtcNow;
        }
    }

    private static (int Ct, int Tr) RodadasVencidas()
    {
        int ct = 0, tr = 0;
        foreach (var time in Utilities.FindAllEntitiesByDesignerName<CCSTeam>("cs_team_manager"))
        {
            if (time.TeamNum == (byte)CsTeam.CounterTerrorist) ct = time.Score;
            else if (time.TeamNum == (byte)CsTeam.Terrorist) tr = time.Score;
        }
        return (ct, tr);
    }

    private void EncerrarPartidaDoFantasma()
    {
        var (ct, tr) = RodadasVencidas();
        var vencedor = ct > tr ? "ct" : tr > ct ? "tr" : "empate";
        // Os times trocam de lado no meio da partida: o nome é do lado em que o vencedor terminou.
        var resultado = vencedor == "empate"
            ? "Empate"
            : $"{(vencedor == "ct" ? "CT" : "TR")} venceu por {Math.Max(ct, tr)} a {Math.Min(ct, tr)}";
        AvisarFimDaPartida(resultado);
        var minutos = (float)Math.Max(0.01, (DateTime.UtcNow - inicioDaPartida).TotalMinutes);
        FecharPartida(vencedor, minutos);
    }

    [GameEventHandler]
    public HookResult AoAcabarOJogo(EventCsWinPanelMatch evento, GameEventInfo informacao)
    {
        if (Config.Regra == "fantasma" && !partidaEncerrada) EncerrarPartidaDoFantasma();
        return HookResult.Continue;
    }

    [GameEventHandler]
    public HookResult AoSairDoServidor(EventPlayerDisconnect evento, GameEventInfo informacao)
    {
        if (Config.Regra != "fantasma") return HookResult.Continue;
        var quem = evento.Userid;
        // Quem chegar depois não pode herdar o placar de uma partida que ninguém mais está jogando.
        if (!Pessoas().Any(pessoa => pessoa.Slot != quem?.Slot)) Server.ExecuteCommand("mp_restartgame 1");
        return HookResult.Continue;
    }
}
