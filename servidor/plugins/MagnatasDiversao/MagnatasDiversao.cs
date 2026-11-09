using System.Net;
using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;
using System.Text.Json.Serialization;
using CounterStrikeSharp.API;
using CounterStrikeSharp.API.Core;
using CounterStrikeSharp.API.Core.Attributes.Registration;
using CounterStrikeSharp.API.Modules.Commands;
using CounterStrikeSharp.API.Modules.Cvars;
using CounterStrikeSharp.API.Modules.Entities.Constants;
using CounterStrikeSharp.API.Modules.Timers;
using CounterStrikeSharp.API.Modules.Utils;

namespace MagnatasDiversao;

/// <summary>Cada servidor tem o próprio arquivo, gravado pelo iniciar_diversao.sh.</summary>
public class ConfiguracaoDoModo : BasePluginConfig
{
    /// <summary>Vazio significa não entregar arma principal, como no servidor só de pistola.</summary>
    [JsonPropertyName("ArmaPrincipal")]
    public string ArmaPrincipal { get; set; } = "";

    /// <summary>cada_um, equipe, fantasma ou mutacao.</summary>
    [JsonPropertyName("Regra")]
    public string Regra { get; set; } = "cada_um";

    [JsonPropertyName("Porta")]
    public int Porta { get; set; }

    /// <summary>Sem endereço ou token, o servidor joga normalmente, sem XP.</summary>
    [JsonPropertyName("SiteUrl")]
    public string SiteUrl { get; set; } = "";

    [JsonPropertyName("Token")]
    public string Token { get; set; } = "";

    /// <summary>Números da Oficina separados por vírgula. Com dois ou mais, o próximo é sorteado ao fim de cada partida.</summary>
    [JsonPropertyName("Rotacao")]
    public string Rotacao { get; set; } = "";
}

public class GanhoDoSite
{
    [JsonPropertyName("steamid64")]
    public string Steamid64 { get; set; } = "";

    [JsonPropertyName("xp")]
    public int Xp { get; set; }

    [JsonPropertyName("patente")]
    public string Patente { get; set; } = "";

    [JsonPropertyName("subiu")]
    public bool Subiu { get; set; }
}

public class RespostaDoSite
{
    [JsonPropertyName("ganhos")]
    public List<GanhoDoSite> Ganhos { get; set; } = new();
}

/// <summary>Os nomes seguem o que o site espera receber. O XP não vai junto: quem calcula é o site.</summary>
public class JogadorEnviado
{
    public string steamid64 { get; init; } = "";
    public int abates { get; init; }
    public double minutos { get; init; }
    public bool ateOFim { get; init; }

    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public string? time { get; init; }

    /// <summary>Só para a tabela do perfil no site.</summary>
    public int? mortes { get; init; }
}

/// <summary>
/// O que o CS2 não faz sozinho nos servidores da aba Diversão: entregar a arma principal, zerar o placar
/// sem parar o jogo, decidir a partida por abates, informar o resultado ao site e dizer quem está conectado.
/// </summary>
public partial class ModoDeDiversao : BasePlugin, IPluginConfig<ConfiguracaoDoModo>
{
    private const float EsperaAposNascer = 0.1f;
    private const float SegundosAteZerarOPlacar = 20 * 60;
    private const int SegundosMostrandoOVencedor = 15;
    private const float MinutosSeFaltarORelogio = 5;
    private const float MinutosDoCicloDoCadaUm = 20;
    private const int TentativasDeEnvio = 3;
    private static readonly TimeSpan PrazoDoEnvio = TimeSpan.FromSeconds(5);
    private static readonly TimeSpan PausaEntreTentativas = TimeSpan.FromSeconds(2);
    private static readonly HttpClient Site = new() { Timeout = PrazoDoEnvio };

    private sealed class JogadorNaPartida
    {
        public int Abates;
        public int Mortes;
        public DateTime Desde = DateTime.UtcNow;
    }

