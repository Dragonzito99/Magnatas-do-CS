using CounterStrikeSharp.API;
using CounterStrikeSharp.API.Core;
using CounterStrikeSharp.API.Modules.Commands;

namespace MagnatasLemnos;

/// <summary>
/// O kit na mão e o rastro de cada peça: a entidade de cada arma guarda a linha do baú, para o site saber o que voltou,
/// o que se perdeu e o que é arma achada. A de MagCoin e a Glock de graça nunca ficam no chão nem passam de mão.
/// </summary>
public partial class IlhaLemnos
{
    private const float EsperaParaLigarAsArmas = 0.3f;
    private const int TentativasDeLigarOKit = 5;

    /// <summary>
    /// A classe que o site conhece. O nome interno da M4A1-S, da USP-S e do R8 é o da M4A4, da P2000 e da Deagle: só o
    /// número do item separa.
    /// </summary>
    private static string ClasseDe(CBasePlayerWeapon arma)
    {
        var numero = arma.AttributeManager.Item.ItemDefinitionIndex;
        return (arma.DesignerName, numero) switch
        {
            ("weapon_m4a1", 60) => "weapon_m4a1_silencer",
            ("weapon_hkp2000", 61) => "weapon_usp_silencer",
            ("weapon_deagle", 64) => "weapon_revolver",
            _ => arma.DesignerName,
        };
    }

    private static bool EhFacaOuBomba(string nome) => nome.Contains("knife") || nome.Contains("bayonet") || nome == "weapon_c4";

    private void DarKit(CCSPlayerController jogador, NaIlha estado, KitDaEntrada kit)
    {
        estado.Espacos = kit.Espacos;
        estado.ArmasDoKit.Clear();
        jogador.RemoveWeapons();
        jogador.GiveNamedItem("weapon_knife");
        var pecas = new List<PecaDoKit>();
        if (kit.Principal != null) pecas.Add(kit.Principal);
        pecas.Add(kit.Secundaria);
        pecas.AddRange(kit.Granadas);
        foreach (var peca in pecas) jogador.GiveNamedItem(peca.Classe);
        // A arma só aparece na lista do jogador um pouco depois de entregue.
        AddTimer(EsperaParaLigarAsArmas, () => LigarArmasAoKit(jogador, estado, pecas, 1));
    }

    /// <summary>
    /// Liga cada peça do kit à entidade da arma. A que não apareceu ainda é tentada de novo: arma de MagCoin ou Glock de
    /// graça sem ligação seria contada como achada e duplicaria.
    /// </summary>
    private void LigarArmasAoKit(CCSPlayerController jogador, NaIlha estado, List<PecaDoKit> pecas, int tentativa)
    {
        if (!jogador.IsValid || jogador.PlayerPawn.Value?.WeaponServices?.MyWeapons is not { } armas) return;
        var livres = new List<PecaDoKit>(pecas);
        foreach (var alca in armas)
        {
            if (alca.Value is not { IsValid: true } arma || estado.ArmasDoKit.ContainsKey(arma.Index)) continue;
            var classe = ClasseDe(arma);
            var dela = livres.Where(peca => peca.Classe == classe).ToList();
            if (dela.Count == 0) continue;
            foreach (var peca in dela) livres.Remove(peca);
            estado.ArmasDoKit[arma.Index] = dela;
        }
        if (livres.Count == 0) return;
        if (tentativa >= TentativasDeLigarOKit)
        {
            Console.WriteLine($"[Lemnos] {livres.Count} peças do kit de {jogador.PlayerName} não apareceram na mão.");
            return;
        }
        AddTimer(EsperaParaLigarAsArmas, () => LigarArmasAoKit(jogador, estado, livres, tentativa + 1));
    }

    /// <summary>A entidade é uma arma de MagCoin ou a Glock de graça do kit de outra pessoa.</summary>
    private bool DeOutroKit(uint indice, ulong dono) =>
        naIlha.Any(par => par.Key != dono && par.Value.ArmasDoKit.TryGetValue(indice, out var pecas) && pecas.Any(peca => peca.Magcoin || peca.Gratis));

    /// <summary>
    /// A arma de MagCoin e a Glock de graça nunca passam de mão. Pegar outra arma com E larga a atual sem passar pelo
    /// comando drop: a cada passo, a que saiu da mão do dono some do mapa (a de MagCoin continua no baú dele).
    /// </summary>
    private void PrenderArmasQueNaoCaem()
    {
        foreach (var (steam, estado) in naIlha)
        {
            var dono = PessoaPorSteam(steam);
            foreach (var (indice, pecas) in estado.ArmasDoKit.ToList())
            {
                if (!pecas.Any(peca => peca.Magcoin || peca.Gratis)) continue;
                var arma = Utilities.GetEntityFromIndex<CBasePlayerWeapon>((int)indice);
                if (arma is not { IsValid: true } || !arma.DesignerName.StartsWith("weapon_") || !pecas.Any(peca => peca.Classe == ClasseDe(arma)))
                {
                    estado.ArmasDoKit.Remove(indice);
                    continue;
                }
                var naMao = dono?.PlayerPawn.Value?.WeaponServices?.MyWeapons.Any(alca => alca.Value?.Index == indice) == true;
                if (naMao) continue;
                arma.Remove();
                estado.ArmasDoKit.Remove(indice);
                if (dono is { IsValid: true }) dono.PrintToCenterHtml("Essa arma não sai da sua mão: ela voltou para o seu baú.", 3);
            }
        }
    }

