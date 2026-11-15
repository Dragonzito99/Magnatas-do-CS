using System.Text.Json;
using System.Text.Json.Serialization;
using CounterStrikeSharp.API;
using CounterStrikeSharp.API.Core;
using CounterStrikeSharp.API.Modules.Commands;
using CounterStrikeSharp.API.Modules.Timers;
using CounterStrikeSharp.API.Modules.Utils;

namespace MagnatasLemnos;

/// <summary>Gravada pelo iniciar_diversao.sh, só o usuário cs2 lê (leva o token do site).</summary>
public class ConfiguracaoDaIlha : BasePluginConfig
{
    [JsonPropertyName("SiteUrl")]
    public string SiteUrl { get; set; } = "";

    [JsonPropertyName("Token")]
    public string Token { get; set; } = "";

    [JsonPropertyName("Porta")]
    public int Porta { get; set; }

    /// <summary>Postos, saídas, caixas e pontos de chão do mapa. O !marcar do Adm escreve nele.</summary>
    [JsonPropertyName("ArquivoDoMapa")]
    public string ArquivoDoMapa { get; set; } = "";

    /// <summary>O objeto que aparece no chão para o saque e a mochila de quem morreu. Escolhido no teste do Laboratório.</summary>
    [JsonPropertyName("ModeloDoSaque")]
    public string ModeloDoSaque { get; set; } = "models/props/de_dust/hr_dust/dust_crates/dust_crate_style_01_32x32x32.vmdl";
}

/// <summary>O que cada pessoa está fazendo na ilha agora. Some quando ela sai do servidor.</summary>
public sealed class NaIlha
{
    public string? Sessao { get; set; }
    public bool Adm { get; set; }
    public int Espacos { get; set; } = 8;
    public KitDaEntrada? KitPendente { get; set; }
    /// <summary>A entidade de cada arma ou granada do kit e as peças dela (duas flashes ficam na mesma entidade).</summary>
    public Dictionary<uint, List<PecaDoKit>> ArmasDoKit { get; } = new();
    public List<string> Gastas { get; } = new();
    public List<string> Mochila { get; } = new();
    public bool SaiuDoPosto { get; set; }
    public Vector? UltimoLugarFora { get; set; }
    public float ParadoNaSaida { get; set; }
    public bool UsoAntes { get; set; }
    public DateTime UltimaAcao { get; set; } = DateTime.UtcNow;
    public Vector? UltimoLugar { get; set; }
    public Vector? Ancora { get; set; }
    public DateTime AncoraDesde { get; set; } = DateTime.UtcNow;
    public bool AvisouAfk { get; set; }
    public bool AvisouAcampar { get; set; }
    /// <summary>A saída já foi avisada ao site (kick, reinício): o desconectar não avisa de novo.</summary>
    public bool JaSaiu { get; set; }
}

/// <summary>
/// Ilha Lemnos, o modo extração (dono, 15/11/2026). O jogador entra com o kit que escolheu no site, saqueia, e só guarda
/// o que levar até uma saída. Quem manda no que existe é o site: este plugin só conta o que aconteceu, pela fila de avisos.
/// Roda só no servidor da ilha (plugin próprio, para mudança aqui não derrubar a Mutação).
/// </summary>
public partial class IlhaLemnos : BasePlugin, IPluginConfig<ConfiguracaoDaIlha>
{
    private const float SegundosParaRenascer = 5f;
    private const float IntervaloDoPasso = 0.25f;

    private readonly Dictionary<ulong, NaIlha> naIlha = new();

    public override string ModuleName => "Magnatas: Ilha Lemnos";
    public override string ModuleVersion => "0.1.0";

    public ConfiguracaoDaIlha Config { get; set; } = new();

    public void OnConfigParsed(ConfiguracaoDaIlha config)
    {
        Config = config;
    }