    private readonly Dictionary<ulong, JogadorNaPartida> naPartida = new();
    private string idDaPartida = NovoId();
    private int abatesCt, abatesTr;
    private bool partidaEncerrada;
    private string avisoDoFim = "";
    // O servidor liga no primeiro mapa da rotação, que é o mesmo do OFICINA no .conf.
    private string? mapaAtualDaOficina;
    private CounterStrikeSharp.API.Modules.Timers.Timer? fimDaPartida;

    public override string ModuleName => "Magnatas: Diversão";
    public override string ModuleVersion => "1.8.0";

    public ConfiguracaoDoModo Config { get; set; } = new();

    public void OnConfigParsed(ConfiguracaoDoModo config)
    {
        Config = config;
    }

    private static string NovoId() => Guid.NewGuid().ToString("N");

    public override void Load(bool hotReload)
    {
        LembrarDoMapaAtual(hotReload);
        LigarSonsDeAbate();
        if (Config.Regra == "cada_um")
        {
            // Se a partida acabar pelo tempo do jogo, este modo não recomeça e deixa todo mundo sem time.
            AddTimer(SegundosAteZerarOPlacar, EncerrarCicloDoCadaUm, TimerFlags.REPEAT);
        }
        // Recarregado no meio da partida, o plugin não veria o início da rodada e o jogo nunca terminaria.
        else if (Config.Regra == "equipe")
        {
            LigarMapasDeRodadas();
            if (hotReload && !NoMapaDeRodadas) ComecarPartida();
        }
        else if (Config.Regra == "fantasma")
        {
            LigarFantasma(hotReload);
        }
        else if (Config.Regra == "mutacao")
        {
            LigarMutacao(hotReload);
        }
    }

    private static CCSGameRules? RegrasDoJogo() =>
        Utilities.FindAllEntitiesByDesignerName<CCSGameRulesProxy>("cs_gamerules").FirstOrDefault()?.GameRules;

    private static IEnumerable<CCSPlayerController> Pessoas() =>
        Utilities.GetPlayers().Where(jogador => jogador is { IsValid: true, IsBot: false, IsHLTV: false, Connected: PlayerConnectedState.Connected } && jogador.SteamID > 0);

    private void Registrar(CCSPlayerController jogador)
    {
        if (jogador is { IsValid: true, IsBot: false, IsHLTV: false } && jogador.SteamID > 0 && !naPartida.ContainsKey(jogador.SteamID))
        {
            naPartida[jogador.SteamID] = new JogadorNaPartida();
        }
    }

    private void ZerarContagem()
    {
        idDaPartida = NovoId();
        partidaEncerrada = false;
        naPartida.Clear();
        sequencias.Clear();
        foreach (var pessoa in Pessoas()) Registrar(pessoa);
    }

    /// <summary>O dono pediu a tabela do zero em cada partida. Equipe e Mutação emendam partidas sem reiniciar o jogo.</summary>
    private static void ZerarPlacarDasPessoas()
    {
        foreach (var jogador in Utilities.GetPlayers().Where(jogador => jogador is { IsValid: true }))
        {
            var estatisticas = jogador.ActionTrackingServices?.MatchStats;
            if (estatisticas != null)
            {
                estatisticas.Kills = 0;
                estatisticas.Deaths = 0;
                estatisticas.Assists = 0;
                estatisticas.Damage = 0;
                Utilities.SetStateChanged(jogador, "CCSPlayerController", "m_pActionTrackingServices");
            }
            jogador.Score = 0;
            Utilities.SetStateChanged(jogador, "CCSPlayerController", "m_iScore");
        }
    }

    private void ComecarPartida()
    {
        ZerarContagem();
        ZerarPlacarDasPessoas();
        abatesCt = 0;
        abatesTr = 0;
        MostrarNoPlacar();
        fimDaPartida?.Kill();
        // O mesmo valor do relógio da tela, para os dois chegarem juntos ao fim.
        var minutos = ConVar<float>.Find("mp_roundtime")?.Value ?? MinutosSeFaltarORelogio;
        fimDaPartida = AddTimer(minutos * 60f, () => EncerrarPartidaDeEquipe(minutos));
    }

