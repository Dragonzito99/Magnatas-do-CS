using System.Text.Json;
using System.Text.Json.Serialization;
using CounterStrikeSharp.API;
using CounterStrikeSharp.API.Core;
using CounterStrikeSharp.API.Modules.Utils;

namespace MagnatasLemnos;

public sealed class Ponto
{
    [JsonPropertyName("x")] public float X { get; set; }
    [JsonPropertyName("y")] public float Y { get; set; }
    [JsonPropertyName("z")] public float Z { get; set; }
    /// <summary>Só nos postos e nas saídas: até onde vale a área.</summary>
    [JsonPropertyName("raio")] public float Raio { get; set; }
}

/// <summary>O arquivo do mapa: postos dos Magnatas (safe zones), saídas, caixas e pontos de chão.</summary>
public sealed class MapaDaIlha
{
    [JsonPropertyName("safeZones")] public List<Ponto> SafeZones { get; set; } = new();
    [JsonPropertyName("saidas")] public List<Ponto> Saidas { get; set; } = new();
    [JsonPropertyName("caixas")] public List<Ponto> Caixas { get; set; } = new();
    [JsonPropertyName("chao")] public List<Ponto> Chao { get; set; } = new();
}

/// <summary>
/// Os postos dos Magnatas: dentro deles ninguém leva nem causa dano, e quem saiu não volta (dono). Quem tenta voltar é
/// posto de novo do lado de fora.
/// </summary>
public partial class IlhaLemnos
{
    private MapaDaIlha mapa = new();

    private void CarregarMapa()
    {
        try
        {
            if (Config.ArquivoDoMapa != "" && File.Exists(Config.ArquivoDoMapa))
                mapa = JsonSerializer.Deserialize<MapaDaIlha>(File.ReadAllText(Config.ArquivoDoMapa)) ?? new();
        }
        catch (Exception erro) when (erro is IOException or JsonException or UnauthorizedAccessException)
        {
            Console.WriteLine($"[Lemnos] Não deu para ler o arquivo do mapa: {erro.GetType().Name}.");
        }
        Console.WriteLine($"[Lemnos] Mapa: {mapa.SafeZones.Count} postos, {mapa.Saidas.Count} saídas, {mapa.Caixas.Count} caixas, {mapa.Chao.Count} pontos de chão.");
    }

    private static float Distancia(Vector lugar, Ponto ponto)
    {
        var dx = lugar.X - ponto.X;
        var dy = lugar.Y - ponto.Y;
        var dz = lugar.Z - ponto.Z;
        return MathF.Sqrt(dx * dx + dy * dy + dz * dz);
    }

    private bool NoPosto(Vector lugar) => mapa.SafeZones.Any(posto => Distancia(lugar, posto) <= posto.Raio);

    private Ponto? SaidaEm(Vector lugar) => mapa.Saidas.FirstOrDefault(saida => Distancia(lugar, saida) <= saida.Raio);

    private void IrParaUmPosto(CCSPlayerController jogador)
    {
        if (mapa.SafeZones.Count == 0 || jogador.PlayerPawn.Value is not { } corpo) return;
        var posto = mapa.SafeZones[Random.Shared.Next(mapa.SafeZones.Count)];
        // Um pouco espalhado, para dois que chegam juntos não nascerem um dentro do outro.
        var x = posto.X + Random.Shared.Next(-48, 49);
        var y = posto.Y + Random.Shared.Next(-48, 49);
        corpo.Teleport(new Vector(x, y, posto.Z + 8), corpo.AbsRotation, new Vector(0, 0, 0));
    }

    /// <summary>Dentro do posto, ninguém leva nem causa dano.</summary>
    private HookResult AoReceberDano(CBaseEntity alvo, CTakeDamageInfo dano)
    {
        try
        {
            if (alvo.DesignerName != "player") return HookResult.Continue;
            if (alvo.AbsOrigin is { } lugarDoAlvo && NoPosto(lugarDoAlvo)) return HookResult.Handled;
            if (dano.Attacker.Value is { DesignerName: "player" } autor && new CCSPlayerPawn(autor.Handle).AbsOrigin is { } lugarDoAutor && NoPosto(lugarDoAutor))
                return HookResult.Handled;
            return HookResult.Continue;
        }
        catch (Exception erro)
        {
            Console.WriteLine($"[Lemnos] Falha no gancho de dano: {erro.GetType().Name}.");
            return HookResult.Continue;
        }
    }

    /// <summary>A cada passo: quem saiu do posto fica marcado; quem tenta voltar volta para fora.</summary>
    private void ConferirPosto(CCSPlayerController jogador, NaIlha estado, CCSPlayerPawn corpo, Vector lugar)
    {
        if (!NoPosto(lugar))
        {
            estado.SaiuDoPosto = true;
            estado.UltimoLugarFora = Copia(lugar);
            return;
        }
        if (!estado.SaiuDoPosto || estado.UltimoLugarFora is not { } fora) return;
        corpo.Teleport(fora, corpo.AbsRotation, new Vector(0, 0, 0));
        jogador.PrintToCenterHtml("<font color='#ff5a5a'>O posto não abre para quem já saiu.</font>", 2);
    }
}
