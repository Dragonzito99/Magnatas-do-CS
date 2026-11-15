using System.Drawing;
using CounterStrikeSharp.API;
using CounterStrikeSharp.API.Core;
using CounterStrikeSharp.API.Modules.Utils;

namespace MagnatasLemnos;

/// <summary>
/// Os mutantes da ilha (dono, 15/11/2026): bots do computador com o boneco do mutante da Mutação, só de faca, que vivem
/// em zonas marcadas pelo Adm. Matar um deixa saque no chão; ele volta 2 minutos depois. Mutante não fere mutante.
/// </summary>
public partial class IlhaLemnos
{
    // O pacote da Oficina com o boneco do mutante, o mesmo da Mutação (cada nível tem o próprio boneco).
    private const string PacoteDoMutante = "3836643990";
    private const string PastaDoMutante = "models/magnatas/mutante_v2";
    private const float RaioDaZonaDeMutantes = 900;
    private const int MutantesPorZona = 2;
    private const int MaximoDeMutantes = 6;
    private const float MinutosParaOMutanteVoltar = 2;
    private const float AfastamentoMaximo = 2.5f;
    private static readonly Color CorDoMutanteSemBoneco = Color.FromArgb(255, 110, 255, 110);

    /// <summary>Nível, vida, velocidade e a chance de nascer assim.</summary>
    private static readonly (int Nivel, int Vida, float Velocidade, double Chance)[] NiveisDoMutante =
    [
        (1, 200, 1.0f, 0.70),
        (2, 400, 1.15f, 0.25),
        (3, 800, 1.1f, 0.05),
    ];

    private sealed class MutanteDaIlha
    {
        public int Nivel { get; set; } = 1;
        public Ponto Casa { get; set; } = new();
        public DateTime? MorreuEm { get; set; }
    }

    private readonly Dictionary<int, MutanteDaIlha> mutantes = new();
    private bool? pacoteDoMutanteNoServidor;

    private static string ModeloDoMutante(int nivel) => $"{PastaDoMutante}/nivel{nivel}/mutante.vmdl";

    private int QuantosMutantes() => Math.Min(MaximoDeMutantes, mapa.Mutantes.Count * MutantesPorZona);

    /// <summary>O boneco só é usado se o pacote está no servidor: sem ele, o mutante fica sem animação e sem acerto.</summary>
    private bool MutanteNoServidor()
    {
        if (pacoteDoMutanteNoServidor is { } sabido) return sabido;
        var achou = false;
        foreach (var raiz in new[] { Server.GameDirectory, Path.GetDirectoryName(Server.GameDirectory) ?? "" })
        {
            var lista = Path.Combine(raiz, "bin", "linuxsteamrt64", "steamapps", "workshop", "content", "730", PacoteDoMutante, $"{PacoteDoMutante}_dir.vpk");
            try
            {
                if (File.Exists(lista) && System.Text.Encoding.ASCII.GetString(File.ReadAllBytes(lista)).Contains(PastaDoMutante)) achou = true;
            }
            catch (Exception erro) when (erro is IOException or UnauthorizedAccessException)
            {
            }
        }
        pacoteDoMutanteNoServidor = achou;
        return achou;
    }

    private void PrepararBonecosDoMutante(ResourceManifest manifesto)
    {
        if (!MutanteNoServidor()) return;
        foreach (var (nivel, _, _, _) in NiveisDoMutante) manifesto.AddResource(ModeloDoMutante(nivel));
    }

    /// <summary>Chama (ou tira) os bots conforme as zonas marcadas: 2 por zona, no máximo 6, todos no time CT.</summary>
    private void LigarMutantes()
    {
        var quantos = QuantosMutantes();
        foreach (var comando in new[] { "bot_join_team ct", "bot_quota_mode normal", "bot_difficulty 2", "bot_join_after_player 0", "bot_chatter off", $"bot_quota {quantos}" })
            Server.ExecuteCommand(comando);
        Console.WriteLine($"[Lemnos] Mutantes: {quantos} em {mapa.Mutantes.Count} zonas.");
    }

    private static int SortearNivel()
    {
        var sorte = Random.Shared.NextDouble();
        foreach (var (nivel, _, _, chance) in NiveisDoMutante)
        {
            if (sorte < chance) return nivel;
            sorte -= chance;
        }
        return 1;
    }

    private static bool CorpoDeBot(CBaseEntity? corpo)
    {
        if (corpo is not { DesignerName: "player" }) return false;
        var dono = new CCSPlayerPawn(corpo.Handle).Controller.Value;
        return dono != null && new CCSPlayerController(dono.Handle) is { IsValid: true, IsBot: true };
    }