    /// <summary>O que o jogador tem na mão agora, como o site espera. A Glock de graça não conta.</summary>
    private List<ArmaNaMao> ArmasNaMao(CCSPlayerController jogador, NaIlha estado)
    {
        var lista = new List<ArmaNaMao>();
        if (jogador.PlayerPawn.Value?.WeaponServices?.MyWeapons is not { } armas) return lista;
        foreach (var alca in armas)
        {
            if (alca.Value is not { IsValid: true } arma || EhFacaOuBomba(arma.DesignerName)) continue;
            if (estado.ArmasDoKit.TryGetValue(arma.Index, out var pecas))
            {
                lista.AddRange(pecas.Where(peca => !peca.Gratis).Select(peca => new ArmaNaMao { Linha = peca.Linha, Classe = peca.Classe }));
                continue;
            }
            // A de MagCoin ou a Glock de graça de outra pessoa nunca vira achada: ela some no próximo passo.
            if (DeOutroKit(arma.Index, jogador.SteamID)) continue;
            lista.Add(new ArmaNaMao { Linha = null, Classe = ClasseDe(arma) });
        }
        return lista.Take(20).ToList();
    }

    /// <summary>Na morte, a arma de MagCoin volta ao baú e a Glock de graça não é de ninguém: as duas somem do chão.</summary>
    private static void TirarDoChaoAsQueNaoCaem(List<KeyValuePair<uint, List<PecaDoKit>>> armas)
    {
        foreach (var (indice, pecas) in armas)
        {
            if (!pecas.Any(peca => peca.Magcoin || peca.Gratis)) continue;
            var arma = Utilities.GetEntityFromIndex<CBasePlayerWeapon>((int)indice);
            // O número pode já ser de outra coisa: só tira se ainda é a mesma arma.
            if (arma is { IsValid: true } && arma.DesignerName.StartsWith("weapon_") && pecas.Any(peca => peca.Classe == ClasseDe(arma))) arma.Remove();
        }
    }

    /// <summary>A arma de MagCoin e a Glock de graça não se largam: senão passariam para outro jogador.</summary>
    private HookResult AoLargarArma(CCSPlayerController? jogador, CommandInfo comando)
    {
        if (jogador is not { IsValid: true } || !naIlha.TryGetValue(jogador.SteamID, out var estado)) return HookResult.Continue;
        var naMao = jogador.PlayerPawn.Value?.WeaponServices?.ActiveWeapon.Value;
        if (naMao == null || !estado.ArmasDoKit.TryGetValue(naMao.Index, out var pecas)) return HookResult.Continue;
        if (!pecas.Any(peca => peca.Magcoin || peca.Gratis)) return HookResult.Continue;
        jogador.PrintToCenterHtml("Esta arma não sai da sua mão.", 2);
        return HookResult.Handled;
    }

    /// <summary>Granada do kit lançada se gasta: a linha vai para o próximo aviso ao site.</summary>
    private HookResult AoLancarGranada(EventGrenadeThrown evento, GameEventInfo informacao)
    {
        var jogador = evento.Userid;
        if (jogador is not { IsValid: true } || !naIlha.TryGetValue(jogador.SteamID, out var estado)) return HookResult.Continue;
        var classe = evento.Weapon.StartsWith("weapon_") ? evento.Weapon : $"weapon_{evento.Weapon}";
        foreach (var (indice, pecas) in estado.ArmasDoKit)
        {
            var peca = pecas.FirstOrDefault(item => item.Classe == classe);
            if (peca == null) continue;
            pecas.Remove(peca);
            if (peca.Linha != null) estado.Gastas.Add(peca.Linha);
            if (pecas.Count == 0) estado.ArmasDoKit.Remove(indice);
            break;
        }
        return HookResult.Continue;
    }

    /// <summary>A arma achada que foi extraída virou do jogador: passa a ter linha no baú.</summary>
    private static void LigarArmasAchadas(CCSPlayerController jogador, NaIlha estado, List<LinhaNova> novas)
    {
        if (!jogador.IsValid || jogador.PlayerPawn.Value?.WeaponServices?.MyWeapons is not { } armas) return;
        var faltam = new List<LinhaNova>(novas);
        foreach (var alca in armas)
        {
            if (alca.Value is not { IsValid: true } arma || estado.ArmasDoKit.ContainsKey(arma.Index)) continue;
            var nova = faltam.FirstOrDefault(item => item.Classe == ClasseDe(arma));
            if (nova == null) continue;
            faltam.Remove(nova);
            estado.ArmasDoKit[arma.Index] = [new PecaDoKit { Linha = nova.Linha, Classe = nova.Classe }];
        }
    }
}
