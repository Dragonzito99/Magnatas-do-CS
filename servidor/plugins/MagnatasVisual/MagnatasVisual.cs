using System.Net.Http.Headers;
using System.Text.Json;
using System.Text.Json.Serialization;
using CounterStrikeSharp.API;
using CounterStrikeSharp.API.Core;
using CounterStrikeSharp.API.Modules.Commands;
using CounterStrikeSharp.API.Modules.Cvars;
using CounterStrikeSharp.API.Modules.Utils;

namespace MagnatasVisual;

/// <summary>Gravada pelo compilar_plugin.sh com o endereço do site e o token dos servidores.</summary>
public class ConfiguracaoDoVisual : BasePluginConfig
{
    /// <summary>Sem endereço ou token, o plugin não faz nada e o chat fica como o do jogo.</summary>
    [JsonPropertyName("SiteUrl")]
    public string SiteUrl { get; set; } = "";

    [JsonPropertyName("Token")]
    public string Token { get; set; } = "";
}

/// <summary>O que o site responde para cada conta: só o resultado pronto, sem saldo nem preço.</summary>
public sealed class Visual
{
    [JsonPropertyName("cor")]
    public string? Cor { get; init; }

    [JsonPropertyName("etiqueta")]
    public string? Etiqueta { get; init; }

    [JsonPropertyName("aviso")]
    public bool Aviso { get; init; }
}

/// <summary>
/// A Magnata Shop no jogo: cor do nome e etiqueta no chat, e o aviso quando o jogador entra. Instalado no competitivo;
/// a Diversão copia os addons do competitivo a cada início, então vale nos dois. Nunca mexe em arma, skin ou inventário.
/// </summary>
public class MagnatasVisual : BasePlugin, IPluginConfig<ConfiguracaoDoVisual>
{
    public override string ModuleName => "Magnatas: visual da loja";
    public override string ModuleVersion => "1.0.0";

    // Prazo curto: se o site demorar, o jogador fala com o nome normal e o jogo segue.
    private static readonly HttpClient Site = new() { Timeout = TimeSpan.FromSeconds(3) };

    // Só as cores que o chat do CS2 mostra, com os nomes que o site manda.
    private static readonly Dictionary<string, char> Cores = new()
    {
        ["Red"] = ChatColors.Red,
        ["Green"] = ChatColors.Green,
        ["Blue"] = ChatColors.Blue,
        ["Purple"] = ChatColors.Purple,
        ["Gold"] = ChatColors.Gold,
        ["Orange"] = ChatColors.Orange,
        ["Magenta"] = ChatColors.Magenta,
        ["LightBlue"] = ChatColors.LightBlue,
    };

    // Lidos e escritos só na linha principal do servidor.
    private readonly Dictionary<ulong, Visual> visuais = new();
    private readonly HashSet<ulong> avisados = new();

    public ConfiguracaoDoVisual Config { get; set; } = new();

    public void OnConfigParsed(ConfiguracaoDoVisual config)
    {
        Config = config;
    }

    public override void Load(bool hotReload)
    {
        AddCommandListener("say", AoFalar, HookMode.Pre);
        AddCommandListener("say_team", AoFalar, HookMode.Pre);
        RegisterEventHandler<EventPlayerConnectFull>(AoEntrar);
        RegisterEventHandler<EventRoundStart>(AoComecarRodada);
        RegisterEventHandler<EventPlayerDisconnect>(AoSair);
    }

    private static IEnumerable<CCSPlayerController> Pessoas() =>
        Utilities.GetPlayers().Where(jogador => jogador is { IsValid: true, IsBot: false, IsHLTV: false } && jogador.SteamID > 0);

    private HookResult AoEntrar(EventPlayerConnectFull evento, GameEventInfo informacao)
    {
        var jogador = evento.Userid;
        if (jogador is { IsValid: true, IsBot: false } && jogador.SteamID > 0) _ = BuscarVisuais([jogador.SteamID], avisar: true);
        return HookResult.Continue;
    }

    private HookResult AoComecarRodada(EventRoundStart evento, GameEventInfo informacao)
    {
        var contas = Pessoas().Select(jogador => jogador.SteamID).ToList();
        if (contas.Count > 0) _ = BuscarVisuais(contas, avisar: false);
        return HookResult.Continue;
    }

    private HookResult AoSair(EventPlayerDisconnect evento, GameEventInfo informacao)
    {
        var jogador = evento.Userid;
        if (jogador is { IsValid: true } && jogador.SteamID > 0)
        {
            avisados.Remove(jogador.SteamID);
            visuais.Remove(jogador.SteamID);
        }
        return HookResult.Continue;
    }

