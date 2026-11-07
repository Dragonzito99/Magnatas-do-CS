using CounterStrikeSharp.API;
using CounterStrikeSharp.API.Core;
using CounterStrikeSharp.API.Core.Attributes.Registration;
using CounterStrikeSharp.API.Modules.Entities.Constants;
using CounterStrikeSharp.API.Modules.Utils;

namespace MagnatasDiversao;

/// <summary>
/// Mapas do Equipe x Equipe que o dono quis jogar em rodadas, como no CrossFire: quem morre espera a próxima rodada,
/// todo mundo nasce com faca e pistola, e as armas ficam no chão onde o mapa as coloca. Fora destes mapas, o Equipe
/// segue como mata-mata.
/// </summary>
public partial class ModoDeDiversao
{
    private static readonly HashSet<string> MapasDeRodadas = new() { "alaska" };
    private const int RodadasDaPartidaDeRodadas = 10;
    private const int VitoriasParaVencer = 6;
    private const float MinutosDaRodadaDeAlaska = 3f;
    private const float SegundosAteEntregarKit = 0.5f;
    private const int SegundosDoEmpate = 5;

    // O cfg do modo volta a valer a cada troca de mapa, então estas regras só existem enquanto o Alaska roda.
    private static readonly string[] RegrasDoAlaska =
    {
        "mp_respawn_on_death_ct 0",
        "mp_respawn_on_death_t 0",
        "mp_ignore_round_win_conditions 0",
        "mp_roundtime 3",
        "mp_freezetime 0",
        "mp_maxrounds 30",
        "mp_match_can_clinch 0",
        "mp_weapons_allow_map_placed 1",
        "mp_death_drop_gun 1",
        "mp_ct_default_primary \"\"",
        "mp_t_default_primary \"\"",
        "mp_ct_default_grenades \"\"",
        "mp_t_default_grenades \"\"",
    };

    private bool regrasDoAlaskaAplicadas;
    private int rodadasDeAlaska;
    private int vitoriasCtNoAlaska;
    private int vitoriasTrNoAlaska;
    private DateTime inicioDoAlaska = DateTime.UtcNow;
    private CounterStrikeSharp.API.Modules.Timers.Timer? empateDoAlaska;

    private bool NoMapaDeRodadas => Config.Regra == "equipe" && MapasDeRodadas.Contains(Server.MapName);

    private void LigarMapasDeRodadas()
    {
        RegisterListener<Listeners.OnMapStart>(_ =>
        {
            regrasDoAlaskaAplicadas = false;
            ZerarPartidaDeAlaska();
        });
    }

    private void ZerarPartidaDeAlaska()
    {
        rodadasDeAlaska = 0;
        vitoriasCtNoAlaska = 0;
        vitoriasTrNoAlaska = 0;
        empateDoAlaska?.Kill();
    }

    private void ComecarRodadaDeAlaska()
    {
        // O relógio da partida de mata-mata do mapa anterior continuaria correndo e trocaria de mapa no meio do Alaska.
        fimDaPartida?.Kill();
        if (!regrasDoAlaskaAplicadas)
        {
            regrasDoAlaskaAplicadas = true;
            foreach (var comando in RegrasDoAlaska) Server.ExecuteCommand(comando);
            ZerarPartidaDeAlaska();
            Server.ExecuteCommand("mp_restartgame 1");
            return;
        }

        if (rodadasDeAlaska == 0)
        {
            ZerarContagem();
            ZerarPlacarDasPessoas();
            inicioDoAlaska = DateTime.UtcNow;
        }
        // As armas do chão ficam por conta do jogo (mp_weapons_allow_map_placed 1). Criar ou apagar entidades
        // pelo plugin derrubou o servidor quando o dono entrou.

        // Sem objetivo no mapa, o jogo daria a vitória ao CT quando o tempo acaba. Aqui, tempo esgotado é empate.
        empateDoAlaska?.Kill();
        empateDoAlaska = AddTimer(MinutosDaRodadaDeAlaska * 60f - 0.5f, () =>
        {
            if (NoMapaDeRodadas) RegrasDoJogo()?.TerminateRound(SegundosDoEmpate, RoundEndReason.RoundDraw);
        });
    }

    /// <summary>O game_player_equip do mapa deixa quem nasce só com a faca. O kit vem logo depois dele.</summary>
    private void EntregarKitDoAlaska(CCSPlayerController? jogador)
    {
        if (!NoMapaDeRodadas || jogador is not { IsValid: true, PawnIsAlive: true }) return;
        if (jogador.Team is not (CsTeam.Terrorist or CsTeam.CounterTerrorist)) return;
        var armas = jogador.PlayerPawn.Value?.WeaponServices?.MyWeapons.Select(item => item.Value?.DesignerName ?? "").ToList();
        if (armas == null) return;
        if (!armas.Any(nome => nome.StartsWith("weapon_knife") || nome == "weapon_bayonet")) jogador.GiveNamedItem("weapon_knife");
        var pistola = jogador.Team == CsTeam.Terrorist ? "weapon_glock" : "weapon_hkp2000";
        if (!armas.Contains(pistola)) jogador.GiveNamedItem(pistola);
    }

    [GameEventHandler]
    public HookResult AoTerminarRodadaDeAlaska(EventRoundEnd evento, GameEventInfo informacao)
    {
        if (!NoMapaDeRodadas || !regrasDoAlaskaAplicadas || partidaEncerrada) return HookResult.Continue;
        empateDoAlaska?.Kill();
        if (evento.Winner == (int)CsTeam.CounterTerrorist) vitoriasCtNoAlaska++;
        else if (evento.Winner == (int)CsTeam.Terrorist) vitoriasTrNoAlaska++;
        rodadasDeAlaska++;

        var alguemFezSeis = vitoriasCtNoAlaska >= VitoriasParaVencer || vitoriasTrNoAlaska >= VitoriasParaVencer;
        if (!alguemFezSeis && rodadasDeAlaska < RodadasDaPartidaDeRodadas) return HookResult.Continue;

        var vencedor = vitoriasCtNoAlaska > vitoriasTrNoAlaska ? "ct" : vitoriasTrNoAlaska > vitoriasCtNoAlaska ? "tr" : "empate";
        AvisarFimDaPartida($"CT {vitoriasCtNoAlaska} x {vitoriasTrNoAlaska} TR");
        FecharPartida(vencedor, (float)Math.Max(0.01, (DateTime.UtcNow - inicioDoAlaska).TotalMinutes));
        ZerarPartidaDeAlaska();
        // Troca um pouco antes da rodada seguinte, como no fim da partida de mata-mata.
        AddTimer(SegundosMostrandoOVencedor - 1, TrocarDeMapa);
        return HookResult.Continue;
    }
}
