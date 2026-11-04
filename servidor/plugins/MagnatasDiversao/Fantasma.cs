using CounterStrikeSharp.API;
using CounterStrikeSharp.API.Core;
using CounterStrikeSharp.API.Core.Attributes.Registration;
using CounterStrikeSharp.API.Modules.Commands;
using CounterStrikeSharp.API.Modules.Timers;
using CounterStrikeSharp.API.Modules.UserMessages;
using CounterStrikeSharp.API.Modules.Utils;

namespace MagnatasDiversao;

/// <summary>
/// O modo Fantasma. A respiração e os áudios são do script do mapa gm_laboratory, e as 13 rodadas com a troca de
/// lados são do próprio jogo. Aqui fica o que nenhum dos dois faz, e a transparência, que o dono quis diferente da do mapa.
/// </summary>
public partial class ModoDeDiversao
{
    private const float EsperaDepoisDeComecarARodada = 0.2f;
    private const int InicioDeSom = 208;
    private const float RepassarCorte = 0.1f;
    private const int CopiasDaRespiracao = 3;
    private const float VolumeDaRespiracao = 1f;
    private const float IntervaloDaRespiracao = 2.5f;
    private const int LimiteDeSonsGuardados = 200;
    private const string SomDaRespiracao = "CrossFire_ghost_Breath01";
    private const ushort NumeroDaM4Silenciada = 60;
    private const ushort NumeroDaUsp = 61;
    private const float VelocidadeDoShift = 140f;
    private const float VelocidadeDevagar = 160f;
    private const float IntervaloDaInvisibilidade = 0.05f;
    private const string AlfaInvisivel = "0";
    private const string AlfaDevagar = "128";
    private const string AlfaCorrendo = "176";
    private const string AlfaDaArmaAparecendo = "128";
    private static readonly string[] GranadasDoCt = { "weapon_smokegrenade", "weapon_flashbang", "weapon_hegrenade" };

    // CrossFire_ghost_Breath01, 02 e 03, tocados pelo script do mapa. Se o autor do mapa renomear os sons, a respiração volta a ficar presa ao corpo.
    private static readonly HashSet<uint> Respiracao = new() { 2454124772, 2525673644, 3258385741 };

    private readonly Dictionary<int, List<int>> tocando = new();
    private readonly HashSet<int> mortos = new();
    private DateTime inicioDaPartida = DateTime.UtcNow;
    private int respiracoesVistas, respiracoesBloqueadas, sonsCortados;
    private string erroDoSom = "nenhum";
    private bool invisibilidadeNoPlugin;

    private void LigarFantasma(bool hotReload)
    {
        AddTimer(IntervaloDaRespiracao, TocarCopiasDaRespiracao, TimerFlags.REPEAT);
        HookUserMessage(InicioDeSom, AoComecarSom, HookMode.Pre);
        AddTimer(IntervaloDaInvisibilidade, AjustarInvisibilidade, TimerFlags.REPEAT);
        // Recarregado no meio da partida, o plugin só assume de novo na próxima rodada.
        // Ao ligar o servidor o mapa ainda não abriu, e procurar uma entidade nessa hora derrubaria o plugin.
        if (hotReload) ChamarScriptDoMapa("invisTeamModifyTTrue");
    }

    private static bool ChamarScriptDoMapa(string entrada)
    {
        var achou = false;
        foreach (var script in Utilities.FindAllEntitiesByDesignerName<CBaseEntity>("point_script"))
        {
            script.AcceptInput("RunScriptInput", null, null, entrada);
            achou = true;
        }
        return achou;
    }

    /// <summary>Só depois do início da rodada: com o time desligado no script, ele não criaria a respiração.</summary>
    private void AssumirInvisibilidade()
    {
        invisibilidadeNoPlugin = ChamarScriptDoMapa("invisTeamModifyTFalse");
    }

