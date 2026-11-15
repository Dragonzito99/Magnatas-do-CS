using System.Net;
using CounterStrikeSharp.API;
using CounterStrikeSharp.API.Core;
using CounterStrikeSharp.API.Modules.Utils;

namespace MagnatasLemnos;

/// <summary>
/// A mochila na tela e a extração: parado 10 segundos dentro de uma saída, o que está na mochila vai para o baú no site,
/// e o jogador volta a um posto dos Magnatas, ainda no servidor (dono).
/// </summary>
public partial class IlhaLemnos
{
    private const float SegundosParaExtrair = 10;
    private const float VelocidadeDeParado = 5;

    private static void MostrarMochila(CCSPlayerController jogador, NaIlha estado)
    {
        var itens = estado.Mochila.Count == 0
            ? "vazia"
            : string.Join(", ", estado.Mochila.GroupBy(item => item).Select(grupo => grupo.Count() > 1 ? $"{NomeDoSaque.GetValueOrDefault(grupo.Key, grupo.Key)} ×{grupo.Count()}" : NomeDoSaque.GetValueOrDefault(grupo.Key, grupo.Key)));
        jogador.PrintToCenterHtml($"<font color='#f5b301'>Mochila {estado.Mochila.Count}/{estado.Espacos}</font><br>{WebUtility.HtmlEncode(itens)}", 3);
    }

    /// <summary>Um passo (a cada 0,25 s): posto, extração e o E de pegar.</summary>
    private void Passo()
    {
        TirarMochilasVencidas();
        foreach (var jogador in Pessoas())
        {
            if (!naIlha.TryGetValue(jogador.SteamID, out var estado) || estado.Sessao == null || estado.JaSaiu) continue;
            if (!jogador.PawnIsAlive || jogador.PlayerPawn.Value is not { } corpo || corpo.AbsOrigin is not { } lugar) continue;

            ConferirPosto(jogador, estado, corpo, lugar);

            var usando = (jogador.Buttons & PlayerButtons.Use) != 0;
            if (usando && !estado.UsoAntes) TentarPegar(jogador, estado, lugar);
            estado.UsoAntes = usando;

            if (SaidaEm(lugar) == null || corpo.AbsVelocity.Length() > VelocidadeDeParado)
            {
                if (estado.ParadoNaSaida > 0) jogador.PrintToCenterHtml("Extração cancelada: fique parado na saída.", 1);
                estado.ParadoNaSaida = 0;
                continue;
            }
            estado.ParadoNaSaida += IntervaloDoPasso;
            var faltam = (int)Math.Ceiling(SegundosParaExtrair - estado.ParadoNaSaida);
            if (faltam > 0)
            {
                jogador.PrintToCenterHtml($"<font color='#f5b301'>Extraindo em {faltam} s</font><br>Fique parado.", 1);
                continue;
            }
            Extrair(jogador, estado);
        }
    }

    private void Extrair(CCSPlayerController jogador, NaIlha estado)
    {
        var steam = jogador.SteamID;
        var saque = estado.Mochila.ToList();
        Avisar("extracao", new
        {
            sessao = estado.Sessao,
            referencia = NovaReferencia(),
            saque,
            armas = ArmasNaMao(jogador, estado),
            gastas = estado.Gastas.ToList(),
        }, json =>
        {
            var pessoa = PessoaPorSteam(steam);
            var resposta = Ler<RespostaDaExtracao>(json);
            if (pessoa == null || !naIlha.TryGetValue(steam, out var atual)) return;
            if (resposta == null)
            {
                pessoa.PrintToChat(" \x04[Ilha Lemnos]\x02 O site não confirmou a extração. Avise a equipe.");
                return;
            }
            LigarArmasAchadas(pessoa, atual, resposta.LinhasNovas);
            var grana = resposta.Grana > 0 ? $"<br>+{resposta.Grana} de Grana em dinheiro" : "";
            pessoa.PrintToCenterHtml($"<font color='#6eff6e' class='fontSize-l'>Você extraiu da Ilha Lemnos</font><br>{saque.Count} itens no baú{grana}", 5);
        });
        estado.Mochila.Clear();
        estado.Gastas.Clear();
        estado.ParadoNaSaida = 0;
        estado.SaiuDoPosto = false;
        estado.UltimoLugarFora = null;
        IrParaUmPosto(jogador);
    }
}
