using CounterStrikeSharp.API;
using CounterStrikeSharp.API.Core;

namespace MagnatasLemnos;

/// <summary>
/// O reinício diário às 5h de Brasília, para as atualizações do CS2 e para limpar a memória. Avisa aos 10, 5 e 1 minuto;
/// às 5h, avisa a saída de todos ao site (quem estiver fora do posto perde a mochila, as armas voltam ao baú) e desliga.
/// O site religa sozinho, porque a ilha é sempre ligada.
/// </summary>
public partial class IlhaLemnos
{
    private const int HoraDoReinicio = 5;
    private static readonly int[] MinutosDeAviso = [10, 5, 1];
    private const int SegundosEsperandoAFila = 30;

    private readonly HashSet<string> avisosDoReinicio = new();
    private DateOnly? reiniciouEm;

    private static DateTime AgoraEmBrasilia()
    {
        try
        {
            return TimeZoneInfo.ConvertTimeFromUtc(DateTime.UtcNow, TimeZoneInfo.FindSystemTimeZoneById("America/Sao_Paulo"));
        }
        catch (TimeZoneNotFoundException)
        {
            return DateTime.UtcNow.AddHours(-3);
        }
    }

    private void ConferirReinicio()
    {
        var agora = AgoraEmBrasilia();
        var hoje = DateOnly.FromDateTime(agora);
        var reinicio = new DateTime(agora.Year, agora.Month, agora.Day, HoraDoReinicio, 0, 0);
        var faltam = (reinicio - agora).TotalMinutes;
        foreach (var minutos in MinutosDeAviso)
        {
            var chave = $"{hoje}:{minutos}";
            if (faltam > minutos || faltam <= minutos - 1 || !avisosDoReinicio.Add(chave)) continue;
            Server.PrintToChatAll($" \x04[Ilha Lemnos]\x02 A ilha reinicia em {minutos} {(minutos == 1 ? "minuto" : "minutos")}. Extraia antes ou volte a um posto!");
        }
        if (faltam > 0 || faltam < -5 || reiniciouEm == hoje) return;
        reiniciouEm = hoje;
        ReiniciarAgora();
    }

    private void ReiniciarAgora()
    {
        foreach (var jogador in Pessoas().ToList())
        {
            if (!naIlha.TryGetValue(jogador.SteamID, out var estado) || estado.Sessao == null || estado.JaSaiu) continue;
            estado.JaSaiu = true;
            var vivo = jogador.PawnIsAlive && jogador.PlayerPawn.Value?.AbsOrigin != null;
            Avisar("saida", new
            {
                sessao = estado.Sessao,
                referencia = NovaReferencia(),
                motivo = "saiu",
                naSafeZone = vivo && NoPosto(jogador.PlayerPawn.Value!.AbsOrigin!),
                gastas = estado.Gastas.ToList(),
                armas = vivo ? ArmasNaMao(jogador, estado) : new List<ArmaNaMao>(),
            });
        }
        Server.PrintToChatAll(" \x04[Ilha Lemnos]\x01 Reiniciando. Volte em alguns minutos!");
        var inicio = DateTime.UtcNow;
        AddTimer(1f, () => DesligarQuandoAFilaEsvaziar(inicio));
    }

    private void DesligarQuandoAFilaEsvaziar(DateTime inicio)
    {
        if (Volatile.Read(ref avisosPendentes) > 0 && (DateTime.UtcNow - inicio).TotalSeconds < SegundosEsperandoAFila)
        {
            AddTimer(1f, () => DesligarQuandoAFilaEsvaziar(inicio));
            return;
        }
        Server.ExecuteCommand("quit");
    }
}
