using System.Text.Json;
using System.Text.Json.Serialization;
using CounterStrikeSharp.API;
using CounterStrikeSharp.API.Core;
using CounterStrikeSharp.API.Modules.Commands;
using CounterStrikeSharp.API.Modules.Utils;

namespace MagnatasVisual;

/// <summary>Uma placa guardada: onde fica, para onde olha, o tamanho e qual imagem.</summary>
public sealed class BannerSalvo
{
    [JsonPropertyName("x")] public float X { get; set; }
    [JsonPropertyName("y")] public float Y { get; set; }
    [JsonPropertyName("z")] public float Z { get; set; }
    [JsonPropertyName("giro")] public float Giro { get; set; }
    [JsonPropertyName("escala")] public float Escala { get; set; }
    [JsonPropertyName("imagem")] public string Imagem { get; set; } = "logo";
    /// <summary>Sem a luz do mapa: sempre clara, como um painel iluminado.</summary>
    [JsonPropertyName("luz")] public bool Luz { get; set; } = true;
}

/// <summary>
/// Banners nos mapas (teste pedido pelo dono em 12/11/2026). Uma placa fina com a imagem é posta na frente de um painel
/// do mapa. O Adm marca os dois cantos do painel com !banner canto, e o plugin acha a parede, o centro e o tamanho. As
/// placas ficam guardadas por mapa e voltam a cada rodada. As imagens vêm de um pacote da Oficina (ferramentas/banner).
/// </summary>
public partial class MagnatasVisual
{
    // Item da Oficina com as placas, publicado pelo dono em 12/11/2026. Em teste só no Equipe x Equipe (mm_extra_addons).
    private const string PacoteDosBanners = "3838522884";
    private const string PastaDosBanners = "models/magnatas/banner_v1";
    private static readonly string[] ImagensDosBanners = ["logo"];
    // A placa do pacote mede 192 x 64 e olha para +X (ver ferramentas/banner/montar_banner.py).
    private const float LarguraDaPlaca = 192f;
    private const float AlturaDaPlaca = 64f;
    // Um pouco na frente da parede, para as duas superfícies não piscarem uma por cima da outra.
    private const float AfastamentoDaParede = 0.6f;

    private Dictionary<string, List<BannerSalvo>> banners = new();
    private readonly List<CDynamicProp> placas = new();
    private readonly Dictionary<ulong, (Vector Ponto, Vector Normal)> primeirosCantos = new();
    private bool? pacoteDosBannersNoServidor;

    private static string ArquivoDosBanners => Path.Combine(Server.GameDirectory, "csgo", "magnatas_banners.json");

    private static string ModeloDoBanner(BannerSalvo banner) => $"{PastaDosBanners}/{banner.Imagem}{(banner.Luz ? "_luz" : "")}.vmdl";

    private void CarregarBanners()
    {
        try
        {
            if (File.Exists(ArquivoDosBanners))
                banners = JsonSerializer.Deserialize<Dictionary<string, List<BannerSalvo>>>(File.ReadAllText(ArquivoDosBanners)) ?? new();
        }
        catch (Exception erro) when (erro is IOException or JsonException or UnauthorizedAccessException)
        {
            Console.WriteLine($"[Magnatas] Não deu para ler os banners: {erro.GetType().Name}.");
        }
        AddCommand("css_banner", "Banners nos mapas (Adm): !banner canto, !banner luz, !banner limpar", ComandoDoBanner);
        RegisterListener<Listeners.OnMapStart>(_ =>
        {
            pacoteDosBannersNoServidor = null;
            placas.Clear();
            primeirosCantos.Clear();
        });
        RegisterEventHandler<EventRoundStart>((_, _) =>
        {
            // A rodada nova limpa o que o plugin criou; as placas voltam logo depois.
            Server.NextFrame(ColocarPlacas);
            return HookResult.Continue;
        });
    }