    private void MostrarNoPlacar()
    {
        foreach (var time in Utilities.FindAllEntitiesByDesignerName<CCSTeam>("cs_team_manager"))
        {
            if (time.TeamNum == (byte)CsTeam.CounterTerrorist) time.Score = abatesCt;
            else if (time.TeamNum == (byte)CsTeam.Terrorist) time.Score = abatesTr;
            else continue;
            Utilities.SetStateChanged(time, "CTeam", "m_iScore");
        }
    }

    /// <summary>Sem isso, o jogo daria a vitória ao CT por tempo. A rodada seguinte zera o placar.</summary>
    private void EncerrarPartidaDeEquipe(float minutos)
    {
        var motivo = abatesCt > abatesTr
            ? RoundEndReason.CTsWin
            : abatesTr > abatesCt ? RoundEndReason.TerroristsWin : RoundEndReason.RoundDraw;
        var vencedor = abatesCt > abatesTr ? "ct" : abatesTr > abatesCt ? "tr" : "empate";
        AvisarFimDaPartida(vencedor == "ct" ? "CT venceu" : vencedor == "tr" ? "TR venceu" : "Empate");
        FecharPartida(vencedor, minutos);
        RegrasDoJogo()?.TerminateRound(SegundosMostrandoOVencedor, motivo);
        // Troca um pouco antes da rodada seguinte, para ninguém começar uma partida que seria interrompida.
        AddTimer(SegundosMostrandoOVencedor - 1, TrocarDeMapa);
    }

    private static List<string> MapasDaRotacao(string rotacao) =>
        rotacao.Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
            .Where(mapa => mapa.All(char.IsDigit))
            .ToList();

    /// <summary>O dono preferiu um servidor com vários mapas, sorteados, sem repetir o que acabou de ser jogado.</summary>
    private void TrocarDeMapa()
    {
        var mapas = MapasDaRotacao(Config.Rotacao);
        if (mapas.Count < 2) return;
        var opcoes = mapas.Where(mapa => mapa != mapaAtualDaOficina).ToList();
        var proximo = opcoes[Random.Shared.Next(opcoes.Count)];
        GuardarMapaAtual(proximo);
        Server.ExecuteCommand($"host_workshop_map {proximo}");
    }

    private string ArquivoDoMapaAtual => Path.Combine(ModuleDirectory, "mapa_atual.txt");

    /// <summary>
    /// O servidor liga no primeiro mapa da rotação. Recarregado no meio do jogo, o plugin lê o mapa do arquivo:
    /// sem isso ele poderia sortear o mesmo pacote, e recarregar o Luxville abre o mapa auxiliar dele e derruba o servidor.
    /// </summary>
    private void LembrarDoMapaAtual(bool hotReload)
    {
        var mapas = MapasDaRotacao(Config.Rotacao);
        string? guardado = null;
        try
        {
            if (hotReload && File.Exists(ArquivoDoMapaAtual)) guardado = File.ReadAllText(ArquivoDoMapaAtual).Trim();
        }
        catch (Exception erro) when (erro is IOException or UnauthorizedAccessException)
        {
        }
        GuardarMapaAtual(guardado != null && mapas.Contains(guardado) ? guardado : mapas.FirstOrDefault());
    }

    private void GuardarMapaAtual(string? mapa)
    {
        mapaAtualDaOficina = mapa;
        if (mapa == null) return;
        try
        {
            File.WriteAllText(ArquivoDoMapaAtual, mapa);
        }
        catch (Exception erro) when (erro is IOException or UnauthorizedAccessException)
        {
            Console.WriteLine($"[Magnatas] Não deu para guardar o mapa atual: {erro.Message}");
        }
    }

