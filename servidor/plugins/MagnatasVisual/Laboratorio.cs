using System.Text.RegularExpressions;
using CounterStrikeSharp.API;
using CounterStrikeSharp.API.Core;
using CounterStrikeSharp.API.Modules.Commands;

namespace MagnatasVisual;

/// <summary>
/// Laboratório do Adm (dono, 13/11/2026), ligado pela aba Testes do site. Nos dois laboratórios só fica quem o site diz
/// que é Adm. No de personagens, o chat veste qualquer personagem da lista, chama bots vestidos e faz os gestos.
/// </summary>
public partial class MagnatasVisual
{
    private const float SegundosParaConfirmarAdm = 15f;
    // Tempo para o jogo tirar o corpo antes de o laboratório pedir o renascimento.
    private const float EsperaParaRenascer = 0.5f;
    // O personagem que cada vaga escolheu no laboratório (pessoas e bots).
    private readonly Dictionary<int, string> escolhas = new();
    // Bots chamados que ainda não entraram, na ordem do pedido.
    private readonly Queue<string> botsPedidos = new();
    private bool botsParados = true;

    private static string PastaDoServidor() => Server.GameDirectory.Replace('\\', '/');

    private static bool NoLaboratorio() => PastaDoServidor().Contains("/diversao/laboratorio-");

    private static bool NoLaboratorioDePersonagens() => PastaDoServidor().Contains("/diversao/laboratorio-personagens/");

    private void LigarLaboratorio()
    {
        AddCommand("css_vestir", "Laboratório: veste um personagem (sem nome, lista)", Vestir);
        AddCommand("css_tirar", "Laboratório: volta ao boneco do jogo", (jogador, _) => Tirar(jogador));
        AddCommand("css_bot", "Laboratório: chama um bot vestido", ComandoBot);
        AddCommand("css_botgesto", "Laboratório: os bots vestidos fazem o gesto", ComandoBotGesto);
        AddCommand("css_parar", "Laboratório: bots parados ou andando", (_, _) => AlternarBotsParados());
        AddCommand("css_limpar", "Laboratório: tira os bots", (_, _) => LimparBots());
        AddCommand("css_ajuda", "Laboratório: lista os comandos", (jogador, _) => MostrarAjuda(jogador));
    }

    /// <summary>Só o Adm fica. Sem resposta do site também sai: o laboratório fecha na dúvida.</summary>
    private void ConferirAdmNoLaboratorio(CCSPlayerController? jogador)
    {
        if (!NoLaboratorio() || jogador is not { IsValid: true, IsBot: false } || jogador.SteamID == 0) return;
        if (visuais.TryGetValue(jogador.SteamID, out var visual) && visual.Adm) return;
        Console.WriteLine($"[Magnatas] Laboratório: {jogador.SteamID} não é Adm e saiu.");
        if (jogador.UserId is int id) Server.ExecuteCommand($"kickid {id} \"Laboratório: só o Adm entra\"");
    }

    /// <summary>A pasta do personagem sem a versão: "adm_v1" vira "adm".</summary>
    private static string NomeCurto(string pasta) => Regex.Replace(pasta, @"_v\d+$", "");

    private static string PastaDe(string caminho) => Path.GetFileName(Path.GetDirectoryName(caminho)!.Replace('\\', '/')) ?? caminho;

    /// <summary>Pela pasta inteira ("adm_v1") ou pelo nome curto ("adm"), que pega a versão mais nova da lista.</summary>
    private static string? AcharPersonagem(string nome)
    {
        nome = nome.Trim().ToLowerInvariant();
        if (nome == "") return null;
        var exato = Bonecos.Keys.FirstOrDefault(caminho => PastaDe(caminho) == nome);
        return exato ?? Bonecos.Keys.LastOrDefault(caminho => NomeCurto(PastaDe(caminho)) == nome);
    }

    private void ListarPersonagens(CCSPlayerController jogador)
    {
        jogador.PrintToChat(" [Magnatas] Personagens (use !vestir <nome>):");
        foreach (var (caminho, boneco) in Bonecos)
        {
            var chegou = BonecoNoServidor(caminho) != null;
            var notas = (boneco.Gestos != null ? ", com gestos" : "") + (boneco.SoNoLaboratorio ? ", novo: só aqui" : "") + (chegou ? "" : ", ainda não chegou ao servidor");
            jogador.PrintToChat($"  {PastaDe(caminho)}{(notas == "" ? "" : $" ({notas.TrimStart(',', ' ')})")}");
        }
    }

