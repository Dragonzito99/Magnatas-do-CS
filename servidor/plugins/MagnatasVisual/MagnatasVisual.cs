using System.Drawing;
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

    /// <summary>Personagem feito só para essa conta (caminho do .vmdl).</summary>
    [JsonPropertyName("boneco")]
    public string? Boneco { get; init; }

    /// <summary>Conta de Adm no site: libera os comandos dos banners.</summary>
    [JsonPropertyName("adm")]
    public bool Adm { get; init; }
}

/// <summary>
/// A Magnata Shop no jogo: cor do nome e etiqueta no chat, e o aviso quando o jogador entra. Instalado no competitivo;
/// a Diversão copia os addons do competitivo a cada início, então vale nos dois. Nunca mexe em arma, skin ou inventário;
/// o único boneco que troca é o personagem próprio de uma conta, da lista fechada abaixo.
/// </summary>
public partial class MagnatasVisual : BasePlugin, IPluginConfig<ConfiguracaoDoVisual>
{
    public override string ModuleName => "Magnatas: visual da loja";
    public override string ModuleVersion => "1.1.0";

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

    // Personagens feitos para uma conta só (campo boneco no site). Cada versão vai numa pasta nova do pacote dos
    // personagens, um item da Oficina que todo servidor manda baixar (mm_extra_addons). Caminho que não estiver aqui não
    // vira modelo. Gestos: o modelo de cena com as animações extras do personagem (ver ferramentas/mutante).
    // Só no laboratório: personagem novo, ou versão nova, que o Adm testa antes de liberar (dono, 13/11/2026). Ele não
    // veste em nenhum outro servidor, nem na conta que já aponte para ele; aprovado, a marca sai.
    private sealed record Boneco(string Pacote, string? Gestos, bool SoNoLaboratorio = false);
    private const string PacoteDosPersonagens = "3837571705";
    private static readonly Dictionary<string, Boneco> Bonecos = new()
    {
        ["models/magnatas/marfioso_v1/mutante.vmdl"] = new(PacoteDosPersonagens, null),
        ["models/magnatas/adm_v1/mutante.vmdl"] = new(PacoteDosPersonagens, "models/magnatas/adm_v1/gestos/gestos.vmdl"),
        // O herói da super Negev da Mutação, para ser visto de perto.
        ["models/magnatas/heroi_v1/mutante.vmdl"] = new(PacoteDosPersonagens, null, SoNoLaboratorio: true),
    };
    // Quanto dura cada gesto (a flexão repete três vezes).
    private static readonly Dictionary<string, float> SegundosDosGestos = new()
    {
        ["danca"] = 8.2f,
        ["flexao"] = 4.5f,
        ["mortal"] = 4.1f,
    };

    /// <summary>Um gesto tocando: o modelo de cena e o que o corpo e a arma tinham antes de sumir.</summary>
    private sealed class GestoEmAndamento
    {
        public required CDynamicProp Cena { get; init; }
        public required CCSPlayerPawn Corpo { get; init; }
        public required Color Cor { get; init; }
        public required RenderMode_t ModoDeDesenho { get; init; }
        public CBasePlayerWeapon? Arma { get; init; }
        public Color CorDaArma { get; init; }
        public RenderMode_t ModoDaArma { get; init; }
    }