    private void EncerrarCicloDoCadaUm()
    {
        AvisarFimDaPartida(QuemLiderouOCiclo());
        FecharPartida(null, MinutosDoCicloDoCadaUm);
        Server.ExecuteCommand("mp_restartgame 15");
    }

    private string QuemLiderouOCiclo()
    {
        var conectadas = Pessoas().ToDictionary(pessoa => pessoa.SteamID);
        var lider = naPartida
            .Where(par => par.Value.Abates > 0 && conectadas.ContainsKey(par.Key))
            .OrderByDescending(par => par.Value.Abates)
            .Select(par => (Nome: conectadas[par.Key].PlayerName, par.Value.Abates))
            .FirstOrDefault();
        return lider.Nome == null ? "" : $"{lider.Nome} venceu com {lider.Abates} abates";
    }

    /// <summary>Sai na hora, para ninguém ficar sem saber o que aconteceu, com ou sem resposta do site.</summary>
    private void AvisarFimDaPartida(string resultado)
    {
        var espera = $"Aguarde: a próxima partida começa em {SegundosMostrandoOVencedor} segundos.";
        var quadroDoResultado = resultado == "" ? "" : $"<br><font color='#f5b301' class='fontSize-l'>{WebUtility.HtmlEncode(resultado)}</font>";
        avisoDoFim = $"<font class='fontSize-l'>Partida encerrada</font>{quadroDoResultado}<br>{espera}";
        var textoDoChat = resultado == "" ? "Partida encerrada." : $"Partida encerrada. {resultado}.";
        foreach (var pessoa in Pessoas())
        {
            pessoa.PrintToCenterHtml(avisoDoFim, SegundosMostrandoOVencedor);
            pessoa.PrintToChat($" [Magnatas] {textoDoChat} {espera}");
        }
    }

    /// <summary>O envio roda fora do jogo: a partida termina igual, com ou sem resposta do site.</summary>
    private void FecharPartida(string? vencedor, float duracaoMinutos)
    {
        partidaEncerrada = true;
        // O teste do Adm com bots não vale XP nem entra no perfil.
        if (testeComBots) return;
        if (Config.SiteUrl == "" || Config.Token == "") return;

        var conectadas = Pessoas().ToDictionary(pessoa => pessoa.SteamID);
        var agora = DateTime.UtcNow;
        var jogadores = naPartida
            .Select(par =>
            {
                conectadas.TryGetValue(par.Key, out var pessoa);
                var time = pessoa?.Team == CsTeam.CounterTerrorist ? "ct" : pessoa?.Team == CsTeam.Terrorist ? "tr" : null;
                return new JogadorEnviado
                {
                    steamid64 = par.Key.ToString(),
                    abates = par.Value.Abates,
                    minutos = Math.Round((agora - par.Value.Desde).TotalMinutes, 2),
                    ateOFim = pessoa != null,
                    time = Config.Regra != "cada_um" ? time : null,
                    mortes = par.Value.Mortes,
                };
            })
            .ToList();
        if (jogadores.Count == 0) return;

        var corpo = JsonSerializer.Serialize(new { porta = Config.Porta, partida = idDaPartida, duracaoMinutos, vencedor, jogadores, mapa = Server.MapName, placar = PlacarDaPartida() });
        _ = Task.Run(() => EnviarResultado(corpo));
    }

    /// <summary>
    /// O placar do lado do CT, para a tabela do perfil: no Equipe x Equipe sem rodadas, os abates de cada time;
    /// nos modos de rodada, as rodadas que o jogo contou. Cada um por si e Mutação não têm placar de time.
    /// </summary>
    private string? PlacarDaPartida()
    {
        if (Config.Regra == "equipe" && !NoMapaDeRodadas) return $"{abatesCt} x {abatesTr}";
        if (Config.Regra != "fantasma" && !NoMapaDeRodadas) return null;
        var times = Utilities.FindAllEntitiesByDesignerName<CCSTeam>("cs_team_manager").ToList();
        var ct = times.FirstOrDefault(time => time.TeamNum == (int)CsTeam.CounterTerrorist)?.Score;
        var tr = times.FirstOrDefault(time => time.TeamNum == (int)CsTeam.Terrorist)?.Score;
        return ct is null || tr is null ? null : $"{ct} x {tr}";
    }