    public override void Load(bool hotReload)
    {
        CarregarMapa();
        LigarFila();
        // O servidor (re)ligou: quem estava aqui caiu junto. O site fecha essas sessões e devolve as armas ao baú.
        Avisar("inicio", new { porta = Config.Porta, referencia = NovaReferencia() });

        RegisterEventHandler<EventPlayerConnectFull>(AoEntrar);
        RegisterEventHandler<EventPlayerSpawn>(AoNascer);
        RegisterEventHandler<EventPlayerDeath>(AoMorrer);
        RegisterEventHandler<EventPlayerDisconnect>(AoSair);
        RegisterEventHandler<EventGrenadeThrown>(AoLancarGranada);
        RegisterEventHandler<EventRoundStart>((_, _) =>
        {
            // A rodada nunca deveria recomeçar; se recomeçar, o jogo apaga o que o plugin criou, e o saque volta.
            Server.NextFrame(RecriarOQueEstaNoChao);
            return HookResult.Continue;
        });
        RegisterListener<Listeners.OnEntityTakeDamagePre>(AoReceberDano);
        RegisterListener<Listeners.OnServerPrecacheResources>(manifesto => manifesto.AddResource(Config.ModeloDoSaque));
        RegisterListener<Listeners.OnMapStart>(_ => AddTimer(5f, EspalharSaque, TimerFlags.STOP_ON_MAPCHANGE));
        AddCommandListener("drop", AoLargarArma, HookMode.Pre);
        AddCommand("css_mochila", "Mostra o que está na sua mochila", (jogador, _) =>
        {
            if (jogador is { IsValid: true } && naIlha.TryGetValue(jogador.SteamID, out var estado)) MostrarMochila(jogador, estado);
        });
        AddCommand("css_marcar", "Adm: marca o lugar onde você está (safe, saida, caixa, chao) no arquivo do mapa", ComandoMarcar);
        AddCommand("css_marcados", "Adm: quantos lugares já foram marcados", ComandoMarcados);
        AddCommand("css_desmarcar", "Adm: apaga o último lugar marcado", ComandoDesmarcar);
        AddTimer(IntervaloDoPasso, Passo, TimerFlags.REPEAT);
        AddTimer(1f, Vigiar, TimerFlags.REPEAT);
        AddTimer(30f, ConferirReinicio, TimerFlags.REPEAT);
        if (hotReload) Server.NextFrame(EspalharSaque);
    }

    public override void Unload(bool hotReload)
    {
        DesligarFila();
    }

    private static IEnumerable<CCSPlayerController> Pessoas() =>
        Utilities.GetPlayers().Where(jogador => jogador is { IsValid: true, IsBot: false, IsHLTV: false, Connected: PlayerConnectedState.Connected } && jogador.SteamID > 0);

    private static CCSPlayerController? PessoaPorSteam(ulong steam) => Pessoas().FirstOrDefault(pessoa => pessoa.SteamID == steam);

    private static Vector Copia(Vector lugar) => new(lugar.X, lugar.Y, lugar.Z);

    private static T? Ler<T>(string? json) where T : class
    {
        if (string.IsNullOrEmpty(json)) return null;
        try
        {
            return JsonSerializer.Deserialize<T>(json);
        }
        catch (JsonException)
        {
            return null;
        }
    }

