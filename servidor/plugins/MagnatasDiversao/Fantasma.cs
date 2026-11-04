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
    private const float EsperaParaSortearOKit = 0.2f;

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
        // Espera todos nascerem, para o sorteio não deixar ninguém de fora.
        AddTimer(EsperaParaSortearOKit, SortearKitDeDefuse);
    }

    /// <summary>A configuração já não entrega arma ao fantasma. Isto cobre o que vem do chão, como a arma largada por um CT.</summary>
    private void DeixarSoAFaca(CCSPlayerController? jogador)
    {
        if (jogador is not { IsValid: true, PawnIsAlive: true, Team: CsTeam.Terrorist }) return;
        var armas = jogador.PlayerPawn.Value?.WeaponServices?.MyWeapons;
        if (armas == null) return;

        var tirou = false;
        foreach (var item in armas.ToList())
        {
            var arma = item.Value;
            if (arma == null || arma.DesignerName == "weapon_c4" || arma.DesignerName.Contains("knife") || arma.DesignerName.Contains("bayonet")) continue;
            arma.Remove();
            tirou = true;
        }
        if (tirou) jogador.ExecuteClientCommand("slot3");
    }

    private void SortearKitDeDefuse()
    {
        if (RegrasDoJogo()?.WarmupPeriod != false) return;

        var vivos = new List<CCSPlayerController>();
        foreach (var jogador in Utilities.GetPlayers().Where(jogador => jogador is { IsValid: true, Team: CsTeam.CounterTerrorist }))
        {
            // Quem sobreviveu ainda carrega o kit da rodada anterior.
            var corpo = jogador.PlayerPawn.Value;
            if (corpo?.ItemServices != null)
            {
                new CCSPlayer_ItemServices(corpo.ItemServices.Handle).HasDefuser = false;
                Utilities.SetStateChanged(corpo, "CBasePlayerPawn", "m_pItemServices");
            }
            if (jogador.PawnIsAlive) vivos.Add(jogador);
        }
        if (vivos.Count == 0) return;

        var sorteado = vivos[Random.Shared.Next(vivos.Count)];
        sorteado.GiveNamedItem("item_defuser");
        sorteado.PrintToChat(" [Magnatas] Você recebeu o kit de defuse nesta rodada.");
    }

    [GameEventHandler]
    public HookResult AoPegarItem(EventItemPickup evento, GameEventInfo informacao)
    {
        if (Config.Regra != "fantasma") return HookResult.Continue;
        var jogador = evento.Userid;
        // O item só entra na lista do jogador depois do evento.
        AddTimer(EsperaAposNascer, () => DeixarSoAFaca(jogador));
        return HookResult.Continue;
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