    private void SalvarBanners()
    {
        try
        {
            File.WriteAllText(ArquivoDosBanners, JsonSerializer.Serialize(banners, new JsonSerializerOptions { WriteIndented = true }));
        }
        catch (Exception erro) when (erro is IOException or UnauthorizedAccessException)
        {
            Console.WriteLine($"[Magnatas] Não deu para guardar os banners: {erro.GetType().Name}.");
        }
    }

    /// <summary>Na Mutação ainda não: lá o pacote dos personagens já fechou o jogo de jogadores, e o teste vai devagar.</summary>
    private bool BannersNoServidor()
    {
        if (PacoteDosBanners == "" || NaMutacao()) return false;
        pacoteDosBannersNoServidor ??= NoPacote(PacoteDosBanners, PastaDosBanners);
        return pacoteDosBannersNoServidor.Value;
    }

    private void PrepararBanners(ResourceManifest manifesto)
    {
        if (!BannersNoServidor()) return;
        foreach (var imagem in ImagensDosBanners)
        {
            manifesto.AddResource($"{PastaDosBanners}/{imagem}.vmdl");
            manifesto.AddResource($"{PastaDosBanners}/{imagem}_luz.vmdl");
        }
    }

    private void ColocarPlacas()
    {
        foreach (var placa in placas.Where(placa => placa.IsValid)) placa.Remove();
        placas.Clear();
        if (!BannersNoServidor() || !banners.TryGetValue(Server.MapName, out var doMapa)) return;
        foreach (var banner in doMapa) ColocarPlaca(banner);
    }

    private void ColocarPlaca(BannerSalvo banner)
    {
        var placa = Utilities.CreateEntityByName<CDynamicProp>("prop_dynamic");
        if (placa == null) return;
        // Tudo na criação, como a queda do mutante e os gestos.
        var valores = new CEntityKeyValues();
        valores.SetString("model", ModeloDoBanner(banner));
        valores.SetVector("origin", new Vector(banner.X, banner.Y, banner.Z));
        valores.SetAngle("angles", new QAngle(0, banner.Giro, 0));
        valores.SetInt("solid", 0);
        placa.DispatchSpawn(valores);
        // A placa é estática e sem esqueleto animado: aumentar ou diminuir é só o tamanho do nó dela.
        var no = placa.CBodyComponent?.SceneNode;
        if (no != null)
        {
            no.Scale = banner.Escala;
            Utilities.SetStateChanged(placa, "CBaseEntity", "m_CBodyComponent");
        }
        placas.Add(placa);
    }

    private void ComandoDoBanner(CCSPlayerController? jogador, CommandInfo comando)
    {
        if (jogador is not { IsValid: true } || !visuais.TryGetValue(jogador.SteamID, out var visual) || !visual.Adm)
        {
            comando.ReplyToCommand(" Só Adm usa o !banner.");
            return;
        }
        if (!BannersNoServidor())
        {
            comando.ReplyToCommand(NaMutacao() ? " Banner ainda não vale na Mutação." : " O pacote dos banners ainda não está neste servidor.");
            return;
        }
        var mapa = Server.MapName;
        switch (comando.ArgCount > 1 ? comando.GetArg(1).ToLowerInvariant() : "")
        {
            case "canto":
                MarcarCanto(jogador, comando);
                break;
            case "luz":
                if (!banners.TryGetValue(mapa, out var doMapa) || doMapa.Count == 0)
                {
                    comando.ReplyToCommand(" Este mapa não tem banner.");
                    return;
                }
                var luz = !doMapa[^1].Luz;
                foreach (var banner in doMapa) banner.Luz = luz;
                SalvarBanners();
                ColocarPlacas();
                comando.ReplyToCommand(luz ? " Banners sem a luz do mapa (sempre claros)." : " Banners com a luz do mapa.");
                break;
            case "limpar":
                banners.Remove(mapa);
                SalvarBanners();
                ColocarPlacas();
                comando.ReplyToCommand(" Banners deste mapa apagados.");
                break;
            default:
                comando.ReplyToCommand(" !banner canto: mire num canto do painel e depois no canto oposto. !banner luz: troca o brilho. !banner limpar: apaga os deste mapa.");
                break;
        }
    }