    // Lidos e escritos só na linha principal do servidor.
    private readonly Dictionary<string, bool> bonecosNoServidor = new();
    private readonly Dictionary<int, GestoEmAndamento> gestos = new();
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
        RegisterEventHandler<EventPlayerSpawn>(AoNascer);
        RegisterListener<Listeners.OnServerPrecacheResources>(manifesto =>
        {
            // A Mutação não baixa o pacote dos personagens: com ele, o jogo do Adm fechou (OnPreserveEntity, 10/11 20:01).
            if (NaMutacao()) return;
            foreach (var (modelo, boneco) in Bonecos)
            {
                if (boneco.SoNoLaboratorio && !NoLaboratorioDePersonagens()) continue;
                manifesto.AddResource(modelo);
                if (boneco.Gestos != null) manifesto.AddResource(boneco.Gestos);
            }
            PrepararBanners(manifesto);
        });
        // O pacote novo chega numa troca de mapa, então a conferência se refaz a cada mapa.
        RegisterListener<Listeners.OnMapStart>(_ => bonecosNoServidor.Clear());
        CarregarBanners();
        // Comandos de console: dá para pôr numa tecla (bind 7 css_danca), ou escrever !danca no chat.
        AddCommand("css_danca", "Dança (boneco próprio)", (jogador, _) => FazerGesto(jogador, "danca"));
        AddCommand("css_flexao", "Flexão (boneco próprio)", (jogador, _) => FazerGesto(jogador, "flexao"));
        AddCommand("css_mortal", "Salto mortal (boneco próprio)", (jogador, _) => FazerGesto(jogador, "mortal"));
        RegisterEventHandler<EventPlayerHurt>((evento, _) => PararGestoDe(evento.Userid, devolverCorpo: true));
        RegisterEventHandler<EventPlayerDeath>((evento, _) => PararGestoDe(evento.Userid, devolverCorpo: false));
        RegisterEventHandler<EventRoundPrestart>((_, _) =>
        {
            foreach (var vaga in gestos.Keys.ToList()) EncerrarGesto(vaga, devolverCorpo: true);
            return HookResult.Continue;
        });
        if (NoLaboratorioDePersonagens()) LigarLaboratorio();
    }

    private HookResult AoNascer(EventPlayerSpawn evento, GameEventInfo informacao)
    {
        var jogador = evento.Userid;
        if (jogador is not { IsValid: true }) return HookResult.Continue;
        // Bot só se veste no laboratório, com o personagem que o Adm pediu no !bot.
        if (jogador.IsBot)
        {
            if (!NoLaboratorioDePersonagens()) return HookResult.Continue;
            PedidoDoBot(jogador);
        }
        else if (jogador.SteamID == 0) return HookResult.Continue;
        // No quadro seguinte o corpo já existe; a Mutação veste o zumbi só 0,1 s depois, e fica por cima.
        Server.NextFrame(() => VestirBoneco(jogador));
        return HookResult.Continue;
    }

    /// <summary>O personagem da lista, se o pacote dele já está neste servidor.</summary>
    private Boneco? BonecoNoServidor(string? caminho)
    {
        if (caminho == null || !Bonecos.TryGetValue(caminho, out var boneco)) return null;
        if (boneco.SoNoLaboratorio && !NoLaboratorioDePersonagens()) return null;
        if (!bonecosNoServidor.TryGetValue(caminho, out var noServidor))
        {
            noServidor = NoPacote(boneco.Pacote, Path.GetDirectoryName(caminho)!.Replace('\\', '/'));
            bonecosNoServidor[caminho] = noServidor;
            Console.WriteLine($"[Magnatas] Boneco {caminho} no servidor: {(noServidor ? "sim" : "não")}.");
        }
        return noServidor ? boneco : null;
    }

    /// <summary>
    /// O que vestir: no laboratório de personagens, só o que o Adm escolheu no chat (o !tirar volta ao boneco do jogo);
    /// nos outros servidores, o personagem próprio da conta.
    /// </summary>
    private (string Caminho, Boneco Boneco)? BonecoDe(CCSPlayerController jogador)
    {
        var caminho = NoLaboratorioDePersonagens()
            ? escolhas.GetValueOrDefault(jogador.Slot)
            : !jogador.IsBot && visuais.TryGetValue(jogador.SteamID, out var visual) ? visual.Boneco : null;
        var boneco = BonecoNoServidor(caminho);
        return boneco == null ? null : (caminho!, boneco);
    }

    /// <summary>
    /// Na Mutação o corpo é da Mutação: trocar para o boneco próprio e, 0,1 s depois, para o zumbi derrubou o servidor
    /// (WriteEnterPVS, 10/11/2026 19:54). A Diversão copia este plugin para a pasta de cada modo.
    /// </summary>
    private static bool NaMutacao()
    {
        var pasta = Server.GameDirectory.Replace('\\', '/');
        // O laboratório de mutantes é a Mutação: o mesmo cuidado vale lá.
        return pasta.Contains("/diversao/mutacao/") || pasta.Contains("/diversao/laboratorio-mutantes/");
    }

    /// <summary>Veste o personagem próprio da conta, se ela tem um e o pacote dele já está neste servidor.</summary>
    private void VestirBoneco(CCSPlayerController jogador)
    {
        if (jogador is not { IsValid: true, PawnIsAlive: true } || NaMutacao()) return;
        if (BonecoDe(jogador) is { } achado) jogador.PlayerPawn.Value?.SetModel(achado.Caminho);
    }

    /// <summary>
    /// O corpo some e para, e no lugar dele o modelo de cena toca o gesto. Os outros veem; quem faz continua em
    /// primeira pessoa. Acaba sozinho, ou antes se tomar dano, morrer ou a rodada recomeçar.
    /// </summary>
    private void FazerGesto(CCSPlayerController? jogador, string gesto)
    {
        if (jogador is not { IsValid: true, PawnIsAlive: true } || gestos.ContainsKey(jogador.Slot) || NaMutacao()) return;
        if (BonecoDe(jogador) is not { } achado || achado.Boneco.Gestos is not { } modeloDosGestos) return;
        var corpo = jogador.PlayerPawn.Value;
        if (corpo is not { IsValid: true } || corpo.AbsOrigin == null || corpo.AbsRotation == null) return;

        var cena = Utilities.CreateEntityByName<CDynamicProp>("prop_dynamic");
        if (cena == null) return;
        // Tudo vai na criação, como a queda do mutante: trocar o modelo depois de nascer dava erro no servidor.
        var valores = new CEntityKeyValues();
        valores.SetString("model", modeloDosGestos);
        valores.SetVector("origin", new Vector(corpo.AbsOrigin.X, corpo.AbsOrigin.Y, corpo.AbsOrigin.Z));
        valores.SetAngle("angles", new QAngle(0, corpo.AbsRotation.Y, 0));
        valores.SetString("DefaultAnim", gesto);
        valores.SetInt("solid", 0);
        cena.DispatchSpawn(valores);

        var arma = corpo.WeaponServices?.ActiveWeapon.Value;
        var atual = new GestoEmAndamento
        {
            Cena = cena,
            Corpo = corpo,
            Cor = corpo.Render,
            ModoDeDesenho = corpo.RenderMode,
            Arma = arma,
            CorDaArma = arma?.Render ?? Color.White,
            ModoDaArma = arma?.RenderMode ?? RenderMode_t.kRenderNormal,
        };
        gestos[jogador.Slot] = atual;
        Desenhar(corpo, RenderMode_t.kRenderTransAlpha, Color.FromArgb(0, 255, 255, 255));
        if (arma != null) Desenhar(arma, RenderMode_t.kRenderTransAlpha, Color.FromArgb(0, 255, 255, 255));
        corpo.MoveType = MoveType_t.MOVETYPE_NONE;
        corpo.ActualMoveType = MoveType_t.MOVETYPE_NONE;
        Utilities.SetStateChanged(corpo, "CBaseEntity", "m_MoveType");

        var vaga = jogador.Slot;
        AddTimer(SegundosDosGestos[gesto], () =>
        {
            if (gestos.TryGetValue(vaga, out var ainda) && ainda == atual) EncerrarGesto(vaga, devolverCorpo: true);
        });
    }

    private HookResult PararGestoDe(CCSPlayerController? jogador, bool devolverCorpo)
    {
        if (jogador is { IsValid: true }) EncerrarGesto(jogador.Slot, devolverCorpo);
        return HookResult.Continue;
    }

    /// <summary>Tira o modelo de cena e devolve o corpo como estava. Quem morreu fica como a morte deixou.</summary>
    private void EncerrarGesto(int vaga, bool devolverCorpo)
    {
        if (!gestos.Remove(vaga, out var gesto)) return;
        if (gesto.Cena.IsValid) gesto.Cena.Remove();
        if (!devolverCorpo || !gesto.Corpo.IsValid) return;
        Desenhar(gesto.Corpo, gesto.ModoDeDesenho, gesto.Cor);
        if (gesto.Arma is { IsValid: true }) Desenhar(gesto.Arma, gesto.ModoDaArma, gesto.CorDaArma);
        gesto.Corpo.MoveType = MoveType_t.MOVETYPE_WALK;
        gesto.Corpo.ActualMoveType = MoveType_t.MOVETYPE_WALK;
        Utilities.SetStateChanged(gesto.Corpo, "CBaseEntity", "m_MoveType");
    }

    private static void Desenhar(CBaseModelEntity entidade, RenderMode_t modo, Color cor)
    {
        entidade.RenderMode = modo;
        entidade.Render = cor;
        Utilities.SetStateChanged(entidade, "CBaseModelEntity", "m_nRenderMode");
        Utilities.SetStateChanged(entidade, "CBaseModelEntity", "m_clrRender");
    }

    /// <summary>O pacote da Oficina chega ao servidor ao ligar; a lista de arquivos dele diz se o boneco veio.</summary>
    private static bool NoPacote(string pacote, string caminho)
    {
        foreach (var raiz in new[] { Server.GameDirectory, Path.GetDirectoryName(Server.GameDirectory) ?? "" })
        {
            var lista = Path.Combine(raiz, "bin", "linuxsteamrt64", "steamapps", "workshop", "content", "730", pacote, $"{pacote}_dir.vpk");
            try
            {
                if (File.Exists(lista) && System.Text.Encoding.ASCII.GetString(File.ReadAllBytes(lista)).Contains(caminho)) return true;
            }
            catch (Exception erro) when (erro is IOException or UnauthorizedAccessException)
            {
            }
        }
        return false;
    }

    private static IEnumerable<CCSPlayerController> Pessoas() =>
        Utilities.GetPlayers().Where(jogador => jogador is { IsValid: true, IsBot: false, IsHLTV: false } && jogador.SteamID > 0);

    private HookResult AoEntrar(EventPlayerConnectFull evento, GameEventInfo informacao)
    {
        var jogador = evento.Userid;
        if (jogador is { IsValid: true, IsBot: false } && jogador.SteamID > 0)
        {
            _ = BuscarVisuais([jogador.SteamID], avisar: true);
            // No laboratório, sem a resposta do site dizendo que é Adm, a pessoa sai: na dúvida, fecha.
            if (NoLaboratorio()) AddTimer(SegundosParaConfirmarAdm, () => ConferirAdmNoLaboratorio(jogador));
        }
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
        if (jogador is { IsValid: true })
        {
            EncerrarGesto(jogador.Slot, devolverCorpo: false);
            escolhas.Remove(jogador.Slot);
        }
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
        foreach (var jogador in Pessoas().Where(pessoa => contas.Contains(pessoa.SteamID))) ConferirAdmNoLaboratorio(jogador);
        if (!avisar) return;
        foreach (var jogador in Pessoas().Where(pessoa => contas.Contains(pessoa.SteamID)))
        {
            // Quem entra já vivo (aquecimento) nasceu antes de o site responder.
            VestirBoneco(jogador);
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