    /// <summary>Pergunta ao site o que as contas estão usando. Erro de rede vira só uma linha no log.</summary>
    private async Task BuscarVisuais(List<ulong> contas, bool avisar)
    {
        if (Config.SiteUrl == "" || Config.Token == "") return;
        try
        {
            var endereco = $"{Config.SiteUrl.TrimEnd('/')}/api/servidor/visuais?steamids={string.Join(",", contas)}";
            using var pedido = new HttpRequestMessage(HttpMethod.Get, endereco);
            pedido.Headers.Authorization = new AuthenticationHeaderValue("Bearer", Config.Token);
            using var resposta = await Site.SendAsync(pedido);
            if (!resposta.IsSuccessStatusCode)
            {
                Console.WriteLine($"[Magnatas] O site recusou os visuais: {(int)resposta.StatusCode}.");
                return;
            }
            var dados = JsonSerializer.Deserialize<Dictionary<string, Visual>>(await resposta.Content.ReadAsStringAsync()) ?? new();
            Server.NextFrame(() => Guardar(contas, dados, avisar));
        }
        catch (Exception erro)
        {
            Console.WriteLine($"[Magnatas] Falha ao buscar os visuais: {erro.GetType().Name}.");
        }
    }

    private void Guardar(List<ulong> contas, Dictionary<string, Visual> dados, bool avisar)
    {
        foreach (var conta in contas)
        {
            if (dados.TryGetValue(conta.ToString(), out var visual)) visuais[conta] = visual;
            else visuais.Remove(conta);
        }
        if (!avisar) return;
        foreach (var jogador in Pessoas().Where(pessoa => contas.Contains(pessoa.SteamID)))
        {
            if (!visuais.TryGetValue(jogador.SteamID, out var visual) || !visual.Aviso || !avisados.Add(jogador.SteamID)) continue;
            Server.PrintToChatAll($" {ChatColors.Gold}★ {CorDoNome(visual)}{jogador.PlayerName}{ChatColors.Gold} chegou");
        }
    }

    private static char CorDoNome(Visual visual) => visual.Cor != null && Cores.TryGetValue(visual.Cor, out var cor) ? cor : ChatColors.Default;

    /// <summary>Reescreve a mensagem com etiqueta e cor. Comando e jogador sem item passam como o jogo mandou.</summary>
    private HookResult AoFalar(CCSPlayerController? jogador, CommandInfo comando)
    {
        if (jogador is not { IsValid: true, IsBot: false } || jogador.SteamID == 0) return HookResult.Continue;
        var mensagem = (comando.ArgCount > 2 ? comando.ArgString : comando.GetArg(1)).Trim().Trim('"').Trim();
        if (mensagem.Length == 0) return HookResult.Continue;
        // Comandos do MatchZy (.ready), da Diversão (!algo) e silenciosos (/algo) seguem para quem os trata.
        if (mensagem[0] is '.' or '!' or '/') return HookResult.Continue;
        if (!visuais.TryGetValue(jogador.SteamID, out var visual)) return HookResult.Continue;
        if (visual.Cor == null && visual.Etiqueta == null) return HookResult.Continue;

        var doTime = comando.GetArg(0) == "say_team";
        var morto = !jogador.PawnIsAlive && jogador.Team is CsTeam.Terrorist or CsTeam.CounterTerrorist;
        var prefixo = (morto ? $"{ChatColors.Grey}*MORTO* " : "") + (doTime ? $"{ChatColors.Grey}(Time) " : "");
        var etiqueta = visual.Etiqueta != null ? $"{ChatColors.Gold}{visual.Etiqueta} " : "";
        var linha = $" {prefixo}{etiqueta}{CorDoNome(visual)}{jogador.PlayerName}{ChatColors.Default}: {mensagem}";

        // Como o jogo: morto fala só com mortos e espectadores, a não ser que o servidor libere (sv_deadtalk).
        var mortoFalaComTodos = ConVar<bool>.Find("sv_deadtalk")?.Value ?? false;
        foreach (var ouvinte in Pessoas())
        {
            if (doTime && ouvinte.Team != jogador.Team) continue;
            if (morto && !mortoFalaComTodos && ouvinte.PawnIsAlive && ouvinte.Team is CsTeam.Terrorist or CsTeam.CounterTerrorist) continue;
            ouvinte.PrintToChat(linha);
        }
        return HookResult.Handled;
    }
}
