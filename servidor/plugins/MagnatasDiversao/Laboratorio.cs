using CounterStrikeSharp.API;
using CounterStrikeSharp.API.Core;
using CounterStrikeSharp.API.Modules.Commands;
using CounterStrikeSharp.API.Modules.Timers;
using CounterStrikeSharp.API.Modules.Utils;

namespace MagnatasDiversao;

/// <summary>
/// Laboratório do Adm (dono, 13/11/2026): servidor só dele, ligado pela aba Testes, para testar sem esperar sorteio nem
/// pedir comando no console. No de mutantes, a rodada da Mutação fica sempre aberta e o chat escolhe tipo e nível.
/// Os dois desligam sozinhos quando ficam vazios. Quem não é Adm é tirado pelo MagnatasVisual.
/// </summary>
public partial class ModoDeDiversao
{
    private const int MinutosVazioParaDesligar = 10;
    private const float IntervaloDaConferenciaDoVazio = 60f;
    // Depois de o AoNascer entregar a arma do humano (0,1 s): a transformação tira a arma, como numa infecção.
    private const float EsperaParaVirarNoLaboratorio = 0.5f;
    private const float SegundosParaRenascerHumano = 2f;
    private static readonly string[] TiposDeMutante = { "comum", "blindado", "fumaca", "healix" };
    private DateTime? laboratorioVazioDesde;
    // Por vaga: o nível pedido no chat (vale no NivelDe), quem vira mutante ao renascer e o que cada bot é.
    private readonly Dictionary<int, int> niveisDoLaboratorio = new();
    private readonly Dictionary<int, (string Tipo, int Nivel)> transformarAoNascer = new();
    private readonly Dictionary<int, (string Tipo, int Nivel)?> botsDoLaboratorio = new();
    // Bots chamados que ainda não entraram, na ordem do pedido. Nulo é bot humano.
    private readonly Queue<(string Tipo, int Nivel)?> botsPedidos = new();
    private bool botsParados = true;

    private void LigarLaboratorio()
    {
        AddTimer(IntervaloDaConferenciaDoVazio, ConferirLaboratorioVazio, TimerFlags.REPEAT);
        // O de personagens tem os comandos no MagnatasVisual; os dois plugins no mesmo chat repetiriam o !bot.
        if (Config.Regra == "mutacao")
        {
            AddCommand("css_mutante", "Laboratório: vira o mutante (tipo nível)", ComandoMutante);
            AddCommand("css_humano", "Laboratório: volta a humano", (jogador, _) => VirarHumano(jogador));
            AddCommand("css_recarga", "Laboratório: zera a espera do E", (jogador, _) => Recarregar(jogador));
            AddCommand("css_bot", "Laboratório: chama um bot (humano ou tipo nível)", ComandoBot);
            AddCommand("css_parar", "Laboratório: bots parados ou andando", (jogador, _) => AlternarBotsParados());
            AddCommand("css_limpar", "Laboratório: tira os bots", (jogador, _) => LimparBots());
            AddCommand("css_ajuda", "Laboratório: lista os comandos", (jogador, _) => MostrarAjuda(jogador));
        }
    }

    /// <summary>Sem ninguém por 10 minutos, o servidor fecha; o site liga de novo quando o Adm pedir.</summary>
    private void ConferirLaboratorioVazio()
    {
        if (Pessoas().Any())
        {
            laboratorioVazioDesde = null;
            return;
        }
        laboratorioVazioDesde ??= DateTime.UtcNow;
        if (DateTime.UtcNow - laboratorioVazioDesde.Value < TimeSpan.FromMinutes(MinutosVazioParaDesligar)) return;
        Console.WriteLine($"[Magnatas] Laboratório vazio há {MinutosVazioParaDesligar} minutos: desligando.");
        Server.ExecuteCommand("quit");
    }

    /// <summary>A rodada fica aberta como se o sorteio já tivesse saído, sem relógio, sem fim e sem super Negev.</summary>
    private void AbrirRodadaDoLaboratorio()
    {
        rodadaEmAndamento = true;
        sorteioFeito = true;
        tempoDeEspalharAcabou = true;
        superArmaSorteada = true;
        portadorDaSuperArma = null;
        esperandoJogadores = false;
        puloDuploUsado.Clear();
    }