    /// <summary>Reenviar é seguro: o id da partida é o mesmo, e o site não conta duas vezes.</summary>
    private async Task EnviarResultado(string corpo)
    {
        for (var tentativa = 1; tentativa <= TentativasDeEnvio; tentativa++)
        {
            try
            {
                using var pedido = new HttpRequestMessage(HttpMethod.Post, $"{Config.SiteUrl.TrimEnd('/')}/api/servidor/diversao/resultado")
                {
                    Content = new StringContent(corpo, Encoding.UTF8, "application/json"),
                };
                pedido.Headers.Authorization = new AuthenticationHeaderValue("Bearer", Config.Token);
                using var resposta = await Site.SendAsync(pedido);
                if (resposta.IsSuccessStatusCode)
                {
                    var dados = JsonSerializer.Deserialize<RespostaDoSite>(await resposta.Content.ReadAsStringAsync());
                    await Server.NextFrameAsync(() => MostrarGanhos(dados));
                    return;
                }
                Console.WriteLine($"[Magnatas] O site recusou o resultado: {(int)resposta.StatusCode}.");
                // Pedido recusado continuaria recusado. Só vale tentar de novo quando o erro é do site.
                if ((int)resposta.StatusCode < 500) return;
            }
            catch (Exception erro)
            {
                Console.WriteLine($"[Magnatas] Falha ao enviar o resultado: {erro.GetType().Name}.");
            }
            if (tentativa < TentativasDeEnvio) await Task.Delay(PausaEntreTentativas);
        }
    }

    private void MostrarGanhos(RespostaDoSite? dados)
    {
        if (dados == null) return;
        var conectadas = Pessoas().ToDictionary(pessoa => pessoa.SteamID.ToString());
        foreach (var ganho in dados.Ganhos)
        {
            if (!conectadas.TryGetValue(ganho.Steamid64, out var pessoa)) continue;
            var patente = WebUtility.HtmlEncode(ganho.Patente);
            // Só um quadro aparece por vez no centro da tela, então este repete o aviso do fim.
            var quadro = $"{avisoDoFim}<br><font color='#f5b301' class='fontSize-xl'>+ {ganho.Xp} XP</font>";
            if (ganho.Subiu) quadro += $"<br><font color='#f5b301'>Nova patente: {patente}</font>";
            pessoa.PrintToCenterHtml(quadro, SegundosMostrandoOVencedor);
            pessoa.PrintToChat($" [Magnatas] + {ganho.Xp} XP");
            if (ganho.Subiu) pessoa.PrintToChat($" [Magnatas] Nova patente: {ganho.Patente}");
        }
    }

    [GameEventHandler]
    public HookResult AoComecarRodada(EventRoundStart evento, GameEventInfo informacao)
    {
        var regras = RegrasDoJogo();
        if (regras == null || regras.WarmupPeriod) return HookResult.Continue;
        if (Config.Regra == "equipe")
        {
            if (NoMapaDeRodadas) ComecarRodadaDeAlaska();
            else ComecarPartida();
        }
        else if (Config.Regra == "fantasma") ComecarRodadaDoFantasma(regras);
        else if (Config.Regra == "mutacao") ComecarRodadaDaMutacao();
        else ZerarContagem();
        return HookResult.Continue;
    }