    /// <summary>Nunca troca o boneco de quem está vivo (já derrubou jogos): a pessoa renasce, e o nascimento veste.</summary>
    private void Vestir(CCSPlayerController? jogador, CommandInfo comando)
    {
        if (jogador is not { IsValid: true }) return;
        var nome = comando.ArgCount > 1 ? comando.GetArg(1) : "";
        if (nome.Trim() == "")
        {
            ListarPersonagens(jogador);
            return;
        }
        var caminho = AcharPersonagem(nome);
        if (caminho == null)
        {
            jogador.PrintToChat($" [Magnatas] Não achei o personagem \"{nome}\".");
            ListarPersonagens(jogador);
            return;
        }
        if (BonecoNoServidor(caminho) == null)
        {
            jogador.PrintToChat($" [Magnatas] {PastaDe(caminho)} ainda não chegou a este servidor.");
            return;
        }
        escolhas[jogador.Slot] = caminho;
        jogador.PrintToChat($" [Magnatas] Vestindo {PastaDe(caminho)}.");
        Renascer(jogador);
    }

    private void Tirar(CCSPlayerController? jogador)
    {
        if (jogador is not { IsValid: true }) return;
        if (!escolhas.Remove(jogador.Slot))
        {
            jogador.PrintToChat(" [Magnatas] Você já está com o boneco do jogo.");
            return;
        }
        jogador.PrintToChat(" [Magnatas] De volta ao boneco do jogo.");
        Renascer(jogador);
    }

    /// <summary>Vivo, sai do corpo e renasce logo; o AoNascer veste o que estiver escolhido.</summary>
    private void Renascer(CCSPlayerController jogador)
    {
        EncerrarGesto(jogador.Slot, devolverCorpo: false);
        if (jogador.PawnIsAlive) jogador.PlayerPawn.Value?.CommitSuicide(false, true);
        AddTimer(EsperaParaRenascer, () =>
        {
            if (jogador is { IsValid: true, PawnIsAlive: false }) jogador.Respawn();
        });
    }

    /// <summary>O bot que acabou de nascer pela primeira vez fica com o primeiro pedido da fila.</summary>
    private void PedidoDoBot(CCSPlayerController bot)
    {
        if (!escolhas.ContainsKey(bot.Slot) && botsPedidos.Count > 0) escolhas[bot.Slot] = botsPedidos.Dequeue();
    }

    private void ComandoBot(CCSPlayerController? jogador, CommandInfo comando)
    {
        if (jogador is not { IsValid: true }) return;
        var caminho = AcharPersonagem(comando.ArgCount > 1 ? comando.GetArg(1) : "");
        if (caminho == null || BonecoNoServidor(caminho) == null)
        {
            jogador.PrintToChat(" [Magnatas] Use: !bot <nome do personagem>. A lista sai no !vestir.");
            return;
        }
        botsPedidos.Enqueue(caminho);
        Server.ExecuteCommand("bot_add");
        jogador.PrintToChat($" [Magnatas] Chamando um bot com {PastaDe(caminho)}.");
    }

    private void ComandoBotGesto(CCSPlayerController? jogador, CommandInfo comando)
    {
        if (jogador is not { IsValid: true }) return;
        var gesto = comando.ArgCount > 1 ? comando.GetArg(1).Trim().ToLowerInvariant() : "";
        if (!SegundosDosGestos.ContainsKey(gesto))
        {
            jogador.PrintToChat($" [Magnatas] Use: !botgesto <{string.Join("|", SegundosDosGestos.Keys)}>");
            return;
        }
        var bots = Utilities.GetPlayers().Where(bot => bot is { IsValid: true, IsBot: true, PawnIsAlive: true } && escolhas.ContainsKey(bot.Slot)).ToList();
        foreach (var bot in bots) FazerGesto(bot, gesto);
        if (!bots.Any(bot => BonecoDe(bot) is { Boneco.Gestos: not null }))
            jogador.PrintToChat(" [Magnatas] Nenhum bot está com um personagem que tem gestos.");
    }

    /// <summary>Parados, os bots também não atiram.</summary>
    private void AlternarBotsParados()
    {
        botsParados = !botsParados;
        var valor = botsParados ? 1 : 0;
        Server.ExecuteCommand($"bot_stop {valor}");
        Server.ExecuteCommand($"bot_dont_shoot {valor}");
        foreach (var pessoa in Pessoas()) pessoa.PrintToChat(botsParados ? " [Magnatas] Bots parados e sem atirar." : " [Magnatas] Bots andando e atirando.");
    }

    private void LimparBots()
    {
        botsPedidos.Clear();
        Server.ExecuteCommand("bot_kick");
        foreach (var pessoa in Pessoas()) pessoa.PrintToChat(" [Magnatas] Bots fora.");
    }

    private static void MostrarAjuda(CCSPlayerController? jogador)
    {
        if (jogador is not { IsValid: true }) return;
        foreach (var linha in new[]
        {
            " [Magnatas] Laboratório de personagens:",
            " !vestir  lista    !vestir <nome>  veste    !tirar  volta ao boneco do jogo",
            " !danca  !flexao  !mortal  gestos em você",
            " !bot <nome>  chama um bot vestido    !botgesto <danca|flexao|mortal>  os bots fazem",
            " !parar  bots parados/andando    !limpar  tira os bots",
            " Terceira pessoa: thirdperson no console (firstperson volta).",
        }) jogador.PrintToChat(linha);
    }
}
