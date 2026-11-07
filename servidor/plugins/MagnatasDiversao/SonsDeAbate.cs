using CounterStrikeSharp.API.Core;
using CounterStrikeSharp.API.Core.Attributes.Registration;
using CounterStrikeSharp.API.Modules.Utils;

namespace MagnatasDiversao;

/// <summary>
/// Sons de abate em sequência: de 2 a 7 abates sem morrer, e o tiro na cabeça no primeiro. Depois do 7, silêncio.
/// Os sons vêm do pacote da Oficina que o MultiAddonManager manda cada jogador baixar.
/// Só quem matou ouve, na voz do time dele.
/// </summary>
public partial class ModoDeDiversao
{
    private const int MaiorSequenciaComSom = 7;
    private readonly Dictionary<ulong, int> sequencias = new();

    private void LigarSonsDeAbate()
    {
        RegisterListener<Listeners.OnServerPrecacheResources>(manifesto =>
            manifesto.AddResource("soundevents/soundevents_addon.vsndevts"));
    }

    /// <summary>A sequência tem a vez sobre o tiro na cabeça, que só toca no primeiro abate.</summary>
    internal static string? SomDoAbate(int sequencia, bool tiroNaCabeca, CsTeam time)
    {
        var voz = time == CsTeam.CounterTerrorist ? "ct" : "tr";
        // Depois do 7 fica em silêncio, a pedido do dono.
        if (sequencia > MaiorSequenciaComSom) return null;
        if (sequencia >= 2) return $"magnatas.killmark_{sequencia}_{voz}";
        return tiroNaCabeca ? $"magnatas.headshot_{voz}" : null;
    }

    [GameEventHandler]
    public HookResult TocarSomDoAbate(EventPlayerDeath evento, GameEventInfo informacao)
    {
        var quem = evento.Attacker;
        var alvo = evento.Userid;
        if (alvo is { IsValid: true }) sequencias.Remove(alvo.SteamID);
        if (quem is not { IsValid: true, IsBot: false } || alvo is not { IsValid: true } || quem == alvo) return HookResult.Continue;
        // Morte pela bomba ou de alguém do próprio time não conta para a sequência.
        if (evento.Weapon.Contains("c4")) return HookResult.Continue;
        if (Config.Regra != "cada_um" && quem.Team == alvo.Team) return HookResult.Continue;

        var sequencia = sequencias.GetValueOrDefault(quem.SteamID) + 1;
        sequencias[quem.SteamID] = sequencia;
        var som = SomDoAbate(sequencia, evento.Headshot, quem.Team);
        if (som == null) return HookResult.Continue;

        var soQuemMatou = new RecipientFilter();
        soQuemMatou.Add(quem);
        quem.EmitSound(som, soQuemMatou);
        return HookResult.Continue;
    }
}
