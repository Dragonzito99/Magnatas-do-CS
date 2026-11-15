using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;
using System.Text.Json.Serialization;
using System.Threading.Channels;
using CounterStrikeSharp.API;

namespace MagnatasLemnos;

public sealed class PecaDoKit
{
    [JsonPropertyName("linha")] public string? Linha { get; set; }
    [JsonPropertyName("classe")] public string Classe { get; set; } = "";
    [JsonPropertyName("magcoin")] public bool Magcoin { get; set; }
    [JsonPropertyName("gratis")] public bool Gratis { get; set; }
}

public sealed class KitDaEntrada
{
    [JsonPropertyName("principal")] public PecaDoKit? Principal { get; set; }
    [JsonPropertyName("secundaria")] public PecaDoKit Secundaria { get; set; } = new();
    [JsonPropertyName("granadas")] public List<PecaDoKit> Granadas { get; set; } = new();
    [JsonPropertyName("espacos")] public int Espacos { get; set; } = 8;
}

public sealed class RespostaDaEntrada
{
    [JsonPropertyName("ok")] public bool Ok { get; set; }
    [JsonPropertyName("sessao")] public string? Sessao { get; set; }
    [JsonPropertyName("kit")] public KitDaEntrada? Kit { get; set; }
    [JsonPropertyName("adm")] public bool Adm { get; set; }
    [JsonPropertyName("motivo")] public string? Motivo { get; set; }
    [JsonPropertyName("ate")] public string? Ate { get; set; }
}

public sealed class RespostaDoRenascer
{
    [JsonPropertyName("kit")] public KitDaEntrada? Kit { get; set; }
}

public sealed class LinhaNova
{
    [JsonPropertyName("classe")] public string Classe { get; set; } = "";
    [JsonPropertyName("linha")] public string Linha { get; set; } = "";
}

public sealed class RespostaDaExtracao
{
    [JsonPropertyName("linhasNovas")] public List<LinhaNova> LinhasNovas { get; set; } = new();
    [JsonPropertyName("grana")] public int Grana { get; set; }
}

/// <summary>Uma arma na mão, como o site espera: a linha do baú, ou nula para arma achada no mapa.</summary>
public sealed class ArmaNaMao
{
    [JsonPropertyName("linha")] public string? Linha { get; set; }
    [JsonPropertyName("classe")] public string Classe { get; set; } = "";
}

/// <summary>
/// A fila de avisos ao site. Uma só, em ordem: a morte nunca chega antes da entrada. Erro do site ou da rede repete com
/// espera crescente por até 10 minutos; recusa do site (4xx) não se repete. Toda referência é única, então repetir é seguro.
/// </summary>
public partial class IlhaLemnos
{
    private static readonly TimeSpan PrazoDaFila = TimeSpan.FromMinutes(10);
    private static readonly HttpClient Site = new() { Timeout = TimeSpan.FromSeconds(10) };

    private sealed record Aviso(string Nome, string Corpo, DateTime Criado, Action<string?>? Depois);

    private readonly Channel<Aviso> fila = Channel.CreateUnbounded<Aviso>(new UnboundedChannelOptions { SingleReader = true });
    private CancellationTokenSource? pararFila;
    private int avisosPendentes;

    private string NovaReferencia() => $"lemnos:{Config.Porta}:{Guid.NewGuid():N}";

    private void LigarFila()
    {
        pararFila = new CancellationTokenSource();
        var fim = pararFila.Token;
        _ = Task.Run(() => EsvaziarFila(fim));
    }

    private void DesligarFila()
    {
        pararFila?.Cancel();
    }

    /// <summary>Põe um aviso na fila. A resposta (ou null, se não deu) volta no jogo, no próximo quadro.</summary>
    private void Avisar(string nome, object corpo, Action<string?>? depois = null)
    {
        Interlocked.Increment(ref avisosPendentes);
        fila.Writer.TryWrite(new Aviso(nome, JsonSerializer.Serialize(corpo), DateTime.UtcNow, depois));
    }

    private async Task EsvaziarFila(CancellationToken fim)
    {
        try
        {
            await foreach (var aviso in fila.Reader.ReadAllAsync(fim))
            {
                // Um erro num aviso (ou na resposta dele) não pode parar a fila: os seguintes continuam saindo.
                try
                {
                    var resposta = await Enviar(aviso, fim);
                    if (aviso.Depois is { } depois)
                    {
                        await Server.NextFrameAsync(() =>
                        {
                            try
                            {
                                depois(resposta);
                            }
                            catch (Exception erro)
                            {
                                Console.WriteLine($"[Lemnos] Falha ao tratar a resposta de {aviso.Nome}: {erro.GetType().Name}.");
                            }
                        });
                    }
                }
                catch (OperationCanceledException) when (fim.IsCancellationRequested)
                {
                    throw;
                }
                catch (Exception erro)
                {
                    Console.WriteLine($"[Lemnos] Falha no aviso {aviso.Nome}: {erro.GetType().Name}.");
                }
                finally
                {
                    Interlocked.Decrement(ref avisosPendentes);
                }
            }
        }
        catch (OperationCanceledException)
        {
            // O plugin foi descarregado.
        }
    }

    private async Task<string?> Enviar(Aviso aviso, CancellationToken fim)
    {
        if (Config.SiteUrl == "" || Config.Token == "") return null;
        var espera = TimeSpan.FromSeconds(2);
        while (true)
        {
            try
            {
                using var pedido = new HttpRequestMessage(HttpMethod.Post, $"{Config.SiteUrl.TrimEnd('/')}/api/servidor/lemnos/{aviso.Nome}")
                {
                    Content = new StringContent(aviso.Corpo, Encoding.UTF8, "application/json"),
                };
                pedido.Headers.Authorization = new AuthenticationHeaderValue("Bearer", Config.Token);
                using var resposta = await Site.SendAsync(pedido, fim);
                if (resposta.IsSuccessStatusCode) return await resposta.Content.ReadAsStringAsync(fim);
                Console.WriteLine($"[Lemnos] O site recusou o aviso {aviso.Nome}: {(int)resposta.StatusCode}.");
                // Pedido recusado continuaria recusado. Só vale tentar de novo quando o erro é do site.
                if ((int)resposta.StatusCode < 500) return null;
            }
            catch (OperationCanceledException) when (fim.IsCancellationRequested)
            {
                throw;
            }
            catch (Exception erro)
            {
                Console.WriteLine($"[Lemnos] Falha ao avisar {aviso.Nome}: {erro.GetType().Name}.");
            }
            if (DateTime.UtcNow - aviso.Criado > PrazoDaFila)
            {
                Console.WriteLine($"[Lemnos] Aviso {aviso.Nome} descartado depois de 10 minutos sem resposta.");
                return null;
            }
            await Task.Delay(espera, fim);
            espera = TimeSpan.FromSeconds(Math.Min(espera.TotalSeconds * 2, 60));
        }
    }
}