    /// <summary>O mutante nasceu: faca, vida e velocidade do nível, o boneco, e a zona dele.</summary>
    private void PrepararMutante(CCSPlayerController bot)
    {
        if (!bot.IsValid || !bot.PawnIsAlive || bot.PlayerPawn.Value is not { } corpo || mapa.Mutantes.Count == 0) return;
        if (bot.Team != CsTeam.CounterTerrorist) bot.ChangeTeam(CsTeam.CounterTerrorist);
        var nivel = SortearNivel();
        var dados = NiveisDoMutante.First(item => item.Nivel == nivel);
        var casa = mapa.Mutantes[Random.Shared.Next(mapa.Mutantes.Count)];
        mutantes[bot.Slot] = new MutanteDaIlha { Nivel = nivel, Casa = casa };

        bot.RemoveWeapons();
        bot.GiveNamedItem("weapon_knife");
        corpo.MaxHealth = dados.Vida;
        corpo.Health = dados.Vida;
        Utilities.SetStateChanged(corpo, "CBaseEntity", "m_iMaxHealth");
        Utilities.SetStateChanged(corpo, "CBaseEntity", "m_iHealth");
        corpo.VelocityModifier = dados.Velocidade;
        if (MutanteNoServidor())
        {
            corpo.SetModel(ModeloDoMutante(nivel));
        }
        else
        {
            corpo.Render = CorDoMutanteSemBoneco;
            Utilities.SetStateChanged(corpo, "CBaseModelEntity", "m_clrRender");
        }
        bot.PlayerName = nivel == 3 ? "Mutante chefe" : $"Mutante nível {nivel}";
        Utilities.SetStateChanged(bot, "CBasePlayerController", "m_iszPlayerName");

        var x = casa.X + Random.Shared.Next(-200, 201);
        var y = casa.Y + Random.Shared.Next(-200, 201);
        corpo.Teleport(new Vector(x, y, casa.Z + 8), corpo.AbsRotation, new Vector(0, 0, 0));
    }

    /// <summary>O mutante morreu: deixa saque conforme o nível e volta 2 minutos depois.</summary>
    private void AoMorrerOMutante(CCSPlayerController bot)
    {
        var nivel = mutantes.TryGetValue(bot.Slot, out var mutante) ? mutante.Nivel : 1;
        if (mutante != null) mutante.MorreuEm = DateTime.UtcNow;
        else mutantes[bot.Slot] = new MutanteDaIlha { MorreuEm = DateTime.UtcNow };
        if (bot.PlayerPawn.Value?.AbsOrigin is { } lugar) DeixarSaqueDoMutante(Copia(lugar), nivel);
    }

    /// <summary>Nível 1: metade das vezes, comum ou dinheiro. Nível 2: raro ou dinheiro. Nível 3: 40% lendário, e dinheiro.</summary>
    private void DeixarSaqueDoMutante(Vector lugar, int nivel)
    {
        var itens = new List<string>();
        var sorte = Random.Shared.NextDouble();
        if (nivel == 1 && sorte < 0.5) itens.Add(Random.Shared.NextDouble() < 0.7 ? Sortear(Comuns) : Dinheiro);
        if (nivel == 2) itens.Add(sorte < 0.7 ? Sortear(Raros) : Dinheiro);
        if (nivel == 3)
        {
            itens.Add(sorte < 0.4 ? Sortear(Lendarios) : Sortear(Raros));
            itens.Add(Dinheiro);
        }
        DeixarMochilaNoChao(lugar, itens);
    }

    /// <summary>A cada 5 segundos: volta quem já esperou, e quem se afastou demais da zona volta para ela.</summary>
    private void CuidarDosMutantes()
    {
        if (mapa.Mutantes.Count == 0) return;
        var agora = DateTime.UtcNow;
        foreach (var bot in Utilities.GetPlayers().Where(jogador => jogador is { IsValid: true, IsBot: true }))
        {
            mutantes.TryGetValue(bot.Slot, out var mutante);
            if (!bot.PawnIsAlive)
            {
                if (bot.Team is not (CsTeam.Terrorist or CsTeam.CounterTerrorist)) bot.ChangeTeam(CsTeam.CounterTerrorist);
                if (mutante?.MorreuEm is not { } morreu || (agora - morreu).TotalMinutes >= MinutosParaOMutanteVoltar) bot.Respawn();
                continue;
            }
            if (mutante == null || bot.PlayerPawn.Value is not { } corpo || corpo.AbsOrigin is not { } lugar) continue;
            var raio = mutante.Casa.Raio > 0 ? mutante.Casa.Raio : RaioDaZonaDeMutantes;
            if (Distancia(lugar, mutante.Casa) <= raio * AfastamentoMaximo) continue;
            corpo.Teleport(new Vector(mutante.Casa.X, mutante.Casa.Y, mutante.Casa.Z + 8), corpo.AbsRotation, new Vector(0, 0, 0));
        }
    }
}