    /// <summary>Quem chega, troca de lado ou morre volta no lado em que está: humano renasce humano, mutante, mutante.</summary>
    private void ColocarNoLaboratorio(CCSPlayerController? jogador)
    {
        if (jogador is not { IsValid: true }) return;
        PedidoDoBot(jogador);
        if (jogador.PawnIsAlive || jogador.Team is not (CsTeam.Terrorist or CsTeam.CounterTerrorist)) return;
        if (jogador.Team == CsTeam.Terrorist)
        {
            AddTimer(mutanteDaRodada.SegundosParaRenascer, () => RenascerComoMutante(jogador));
            return;
        }
        AddTimer(SegundosParaRenascerHumano, () =>
        {
            if (jogador is { IsValid: true, PawnIsAlive: false, Team: CsTeam.CounterTerrorist }) jogador.Respawn();
        });
    }

    /// <summary>O bot que acabou de entrar fica com o primeiro pedido da fila.</summary>
    private (string Tipo, int Nivel)? PedidoDoBot(CCSPlayerController jogador)
    {
        if (!jogador.IsBot) return null;
        if (!botsDoLaboratorio.TryGetValue(jogador.Slot, out var pedido))
        {
            pedido = botsPedidos.Count > 0 ? botsPedidos.Dequeue() : null;
            botsDoLaboratorio[jogador.Slot] = pedido;
        }
        return pedido;
    }

    /// <summary>
    /// Humano que nasce com um pedido (o do chat, ou o bot mutante) vira mutante pela transformação, o caminho normal
    /// da infecção. Humano sem pedido volta à vida e à cor de humano: o corpo é o mesmo de quando era mutante.
    /// </summary>
    private void AoNascerNoLaboratorio(CCSPlayerController? jogador)
    {
        if (jogador is not { IsValid: true, PawnIsAlive: true, Team: CsTeam.CounterTerrorist }) return;
        (string Tipo, int Nivel)? pedido = transformarAoNascer.Remove(jogador.Slot, out var doChat) ? doChat : PedidoDoBot(jogador);
        if (pedido is { } virar)
        {
            GuardarPedido(jogador.Slot, virar.Tipo, virar.Nivel);
            TransformarEmMutante(jogador, null);
            return;
        }
        var corpo = jogador.PlayerPawn.Value;
        if (corpo == null) return;
        corpo.MaxHealth = VidaDoHumano;
        corpo.Health = VidaDoHumano;
        Utilities.SetStateChanged(corpo, "CBaseEntity", "m_iMaxHealth");
        Utilities.SetStateChanged(corpo, "CBaseEntity", "m_iHealth");
        corpo.Render = CorDoHumano;
        Utilities.SetStateChanged(corpo, "CBaseModelEntity", "m_clrRender");
    }

    private void GuardarPedido(int vaga, string tipo, int nivel)
    {
        if (tipo == "comum") skinsDeTeste.Remove(vaga);
        else skinsDeTeste[vaga] = tipo;
        niveisDoLaboratorio[vaga] = nivel;
        infeccoes.Remove(vaga);
    }

    private void EsquecerVagaDoLaboratorio(int vaga)
    {
        if (!Config.Laboratorio) return;
        niveisDoLaboratorio.Remove(vaga);
        transformarAoNascer.Remove(vaga);
        botsDoLaboratorio.Remove(vaga);
        skinsDeTeste.Remove(vaga);
    }

    /// <summary>Tipo da lista e nível de 1 a 3. Fora disso o pedido é recusado, para o Adm ver que digitou errado.</summary>
    private static (string Tipo, int Nivel)? LerPedido(string tipo, string textoDoNivel)
    {
        tipo = tipo.Trim().ToLowerInvariant();
        if (!TiposDeMutante.Contains(tipo) || !int.TryParse(textoDoNivel, out var nivel) || nivel is < 1 or > 3) return null;
        return (tipo, nivel);
    }

    private void ComandoMutante(CCSPlayerController? jogador, CommandInfo comando)
    {
        if (jogador is not { IsValid: true }) return;
        var pedido = LerPedido(comando.GetArg(1), comando.ArgCount > 2 ? comando.GetArg(2) : "1");
        if (pedido is not { } virar)
        {
            jogador.PrintToChat(" [Magnatas] Use: !mutante <comum|blindado|fumaca|healix> [nível 1 a 3]");
            return;
        }
        AvisarSeFaltaOBoneco(jogador, virar.Tipo);
        VirarMutante(jogador, virar.Tipo, virar.Nivel);
        jogador.PrintToChat($" [Magnatas] Virando {virar.Tipo}, nível {virar.Nivel}.");
    }

