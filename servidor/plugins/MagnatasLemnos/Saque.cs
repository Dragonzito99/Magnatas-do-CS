using CounterStrikeSharp.API;
using CounterStrikeSharp.API.Core;
using CounterStrikeSharp.API.Modules.Timers;
using CounterStrikeSharp.API.Modules.Utils;

namespace MagnatasLemnos;

/// <summary>Uma coisa no chão: um item de saque, ou a mochila de quem morreu (com vários itens dentro).</summary>
public sealed class CoisaNoChao
{
    public CDynamicProp? Entidade { get; set; }
    public Vector Lugar { get; set; } = new(0, 0, 0);
    public List<string> Itens { get; set; } = new();
    /// <summary>De onde veio: o ponto de chão ou de caixa (para reaparecer noutro do mesmo tipo), ou null se é mochila.</summary>
    public bool? DeCaixa { get; set; }
    public DateTime? SomeEm { get; set; }
}

/// <summary>
/// O saque pelo mapa: comum no chão, raro (e às vezes lendário) nas caixas, dinheiro nos dois. Pega quem chega perto e
/// aperta E. O que foi pego reaparece em outro ponto de 5 a 10 minutos depois, porque a rodada nunca acaba.
/// </summary>
public partial class IlhaLemnos
{
    private const float DistanciaParaPegar = 80;
    private const int MinutosParaReaparecerMin = 5;
    private const int MinutosParaReaparecerMax = 10;
    private const int MinutosDaMochilaNoChao = 5;
    private const double ParteDoChaoComSaque = 0.5;

    private static readonly string[] Comuns = ["relogio", "celular", "radio"];
    private static readonly string[] Raros = ["joias", "notebook", "documentos"];
    private static readonly string[] Lendarios = ["barra_de_ouro", "maleta_de_diamantes"];
    private const string Dinheiro = "maco_de_notas";

    private static readonly Dictionary<string, string> NomeDoSaque = new()
    {
        ["relogio"] = "Relógio",
        ["celular"] = "Celular",
        ["radio"] = "Rádio",
        ["joias"] = "Joias",
        ["notebook"] = "Notebook",
        ["documentos"] = "Documentos",
        ["barra_de_ouro"] = "Barra de ouro",
        ["maleta_de_diamantes"] = "Maleta de diamantes",
        ["maco_de_notas"] = "Maço de notas",
    };

    private readonly List<CoisaNoChao> noChao = new();

    private static string Sortear(string[] lista) => lista[Random.Shared.Next(lista.Length)];

    /// <summary>Chão: 75% comum, 25% dinheiro. Caixa: 70% raro, 25% dinheiro, 5% lendário.</summary>
    private static string SortearSaque(bool deCaixa)
    {
        var sorte = Random.Shared.NextDouble();
        if (!deCaixa) return sorte < 0.75 ? Sortear(Comuns) : Dinheiro;
        if (sorte < 0.70) return Sortear(Raros);
        return sorte < 0.95 ? Dinheiro : Sortear(Lendarios);
    }

    private CDynamicProp? CriarObjeto(Vector lugar)
    {
        var objeto = Utilities.CreateEntityByName<CDynamicProp>("prop_dynamic");
        if (objeto == null) return null;
        // Tudo na criação, como nos outros plugins: trocar o modelo depois de nascer dava erro no servidor.
        var valores = new CEntityKeyValues();
        valores.SetString("model", Config.ModeloDoSaque);
        valores.SetVector("origin", lugar);
        valores.SetAngle("angles", new QAngle(0, Random.Shared.Next(0, 360), 0));
        valores.SetInt("solid", 0);
        objeto.DispatchSpawn(valores);
        return objeto;
    }

