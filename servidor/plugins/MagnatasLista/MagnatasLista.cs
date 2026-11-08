using CounterStrikeSharp.API;
using CounterStrikeSharp.API.Core;
using CounterStrikeSharp.API.Core.Attributes.Registration;
using CounterStrikeSharp.API.Modules.Commands;

namespace MagnatasLista;

/// <summary>
/// Só para o servidor do competitivo, junto do MatchZy: o CS2 não mostra o SteamID de quem está conectado no status nem
/// no status_json, então o site pergunta aqui quem já entrou na partida. Não mexe em mais nada do jogo.
/// </summary>
public class MagnatasLista : BasePlugin
{
    public override string ModuleName => "Magnatas: lista de jogadores";
    public override string ModuleVersion => "1.0.0";

    /// <summary>A mesma resposta do plugin da Diversão, para o site ler os dois do mesmo jeito.</summary>
    [ConsoleCommand("magnatas_jogadores", "Lista as contas conectadas para o site")]
    [CommandHelper(whoCanExecute: CommandUsage.SERVER_ONLY)]
    public void ListarJogadores(CCSPlayerController? chamador, CommandInfo comando)
    {
        var contas = Utilities.GetPlayers()
            .Where(jogador => jogador is { IsValid: true, IsBot: false, IsHLTV: false, Connected: PlayerConnectedState.Connected } && jogador.SteamID > 0)
            .Select(jogador => jogador.SteamID.ToString());
        comando.ReplyToCommand($"magnatas_jogadores=[{string.Join(",", contas)}] mapa={Server.MapName}");
    }
}