    /// <summary>Primeiro canto fica guardado; com o segundo, a placa nasce no meio dos dois, do tamanho do painel.</summary>
    private void MarcarCanto(CCSPlayerController jogador, CommandInfo comando)
    {
        var corpo = jogador.PlayerPawn.Value;
        if (corpo is not { IsValid: true } || corpo.AbsOrigin == null || !jogador.PawnIsAlive)
        {
            comando.ReplyToCommand(" Precisa estar vivo para mirar.");
            return;
        }
        var olho = new Vector(corpo.AbsOrigin.X, corpo.AbsOrigin.Y, corpo.AbsOrigin.Z + corpo.ViewOffset.Z);
        var mira = Trace.TraceShape(olho, corpo.EyeAngles, corpo, new TraceOptions { InteractsWith = Masks.Shot });
        if (!mira.DidHit())
        {
            comando.ReplyToCommand(" Mire numa parede.");
            return;
        }
        var ponto = mira.EndPos;
        var normal = mira.Normal;
        if (MathF.Abs(normal.Z) > 0.3f)
        {
            comando.ReplyToCommand(" Mire numa parede em pé, não no chão nem no teto.");
            return;
        }
        if (!primeirosCantos.Remove(jogador.SteamID, out var primeiro))
        {
            primeirosCantos[jogador.SteamID] = (ponto, normal);
            comando.ReplyToCommand(" Primeiro canto marcado. Mire no canto oposto e digite !banner canto de novo.");
            return;
        }

        // A parede é a média das duas miras, deitada: a placa fica sempre em pé.
        var nx = primeiro.Normal.X + normal.X;
        var ny = primeiro.Normal.Y + normal.Y;
        var tamanhoDaNormal = MathF.Sqrt(nx * nx + ny * ny);
        if (tamanhoDaNormal < 0.5f)
        {
            comando.ReplyToCommand(" Os dois cantos ficaram em paredes diferentes. Marque de novo.");
            return;
        }
        nx /= tamanhoDaNormal;
        ny /= tamanhoDaNormal;
        // Para quem olha a parede de frente, a direita é (-ny, nx); é para onde a placa estende a largura.
        var largura = MathF.Abs((ponto.X - primeiro.Ponto.X) * -ny + (ponto.Y - primeiro.Ponto.Y) * nx);
        var altura = MathF.Abs(ponto.Z - primeiro.Ponto.Z);
        if (largura < 16 || altura < 8)
        {
            comando.ReplyToCommand(" Os cantos ficaram muito perto. Marque um canto de cada lado do painel.");
            return;
        }
        var banner = new BannerSalvo
        {
            X = (ponto.X + primeiro.Ponto.X) / 2 + nx * AfastamentoDaParede,
            Y = (ponto.Y + primeiro.Ponto.Y) / 2 + ny * AfastamentoDaParede,
            Z = (ponto.Z + primeiro.Ponto.Z) / 2,
            Giro = MathF.Atan2(ny, nx) * 180f / MathF.PI,
            // Cabe inteira no painel, sem esticar a imagem.
            Escala = MathF.Min(largura / LarguraDaPlaca, altura / AlturaDaPlaca),
        };
        var mapa = Server.MapName;
        if (!banners.TryGetValue(mapa, out var doMapa)) banners[mapa] = doMapa = new();
        doMapa.Add(banner);
        SalvarBanners();
        ColocarPlaca(banner);
        Console.WriteLine($"[Magnatas] Banner em {mapa}: {largura:0} x {altura:0}, escala {banner.Escala:0.00}.");
        comando.ReplyToCommand($" Banner colocado ({largura:0} x {altura:0}). Não gostou? !banner limpar e marque de novo.");
    }
}