    /// <summary>Tira do servidor sem avisar saída ao site (quem nem chegou a abrir sessão).</summary>
    private static void Chutar(CCSPlayerController jogador, string texto)
    {
        if (jogador.UserId is int id) Server.ExecuteCommand($"kickid {id} \"{texto.Replace("\"", "'")}\"");
    }

    private HookResult AoEntrar(EventPlayerConnectFull evento, GameEventInfo informacao)
    {
        var jogador = evento.Userid;
        if (jogador is not { IsValid: true, IsBot: false } || jogador.SteamID == 0) return HookResult.Continue;
        var steam = jogador.SteamID;
        var estado = new NaIlha();
        naIlha[steam] = estado;
        jogador.PrintToChat(" \x04[Ilha Lemnos]\x01 Conferindo seu kit no site...");
        Avisar("entrada", new { porta = Config.Porta, steamid64 = steam.ToString(), referencia = NovaReferencia() }, json =>
        {
            var pessoa = PessoaPorSteam(steam);
            if (pessoa == null || !naIlha.TryGetValue(steam, out var atual) || atual != estado) return;
            var resposta = Ler<RespostaDaEntrada>(json);
            if (resposta == null)
            {
                Chutar(pessoa, "A Ilha Lemnos não conseguiu falar com o site. Tente de novo em instantes.");
                return;
            }
            if (!resposta.Ok || resposta.Sessao == null || resposta.Kit == null)
            {
                var ate = resposta.Ate == null ? "para sempre" : $"até {DateTime.Parse(resposta.Ate).ToLocalTime():dd/MM HH:mm}";
                Chutar(pessoa, resposta.Motivo == "banido" ? $"Você está fora da Ilha Lemnos {ate}" : "A Ilha Lemnos é só para membros do Magnatas.");
                return;
            }
            estado.Sessao = resposta.Sessao;
            estado.Adm = resposta.Adm;
            estado.KitPendente = resposta.Kit;
            if (pessoa.Team is not (CsTeam.Terrorist or CsTeam.CounterTerrorist)) pessoa.ChangeTeam(CsTeam.Terrorist);
            AddTimer(0.5f, () =>
            {
                if (pessoa.IsValid && !pessoa.PawnIsAlive) pessoa.Respawn();
                else if (pessoa.IsValid) PrepararVida(pessoa, estado);
            });
        });
        return HookResult.Continue;
    }

    private HookResult AoNascer(EventPlayerSpawn evento, GameEventInfo informacao)
    {
        var jogador = evento.Userid;
        if (jogador is not { IsValid: true } || !naIlha.TryGetValue(jogador.SteamID, out var estado) || estado.KitPendente == null) return HookResult.Continue;
        Server.NextFrame(() =>
        {
            if (jogador.IsValid && jogador.PawnIsAlive) PrepararVida(jogador, estado);
        });
        return HookResult.Continue;
    }

    /// <summary>Uma vida nova: o kit na mão e um posto dos Magnatas sorteado.</summary>
    private void PrepararVida(CCSPlayerController jogador, NaIlha estado)
    {
        if (estado.KitPendente is not { } kit) return;
        estado.KitPendente = null;
        DarKit(jogador, estado, kit);
        estado.SaiuDoPosto = false;
        estado.UltimoLugarFora = null;
        estado.ParadoNaSaida = 0;
        estado.UltimaAcao = DateTime.UtcNow;
        estado.Ancora = null;
        IrParaUmPosto(jogador);
        jogador.PrintToCenterHtml("<font color='#f5b301' class='fontSize-l'>Ilha Lemnos</font><br>Saqueie e chegue vivo a uma saída. !mochila mostra o que você leva.", 6);
    }

    private HookResult AoMorrer(EventPlayerDeath evento, GameEventInfo informacao)
    {
        var jogador = evento.Userid;
        if (jogador is not { IsValid: true } || !naIlha.TryGetValue(jogador.SteamID, out var estado) || estado.Sessao == null) return HookResult.Continue;
        var matador = evento.Attacker is { IsValid: true, IsBot: false } autor && autor.SteamID != jogador.SteamID ? autor.SteamID.ToString() : null;
        var onde = jogador.PlayerPawn.Value?.AbsOrigin is { } lugar ? Copia(lugar) : null;
        Avisar("morte", new { sessao = estado.Sessao, referencia = NovaReferencia(), matador, gastas = estado.Gastas.ToList() });
        estado.Gastas.Clear();
        if (onde != null) DeixarMochilaNoChao(onde, estado.Mochila);
        estado.Mochila.Clear();
        var armas = estado.ArmasDoKit.ToList();
        estado.ArmasDoKit.Clear();
        Server.NextFrame(() => TirarDoChaoAsQueNaoCaem(armas));
        jogador.PrintToCenterHtml("<font color='#ff5a5a' class='fontSize-l'>Morreu na Ilha Lemnos</font><br>O que você carregava ficou no chão.", 4);

        var steam = jogador.SteamID;
        var sessao = estado.Sessao;
        AddTimer(SegundosParaRenascer, () =>
        {
            if (!naIlha.TryGetValue(steam, out var atual) || atual.Sessao != sessao || atual.JaSaiu) return;
            Avisar("renascer", new { sessao, referencia = NovaReferencia() }, json =>
            {
                var resposta = Ler<RespostaDoRenascer>(json);
                var pessoa = PessoaPorSteam(steam);
                if (resposta?.Kit == null || pessoa == null || atual.JaSaiu) return;
                atual.KitPendente = resposta.Kit;
                if (!pessoa.PawnIsAlive) pessoa.Respawn();
            });
        });
        return HookResult.Continue;
    }

    private HookResult AoSair(EventPlayerDisconnect evento, GameEventInfo informacao)
    {
        var jogador = evento.Userid;
        if (jogador is not { IsValid: true } || !naIlha.Remove(jogador.SteamID, out var estado)) return HookResult.Continue;
        if (estado.Sessao == null || estado.JaSaiu) return HookResult.Continue;
        var vivo = jogador.PawnIsAlive && jogador.PlayerPawn.Value?.AbsOrigin != null;
        var lugar = vivo ? Copia(jogador.PlayerPawn.Value!.AbsOrigin!) : null;
        var noPosto = lugar != null && NoPosto(lugar);
        Avisar("saida", new
        {
            sessao = estado.Sessao,
            referencia = NovaReferencia(),
            motivo = "saiu",
            naSafeZone = noPosto,
            gastas = estado.Gastas.ToList(),
            armas = vivo ? ArmasNaMao(jogador, estado) : new List<ArmaNaMao>(),
        });
        // Quem fecha o jogo fora do posto perde a mochila: ela fica no chão para quem passar.
        if (lugar != null && !noPosto) DeixarMochilaNoChao(lugar, estado.Mochila);
        return HookResult.Continue;
    }
}
