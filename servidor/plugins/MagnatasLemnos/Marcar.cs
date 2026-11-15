using System.Text.Json;
using CounterStrikeSharp.API.Core;
using CounterStrikeSharp.API.Modules.Commands;

namespace MagnatasLemnos;

/// <summary>
/// O Adm marca o mapa andando por ele: !marcar safe|saida|caixa|chao [raio] grava o lugar onde ele está no arquivo do
/// mapa. !marcados mostra quantos já tem; !desmarcar apaga o último. Vale na hora para os postos e as saídas.
/// </summary>
public partial class IlhaLemnos
{
    private const float RaioDoPosto = 600;
    private const float RaioDaSaida = 150;

    private readonly Stack<List<Ponto>> marcacoes = new();

    private bool EhAdm(CCSPlayerController? jogador) => jogador is { IsValid: true } && naIlha.TryGetValue(jogador.SteamID, out var estado) && estado.Adm;

    private void ComandoMarcar(CCSPlayerController? jogador, CommandInfo comando)
    {
        if (jogador == null || !EhAdm(jogador))
        {
            comando.ReplyToCommand("Só o Adm marca o mapa.");
            return;
        }
        if (jogador.PlayerPawn.Value?.AbsOrigin is not { } lugar)
        {
            comando.ReplyToCommand("Esteja vivo para marcar.");
            return;
        }
        var tipo = comando.ArgCount > 1 ? comando.ArgByIndex(1).ToLowerInvariant() : "";
        float.TryParse(comando.ArgCount > 2 ? comando.ArgByIndex(2) : "", out var raioPedido);
        var (lista, raio) = tipo switch
        {
            "safe" => (mapa.SafeZones, raioPedido > 0 ? raioPedido : RaioDoPosto),
            "saida" => (mapa.Saidas, raioPedido > 0 ? raioPedido : RaioDaSaida),
            "caixa" => (mapa.Caixas, 0f),
            "chao" => (mapa.Chao, 0f),
            _ => ((List<Ponto>?)null, 0f),
        };
        if (lista == null)
        {
            comando.ReplyToCommand("Use: !marcar safe|saida|caixa|chao [raio]");
            return;
        }
        lista.Add(new Ponto { X = lugar.X, Y = lugar.Y, Z = lugar.Z, Raio = raio });
        marcacoes.Push(lista);
        SalvarMapa();
        comando.ReplyToCommand($"Marcado: {tipo} nº {lista.Count}{(raio > 0 ? $", raio {raio:0}" : "")}.");
    }

    private void ComandoMarcados(CCSPlayerController? jogador, CommandInfo comando)
    {
        if (!EhAdm(jogador))
        {
            comando.ReplyToCommand("Só o Adm vê as marcações.");
            return;
        }
        comando.ReplyToCommand($"Postos: {mapa.SafeZones.Count} · Saídas: {mapa.Saidas.Count} · Caixas: {mapa.Caixas.Count} · Chão: {mapa.Chao.Count}");
    }

    private void ComandoDesmarcar(CCSPlayerController? jogador, CommandInfo comando)
    {
        if (!EhAdm(jogador))
        {
            comando.ReplyToCommand("Só o Adm desmarca.");
            return;
        }
        if (marcacoes.Count == 0 || marcacoes.Pop() is not { Count: > 0 } lista)
        {
            comando.ReplyToCommand("Nada para desmarcar nesta sessão.");
            return;
        }
        lista.RemoveAt(lista.Count - 1);
        SalvarMapa();
        comando.ReplyToCommand("Última marcação apagada.");
    }

    private void SalvarMapa()
    {
        if (Config.ArquivoDoMapa == "") return;
        try
        {
            File.WriteAllText(Config.ArquivoDoMapa, JsonSerializer.Serialize(mapa, new JsonSerializerOptions { WriteIndented = true }));
        }
        catch (Exception erro) when (erro is IOException or UnauthorizedAccessException)
        {
            Console.WriteLine($"[Lemnos] Não deu para guardar o arquivo do mapa: {erro.GetType().Name}.");
        }
    }
}
