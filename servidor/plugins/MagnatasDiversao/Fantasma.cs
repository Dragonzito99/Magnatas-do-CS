using CounterStrikeSharp.API;
using CounterStrikeSharp.API.Core;
using CounterStrikeSharp.API.Core.Attributes.Registration;
using CounterStrikeSharp.API.Modules.Commands;
using CounterStrikeSharp.API.Modules.Timers;
using CounterStrikeSharp.API.Modules.UserMessages;
using CounterStrikeSharp.API.Modules.Utils;

namespace MagnatasDiversao;

/// <summary>
/// O modo Fantasma. A invisibilidade, os áudios e a bomba são do script do mapa gm_laboratory, e as 13 rodadas
/// com a troca de lados são do próprio jogo. Aqui fica o que nenhum dos dois faz.
/// </summary>
public partial class ModoDeDiversao
{
    private const float EsperaParaSortearOKit = 0.2f;
    private const int InicioDeSom = 208;
    private const float RepassarCorte = 0.1f;
    private const int CopiasDaRespiracao = 3;
    private const float VolumeDaRespiracao = 1f;
    private const float IntervaloDaRespiracao = 2.5f;
    private const int LimiteDeSonsGuardados = 200;
    private const string SomDaRespiracao = "CrossFire_ghost_Breath01";

    // CrossFire_ghost_Breath01, 02 e 03, tocados pelo script do mapa. Se o autor do mapa renomear os sons, a respiração volta a ficar presa ao corpo.
    private static readonly HashSet<uint> Respiracao = new() { 2454124772, 2525673644, 3258385741 };

    private readonly Dictionary<int, List<int>> tocando = new();
    private readonly HashSet<int> mortos = new();
    private DateTime inicioDaPartida = DateTime.UtcNow;
    private int respiracoesVistas, respiracoesBloqueadas, sonsCortados;
    private string erroDoSom = "nenhum";

    private void LigarFantasma()
    {
        AddTimer(IntervaloDaRespiracao, TocarCopiasDaRespiracao, TimerFlags.REPEAT);
        HookUserMessage(InicioDeSom, AoComecarSom, HookMode.Pre);
    }

    /// <summary>Só o som do mapa não chega longe o bastante para localizar o fantasma pelo fone.</summary>
    private void TocarCopiasDaRespiracao()
    {
        foreach (var fantasma in Utilities.GetPlayers().Where(jogador => jogador is { IsValid: true, PawnIsAlive: true, Team: CsTeam.Terrorist }))
        {
            var corpo = fantasma.PlayerPawn.Value;
            if (corpo == null || mortos.Contains((int)corpo.Index)) continue;
            for (var copia = 0; copia < CopiasDaRespiracao; copia++) corpo.EmitSound(SomDaRespiracao, null, VolumeDaRespiracao);
        }
    }

    /// <summary>O script do mapa continua tocando a respiração a partir do corpo no chão, por isso ela é barrada aqui.</summary>
    private HookResult AoComecarSom(UserMessage mensagem)
    {
        try
        {
            if (!Respiracao.Contains(mensagem.ReadUInt("soundevent_hash"))) return HookResult.Continue;
            respiracoesVistas++;
            var entidade = mensagem.ReadInt("source_entity_index");
            if (entidade == 0 || mortos.Contains(entidade))
            {
                respiracoesBloqueadas++;
                return HookResult.Stop;
            }
            if (!tocando.TryGetValue(entidade, out var sons)) tocando[entidade] = sons = new List<int>();
            sons.Add(mensagem.ReadInt("soundevent_guid"));
            if (sons.Count > LimiteDeSonsGuardados) sons.RemoveRange(0, LimiteDeSonsGuardados / 2);
        }
        catch (Exception erro)
        {
            erroDoSom = erro.GetType().Name;
        }
        return HookResult.Continue;
    }