    [GameEventHandler]
    public HookResult AoMorrer(EventPlayerDeath evento, GameEventInfo informacao)
    {
        if (partidaEncerrada || RegrasDoJogo()?.WarmupPeriod != false) return HookResult.Continue;
        var quem = evento.Attacker;
        var alvo = evento.Userid;
        if (quem == null || alvo == null || quem == alvo) return HookResult.Continue;
        // A explosão da bomba não é abate de ninguém.
        if (evento.Weapon.Contains("c4")) return HookResult.Continue;

        if (Config.Regra != "cada_um" && quem.Team == alvo.Team) return HookResult.Continue;

        // No Alaska o placar do time é de rodadas, e o próprio jogo conta.
        if (Config.Regra == "equipe" && !NoMapaDeRodadas)
        {
            if (quem.Team == CsTeam.CounterTerrorist) abatesCt++;
            else if (quem.Team == CsTeam.Terrorist) abatesTr++;
            MostrarNoPlacar();
        }

        Registrar(quem);
        if (naPartida.TryGetValue(quem.SteamID, out var dados)) dados.Abates++;
        Registrar(alvo);
        if (naPartida.TryGetValue(alvo.SteamID, out var doAlvo)) doAlvo.Mortes++;
        return HookResult.Continue;
    }

    /// <summary>Este modo do jogo espalha quem renasce, mas ignora a arma principal padrão.</summary>
    [GameEventHandler]
    public HookResult AoNascer(EventPlayerSpawn evento, GameEventInfo informacao)
    {
        var jogador = evento.Userid;
        if (jogador != null) Registrar(jogador);
        // No momento do evento, o jogo ainda está montando o jogador e as armas dele.
        AddTimer(EsperaAposNascer, () => EntregarArma(jogador));
        if (NoMapaDeRodadas) AddTimer(SegundosAteEntregarKit, () => EntregarKitDoAlaska(jogador));
        if (Config.Regra == "fantasma")
        {
            AddTimer(EsperaAposNascer, () => DeixarSoAFaca(jogador));
            AddTimer(EsperaAposNascer, () => CompletarKitDoCt(jogador));
        }
        else if (Config.Regra == "mutacao")
        {
            AddTimer(EsperaAposNascer, () =>
            {
                if (jogador != null && EhMutanteDeVerdade(jogador)) AplicarAtributosDoMutante(jogador);
                EntregarArmaDoHumano(jogador);
            });
        }
        return HookResult.Continue;
    }

    private void EntregarArma(CCSPlayerController? jogador)
    {
        var arma = Config.ArmaPrincipal;
        if (arma == "") return;
        if (jogador is not { IsValid: true, PawnIsAlive: true }) return;
        if (jogador.Team is not (CsTeam.Terrorist or CsTeam.CounterTerrorist)) return;

        var armas = jogador.PlayerPawn.Value?.WeaponServices?.MyWeapons;
        if (armas == null) return;
        if (armas.Any(item => item.Value?.DesignerName == arma)) return;

        jogador.GiveNamedItem(arma);
    }

    [GameEventHandler]
    public HookResult AoSairDaEquipe(EventPlayerDisconnect evento, GameEventInfo informacao)
    {
        if (Config.Regra != "equipe") return HookResult.Continue;
        var quem = evento.Userid;
        // Quem chegar depois não pode herdar o placar e o relógio de uma partida que ninguém mais está jogando.
        if (!Pessoas().Any(pessoa => pessoa.Slot != quem?.Slot))
        {
            ZerarPartidaDeAlaska();
            Server.ExecuteCommand("mp_restartgame 1");
        }
        return HookResult.Continue;
    }

    /// <summary>O status_json do CS2 só olha as primeiras vagas, e quem está em uma vaga alta ficaria de fora.</summary>
    [ConsoleCommand("magnatas_jogadores", "Lista as contas conectadas para o site")]
    [CommandHelper(whoCanExecute: CommandUsage.SERVER_ONLY)]
    public void ListarJogadores(CCSPlayerController? chamador, CommandInfo comando)
    {
        var contas = Pessoas().Select(jogador => jogador.SteamID.ToString());
        // O mapa vai junto para o cartão do site mostrar o que está rodando agora.
        comando.ReplyToCommand($"magnatas_jogadores=[{string.Join(",", contas)}] mapa={Server.MapName}");
    }
}
