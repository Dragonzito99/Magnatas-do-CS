using CounterStrikeSharp.API;
using CounterStrikeSharp.API.Core;

namespace MagnatasLemnos;

/// <summary>
/// AFK e acampar (dono, 15/11/2026): aviso antes, depois kick. O kick conta como morte e entra na escada de punições do
/// site (3º kick: 3 dias fora da ilha; mais um depois disso: para sempre). O banimento é só da Ilha Lemnos.
/// </summary>
public partial class IlhaLemnos
{
    private const int SegundosAteAvisoAfk = 180;
    private const int SegundosAteKickAfk = 210;
    private const int SegundosAteAvisoAcampar = 600;
    private const int SegundosAteKickAcampar = 660;
    private const float RaioDeAcampar = 300;
    private const float MexeuSe = 1;

    private void Vigiar()
    {
        var agora = DateTime.UtcNow;
        foreach (var jogador in Pessoas().ToList())
        {
            if (!naIlha.TryGetValue(jogador.SteamID, out var estado) || estado.Sessao == null || estado.JaSaiu) continue;
            if (!jogador.PawnIsAlive || jogador.PlayerPawn.Value?.AbsOrigin is not { } lugar) continue;

            var mexeu = estado.UltimoLugar is not { } antes || Distancia(lugar, new Ponto { X = antes.X, Y = antes.Y, Z = antes.Z }) > MexeuSe;
            if (mexeu || jogador.Buttons != 0)
            {
                estado.UltimaAcao = agora;
                estado.AvisouAfk = false;
            }
            estado.UltimoLugar = Copia(lugar);
            var parado = (agora - estado.UltimaAcao).TotalSeconds;
            if (parado >= SegundosAteKickAfk)
            {
                Expulsar(jogador, estado, "kick_afk", "Kick por ficar parado (AFK) na Ilha Lemnos. Conta como morte.");
                continue;
            }
            if (parado >= SegundosAteAvisoAfk && !estado.AvisouAfk)
            {
                estado.AvisouAfk = true;
                jogador.PrintToChat(" \x04[Ilha Lemnos]\x02 Você está parado. Mexa-se em 30 segundos ou leva kick (conta como morte).");
                jogador.PrintToCenterHtml("<font color='#ff5a5a'>Mexa-se ou leva kick em 30 s</font>", 5);
            }

            // Acampar: só fora do posto. Sair do raio recomeça a conta.
            if (NoPosto(lugar))
            {
                estado.Ancora = null;
                continue;
            }
            if (estado.Ancora is not { } ancora || Distancia(lugar, new Ponto { X = ancora.X, Y = ancora.Y, Z = ancora.Z }) > RaioDeAcampar)
            {
                estado.Ancora = Copia(lugar);
                estado.AncoraDesde = agora;
                estado.AvisouAcampar = false;
                continue;
            }
            var acampando = (agora - estado.AncoraDesde).TotalSeconds;
            if (acampando >= SegundosAteKickAcampar)
            {
                Expulsar(jogador, estado, "kick_acampar", "Kick por acampar na Ilha Lemnos. Conta como morte.");
                continue;
            }
            if (acampando >= SegundosAteAvisoAcampar && !estado.AvisouAcampar)
            {
                estado.AvisouAcampar = true;
                jogador.PrintToChat(" \x04[Ilha Lemnos]\x02 Você está no mesmo lugar há 10 minutos. Saia daqui em 1 minuto ou leva kick.");
                jogador.PrintToCenterHtml("<font color='#ff5a5a'>Saia daqui em 1 minuto ou leva kick</font>", 5);
            }
        }
    }

    /// <summary>Avisa o site antes de tirar do servidor: o motivo do kick chega antes do desconectar.</summary>
    private void Expulsar(CCSPlayerController jogador, NaIlha estado, string motivo, string texto)
    {
        estado.JaSaiu = true;
        var lugar = jogador.PlayerPawn.Value?.AbsOrigin is { } onde ? Copia(onde) : null;
        Avisar("saida", new
        {
            sessao = estado.Sessao,
            referencia = NovaReferencia(),
            motivo,
            naSafeZone = lugar != null && NoPosto(lugar),
            gastas = estado.Gastas.ToList(),
            armas = ArmasNaMao(jogador, estado),
        });
        if (lugar != null) DeixarMochilaNoChao(lugar, estado.Mochila);
        estado.Mochila.Clear();
        if (jogador.UserId is int id) Server.ExecuteCommand($"kickid {id} \"{texto}\"");
    }
}