    private void EspalharSaque()
    {
        foreach (var coisa in noChao.Where(coisa => coisa.Entidade is { IsValid: true })) coisa.Entidade!.Remove();
        noChao.Clear();
        foreach (var ponto in mapa.Chao.Where(_ => Random.Shared.NextDouble() < ParteDoChaoComSaque)) PorSaque(ponto, deCaixa: false);
        foreach (var ponto in mapa.Caixas) PorSaque(ponto, deCaixa: true);
        Console.WriteLine($"[Lemnos] Saque espalhado: {noChao.Count} itens.");
    }

    private void PorSaque(Ponto ponto, bool deCaixa)
    {
        var lugar = new Vector(ponto.X, ponto.Y, ponto.Z);
        noChao.Add(new CoisaNoChao { Lugar = lugar, Itens = [SortearSaque(deCaixa)], DeCaixa = deCaixa, Entidade = CriarObjeto(lugar) });
    }

    /// <summary>Reaparece num ponto do mesmo tipo que esteja vazio.</summary>
    private void ReaparecerDepois(bool deCaixa)
    {
        var minutos = Random.Shared.Next(MinutosParaReaparecerMin, MinutosParaReaparecerMax + 1);
        AddTimer(minutos * 60f, () =>
        {
            var pontos = deCaixa ? mapa.Caixas : mapa.Chao;
            var livres = pontos.Where(ponto => !noChao.Any(coisa => Distancia(coisa.Lugar, ponto) < 1)).ToList();
            if (livres.Count > 0) PorSaque(livres[Random.Shared.Next(livres.Count)], deCaixa);
        }, TimerFlags.STOP_ON_MAPCHANGE);
    }

    /// <summary>A mochila de quem morreu ou saiu fora do posto fica no chão por 5 minutos, para quem passar.</summary>
    private void DeixarMochilaNoChao(Vector lugar, List<string> itens)
    {
        if (itens.Count == 0) return;
        noChao.Add(new CoisaNoChao { Lugar = lugar, Itens = itens.ToList(), Entidade = CriarObjeto(lugar), SomeEm = DateTime.UtcNow.AddMinutes(MinutosDaMochilaNoChao) });
    }

    private void RecriarOQueEstaNoChao()
    {
        foreach (var coisa in noChao)
        {
            if (coisa.Entidade is { IsValid: true }) continue;
            coisa.Entidade = CriarObjeto(coisa.Lugar);
        }
    }

    private void Tirar(CoisaNoChao coisa)
    {
        if (coisa.Entidade is { IsValid: true }) coisa.Entidade.Remove();
        noChao.Remove(coisa);
    }

    /// <summary>Apertou E perto de algo: vai para a mochila até encher.</summary>
    private void TentarPegar(CCSPlayerController jogador, NaIlha estado, Vector lugar)
    {
        var perto = noChao.Where(coisa => Distancia(lugar, new Ponto { X = coisa.Lugar.X, Y = coisa.Lugar.Y, Z = coisa.Lugar.Z }) <= DistanciaParaPegar)
            .OrderBy(coisa => Distancia(lugar, new Ponto { X = coisa.Lugar.X, Y = coisa.Lugar.Y, Z = coisa.Lugar.Z }))
            .FirstOrDefault();
        if (perto == null) return;
        var pegou = 0;
        while (perto.Itens.Count > 0)
        {
            if (estado.Mochila.Count >= estado.Espacos)
            {
                jogador.PrintToCenterHtml($"<font color='#ff5a5a'>Mochila cheia ({estado.Mochila.Count}/{estado.Espacos})</font>", 2);
                break;
            }
            estado.Mochila.Add(perto.Itens[0]);
            perto.Itens.RemoveAt(0);
            pegou++;
        }
        if (perto.Itens.Count == 0)
        {
            Tirar(perto);
            if (perto.DeCaixa is { } deCaixa) ReaparecerDepois(deCaixa);
        }
        if (pegou > 0) MostrarMochila(jogador, estado);
    }

    private void TirarMochilasVencidas()
    {
        var agora = DateTime.UtcNow;
        foreach (var coisa in noChao.Where(coisa => coisa.SomeEm <= agora).ToList()) Tirar(coisa);
    }
}
