using CounterStrikeSharp.API;
using CounterStrikeSharp.API.Core;

namespace MagnatasLemnos;

/// <summary>
/// O reinício diário às 5h de Brasília, para as atualizações do CS2 e para limpar a memória. Avisa aos 10, 5 e 1 minuto;
/// às 5h desliga, e o site fecha as sessões como queda no próximo início (a mochila não extraída se perde, as armas
/// voltam ao baú). O site religa sozinho, porque a ilha é sempre ligada.
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
            Server.PrintToChatAll($" \x04[Ilha Lemnos]\x02 A ilha reinicia em {minutos} {(minutos == 1 ? "minuto" : "minutos")}. Extraia antes: o que estiver na mochila se perde. As armas voltam ao baú.");
        }
        if (faltam > 0 || faltam < -5 || reiniciouEm == hoje) return;
        reiniciouEm = hoje;
        ReiniciarAgora();
    }

    /// <summary>
    /// Não avisa a saída: no próximo início o site fecha as sessões como queda, e as armas e granadas voltam ao baú. O
    /// que estava na mochila se perde, porque não foi extraído. Antes de desligar, espera a fila mandar o que já tinha.
    /// </summary>
    private void ReiniciarAgora()
    {
        // Ninguém avisa saída ao cair do servidor: senão quem está fora do posto perderia as armas como numa morte.
        foreach (var estado in naIlha.Values) estado.JaSaiu = true;
        Server.PrintToChatAll(" \x04[Ilha Lemnos]\x01 Reiniciando. Suas armas voltam ao baú. Volte em alguns minutos!");
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