    private void VirarMutante(CCSPlayerController jogador, string tipo, int nivel)
    {
        Recarregar(jogador, avisar: false);
        if (jogador is { PawnIsAlive: true, Team: CsTeam.CounterTerrorist })
        {
            GuardarPedido(jogador.Slot, tipo, nivel);
            TransformarEmMutante(jogador, null);
            return;
        }
        if (jogador is { PawnIsAlive: true, Team: CsTeam.Terrorist })
        {
            // Trocar o boneco de um mutante vivo fechou jogos (10/11/2026): ele volta humano, renasce, e a transformação
            // veste o boneco novo no AoNascerNoLaboratorio.
            transformarAoNascer[jogador.Slot] = (tipo, nivel);
            jogador.SwitchTeam(CsTeam.CounterTerrorist);
            jogador.Respawn();
            return;
        }
        // Morto ou assistindo: nasce direto mutante, e o AoNascer veste o boneco do tipo e do nível.
        GuardarPedido(jogador.Slot, tipo, nivel);
        if (jogador.Team != CsTeam.Terrorist) jogador.SwitchTeam(CsTeam.Terrorist);
        jogador.Respawn();
    }

    private void VirarHumano(CCSPlayerController? jogador)
    {
        if (jogador is not { IsValid: true }) return;
        skinsDeTeste.Remove(jogador.Slot);
        niveisDoLaboratorio.Remove(jogador.Slot);
        transformarAoNascer.Remove(jogador.Slot);
        infeccoes.Remove(jogador.Slot);
        Recarregar(jogador, avisar: false);
        if (jogador is { PawnIsAlive: true, Team: CsTeam.CounterTerrorist })
        {
            jogador.PrintToChat(" [Magnatas] Você já é humano.");
            return;
        }
        jogador.SwitchTeam(CsTeam.CounterTerrorist);
        jogador.Respawn();
    }

    private void Recarregar(CCSPlayerController? jogador, bool avisar = true)
    {
        if (jogador is not { IsValid: true }) return;
        corridas.Remove(jogador.Slot);
        escudos.Remove(jogador.Slot);
        fumacas.Remove(jogador.Slot);
        curas.Remove(jogador.Slot);
        puloDuploUsado.Remove(jogador.Slot);
        if (avisar) jogador.PrintToChat(" [Magnatas] Poder recarregado: o E já funciona de novo.");
    }

    private void ComandoBot(CCSPlayerController? jogador, CommandInfo comando)
    {
        if (jogador is not { IsValid: true }) return;
        var tipo = comando.ArgCount > 1 ? comando.GetArg(1).Trim().ToLowerInvariant() : "";
        if (tipo == "humano")
        {
            ChamarBot(null);
            jogador.PrintToChat(" [Magnatas] Chamando um bot humano.");
            return;
        }
        var pedido = LerPedido(tipo, comando.ArgCount > 2 ? comando.GetArg(2) : "1");
        if (pedido is not { } virar)
        {
            jogador.PrintToChat(" [Magnatas] Use: !bot humano  ou  !bot <comum|blindado|fumaca|healix> [nível 1 a 3]");
            return;
        }
        AvisarSeFaltaOBoneco(jogador, virar.Tipo);
        ChamarBot(virar);
        jogador.PrintToChat($" [Magnatas] Chamando um bot {virar.Tipo}, nível {virar.Nivel}.");
    }

    private void ChamarBot((string Tipo, int Nivel)? pedido)
    {
        botsPedidos.Enqueue(pedido);
        // Todo bot entra humano: o mutante vem pela transformação, como a infecção, e nunca trocando o boneco vivo.
        Server.ExecuteCommand("bot_add_ct");
    }

    /// <summary>Parados, os bots também não atiram; andando, os humanos atiram, para testar escudo, cura e fumaça.</summary>
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

    /// <summary>O pacote de cada mutante chega ao servidor ao ligar; sem ele, o tipo aparece como o comum.</summary>
    private void AvisarSeFaltaOBoneco(CCSPlayerController jogador, string tipo)
    {
        var chegou = tipo switch
        {
            "blindado" => BlindadoNoServidor(),
            "fumaca" => FumacaNoServidor(),
            "healix" => HealixNoServidor(),
            _ => ZumbiNoServidor(),
        };
        if (!chegou) jogador.PrintToChat($" [Magnatas] O boneco de {tipo} ainda não chegou a este servidor: vai aparecer como o comum.");
    }

    private static void MostrarAjuda(CCSPlayerController? jogador)
    {
        if (jogador is not { IsValid: true }) return;
        foreach (var linha in new[]
        {
            " [Magnatas] Laboratório de mutantes:",
            " !mutante <comum|blindado|fumaca|healix> [1-3]  vira esse mutante",
            " !humano  volta a humano    !recarga  zera a espera do E",
            " !bot humano  ou  !bot <tipo> [1-3]  chama um bot",
            " !parar  bots parados/andando    !limpar  tira os bots",
            " Terceira pessoa: thirdperson no console (firstperson volta).",
        }) jogador.PrintToChat(linha);
    }
}