    private void PararSom(int som)
    {
        try
        {
            var parar = UserMessage.FromPartialName("SosStopSoundEvent");
            parar.SetInt("soundevent_guid", som);
            parar.Recipients.AddAllPlayers();
            parar.Send();
            sonsCortados++;
        }
        catch (Exception erro)
        {
            erroDoSom = erro.GetType().Name;
        }
    }

    private void Cortar(int entidade)
    {
        if (!tocando.Remove(entidade, out var sons)) return;
        foreach (var som in sons) PararSom(som);
    }

    [GameEventHandler(HookMode.Pre)]
    public HookResult AoMorrerOFantasma(EventPlayerDeath evento, GameEventInfo informacao)
    {
        if (Config.Regra != "fantasma") return HookResult.Continue;
        var corpo = evento.Userid?.PlayerPawn.Value;
        if (corpo == null) return HookResult.Continue;
        var entidade = (int)corpo.Index;
        mortos.Add(entidade);
        Cortar(entidade);
        // O som que já estava saindo na hora da morte ainda não tinha passado por aqui.
        AddTimer(RepassarCorte, () => Cortar(entidade));
        return HookResult.Continue;
    }

    [GameEventHandler]
    public HookResult AoNascerOFantasma(EventPlayerSpawn evento, GameEventInfo informacao)
    {
        var corpo = evento.Userid?.PlayerPawn.Value;
        if (Config.Regra == "fantasma" && corpo != null) mortos.Remove((int)corpo.Index);
        return HookResult.Continue;
    }

    /// <summary>Roda antes de a rodada nova criar a respiração dela. O som dura 17 segundos, e quem troca de lado não pode levá-lo junto.</summary>
    [GameEventHandler]
    public HookResult AoPrepararRodada(EventRoundPrestart evento, GameEventInfo informacao)
    {
        if (Config.Regra != "fantasma") return HookResult.Continue;
        foreach (var sons in tocando.Values)
        {
            foreach (var som in sons) PararSom(som);
        }
        tocando.Clear();
        return HookResult.Continue;
    }

    private void ComecarRodadaDoFantasma(CCSGameRules regras)
    {
        // O evento de nascer nem sempre traz o corpo de um jogador humano.
        mortos.Clear();
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
        var corpo = quem?.PlayerPawn.Value;
        if (corpo != null) Cortar((int)corpo.Index);
        // Quem chegar depois não pode herdar o placar de uma partida que ninguém mais está jogando.
        if (!Pessoas().Any(pessoa => pessoa.Slot != quem?.Slot)) Server.ExecuteCommand("mp_restartgame 1");
        return HookResult.Continue;
    }

    [ConsoleCommand("magnatas_fantasma_ver", "Mostra armas, kit de defuse e respiração, para conferir o modo")]
    [CommandHelper(whoCanExecute: CommandUsage.SERVER_ONLY)]
    public void VerFantasma(CCSPlayerController? chamador, CommandInfo comando)
    {
        if (Config.Regra != "fantasma") return;
        foreach (var jogador in Utilities.GetPlayers().Where(jogador => jogador is { IsValid: true }))
        {
            var corpo = jogador.PlayerPawn.Value;
            var armas = corpo?.WeaponServices?.MyWeapons.Select(item => item.Value?.DesignerName ?? "?") ?? Enumerable.Empty<string>();
            var kit = corpo?.ItemServices != null && new CCSPlayer_ItemServices(corpo.ItemServices.Handle).HasDefuser;
            comando.ReplyToCommand($"vaga={jogador.Slot} time={jogador.Team} vivo={jogador.PawnIsAlive} kit={kit} armas={string.Join(",", armas)}");
        }
        var (ct, tr) = RodadasVencidas();
        comando.ReplyToCommand($"rodadas={RegrasDoJogo()?.TotalRoundsPlayed} ct={ct} tr={tr} respiracoes={respiracoesVistas} bloqueadas={respiracoesBloqueadas} cortadas={sonsCortados} erro={erroDoSom}");
    }
}