    /// <summary>
    /// O script do mapa deixa quem anda no shift 50% visível e, enquanto controla a transparência, qualquer outro
    /// ajuste pisca. Por isso o plugin assume a tabela dele, com o shift e o ar invisíveis, a pedido do dono.
    /// </summary>
    private void AjustarInvisibilidade()
    {
        if (!invisibilidadeNoPlugin) return;
        foreach (var fantasma in Utilities.GetPlayers().Where(jogador => jogador is { IsValid: true, PawnIsAlive: true, Team: CsTeam.Terrorist }))
        {
            var corpo = fantasma.PlayerPawn.Value;
            if (corpo == null) continue;
            var noAr = (corpo.Flags & (uint)PlayerFlags.FL_ONGROUND) == 0;
            var velocidade = corpo.AbsVelocity.Length();
            var alfa = noAr || velocidade <= VelocidadeDoShift ? AlfaInvisivel : velocidade <= VelocidadeDevagar ? AlfaDevagar : AlfaCorrendo;
            var alfaDaArma = noAr || velocidade <= VelocidadeDevagar ? AlfaInvisivel : AlfaDaArmaAparecendo;

            corpo.AcceptInput("alpha", null, null, alfa);
            var armas = corpo.WeaponServices?.MyWeapons;
            if (armas == null) continue;
            foreach (var item in armas) item.Value?.AcceptInput("alpha", null, null, alfaDaArma);
        }
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
        invisibilidadeNoPlugin = false;
        ChamarScriptDoMapa("invisTeamModifyTTrue");
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
        // Espera todos nascerem, para o sorteio não deixar ninguém de fora, e o script criar a respiração da rodada.
        AddTimer(EsperaDepoisDeComecarARodada, () =>
        {
            SortearKitDeDefuse();
            AssumirInvisibilidade();
        });
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

    /// <summary>
    /// A configuração não basta: o jogo pode dar a pistola do inventário no lugar da USP, e quem sobrevive
    /// não recebe de volta a granada que usou.
    /// </summary>
    private void CompletarKitDoCt(CCSPlayerController? jogador)
    {
        if (jogador is not { IsValid: true, PawnIsAlive: true, Team: CsTeam.CounterTerrorist }) return;
        var armas = jogador.PlayerPawn.Value?.WeaponServices?.MyWeapons;
        if (armas == null) return;

        GarantirArma(jogador, armas, "weapon_m4a1", NumeroDaM4Silenciada, "weapon_m4a1_silencer");
        GarantirArma(jogador, armas, "weapon_hkp2000", NumeroDaUsp, "weapon_usp_silencer");
        foreach (var granada in GranadasDoCt)
        {
            if (!armas.Any(item => item.Value?.DesignerName == granada)) jogador.GiveNamedItem(granada);
        }
    }

    /// <summary>O nome interno da M4 silenciada e da USP é igual ao da M4A4 e da P2000. Só o número do item separa.</summary>
    private static void GarantirArma(CCSPlayerController jogador, IEnumerable<CHandle<CBasePlayerWeapon>> armas, string nomeInterno, ushort numero, string nomeParaEntregar)
    {
        var atual = armas.Select(item => item.Value).FirstOrDefault(arma => arma?.DesignerName == nomeInterno);
        if (atual?.AttributeManager.Item.ItemDefinitionIndex == numero) return;
        atual?.Remove();
        jogador.GiveNamedItem(nomeParaEntregar);
    }

    private void SortearKitDeDefuse()
    {
        if (RegrasDoJogo()?.WarmupPeriod != false) return;

        var vivos = new List<CCSPlayerController>();
        foreach (var jogador in Utilities.GetPlayers().Where(jogador => jogador is { IsValid: true, Team: CsTeam.CounterTerrorist }))
        {
            // Quem sobreviveu ainda carrega o kit da rodada anterior.
            DefinirKit(jogador, false);
            if (jogador.PawnIsAlive) vivos.Add(jogador);
        }
        if (vivos.Count == 0) return;

        var sorteado = vivos[Random.Shared.Next(vivos.Count)];
        DefinirKit(sorteado, true);
        sorteado.PrintToChat(" [Magnatas] Você recebeu o kit de defuse nesta rodada.");
    }

    /// <summary>Marcado direto no jogador: entregue como item, o kit demora a chegar e às vezes não chega.</summary>
    private static void DefinirKit(CCSPlayerController jogador, bool temKit)
    {
        var corpo = jogador.PlayerPawn.Value;
        if (corpo?.ItemServices == null) return;
        new CCSPlayer_ItemServices(corpo.ItemServices.Handle).HasDefuser = temKit;
        Utilities.SetStateChanged(corpo, "CBasePlayerPawn", "m_pItemServices");
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
            // O nome interno da M4 silenciada e da USP é igual ao da M4A4 e da P2000. Só o número do item separa.
            var armas = corpo?.WeaponServices?.MyWeapons.Select(item => $"{item.Value?.DesignerName ?? "?"}:{item.Value?.AttributeManager.Item.ItemDefinitionIndex}") ?? Enumerable.Empty<string>();
            var kit = corpo?.ItemServices != null && new CCSPlayer_ItemServices(corpo.ItemServices.Handle).HasDefuser;
            comando.ReplyToCommand($"vaga={jogador.Slot} time={jogador.Team} vivo={jogador.PawnIsAlive} kit={kit} velocidade={corpo?.AbsVelocity.Length():0} alfa={corpo?.Render.A} armas={string.Join(",", armas)}");
        }
        var (ct, tr) = RodadasVencidas();
        comando.ReplyToCommand($"plugin_na_transparencia={invisibilidadeNoPlugin} rodadas={RegrasDoJogo()?.TotalRoundsPlayed} ct={ct} tr={tr} respiracoes={respiracoesVistas} bloqueadas={respiracoesBloqueadas} cortadas={sonsCortados} erro={erroDoSom}");
    }
}
