using System.Drawing;
using System.Net.Http.Headers;
using System.Text.Json;
using CounterStrikeSharp.API;
using CounterStrikeSharp.API.Core;
using CounterStrikeSharp.API.Core.Attributes.Registration;
using CounterStrikeSharp.API.Modules.Commands;
using CounterStrikeSharp.API.Modules.Cvars;
using CounterStrikeSharp.API.Modules.Entities.Constants;
using CounterStrikeSharp.API.Modules.Memory.DynamicFunctions;
using CounterStrikeSharp.API.Modules.Timers;
using CounterStrikeSharp.API.Modules.Utils;

namespace MagnatasDiversao;

/// <summary>
/// O modo Mutação. Todos nascem humanos (CT), e virar mutante é passar para TR sem morrer. O jogo não decide
/// nada da rodada: quem sorteia, transforma e encerra é o plugin.
/// </summary>
public partial class ModoDeDiversao
{
    /// <summary>Os atributos ficam juntos para os mutantes de outros tipos entrarem aqui, sem reescrever o modo.</summary>
    private sealed record TipoDeMutante(string Nome, float SegundosParaRenascer, Color Cor, NivelDoMutante[] Niveis);

    /// <summary>O mutante sobe de nível conforme infecta, só durante a rodada. Quem morre volta no nível em que estava.</summary>
    private sealed record NivelDoMutante(int Nivel, int InfeccoesParaChegar, int Vida, float Velocidade, float Tamanho);

    // Nível, infecções para chegar, vida, velocidade e tamanho, aprovados pelo dono.
    private static readonly TipoDeMutante MutanteComum = new("Mutante", 3f, Color.FromArgb(255, 255, 255, 255), new NivelDoMutante[]
    {
        new(1, 0, 1000, 1.10f, 1.15f),
        new(2, 2, 1500, 1.15f, 1.25f),
        new(3, 5, 2000, 1.20f, 1.35f),
    });
    private static readonly Color CorDoHumano = Color.FromArgb(255, 255, 255, 255);
    private const int VidaDoHumano = 100;
    private const float IntervaloDaVelocidade = 0.5f;
    // Barra do poder do G na tela (dono, 10/11/2026): esvazia enquanto a corrida ou o escudo vale, enche na recarga.
    private const float IntervaloDaBarra = 0.25f;
    private const int BlocosDaBarra = 12;
    // Cartão de cada vaga (mutante, herói) e até quando ele fica na tela.
    private readonly Dictionary<int, (string Html, float Ate)> cartoes = new();
    // O que cada vaga vê no meio da tela agora, repetido a cada tick pelo RepetirTelas.
    private readonly Dictionary<int, string> telas = new();
    // A partir do nível 2, o mutante corre mais rápido por alguns segundos ao apertar G (o "largar arma" do jogo).
    private const int NivelDaCorrida = 2;
    private const float BonusDaCorrida = 0.5f;
    private const float SegundosDaCorrida = 3f;
    private const float SegundosDeRecargaDaCorrida = 12f;
    private const int SegundosDoAvisoDeMutante = 3;
    // O aviso do que o mutante e o herói fazem tem mais linhas: fica mais tempo na tela.
    private const int SegundosDoAvisoDoMutante = 6;
    private const float SegundosParaEspalhar = 15f;
    // O som da contagem começa antes e termina junto com o sorteio. Na tela, só os últimos 10 segundos.
    private const string SomDaContagem = "magnatas.contagem_mutacao";
    // Gravados pelo dono: um para a vitória dos Magnatas (os humanos, CT) e outro para a dos mutantes. No pacote os dois
    // arquivos ficaram trocados (o dono ouviu o dos Magnatas quando os mutantes venceram): a troca é feita aqui.
    private const string SomDaVitoriaDosMagnatas = "magnatas.vitoria_mutantes";
    private const string SomDaVitoriaDosMutantes = "magnatas.vitoria_magnatas";
    private const float SegundosDoSomDaContagem = 11.5f;
    private const int SegundosDaContagemNaTela = 10;
    // Sozinho não há o que jogar: a rodada fica parada, sem contar, até chegar mais alguém.
    private const int MinimoDeJogadores = 2;
    private const float EsperaParaConferirOFim = 0.5f;
    // O teste com bots precisa de um mapa com o caminho que os bots seguem; os da Mutação não têm.
    private const string MapaDoTeste = "de_dust2";
    private const float IntervaloDoAvisoDeEspera = 2f;
    private const int SegundosParaComecar = 3;
    // 1 mutante para cada 4 jogadores, arredondando para cima: 2 a 4 jogadores, 1; 5 a 8, 2; e assim por diante.
    private const int JogadoresPorMutante = 4;
    private const int RodadasPorPartida = 10;
    private const int SegundosEntreRodadas = 5;
    private const float MinutosDaRodadaSeFaltarORelogio = 3;
    private const float ForcaDoEmpurrao = 5f;
    private const float EmpurraoMaximo = 300f;
    private const int MunicaoDeReservaInfinita = 2;
    private static readonly string[] ArmasDoHumano = { "weapon_ak47", "weapon_m4a1" };

    // O boneco vem num pacote da Oficina só dele, um item novo para cada versão, que nunca é atualizado: a Steam entrega
    // atualizações ao servidor e ao jogo de cada um em horas diferentes, e o mesmo boneco com esqueletos diferentes
    // fechava o jogo de quem virava mutante ("OnPreserveEntity", 08/11 às 23:02 e 23:05). Item novo, todos baixam igual.
    private const string PacoteDoMutante = "3836643990";
    // Um boneco por nível (v2): o mutante troca de boneco quando sobe de nível, em vez de crescer. Mudar o tamanho
    // durante o jogo fechava o jogo de quem estava no servidor (provado no teste de 09/11: sem isso, nenhuma queda).
    private const string PastaDoMutante = "models/magnatas/mutante_v2";
    private static string ModeloDoNivel(int nivel) => $"{PastaDoMutante}/nivel{nivel}/mutante.vmdl";
    // Sem o zumbi no servidor (o pacote novo ainda não chegou), o mutante ficaria sem áreas de acerto e sem animação.
    // Trocar para outro boneco do jogo fazia o jogo de quem estava no servidor parar para carregar o modelo e cair
    // ("OnPreserveEntity"). Então, sem o zumbi, o mutante fica com o próprio boneco, verde e maior.
    private static readonly Color CorDaReserva = Color.FromArgb(255, 110, 255, 110);
    private bool? zumbiNoServidor;
    // Chave para desligar os bonecos do pacote de uma vez, se uma versão nova der problema.
    private static readonly bool UsarBonecosDoPacote = true;
    // Desligado para teste (09/11): o jogo de quem estava no servidor fechava na transformação e no reinício da rodada,
    // os dois momentos em que o plugin mexe no esqueleto para mudar o tamanho. Com isso desligado, o mutante fica do
    // tamanho normal e o guerreiro caído não é aumentado.
    private static readonly bool MudarTamanhoEmJogo = false;
    private bool? morteNoServidor;
    // Quando o mutante morre, o corpo some e no lugar cai o guerreiro de cena tocando a animação do Meshy. O CS2 não toca
    // animação de morte no jogador (o corpo vira boneco de pano), então a queda é um modelo à parte que some sozinho.
    // A queda de cada nível. O nível 3 não veio com animação de morrer e usa a do nível 2 no próprio corpo.
    private static readonly string?[] QuedaDoNivel =
    {
        $"{PastaDoMutante}/nivel1/morte/guerreiro_morte.vmdl",
        $"{PastaDoMutante}/nivel2/morte/guerreiro_morte.vmdl",
        $"{PastaDoMutante}/nivel3/morte/guerreiro_morte.vmdl",
    };
    private const float SegundosDaCenaDaMorte = 4f;

    // Mutante da Magnata Shop: quem compra e põe em uso no baú vira o Cyber Hulk, e o G liga um escudo em vez da corrida
    // (dono, 10/11/2026). Vem num pacote da Oficina só dele; vazio enquanto o item não existe, e aí o Blindado fica
    // desligado e quem comprou vira o mutante comum.
    private const string PacoteDoBlindado = "3837109609";
    private const string PastaDoBlindado = "models/magnatas/blindado_v1";
    // Um boneco por nível: Cyber Hulk, Toxic Warlord e Venomclaw Titan. Se faltar um, vale o do nível mais alto que existir.
    private static readonly int[] NiveisComBonecoDoBlindado = { 1, 2, 3 };
    private static readonly float[] SegundosDoEscudo = { 2f, 4f, 6f };
    private const float SegundosDeRecargaDoEscudo = 15f;
    // Azul enquanto o escudo vale, para os humanos saberem que não adianta atirar.
    private static readonly Color CorDoEscudo = Color.FromArgb(255, 80, 160, 255);
    private bool? blindadoNoServidor;
    // Segundo mutante da Shop, o Senhor do Vazio (Voidforged Warlord): o G solta uma cortina de fumaça roxa em volta
    // dele e custa vida, como o Smoke do CrossFire (dono, 11/11/2026). Vem num pacote da Oficina só dele; sem o pacote no
    // servidor, quem comprou vira o mutante comum.
    private const string PacoteDaFumaca = "3837859077";
    private const string PastaDaFumaca = "models/magnatas/fumaca_v2";
    private static readonly int[] NiveisComBonecoDaFumaca = { 1, 2, 3 };
    private static readonly float[] SegundosDaFumaca = { 8f, 10f, 12f };
    private const float SegundosDeRecargaDaFumaca = 15f;
    // Cada fumaça custa 10% da vida máxima do nível; com menos que isso, o G não solta.
    private const float VidaPorFumaca = 0.10f;
    private bool? fumacaNoServidor;
    private readonly Dictionary<int, (float Fim, float Recarga)> fumacas = new();
    // Terceira mutante da Shop, a HEALIX (dono, 11/11/2026): o E recupera vida; do nível 2 pula mais alto; no nível 3 tem
    // pulo duplo, com o segundo mais baixo. Um boneco por nível (Neon Night Nurse, Cybernetic Plague Nurse e Neon
    // Nightingale), num pacote da Oficina só dela; sem o pacote no servidor, quem comprou vira o mutante comum.
    private const string PacoteDaHealix = "3838113494";
    private const string PastaDaHealix = "models/magnatas/healix_v1";
    private static readonly int[] NiveisComBonecoDaHealix = { 1, 2, 3 };
    // Cura 30% da vida máxima do nível, aos poucos, em 3 s.
    private const float CuraDaHealix = 0.30f;
    private const float SegundosDaCura = 3f;
    private const int PassosDaCura = 6;
    private const float SegundosDeRecargaDaCura = 15f;
    private const int NivelDoPuloAlto = 2;
    private const int NivelDoPuloDuplo = 3;
    // O pulo normal sobe a uns 300 por segundo; 345 dá uns 30% mais de altura. O segundo pulo é bem mais baixo.
    private const float ImpulsoDoPuloAlto = 345f;
    private const float ImpulsoDoPuloDuplo = 220f;
    private bool? healixNoServidor;
    private readonly Dictionary<int, (float Fim, float Recarga)> curas = new();
    private readonly HashSet<int> segurandoPulo = new();
    private readonly HashSet<int> puloDuploUsado = new();
    // Pacote dos personagens (dono, 10/11/2026): quem pega a super Negev vira o herói. Os bonecos próprios (ADM,
    // Marfioso) ficam fora da Mutação, a pedido do dono: trocar um boneco nosso por outro com o jogador vivo fechou o
    // jogo três vezes no dia (19:54, 20:37, 20:56), e o boneco do jogo virando zumbi nunca. Sem o pacote, o portador
    // fica dourado, como antes.
    private const string PacoteDosPersonagens = "3837571705";
    private const string PastaDoHeroi = "models/magnatas/heroi_v1";
    private const string ModeloDoHeroi = $"{PastaDoHeroi}/mutante.vmdl";
    private bool? personagensNoServidor;
    // Chave para desligar o herói de uma vez, se ele der problema.
    private static readonly bool UsarHeroi = true;
    // O mutante que cada conta comprou, perguntado ao site a cada rodada. Os de teste vão pela vaga (bots não têm conta).
    private readonly Dictionary<ulong, string> skinsPorConta = new();
    private readonly Dictionary<int, string> skinsDeTeste = new();
    // Por vaga: até quando o escudo vale e quando o G volta a funcionar.
    private readonly Dictionary<int, (float Fim, float Recarga)> escudos = new();
    private const float TamanhoDoHumano = 1f;

    // Um humano por rodada ganha a super Negev: empurra o mutante bem mais longe. A munição é a normal: infinita ficava
    // forte demais (dono, 10/11/2026), e encher o pente a cada tiro já tinha fechado jogos ("CopyExistingEntity", 09/11).
    private const string ArmaEspecial = "weapon_negev";
    private const float EmpurraoDaSuperArma = 3f;
    private const float EmpurraoMaximoDaSuperArma = 600f;
    private static readonly Color CorDoPortador = Color.FromArgb(255, 255, 200, 40);
    // Tempo para o jogo de quem vai ganhar a Negev trocar para a faca antes de o fuzil sair da mão.
    private const float EsperaParaTrocarDeArma = 0.3f;
    private int? portadorDaSuperArma;
    private bool superArmaSorteada;

    private readonly TipoDeMutante mutanteDaRodada = MutanteComum;
    private CounterStrikeSharp.API.Modules.Timers.Timer? relogioDoSorteio;
    private CounterStrikeSharp.API.Modules.Timers.Timer? fimDaRodada;
    private CounterStrikeSharp.API.Modules.Timers.Timer? relogioDaContagem;
    private CounterStrikeSharp.API.Modules.Timers.Timer? somDaContagem;
    private int segundosAteOMutante;
    private bool esperandoJogadores;
    // Pedido pelo site, na aba Testes do Adm. Vale até o servidor desligar: troca o mapa, mas o plugin continua o mesmo.
    private bool testeComBots;
    // Infecções de cada mutante na rodada, pela vaga. Decidem o nível.
    private readonly Dictionary<int, int> infeccoes = new();
    // Por vaga: até quando a corrida vale e quando o G volta a funcionar, no relógio do servidor.
    private readonly Dictionary<int, (float Fim, float Recarga)> corridas = new();
    private bool rodadaEmAndamento;
    private bool sorteioFeito;
    private bool tempoDeEspalharAcabou;
    private int rodadasDaPartida;
    private int vitoriasDosHumanos;
    private int vitoriasDosMutantes;
    private int transformacoes;

    private void ComecarRodadaDaMutacao()
    {
        // O console recusa este comando, e o mapa pode reverter ao carregar. Por isso o plugin liga a cada rodada.
        var municao = ConVar<int>.Find("sv_infinite_ammo");
        if (municao != null) municao.Value = MunicaoDeReservaInfinita;
        // A troca de mapa volta as configurações ao padrão, e a super Negev de quem morria caía no chão.
        Server.ExecuteCommand("mp_death_drop_gun 0");
        // O G do mutante só chega ao servidor com a faca liberada para largar; o AoApertarG não deixa ninguém largar.
        Server.ExecuteCommand("mp_drop_knife_enable 1");
        Parar(ref relogioDoSorteio);
        Parar(ref fimDaRodada);
        Parar(ref relogioDaContagem);
        Parar(ref somDaContagem);
        infeccoes.Clear();
        corridas.Clear();
        escudos.Clear();
        fumacas.Clear();
        curas.Clear();
        _ = BuscarMutantesDaLoja(Pessoas().Select(pessoa => pessoa.SteamID).ToList());
        if (testeComBots) ChamarBotsDoTeste();
        if (JogadoresNaRodada() < MinimoDeJogadores)
        {
            esperandoJogadores = true;
            rodadaEmAndamento = false;
            return;
        }
        esperandoJogadores = false;
        if (rodadasDaPartida == 0)
        {
            ZerarContagem();
            ZerarPlacarDasPessoas();
            inicioDaPartida = DateTime.UtcNow;
            vitoriasDosHumanos = 0;
            vitoriasDosMutantes = 0;
            MostrarPlacarDaMutacao();
            // A história do mapa, a mesma da página Jogo do site.
            if (Server.MapName == "zm_silent_village")
            {
                foreach (var pessoa in Pessoas()) pessoa.PrintToChat(" [Magnatas] Silent Village: o vírus vazou do laboratório debaixo da vila. Não confie em ninguém.");
            }
        }
        rodadaEmAndamento = true;
        sorteioFeito = false;
        tempoDeEspalharAcabou = false;
        superArmaSorteada = false;
        portadorDaSuperArma = null;

        relogioDoSorteio = AddTimer(SegundosParaEspalhar, () =>
        {
            relogioDoSorteio = null;
            tempoDeEspalharAcabou = true;
            SortearMutantes();
        });
        // O mesmo valor do relógio da tela, para os dois chegarem juntos ao fim.
        var minutos = ConVar<float>.Find("mp_roundtime")?.Value ?? MinutosDaRodadaSeFaltarORelogio;
        fimDaRodada = AddTimer(minutos * 60f, () =>
        {
            fimDaRodada = null;
            EncerrarRodadaDaMutacao(RoundEndReason.CTsWin);
        });

        segundosAteOMutante = (int)SegundosParaEspalhar;
        relogioDaContagem = AddTimer(1f, MostrarContagem, TimerFlags.REPEAT);
        somDaContagem = AddTimer(SegundosParaEspalhar - SegundosDoSomDaContagem, () =>
        {
            somDaContagem = null;
            TocarContagem();
        });
        foreach (var pessoa in Pessoas()) pessoa.PrintToChat($" [Magnatas] Espalhem-se: o mutante aparece em {SegundosParaEspalhar:0} segundos.");
    }

    /// <summary>Bots contam, para os testes com bots.</summary>
    private static int JogadoresNaRodada() =>
        Utilities.GetPlayers().Count(jogador => jogador is { IsValid: true, IsHLTV: false, Team: CsTeam.Terrorist or CsTeam.CounterTerrorist });

    private void MostrarContagem()
    {
        // O número na tela vem do AvisoGeral, repetido a cada tick como a barra do poder.
        segundosAteOMutante--;
    }

    /// <summary>Cada um ouve o som no próprio ouvido, na mesma altura, onde quer que esteja no mapa.</summary>
    private void TocarParaTodos(string som)
    {
        foreach (var pessoa in Pessoas())
        {
            var soEle = new RecipientFilter();
            soEle.Add(pessoa);
            pessoa.EmitSound(som, soEle);
        }
    }

    private void TocarContagem()
    {
        if (!rodadaEmAndamento || sorteioFeito) return;
        foreach (var pessoa in Pessoas())
        {
            var soEle = new RecipientFilter();
            soEle.Add(pessoa);
            pessoa.EmitSound(SomDaContagem, soEle);
        }
    }

    /// <summary>Repete enquanto a pessoa está sozinha, e começa a partida se alguém entrou sem passar pela escolha de time.</summary>
    private void AvisarQueFaltaJogador()
    {
        if (!esperandoJogadores) return;
        ColocarNaRodada(null);
        // O aviso na tela vem do AvisoGeral: mandado daqui a cada 2 s, ficava um quadrado branco sem texto (11/11/2026).
    }

    private void SortearMutantes()
    {
        if (!rodadaEmAndamento) return;
        var vivos = Utilities.GetPlayers().Where(jogador => jogador is { IsValid: true, PawnIsAlive: true, Team: CsTeam.CounterTerrorist }).ToList();
        // Sozinho no servidor não há o que jogar: quem chegar depois dispara este sorteio.
        if (vivos.Count < 2) return;

        sorteioFeito = true;
        var quantos = (vivos.Count + JogadoresPorMutante - 1) / JogadoresPorMutante;
        foreach (var sorteado in vivos.OrderBy(_ => Random.Shared.Next()).Take(quantos)) TransformarEmMutante(sorteado, null);
        foreach (var pessoa in Pessoas()) pessoa.PrintToChat(" [Magnatas] O mutante apareceu. Fujam!");
        SortearSuperArma();
    }

    /// <summary>Uma vez por rodada, entre os humanos que sobraram do sorteio dos mutantes.</summary>
    private void SortearSuperArma()
    {
        if (superArmaSorteada || !rodadaEmAndamento) return;
        var humanos = Utilities.GetPlayers().Where(jogador => jogador is { IsValid: true, PawnIsAlive: true, Team: CsTeam.CounterTerrorist }).ToList();
        if (humanos.Count == 0) return;
        superArmaSorteada = true;
        var sorteado = humanos[Random.Shared.Next(humanos.Count)];
        EntregarSuperArma(sorteado);
        var nome = System.Net.WebUtility.HtmlEncode(sorteado.PlayerName);
        foreach (var pessoa in Pessoas())
        {
            pessoa.PrintToChat($" [Magnatas] {sorteado.PlayerName} pegou a super Negev e virou o herói!");
            // Na tela só para os outros humanos: o mutante recém-sorteado está lendo o que ele faz, e o herói, o dele.
            if (pessoa.Team == CsTeam.Terrorist || pessoa.Slot == sorteado.Slot) continue;
            pessoa.PrintToCenterHtml($"<font color='#ffc828' class='fontSize-l'>{nome} pegou a super Negev!</font>", SegundosDoAvisoDeMutante);
        }
    }

    private void EntregarSuperArma(CCSPlayerController jogador)
    {
        if (jogador.PlayerPawn.Value?.WeaponServices?.MyWeapons == null) return;
        portadorDaSuperArma = jogador.Slot;
        // Apagar o fuzil que está na mão e dar a Negev no quadro seguinte fechou o jogo de quem ganhou
        // ("OnPreserveEntity", 10/11 20:01): o jogo dele ainda usava a arma apagada. Agora a faca vai para a mão,
        // o fuzil sai depois que o jogo já trocou, e a Negev vem no quadro seguinte (com a vaga ainda ocupada, ela
        // não entrava).
        jogador.ExecuteClientCommand("slot3");
        AddTimer(EsperaParaTrocarDeArma, () =>
        {
            if (jogador is not { IsValid: true, PawnIsAlive: true, Team: CsTeam.CounterTerrorist } || jogador.Slot != portadorDaSuperArma) return;
            var corpo = jogador.PlayerPawn.Value;
            if (corpo?.WeaponServices?.MyWeapons == null) return;
            foreach (var item in corpo.WeaponServices.MyWeapons.ToList())
            {
                var arma = item.Value;
                if (arma != null && ArmasDoHumano.Contains(arma.DesignerName)) arma.Remove();
            }
            // Como na infecção: o boneco troca junto com a saída das armas, e a arma nova vem depois. O herói já se
            // destaca pelo boneco, sem o tom dourado por cima; a próxima rodada devolve o de cada um.
            if (HeroiNoServidor()) corpo.SetModel(ModeloDoHeroi);
            else
            {
                corpo.Render = CorDoPortador;
                Utilities.SetStateChanged(corpo, "CBaseModelEntity", "m_clrRender");
            }
            Server.NextFrame(() =>
            {
                if (jogador is not { IsValid: true, PawnIsAlive: true, Team: CsTeam.CounterTerrorist } || jogador.Slot != portadorDaSuperArma) return;
                jogador.GiveNamedItem(ArmaEspecial);
                // A troca para a Negev espera ela chegar na mão; no mesmo quadro o herói ficava de faca.
                AddTimer(EsperaParaTrocarDeArma, () =>
                {
                    if (jogador is { IsValid: true, PawnIsAlive: true } && jogador.Slot == portadorDaSuperArma) jogador.ExecuteClientCommand("slot1");
                });
                MostrarCartao(jogador, Cartao("HERÓI", "#ffc828", "Super Negev: empurra os mutantes para longe", "Não deixe encostarem em você"));
                jogador.PrintToChat(" [Magnatas] Você é o HERÓI: a super Negev empurra os mutantes para longe. Cuide da munição!");
            });
        });
    }

    private bool HeroiNoServidor() => UsarHeroi && PersonagensNoServidor();

    private bool PersonagensNoServidor()
    {
        if (!UsarBonecosDoPacote || !PacoteDosPersonagens.All(char.IsDigit)) return false;
        if (personagensNoServidor is bool sabido) return sabido;
        personagensNoServidor = NoPacote(PacoteDosPersonagens, PastaDoHeroi);
        Console.WriteLine($"[Magnatas] Herói da super Negev no servidor: {(personagensNoServidor.Value ? "sim" : "não, o portador fica dourado")}.");
        return personagensNoServidor.Value;
    }


    /// <summary>O encerrar da rodada pelo plugin não soma ponto para o time: o placar de cima mostra as rodadas de cada lado.</summary>
    private void MostrarPlacarDaMutacao()
    {
        foreach (var time in Utilities.FindAllEntitiesByDesignerName<CCSTeam>("cs_team_manager"))
        {
            if (time.TeamNum == (byte)CsTeam.CounterTerrorist) time.Score = vitoriasDosHumanos;
            else if (time.TeamNum == (byte)CsTeam.Terrorist) time.Score = vitoriasDosMutantes;
            else continue;
            Utilities.SetStateChanged(time, "CTeam", "m_iScore");
        }
    }

    private void EncerrarRodadaDaMutacao(RoundEndReason motivo)
    {
        if (!rodadaEmAndamento) return;
        rodadaEmAndamento = false;
        Parar(ref relogioDoSorteio);
        Parar(ref fimDaRodada);
        Parar(ref relogioDaContagem);
        Parar(ref somDaContagem);

        var humanosVenceram = motivo == RoundEndReason.CTsWin;
        if (humanosVenceram) vitoriasDosHumanos++;
        else vitoriasDosMutantes++;
        MostrarPlacarDaMutacao();
        TocarParaTodos(humanosVenceram ? SomDaVitoriaDosMagnatas : SomDaVitoriaDosMutantes);
        rodadasDaPartida++;

        if (rodadasDaPartida < RodadasPorPartida)
        {
            var aviso = humanosVenceram ? "Humanos venceram" : "Mutantes venceram";
            foreach (var pessoa in Pessoas()) pessoa.PrintToCenterHtml($"<font color='#f5b301' class='fontSize-l'>{aviso}</font>", SegundosEntreRodadas);
            RegrasDoJogo()?.TerminateRound(SegundosEntreRodadas, motivo);
            return;
        }

        AvisarFimDaPartida($"Humanos {vitoriasDosHumanos} x {vitoriasDosMutantes} Mutantes");
        FecharPartida(null, (float)Math.Max(0.01, (DateTime.UtcNow - inicioDaPartida).TotalMinutes));
        rodadasDaPartida = 0;
        RegrasDoJogo()?.TerminateRound(SegundosMostrandoOVencedor, motivo);
        // Sorteia o próximo mapa da rotação, como nos outros modos. O teste com bots fica na Dust 2.
        if (!testeComBots) AddTimer(SegundosMostrandoOVencedor - 1, TrocarDeMapa);
    }

    /// <summary>
    /// Para quem entrou no meio ou morreu: antes do sorteio nasce humano; depois, quem morreu volta mutante, e quem está
    /// chegando assiste do CT até a próxima rodada (pedido do dono, 10/11/2026).
    /// </summary>
    private void ColocarNaRodada(CCSPlayerController? jogador, bool chegando = false)
    {
        if (esperandoJogadores)
        {
            if (JogadoresNaRodada() >= MinimoDeJogadores)
            {
                esperandoJogadores = false;
                foreach (var pessoa in Pessoas()) pessoa.PrintToChat(" [Magnatas] Chegou mais um jogador. A partida vai começar!");
                RegrasDoJogo()?.TerminateRound(SegundosParaComecar, RoundEndReason.RoundDraw);
                return;
            }
            // Sozinho, a pessoa anda pelo mapa como humano até alguém chegar.
            if (jogador is { IsValid: true, PawnIsAlive: false, Team: CsTeam.Terrorist or CsTeam.CounterTerrorist })
            {
                if (jogador.Team == CsTeam.Terrorist) jogador.SwitchTeam(CsTeam.CounterTerrorist);
                jogador.Respawn();
            }
            return;
        }
        if (!rodadaEmAndamento || jogador is not { IsValid: true, PawnIsAlive: false } || jogador.Team is not (CsTeam.Terrorist or CsTeam.CounterTerrorist)) return;
        if (sorteioFeito)
        {
            if (chegando)
            {
                if (jogador.Team == CsTeam.Terrorist) jogador.SwitchTeam(CsTeam.CounterTerrorist);
                jogador.PrintToChat(" [Magnatas] A rodada já está rolando: você assiste daqui e entra na próxima.");
                return;
            }
            if (jogador.Team == CsTeam.CounterTerrorist) jogador.SwitchTeam(CsTeam.Terrorist);
            AddTimer(mutanteDaRodada.SegundosParaRenascer, () => RenascerComoMutante(jogador));
            return;
        }
        // Antes do sorteio todo mundo é humano, mesmo quem o jogo colocou do outro lado.
        if (jogador.Team == CsTeam.Terrorist) jogador.SwitchTeam(CsTeam.CounterTerrorist);
        jogador.Respawn();
        if (tempoDeEspalharAcabou) SortearMutantes();
    }

    [GameEventHandler]
    public HookResult AoEscolherTime(EventPlayerTeam evento, GameEventInfo informacao)
    {
        if (Config.Regra != "mutacao" || evento.Disconnect) return HookResult.Continue;
        var jogador = evento.Userid;
        // Chegando é quem vinha de nenhum time ou do espectador; as trocas que o próprio plugin faz vêm de CT ou TR.
        var chegando = evento.Oldteam <= (int)CsTeam.Spectator;
        AddTimer(EsperaAposNascer, () => ColocarNaRodada(jogador, chegando));
        return HookResult.Continue;
    }

    [GameEventHandler]
    public HookResult AoSairDaMutacao(EventPlayerDisconnect evento, GameEventInfo informacao)
    {
        if (Config.Regra != "mutacao") return HookResult.Continue;
        var quem = evento.Userid;
        if (quem != null)
        {
            infeccoes.Remove(quem.Slot);
            corridas.Remove(quem.Slot);
        }
        // Quem chegar depois não pode herdar uma partida que ninguém mais está jogando.
        if (!Pessoas().Any(pessoa => pessoa.Slot != quem?.Slot))
        {
            rodadasDaPartida = 0;
            Server.ExecuteCommand("mp_restartgame 1");
            return HookResult.Continue;
        }
        AddTimer(EsperaAposNascer, ConferirFimDaRodada);
        return HookResult.Continue;
    }

    private void LigarMutacao(bool hotReload)
    {
        AddTimer(IntervaloDaVelocidade, ManterVelocidadeDosMutantes, TimerFlags.REPEAT);
        AddTimer(IntervaloDaBarra, AtualizarTelaDaMutacao, TimerFlags.REPEAT);
        RegisterListener<Listeners.OnTick>(RepetirTelas);
        RegisterListener<Listeners.OnTick>(PoderNoE);
        RegisterListener<Listeners.OnTick>(PuloDuplo);
        RegisterListener<Listeners.OnEntitySpawned>(TirarComandosDoMapa);
        AddTimer(IntervaloDoAvisoDeEspera, AvisarQueFaltaJogador, TimerFlags.REPEAT);
        RegisterListener<Listeners.OnEntityTakeDamagePre>(AoReceberDano);
        AddCommandListener("drop", AoApertarG, HookMode.Pre);
        RegisterListener<Listeners.OnServerPrecacheResources>(manifesto =>
        {
            if (!UsarBonecosDoPacote) return;
            foreach (var nivel in mutanteDaRodada.Niveis) manifesto.AddResource(ModeloDoNivel(nivel.Nivel));
            foreach (var queda in QuedaDoNivel) if (queda != null) manifesto.AddResource(queda);
            if (HeroiNoServidor()) manifesto.AddResource(ModeloDoHeroi);
            if (BlindadoNoServidor())
            {
                foreach (var nivel in NiveisComBonecoDoBlindado)
                {
                    manifesto.AddResource(ModeloDoBlindado(nivel));
                    manifesto.AddResource(QuedaDoBlindado(nivel));
                }
            }
            if (FumacaNoServidor())
            {
                foreach (var nivel in NiveisComBonecoDaFumaca)
                {
                    manifesto.AddResource(ModeloDaFumaca(nivel));
                    manifesto.AddResource(QuedaDaFumaca(nivel));
                }
            }
            if (HealixNoServidor())
            {
                foreach (var nivel in NiveisComBonecoDaHealix)
                {
                    manifesto.AddResource(ModeloDaHealix(nivel));
                    manifesto.AddResource(QuedaDaHealix(nivel));
                }
            }
        });
        RegisterListener<Listeners.OnMapStart>(mapa =>
        {
            // O pacote novo chega numa troca de mapa, então a conferência se refaz a cada mapa.
            zumbiNoServidor = null;
            morteNoServidor = null;
            blindadoNoServidor = null;
            fumacaNoServidor = null;
            healixNoServidor = null;
            personagensNoServidor = null;
            // Ao ligar, o servidor abre o mapa da Oficina por último: se o teste já tinha pedido a Dust 2, ela era trocada.
            if (testeComBots && mapa != MapaDoTeste) AddTimer(1f, () => Server.ExecuteCommand($"changelevel {MapaDoTeste}"));
        });
        // Recarregado no meio da rodada, o plugin não teria a rodada em andamento nem o relógio, e o servidor travaria.
        if (hotReload)
        {
            rodadasDaPartida = 0;
            Server.ExecuteCommand("mp_restartgame 1");
        }
    }

    /// <summary>
    /// O golpe do mutante não causa dano: transforma. Sem isso, uma facada pelas costas mataria antes.
    /// Se isto parar de funcionar numa atualização do jogo, o golpe volta a matar, e quem morre vira mutante do mesmo jeito.
    /// </summary>
    private HookResult AoReceberDano(CBaseEntity alvo, CTakeDamageInfo dano)
    {
        try
        {
            if (alvo.DesignerName != "player") return HookResult.Continue;
            var autor = dano.Attacker.Value;
            if (autor == null || autor.DesignerName != "player") return HookResult.Continue;

            var corpo = new CCSPlayerPawn(alvo.Handle);
            // Mutante com o escudo do Blindado ligado não leva dano de ninguém.
            if (corpo.TeamNum == (byte)CsTeam.Terrorist && corpo.Controller.Value is { } dono && EscudoLigado(new CCSPlayerController(dono.Handle).Slot))
                return HookResult.Handled;
            if (corpo.TeamNum != (byte)CsTeam.CounterTerrorist || autor.TeamNum != (byte)CsTeam.Terrorist) return HookResult.Continue;

            var controleDoAlvo = corpo.Controller.Value;
            var controleDoAutor = new CCSPlayerPawn(autor.Handle).Controller.Value;
            if (rodadaEmAndamento && controleDoAlvo != null)
            {
                var jogador = new CCSPlayerController(controleDoAlvo.Handle);
                var quem = controleDoAutor == null ? null : new CCSPlayerController(controleDoAutor.Handle);
                Server.NextFrame(() => TransformarEmMutante(jogador, quem));
            }
            return HookResult.Handled;
        }
        catch (Exception erro)
        {
            Console.WriteLine($"[Magnatas] Falha no gancho de dano: {erro.GetType().Name}.");
            return HookResult.Continue;
        }
    }

    private void TransformarEmMutante(CCSPlayerController? jogador, CCSPlayerController? autor)
    {
        // A conferência vale também para dois golpes no mesmo instante: só o primeiro transforma e conta abate.
        if (jogador is not { IsValid: true, PawnIsAlive: true, Team: CsTeam.CounterTerrorist }) return;
        // A super Negev se perde com quem vira mutante, e ninguém mais ganha nesta rodada.
        if (jogador.Slot == portadorDaSuperArma)
        {
            portadorDaSuperArma = null;
            foreach (var pessoa in Pessoas()) pessoa.PrintToChat(" [Magnatas] A super Negev caiu!");
        }
        jogador.SwitchTeam(CsTeam.Terrorist);
        transformacoes++;
        infeccoes.Remove(jogador.Slot);
        corridas.Remove(jogador.Slot);
        escudos.Remove(jogador.Slot);
        fumacas.Remove(jogador.Slot);
        curas.Remove(jogador.Slot);
        AplicarAtributosDoMutante(jogador);
        AvisarOQueOMutanteFaz(jogador);
        if (autor is { IsValid: true }) ContarTransformacao(autor);
        // Encerrar a rodada no mesmo instante em que as armas do infectado saem, ainda dentro do golpe, derrubava o jogo
        // de quem estava no servidor ("OnPreserveEntity") na infecção do último humano. O fim vem logo depois.
        AddTimer(EsperaParaConferirOFim, ConferirFimDaRodada);
    }

    private void ContarTransformacao(CCSPlayerController autor)
    {
        Registrar(autor);
        if (!partidaEncerrada && naPartida.TryGetValue(autor.SteamID, out var dados)) dados.Abates++;
        var antes = NivelDe(autor);
        infeccoes[autor.Slot] = infeccoes.GetValueOrDefault(autor.Slot) + 1;
        var depois = NivelDe(autor);
        if (depois.Nivel > antes.Nivel) SubirDeNivel(autor, antes, depois);
        var estatisticas = autor.ActionTrackingServices?.MatchStats;
        if (estatisticas == null) return;
        estatisticas.Kills++;
        Utilities.SetStateChanged(autor, "CCSPlayerController", "m_pActionTrackingServices");
    }

    private void AplicarAtributosDoMutante(CCSPlayerController jogador)
    {
        var corpo = jogador.PlayerPawn.Value;
        if (corpo == null) return;
        DeixarSoAFaca(jogador);
        var nivel = NivelDe(jogador);
        corpo.MaxHealth = nivel.Vida;
        corpo.Health = nivel.Vida;
        Utilities.SetStateChanged(corpo, "CBaseEntity", "m_iMaxHealth");
        Utilities.SetStateChanged(corpo, "CBaseEntity", "m_iHealth");
        var zumbi = ZumbiNoServidor();
        if (zumbi) corpo.SetModel(ModeloDe(jogador, nivel.Nivel));
        MudarTamanho(corpo, nivel.Tamanho);
        corpo.Render = zumbi ? mutanteDaRodada.Cor : CorDaReserva;
        Utilities.SetStateChanged(corpo, "CBaseModelEntity", "m_clrRender");
        corpo.VelocityModifier = VelocidadeDe(jogador);
    }

    /// <summary>O zumbi vem no pacote da Oficina, que o servidor baixa ao ligar. A lista de arquivos do pacote diz se ele já chegou.</summary>
    private bool ZumbiNoServidor()
    {
        if (!UsarBonecosDoPacote) return false;
        if (zumbiNoServidor is bool sabido) return sabido;
        zumbiNoServidor = NoPacote(PacoteDoMutante, PastaDoMutante);
        Console.WriteLine($"[Magnatas] Zumbi do pacote no servidor: {(zumbiNoServidor.Value ? "sim" : "não, o mutante fica com o próprio boneco")}.");
        return zumbiNoServidor.Value;
    }

    /// <summary>A queda do guerreiro veio depois do zumbi: com o pacote antigo no servidor, o corpo cai do jeito normal.</summary>
    private bool MorteNoServidor()
    {
        if (!UsarBonecosDoPacote) return false;
        if (morteNoServidor is bool sabido) return sabido;
        morteNoServidor = NoPacote(PacoteDoMutante, $"{PastaDoMutante}/nivel3/morte");
        Console.WriteLine($"[Magnatas] Queda do guerreiro no servidor: {(morteNoServidor.Value ? "sim" : "não")}.");
        return morteNoServidor.Value;
    }

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

    private static NivelDoMutante NivelPelasInfeccoes(NivelDoMutante[] niveis, int infeccoes) =>
        niveis.LastOrDefault(nivel => infeccoes >= nivel.InfeccoesParaChegar) ?? niveis[0];

    private NivelDoMutante NivelDe(CCSPlayerController jogador) =>
        NivelPelasInfeccoes(mutanteDaRodada.Niveis, infeccoes.GetValueOrDefault(jogador.Slot));

    /// <summary>Ganha só a diferença de vida: quem estava ferido continua ferido. Morto, o nível vale quando renascer.</summary>
    private void SubirDeNivel(CCSPlayerController mutante, NivelDoMutante antigo, NivelDoMutante novo)
    {
        var corpo = mutante.PlayerPawn.Value;
        if (corpo != null && mutante.PawnIsAlive)
        {
            corpo.MaxHealth = novo.Vida;
            corpo.Health = corpo.Health + novo.Vida - antigo.Vida;
            Utilities.SetStateChanged(corpo, "CBaseEntity", "m_iMaxHealth");
            Utilities.SetStateChanged(corpo, "CBaseEntity", "m_iHealth");
            corpo.VelocityModifier = VelocidadeDe(mutante);
            MudarTamanho(corpo, novo.Tamanho);
            // O boneco do nível novo vem quando ele renascer (AplicarAtributosDoMutante): trocar com o mutante vivo e de
            // faca na mão fechou o jogo dele ("CopyExistingEntity: missing client entity", 10/11/2026).
        }
        var nome = System.Net.WebUtility.HtmlEncode(mutante.PlayerName);
        foreach (var pessoa in Pessoas())
        {
            pessoa.PrintToCenterHtml($"<font color='#6eff6e' class='fontSize-l'>{nome} chegou ao nível {novo.Nivel}!</font>", SegundosDoAvisoDeMutante);
            pessoa.PrintToChat($" [Magnatas] {mutante.PlayerName} chegou ao nível {novo.Nivel} de mutação.");
        }
        if (SkinDe(mutante) == "blindado")
            mutante.PrintToChat($" [Magnatas] Seu escudo agora dura {SegundosDoEscudo[Math.Clamp(novo.Nivel, 1, SegundosDoEscudo.Length) - 1]:0} s.");
        else if (SkinDe(mutante) == "fumaca")
            mutante.PrintToChat($" [Magnatas] Sua fumaça agora dura {SegundosDaFumacaNoNivel(novo.Nivel):0} s.");
        else if (SkinDe(mutante) == "healix")
        {
            if (novo.Nivel == NivelDoPuloAlto) mutante.PrintToChat(" [Magnatas] Agora você pula mais alto.");
            if (novo.Nivel == NivelDoPuloDuplo) mutante.PrintToChat(" [Magnatas] Agora você tem pulo duplo: aperte pular de novo no ar.");
        }
        else if (novo.Nivel == NivelDaCorrida) mutante.PrintToChat(" [Magnatas] Aperte E para correr mais rápido por alguns segundos.");
    }

    /// <summary>A velocidade do nível, mais o bônus enquanto a corrida do G vale.</summary>
    private float VelocidadeDe(CCSPlayerController jogador)
    {
        var correndo = corridas.TryGetValue(jogador.Slot, out var corrida) && Server.CurrentTime < corrida.Fim;
        return NivelDe(jogador).Velocidade + (correndo ? BonusDaCorrida : 0f);
    }

    /// <summary>
    /// O G do mutante a partir do nível 2 é a corrida, e não larga a faca. Para os humanos, o G continua largando a arma.
    /// O fim da corrida vem pelo ManterVelocidadeDosMutantes, que reaplica a velocidade a cada meio segundo.
    /// </summary>
    /// <summary>
    /// Na tela e no chat, o que o mutante faz. O G parecia não funcionar: a corrida só libera no nível 2 e nada avisava
    /// (dono, 10/11/2026).
    /// </summary>
    private void AvisarOQueOMutanteFaz(CCSPlayerController jogador)
    {
        var skin = SkinDe(jogador);
        var titulo = skin == "blindado" ? "Você é o BLINDADO!" : skin == "fumaca" ? "Você é o SENHOR DO VAZIO!" : skin == "healix" ? "Você é a HEALIX!" : "Você virou MUTANTE!";
        var g = skin == "blindado"
            ? $"E: escudo, {SegundosDoEscudo[0]:0} s sem levar dano"
            : skin == "fumaca"
                ? $"E: cortina de fumaça de {SegundosDaFumacaNoNivel(1):0} s (custa {VidaPorFumaca * 100:0}% da vida)"
                : skin == "healix"
                    ? $"E: recupera {CuraDaHealix * 100:0}% da vida em {SegundosDaCura:0} s"
                    : $"E: corrida de {SegundosDaCorrida:0} s (a partir do nível {NivelDaCorrida})";
        var nomeDoCartao = skin == "blindado" ? "BLINDADO" : skin == "fumaca" ? "VAZIO" : skin == "healix" ? "HEALIX" : "MUTANTE";
        var corDoCartao = skin == "fumaca" ? "#b07cff" : skin == "healix" ? "#5eead4" : "#6eff6e";
        MostrarCartao(jogador, Cartao(nomeDoCartao, corDoCartao, "Faca: acerte os humanos para infectar", g));
        jogador.PrintToChat($" [Magnatas] {titulo} Faca: acerte os humanos para infectar. {g}.");
    }

    /// <summary>Cartão no meio da tela: título grande, um traço e as linhas do que fazer.</summary>
    private static string Cartao(string titulo, string cor, string linha, string destaque) =>
        $"<font color='{cor}'>━━━━━━━━━━━━━━━━</font><br><font color='{cor}' class='fontSize-xl'>»  {string.Join(' ', titulo.ToCharArray())}  «</font><br>" +
        $"<font color='{cor}'>━━━━━━━━━━━━━━━━</font><br><font color='#ffffff'>{linha}</font><br><font color='#f5b301'>{destaque}</font>";

    /// <summary>
    /// O CS2 apaga logo a mensagem do meio da tela, então o cartão é reenviado junto com a barra do G até o tempo dele
    /// acabar (o dono só via o texto no chat, 10/11/2026).
    /// </summary>
    private void MostrarCartao(CCSPlayerController jogador, string html)
    {
        cartoes[jogador.Slot] = (html, Server.CurrentTime + SegundosDoAvisoDoMutante);
        telas[jogador.Slot] = html;
    }

    private HookResult AoApertarG(CCSPlayerController? jogador, CommandInfo comando)
    {
        if (jogador == null) return HookResult.Continue;
        if (!jogador.IsBot)
            Console.WriteLine($"[Magnatas] G de {jogador.PlayerName}: time={jogador.Team} vivo={jogador.PawnIsAlive} mutante={EhMutanteDeVerdade(jogador)} skin={SkinDe(jogador) ?? "comum"} na_mao={jogador.PlayerPawn.Value?.WeaponServices?.ActiveWeapon.Value?.DesignerName ?? "-"}.");
        // A faca pode ser largada (mp_drop_knife_enable, para o G do mutante chegar): o humano continua sem largar a dele.
        var naMao = jogador.PlayerPawn.Value?.WeaponServices?.ActiveWeapon.Value?.DesignerName ?? "";
        if ((naMao.Contains("knife") || naMao.Contains("bayonet")) && !EhMutanteDeVerdade(jogador)) return HookResult.Handled;
        if (!EhMutanteDeVerdade(jogador)) return HookResult.Continue;
        return UsarPoder(jogador);
    }

    /// <summary>
    /// O G (largar arma) nem chegava ao servidor no jogo do dono, mutante e de faca na mão (11/11/2026). O E chega junto
    /// com o movimento, a cada tick: o poder vale no E, na hora em que ele é apertado. O G continua valendo para quem chega.
    /// </summary>
    private void PoderNoE()
    {
        if (!rodadaEmAndamento)
        {
            segurandoE.Clear();
            return;
        }
        foreach (var jogador in Utilities.GetPlayers())
        {
            if (jogador is not { IsValid: true, IsBot: false, PawnIsAlive: true }) continue;
            if ((jogador.Buttons & PlayerButtons.Use) == 0)
            {
                segurandoE.Remove(jogador.Slot);
                continue;
            }
            // Segurar o E não repete o poder: só vale quando ele é apertado de novo.
            if (!segurandoE.Add(jogador.Slot) || !EhMutanteDeVerdade(jogador)) continue;
            Console.WriteLine($"[Magnatas] E de {jogador.PlayerName}: skin={SkinDe(jogador) ?? "comum"} nível={NivelDe(jogador).Nivel}.");
            UsarPoder(jogador);
        }
    }

    private readonly HashSet<int> segurandoE = new();

    /// <summary>
    /// Mapas que põem todo mundo numa sala de espera e só soltam depois de alguns segundos: o nome do ponto de saída
    /// dos humanos e o dos zumbis, os mesmos que o teletransporte do mapa usa. No zm_dust2_bf_l a sala tinha uma parede
    /// branca e prendia por 13 s (dono, 11/11/2026).
    /// </summary>
    private static readonly Dictionary<string, (string Humanos, string Mutantes)> SaidasDaSalaDeEspera = new()
    {
        ["zm_dust2_bf_l"] = ("starttt", "zombistartt"),
    };

    private void LevarParaOMapa(CCSPlayerController? jogador)
    {
        if (!SaidasDaSalaDeEspera.TryGetValue(Server.MapName, out var saidas)) return;
        if (jogador is not { IsValid: true, PawnIsAlive: true } || jogador.PlayerPawn.Value is not { } corpo) return;
        var nome = jogador.Team == CsTeam.Terrorist ? saidas.Mutantes : saidas.Humanos;
        // O nome pode vir com o prefixo da peça do mapa ("[PR#]starttt").
        var destino = Utilities.FindAllEntitiesByDesignerName<CBaseEntity>("info_teleport_destination")
            .FirstOrDefault(ponto => ponto.Entity?.Name is { } nomeDoPonto && (nomeDoPonto == nome || nomeDoPonto.EndsWith("]" + nome)));
        if (destino?.AbsOrigin is not { } lugar) return;
        corpo.Teleport(new Vector(lugar.X, lugar.Y, lugar.Z), destino.AbsRotation, new Vector(0, 0, 0));
    }

    /// <summary>
    /// Alguns mapas da Oficina mandam comandos ao servidor (o zm_dust2_bf_l punha rodada de 8 min, tempo de compra e
    /// avisos em russo). Na Mutação quem manda nas regras é o plugin: o point_servercommand sai assim que aparece.
    /// </summary>
    private void TirarComandosDoMapa(CEntityInstance entidade)
    {
        if (Config.Regra != "mutacao" || entidade.DesignerName != "point_servercommand") return;
        var indice = entidade.Index;
        Server.NextFrame(() =>
        {
            var comando = Utilities.GetEntityFromIndex<CBaseEntity>((int)indice);
            if (comando is { IsValid: true } && comando.DesignerName == "point_servercommand") comando.Remove();
        });
    }

    /// <summary>O poder do mutante, no E ou no G: escudo do Blindado, fumaça do Senhor do Vazio ou a corrida.</summary>
    private HookResult UsarPoder(CCSPlayerController jogador)
    {
        // O Blindado troca a corrida pelo escudo, que já vale no nível 1.
        if (SkinDe(jogador) == "blindado") return LigarEscudo(jogador);
        // O Senhor do Vazio troca a corrida pela cortina de fumaça, que também já vale no nível 1.
        if (SkinDe(jogador) == "fumaca") return SoltarFumaca(jogador);
        // A HEALIX troca a corrida pela cura, que vale desde o nível 1.
        if (SkinDe(jogador) == "healix") return Curar(jogador);
        if (NivelDe(jogador).Nivel < NivelDaCorrida)
        {
            jogador.PrintToCenterHtml($"<font color='#f5b301'>A corrida libera no nível {NivelDaCorrida}: infecte um humano</font>", 2);
            return HookResult.Handled;
        }
        var agora = Server.CurrentTime;
        if (corridas.TryGetValue(jogador.Slot, out var corrida) && agora < corrida.Recarga)
        {
            jogador.PrintToCenterHtml($"<font color='#f5b301'>Corrida em {Math.Ceiling(corrida.Recarga - agora)} s</font>", 1);
            return HookResult.Handled;
        }
        corridas[jogador.Slot] = (agora + SegundosDaCorrida, agora + SegundosDeRecargaDaCorrida);
        var corpo = jogador.PlayerPawn.Value;
        if (corpo != null) corpo.VelocityModifier = VelocidadeDe(jogador);
        return HookResult.Handled;
    }

    /// <summary>
    /// Calcula, 4 vezes por segundo, o que fica no meio da tela de cada um: o cartão de quem acabou de virar mutante ou
    /// herói e, para o mutante, o HUD do poder do G (dono, 10/11/2026). Quem manda é o RepetirTelas, a cada tick.
    /// </summary>
    private void AtualizarTelaDaMutacao()
    {
        var agora = Server.CurrentTime;
        foreach (var vaga in cartoes.Where(item => agora >= item.Value.Ate).Select(item => item.Key).ToList()) cartoes.Remove(vaga);
        telas.Clear();
        foreach (var jogador in Utilities.GetPlayers().Where(jogador => jogador is { IsValid: true, IsBot: false, PawnIsAlive: true }))
        {
            if (cartoes.TryGetValue(jogador.Slot, out var cartao)) telas[jogador.Slot] = cartao.Html;
            else if (AvisoGeral() is { } aviso) telas[jogador.Slot] = aviso;
            else if (jogador is { Team: CsTeam.Terrorist } && rodadaEmAndamento) telas[jogador.Slot] = HudDoPoder(jogador, agora);
        }
    }

    /// <summary>O aviso que vale para todos agora: esperando mais um jogador ou a contagem até o mutante aparecer.</summary>
    private string? AvisoGeral()
    {
        if (esperandoJogadores)
            return "<font color='#f5b301' class='fontSize-l'>Esperando mais um jogador</font><br><font color='#ffffff'>A partida começa com 2 ou mais</font>";
        if (rodadaEmAndamento && !sorteioFeito && segundosAteOMutante > 0 && segundosAteOMutante <= SegundosDaContagemNaTela)
            return $"<font color='#ff4d4d' class='fontSize-xl'>{segundosAteOMutante}</font><br><font color='#ffffff'>O mutante vai aparecer</font>";
        return null;
    }

    /// <summary>
    /// O CS2 só mantém a mensagem do meio da tela enquanto ela chega: a cada quarto de segundo piscava, a cada 1,5 s
    /// sumia. Repetida a cada tick, fica parada (dono, 10/11/2026).
    /// </summary>
    private void RepetirTelas()
    {
        foreach (var (vaga, html) in telas)
        {
            var jogador = Utilities.GetPlayerFromSlot(vaga);
            if (jogador is { IsValid: true, PawnIsAlive: true }) jogador.PrintToCenterHtml(html);
        }
    }

    /// <summary>O poder do G do mutante: pronto (cheia), em uso (esvaziando), carregando (enchendo) ou ainda travado.</summary>
    private string HudDoPoder(CCSPlayerController jogador, float agora)
    {
        var skin = SkinDe(jogador);
        var blindado = skin == "blindado";
        var fumaca = skin == "fumaca";
        var healix = skin == "healix";
        if (!blindado && !fumaca && !healix && NivelDe(jogador).Nivel < NivelDaCorrida)
            return BarraDePoder($"E libera no nível {NivelDaCorrida}", "#888888", 0f);
        var temPoder = blindado ? escudos.TryGetValue(jogador.Slot, out var poder)
            : fumaca ? fumacas.TryGetValue(jogador.Slot, out poder)
            : healix ? curas.TryGetValue(jogador.Slot, out poder)
            : corridas.TryGetValue(jogador.Slot, out poder);
        if (temPoder)
        {
            var (fim, recarga) = poder;
            var inicio = recarga - (blindado ? SegundosDeRecargaDoEscudo : fumaca ? SegundosDeRecargaDaFumaca : healix ? SegundosDeRecargaDaCura : SegundosDeRecargaDaCorrida);
            if (agora < fim)
                return BarraDePoder(
                    blindado ? "ESCUDO" : fumaca ? "FUMAÇA" : healix ? "CURANDO" : "CORRENDO",
                    blindado ? "#50a0ff" : fumaca ? "#b07cff" : healix ? "#5eead4" : "#6eff6e",
                    (fim - agora) / Math.Max(fim - inicio, 0.1f));
            if (agora < recarga)
                return BarraDePoder("CARREGANDO", "#f5b301", (agora - fim) / Math.Max(recarga - fim, 0.1f));
        }
        return BarraDePoder("E PRONTO", "#6eff6e", 1f);
    }

    private static string BarraDePoder(string nome, string cor, float cheia)
    {
        var blocos = (int)Math.Round(Math.Clamp(cheia, 0f, 1f) * BlocosDaBarra);
        return $"<font color='{cor}'>» {nome} «  {new string('█', blocos)}</font><font color='#555555'>{new string('█', BlocosDaBarra - blocos)}</font>";
    }

    private static void MudarTamanho(CBaseEntity corpo, float tamanho)
    {
        if (!MudarTamanhoEmJogo) return;
        var esqueleto = corpo.CBodyComponent?.SceneNode?.GetSkeletonInstance();
        if (esqueleto == null) return;
        esqueleto.Scale = tamanho;
        Utilities.SetStateChanged(corpo, "CBaseEntity", "m_CBodyComponent");
    }

    /// <summary>O dano pode zerar o modificador de velocidade, por isso ele é reaplicado de tempos em tempos.</summary>
    private void ManterVelocidadeDosMutantes()
    {
        foreach (var mutante in Utilities.GetPlayers().Where(jogador => jogador is { IsValid: true, PawnIsAlive: true, Team: CsTeam.Terrorist }))
        {
            var corpo = mutante.PlayerPawn.Value;
            if (corpo != null) corpo.VelocityModifier = VelocidadeDe(mutante);
        }
    }

    /// <summary>
    /// Quem já tem AK ou M4 fica com ela: tirar e dar de novo a arma logo depois de a rodada reiniciar derruba o jogo de
    /// quem está no servidor ("missing client entity"). Só a super Negev sai, e só quem está sem nenhuma das duas ganha uma.
    /// </summary>
    private void EntregarArmaDoHumano(CCSPlayerController? jogador)
    {
        if (jogador is not { IsValid: true, PawnIsAlive: true, Team: CsTeam.CounterTerrorist }) return;
        var armas = jogador.PlayerPawn.Value?.WeaponServices?.MyWeapons;
        if (armas == null) return;
        var jaTem = false;
        foreach (var item in armas.ToList())
        {
            var arma = item.Value;
            if (arma == null) continue;
            if (arma.DesignerName == ArmaEspecial) arma.Remove();
            else if (ArmasDoHumano.Contains(arma.DesignerName)) jaTem = true;
        }
        if (jaTem) return;
        jogador.GiveNamedItem(ArmasDoHumano[Random.Shared.Next(ArmasDoHumano.Length)]);
        jogador.ExecuteClientCommand("slot1");
    }

    /// <summary>Bot que entra como TR antes do sorteio não é mutante, e não pode perder as armas junto do reinício da rodada.</summary>
    private bool EhMutanteDeVerdade(CCSPlayerController jogador) =>
        rodadaEmAndamento && sorteioFeito && jogador is { IsValid: true, PawnIsAlive: true, Team: CsTeam.Terrorist };

    [GameEventHandler]
    public HookResult AoAtingirMutante(EventPlayerHurt evento, GameEventInfo informacao)
    {
        if (Config.Regra != "mutacao") return HookResult.Continue;
        var alvo = evento.Userid;
        var quem = evento.Attacker;
        if (alvo is not { IsValid: true, Team: CsTeam.Terrorist } || quem is not { IsValid: true, Team: CsTeam.CounterTerrorist }) return HookResult.Continue;
        var corpo = alvo.PlayerPawn.Value;
        var corpoDeQuem = quem.PlayerPawn.Value;
        if (corpo?.AbsOrigin == null || corpoDeQuem?.AbsOrigin == null) return HookResult.Continue;

        var x = corpo.AbsOrigin.X - corpoDeQuem.AbsOrigin.X;
        var y = corpo.AbsOrigin.Y - corpoDeQuem.AbsOrigin.Y;
        var distancia = MathF.Sqrt(x * x + y * y);
        if (distancia < 1f) return HookResult.Continue;

        var daSuperArma = quem.Slot == portadorDaSuperArma && evento.Weapon.Contains("negev");
        var forca = daSuperArma
            ? Math.Min(evento.DmgHealth * ForcaDoEmpurrao * EmpurraoDaSuperArma, EmpurraoMaximoDaSuperArma)
            : Math.Min(evento.DmgHealth * ForcaDoEmpurrao, EmpurraoMaximo);
        var velocidade = corpo.AbsVelocity;
        corpo.Teleport(null, null, new Vector(velocidade.X + x / distancia * forca, velocidade.Y + y / distancia * forca, velocidade.Z));
        return HookResult.Continue;
    }

    private void ConferirFimDaRodada()
    {
        if (!rodadaEmAndamento || !sorteioFeito) return;
        var jogadores = Utilities.GetPlayers().Where(jogador => jogador is { IsValid: true }).ToList();
        if (!jogadores.Any(jogador => jogador is { PawnIsAlive: true, Team: CsTeam.CounterTerrorist }))
        {
            EncerrarRodadaDaMutacao(RoundEndReason.TerroristsWin);
        }
        else if (!jogadores.Any(jogador => jogador.Team == CsTeam.Terrorist))
        {
            // O último mutante saiu do servidor, e a rodada não pode seguir sem nenhum.
            SortearMutantes();
        }
    }

    [GameEventHandler]
    public HookResult AoMorrerNaMutacao(EventPlayerDeath evento, GameEventInfo informacao)
    {
        if (Config.Regra != "mutacao") return HookResult.Continue;
        var jogador = evento.Userid;
        if (jogador is not { IsValid: true }) return HookResult.Continue;
        var eraMutante = jogador.Team == CsTeam.Terrorist;
        if (eraMutante) MostrarQuedaDoMutante(jogador);
        if (esperandoJogadores)
        {
            AddTimer(mutanteDaRodada.SegundosParaRenascer, () => ColocarNaRodada(jogador));
            return HookResult.Continue;
        }

        // Queda, ou o golpe se o gancho quebrar numa atualização do jogo: humano morto também vira mutante.
        // Antes do sorteio ainda não há mutante, então ele só volta humano.
        if (jogador.Team == CsTeam.CounterTerrorist && rodadaEmAndamento)
        {
            if (!sorteioFeito)
            {
                AddTimer(mutanteDaRodada.SegundosParaRenascer, () => ColocarNaRodada(jogador));
                return HookResult.Continue;
            }
            jogador.SwitchTeam(CsTeam.Terrorist);
            ConferirFimDaRodada();
        }
        if (jogador.Team == CsTeam.Terrorist) AddTimer(mutanteDaRodada.SegundosParaRenascer, () => RenascerComoMutante(jogador));
        return HookResult.Continue;
    }

    /// <summary>
    /// O corpo do mutante fica invisível e, no mesmo lugar e do mesmo tamanho, o guerreiro de cena toca a queda.
    /// Quando o mutante renasce, a cor volta pelo AplicarAtributosDoMutante.
    /// </summary>
    private void MostrarQuedaDoMutante(CCSPlayerController jogador)
    {
        var modeloDaQueda = QuedaDe(jogador);
        if (modeloDaQueda == null) return;
        var corpo = jogador.PlayerPawn.Value;
        if (corpo is not { IsValid: true } || corpo.AbsOrigin == null || corpo.AbsRotation == null) return;
        var lugar = new Vector(corpo.AbsOrigin.X, corpo.AbsOrigin.Y, corpo.AbsOrigin.Z);
        var giro = new QAngle(0, corpo.AbsRotation.Y, 0);

        corpo.RenderMode = RenderMode_t.kRenderTransAlpha;
        corpo.Render = Color.FromArgb(0, 255, 255, 255);
        Utilities.SetStateChanged(corpo, "CBaseModelEntity", "m_nRenderMode");
        Utilities.SetStateChanged(corpo, "CBaseModelEntity", "m_clrRender");

        var queda = Utilities.CreateEntityByName<CDynamicProp>("prop_dynamic");
        if (queda == null) return;
        // Tudo vai na criação: trocar o modelo antes de a entidade nascer dava erro interno no servidor a cada morte.
        var valores = new CEntityKeyValues();
        valores.SetString("model", modeloDaQueda);
        valores.SetVector("origin", lugar);
        valores.SetAngle("angles", giro);
        valores.SetString("DefaultAnim", "morte");
        valores.SetInt("solid", 0);
        queda.DispatchSpawn(valores);
        MudarTamanho(queda, NivelDe(jogador).Tamanho);
        AddTimer(SegundosDaCenaDaMorte, () =>
        {
            if (queda.IsValid) queda.Remove();
        });
    }

    private void RenascerComoMutante(CCSPlayerController jogador)
    {
        if (!rodadaEmAndamento || jogador is not { IsValid: true, Team: CsTeam.Terrorist } || jogador.PawnIsAlive) return;
        jogador.Respawn();
    }

    [GameEventHandler]
    public HookResult AoPrepararRodadaDaMutacao(EventRoundPrestart evento, GameEventInfo informacao)
    {
        if (Config.Regra != "mutacao") return HookResult.Continue;
        rodadaEmAndamento = false;
        var portadorAnterior = portadorDaSuperArma;
        portadorDaSuperArma = null;
        Parar(ref relogioDaContagem);
        Parar(ref somDaContagem);
        infeccoes.Clear();
        corridas.Clear();
        fumacas.Clear();
        curas.Clear();
        puloDuploUsado.Clear();
        ApagarFumacasDoG();
        // Os mutantes e o portador dourado voltam à cor e ao tamanho normais. Os outros ficam como estão: mexer em todo
        // mundo junto do reinício da rodada só aumenta a chance de derrubar o jogo de quem está no servidor.
        foreach (var jogador in Utilities.GetPlayers().Where(jogador => jogador is { IsValid: true, Team: CsTeam.Terrorist or CsTeam.CounterTerrorist }))
        {
            var eraMutante = jogador.Team == CsTeam.Terrorist;
            if (eraMutante) jogador.SwitchTeam(CsTeam.CounterTerrorist);
            if (!eraMutante && jogador.Slot != portadorAnterior) continue;
            var corpo = jogador.PlayerPawn.Value;
            if (corpo == null) continue;
            corpo.MaxHealth = VidaDoHumano;
            corpo.Render = CorDoHumano;
            Utilities.SetStateChanged(corpo, "CBaseModelEntity", "m_clrRender");
            MudarTamanho(corpo, TamanhoDoHumano);
        }
        return HookResult.Continue;
    }

    /// <summary>
    /// O teste do Adm com bots. Os mapas da Mutação não têm o caminho que os bots seguem, e a Dust 2 tem.
    /// A configuração do modo zera os bots a cada mapa, então eles são chamados de novo a cada rodada.
    /// </summary>
    [ConsoleCommand("magnatas_teste_bots", "Liga o teste com bots do Adm, na Dust 2 e sem XP")]
    [CommandHelper(whoCanExecute: CommandUsage.SERVER_ONLY)]
    public void LigarTesteComBots(CCSPlayerController? chamador, CommandInfo comando)
    {
        if (Config.Regra != "mutacao")
        {
            comando.ReplyToCommand("teste_bots=0");
            return;
        }
        var jaEstava = testeComBots;
        testeComBots = true;
        comando.ReplyToCommand("teste_bots=1");
        if (!jaEstava || Server.MapName != MapaDoTeste) Server.ExecuteCommand($"changelevel {MapaDoTeste}");
    }

    private static void ChamarBotsDoTeste()
    {
        // Com "fill", a cota conta as pessoas: 1 pessoa e 9 bots.
        // Os bots entram sem esperar a pessoa escolher o time. Forçar um bot enquanto ela carregava fez o jogo tirar e
        // recriar bots sem parar, e o servidor caiu.
        foreach (var comando in new[] { "bot_difficulty 1", "bot_join_team any", "bot_join_after_player 0", "bot_quota_mode fill", "bot_quota 10" }) Server.ExecuteCommand(comando);
    }

    /// <summary>Só para teste: o mutante fica com o próprio boneco até o próximo mapa, para ver se a queda vem do zumbi.</summary>
    [ConsoleCommand("magnatas_mutacao_sem_zumbi", "Teste: mutante sem o boneco do zumbi até trocar de mapa")]
    [CommandHelper(whoCanExecute: CommandUsage.SERVER_ONLY)]
    public void DesligarZumbiParaTeste(CCSPlayerController? chamador, CommandInfo comando)
    {
        zumbiNoServidor = false;
        comando.ReplyToCommand("zumbi=False");
    }

    /// <summary>O mutante da loja que o jogador está usando, só se o pacote dele já chegou ao servidor.</summary>
    private string? SkinDe(CCSPlayerController jogador)
    {
        var skin = skinsDeTeste.TryGetValue(jogador.Slot, out var deTeste) ? deTeste
            : skinsPorConta.TryGetValue(jogador.SteamID, out var comprada) ? comprada : null;
        return skin switch
        {
            "blindado" when BlindadoNoServidor() => skin,
            "fumaca" when FumacaNoServidor() => skin,
            "healix" when HealixNoServidor() => skin,
            _ => null,
        };
    }

    private bool FumacaNoServidor()
    {
        if (!UsarBonecosDoPacote || PacoteDaFumaca == "") return false;
        if (fumacaNoServidor is bool sabido) return sabido;
        fumacaNoServidor = NoPacote(PacoteDaFumaca, PastaDaFumaca);
        Console.WriteLine($"[Magnatas] Senhor do Vazio da loja no servidor: {(fumacaNoServidor.Value ? "sim" : "não, quem comprou vira o mutante comum")}.");
        return fumacaNoServidor.Value;
    }

    private static int NivelComBonecoDaFumaca(int nivel) => NiveisComBonecoDaFumaca.Where(existente => existente <= nivel).DefaultIfEmpty(1).Max();

    private static string ModeloDaFumaca(int nivel) => $"{PastaDaFumaca}/nivel{NivelComBonecoDaFumaca(nivel)}/mutante.vmdl";

    private static string QuedaDaFumaca(int nivel) => $"{PastaDaFumaca}/nivel{NivelComBonecoDaFumaca(nivel)}/morte/guerreiro_morte.vmdl";

    private bool HealixNoServidor()
    {
        if (!UsarBonecosDoPacote || PacoteDaHealix == "") return false;
        if (healixNoServidor is bool sabido) return sabido;
        healixNoServidor = NoPacote(PacoteDaHealix, PastaDaHealix);
        Console.WriteLine($"[Magnatas] HEALIX da loja no servidor: {(healixNoServidor.Value ? "sim" : "não, quem comprou vira o mutante comum")}.");
        return healixNoServidor.Value;
    }

    private static int NivelComBonecoDaHealix(int nivel) => NiveisComBonecoDaHealix.Where(existente => existente <= nivel).DefaultIfEmpty(1).Max();

    private static string ModeloDaHealix(int nivel) => $"{PastaDaHealix}/nivel{NivelComBonecoDaHealix(nivel)}/mutante.vmdl";

    private static string QuedaDaHealix(int nivel) => $"{PastaDaHealix}/nivel{NivelComBonecoDaHealix(nivel)}/morte/guerreiro_morte.vmdl";

    /// <summary>
    /// O E da HEALIX: recupera 30% da vida máxima do nível aos poucos, em 3 s, e volta em 15 s. Com a vida cheia, não
    /// gasta a recarga.
    /// </summary>
    private HookResult Curar(CCSPlayerController jogador)
    {
        var agora = Server.CurrentTime;
        if (curas.TryGetValue(jogador.Slot, out var cura) && agora < cura.Recarga)
        {
            jogador.PrintToCenterHtml($"<font color='#f5b301'>Cura em {Math.Ceiling(cura.Recarga - agora)} s</font>", 1);
            return HookResult.Handled;
        }
        var corpo = jogador.PlayerPawn.Value;
        if (corpo == null) return HookResult.Handled;
        if (corpo.Health >= corpo.MaxHealth)
        {
            jogador.PrintToCenterHtml("<font color='#5eead4'>Vida cheia</font>", 1);
            return HookResult.Handled;
        }
        curas[jogador.Slot] = (agora + SegundosDaCura, agora + SegundosDeRecargaDaCura);
        var porPasso = Math.Max(1, (int)Math.Round(corpo.MaxHealth * CuraDaHealix / PassosDaCura));
        // Um temporizador avulso por passo: parar um temporizador de dentro dele mesmo já derrubou o servidor.
        for (var passo = 1; passo <= PassosDaCura; passo++)
        {
            AddTimer(SegundosDaCura * passo / PassosDaCura, () =>
            {
                var atual = jogador.IsValid ? jogador.PlayerPawn.Value : null;
                if (atual == null || !jogador.PawnIsAlive || !EhMutanteDeVerdade(jogador)) return;
                atual.Health = Math.Min(atual.MaxHealth, atual.Health + porPasso);
                Utilities.SetStateChanged(atual, "CBaseEntity", "m_iHealth");
            }, TimerFlags.STOP_ON_MAPCHANGE);
        }
        Console.WriteLine($"[Magnatas] Cura de {jogador.PlayerName}: {porPasso * PassosDaCura} de vida em {SegundosDaCura:0} s.");
        return HookResult.Handled;
    }

    private bool HealixComPulo(CCSPlayerController jogador, int nivelMinimo) =>
        jogador is { IsValid: true, PawnIsAlive: true } && SkinDe(jogador) == "healix" && EhMutanteDeVerdade(jogador) && NivelDe(jogador).Nivel >= nivelMinimo;

    /// <summary>Do nível 2, a HEALIX pula mais alto: logo depois do pulo, a subida vai para o impulso dela.</summary>
    [GameEventHandler]
    public HookResult AoPularNaMutacao(EventPlayerJump evento, GameEventInfo informacao)
    {
        if (Config.Regra != "mutacao") return HookResult.Continue;
        var jogador = evento.Userid;
        if (jogador == null || !HealixComPulo(jogador, NivelDoPuloAlto)) return HookResult.Continue;
        Server.NextFrame(() =>
        {
            var corpo = jogador.IsValid ? jogador.PlayerPawn.Value : null;
            if (corpo == null) return;
            var velocidade = corpo.AbsVelocity;
            if (velocidade.Z < ImpulsoDoPuloAlto) corpo.Teleport(null, null, new Vector(velocidade.X, velocidade.Y, ImpulsoDoPuloAlto));
        });
        return HookResult.Continue;
    }

    /// <summary>
    /// No nível 3, a HEALIX pula de novo no ar, uma vez por pulo, mais baixo que o primeiro. Conta só quando o botão é
    /// apertado de novo no ar: segurar o pulo não gasta o segundo.
    /// </summary>
    private void PuloDuplo()
    {
        if (!rodadaEmAndamento) return;
        foreach (var jogador in Utilities.GetPlayers())
        {
            if (!HealixComPulo(jogador, NivelDoPuloDuplo) || jogador.PlayerPawn.Value is not { } corpo)
            {
                segurandoPulo.Remove(jogador.Slot);
                continue;
            }
            var pulando = (jogador.Buttons & PlayerButtons.Jump) != 0;
            var noChao = (corpo.Flags & (uint)PlayerFlags.FL_ONGROUND) != 0;
            if (noChao) puloDuploUsado.Remove(jogador.Slot);
            else if (pulando && !segurandoPulo.Contains(jogador.Slot) && puloDuploUsado.Add(jogador.Slot))
            {
                var velocidade = corpo.AbsVelocity;
                corpo.Teleport(null, null, new Vector(velocidade.X, velocidade.Y, ImpulsoDoPuloDuplo));
            }
            if (pulando) segurandoPulo.Add(jogador.Slot);
            else segurandoPulo.Remove(jogador.Slot);
        }
    }


    private static float SegundosDaFumacaNoNivel(int nivel) => SegundosDaFumaca[Math.Clamp(nivel, 1, SegundosDaFumaca.Length) - 1];

    private bool BlindadoNoServidor()
    {
        if (!UsarBonecosDoPacote || PacoteDoBlindado == "") return false;
        if (blindadoNoServidor is bool sabido) return sabido;
        blindadoNoServidor = NoPacote(PacoteDoBlindado, PastaDoBlindado);
        Console.WriteLine($"[Magnatas] Blindado da loja no servidor: {(blindadoNoServidor.Value ? "sim" : "não, quem comprou vira o mutante comum")}.");
        return blindadoNoServidor.Value;
    }

    private static int NivelComBonecoDoBlindado(int nivel) => NiveisComBonecoDoBlindado.Where(existente => existente <= nivel).DefaultIfEmpty(1).Max();

    private static string ModeloDoBlindado(int nivel) => $"{PastaDoBlindado}/nivel{NivelComBonecoDoBlindado(nivel)}/mutante.vmdl";

    private static string QuedaDoBlindado(int nivel) => $"{PastaDoBlindado}/nivel{NivelComBonecoDoBlindado(nivel)}/morte/guerreiro_morte.vmdl";

    private string ModeloDe(CCSPlayerController jogador, int nivel) => SkinDe(jogador) switch
    {
        "blindado" => ModeloDoBlindado(nivel),
        "fumaca" => ModeloDaFumaca(nivel),
        "healix" => ModeloDaHealix(nivel),
        _ => ModeloDoNivel(nivel),
    };

    /// <summary>A queda de cada nível; a do Blindado vem no pacote dele, a do comum só se a do pacote v2 chegou.</summary>
    private string? QuedaDe(CCSPlayerController jogador)
    {
        var nivel = NivelDe(jogador).Nivel;
        if (SkinDe(jogador) == "blindado") return QuedaDoBlindado(nivel);
        if (SkinDe(jogador) == "fumaca") return QuedaDaFumaca(nivel);
        if (SkinDe(jogador) == "healix") return QuedaDaHealix(nivel);
        if (!MorteNoServidor()) return null;
        return QuedaDoNivel[Math.Clamp(nivel, 1, QuedaDoNivel.Length) - 1];
    }

    private bool EscudoLigado(int vaga) => escudos.TryGetValue(vaga, out var escudo) && Server.CurrentTime < escudo.Fim;

    /// <summary>O G do Blindado: 2, 4 ou 6 segundos sem levar dano, conforme o nível, e 15 segundos até poder de novo.</summary>
    private HookResult LigarEscudo(CCSPlayerController jogador)
    {
        var agora = Server.CurrentTime;
        if (escudos.TryGetValue(jogador.Slot, out var escudo) && agora < escudo.Recarga)
        {
            jogador.PrintToCenterHtml($"<font color='#f5b301'>Escudo em {Math.Ceiling(escudo.Recarga - agora)} s</font>", 1);
            return HookResult.Handled;
        }
        var segundos = SegundosDoEscudo[Math.Clamp(NivelDe(jogador).Nivel, 1, SegundosDoEscudo.Length) - 1];
        escudos[jogador.Slot] = (agora + segundos, agora + SegundosDeRecargaDoEscudo);
        var corpo = jogador.PlayerPawn.Value;
        if (corpo != null)
        {
            corpo.Render = CorDoEscudo;
            Utilities.SetStateChanged(corpo, "CBaseModelEntity", "m_clrRender");
        }
        AddTimer(segundos, () =>
        {
            // Morto, o corpo está invisível para a queda: a cor volta pelo AplicarAtributosDoMutante quando renascer.
            if (jogador is not { IsValid: true, PawnIsAlive: true, Team: CsTeam.Terrorist } || EscudoLigado(jogador.Slot)) return;
            var atual = jogador.PlayerPawn.Value;
            if (atual == null) return;
            atual.Render = ZumbiNoServidor() ? mutanteDaRodada.Cor : CorDaReserva;
            Utilities.SetStateChanged(atual, "CBaseModelEntity", "m_clrRender");
        });
        return HookResult.Handled;
    }

    /// <summary>
    /// O G do Senhor do Vazio, como o Smoke do CrossFire: solta uma fumaça roxa em volta dele (8, 10 ou 12 s, conforme o
    /// nível) e custa 10% da vida máxima. Com a vida baixa demais, ou na recarga de 15 s, não solta.
    /// </summary>
    private HookResult SoltarFumaca(CCSPlayerController jogador)
    {
        var agora = Server.CurrentTime;
        if (fumacas.TryGetValue(jogador.Slot, out var fumaca) && agora < fumaca.Recarga)
        {
            jogador.PrintToCenterHtml($"<font color='#f5b301'>Fumaça em {Math.Ceiling(fumaca.Recarga - agora)} s</font>", 1);
            return HookResult.Handled;
        }
        var corpo = jogador.PlayerPawn.Value;
        if (corpo?.AbsOrigin == null) return HookResult.Handled;
        var custo = Math.Max(1, (int)Math.Round(NivelDe(jogador).Vida * VidaPorFumaca));
        if (corpo.Health <= custo)
        {
            jogador.PrintToCenterHtml("<font color='#ff6b6b'>Vida baixa demais para a fumaça</font>", 1);
            return HookResult.Handled;
        }
        corpo.Health -= custo;
        Utilities.SetStateChanged(corpo, "CBaseEntity", "m_iHealth");

        var segundos = SegundosDaFumacaNoNivel(NivelDe(jogador).Nivel);
        fumacas[jogador.Slot] = (agora + segundos, agora + SegundosDeRecargaDaFumaca);
        // A granada criada pelo nome caía no chão e nunca abria (dono, 11/11/2026): só a função do próprio jogo liga o
        // relógio que faz a fumaça estourar quando a granada para.
        var criar = CriarFumacaDoJogo();
        if (criar == null)
        {
            Console.WriteLine($"[Magnatas] Fumaça de {jogador.PlayerName}: a função do jogo que cria a fumaça não foi achada.");
            return HookResult.Handled;
        }
        var pe = corpo.AbsOrigin;
        var nuvem = criar.Invoke(new Vector(pe.X, pe.Y, pe.Z + 8f).Handle, new QAngle(0, 0, 0).Handle, new Vector(0, 0, 0).Handle,
            new Vector(0, 0, 0).Handle, corpo.Handle, ItemDaGranadaDeFumaca, corpo.TeamNum);
        if (nuvem == null || !nuvem.IsValid)
        {
            Console.WriteLine($"[Magnatas] Fumaça de {jogador.PlayerName}: o jogo não criou a granada.");
            return HookResult.Handled;
        }
        // Roxo do Vazio (0 a 255), lido pelo jogo na hora em que a fumaça estoura.
        nuvem.SmokeColor.X = 120f;
        nuvem.SmokeColor.Y = 40f;
        nuvem.SmokeColor.Z = 200f;
        Console.WriteLine($"[Magnatas] Fumaça de {jogador.PlayerName}: {segundos:0} s, custou {custo} de vida.");
        // Pela alça, que muda quando o número é reaproveitado: depois de um reinício de rodada, o número da fumaça podia
        // já ser de outra coisa, e apagar "a fumaça" apagava essa outra coisa (queda de 11/11/2026).
        var alca = nuvem.EntityHandle.Raw;
        fumacasNoChao.Add(alca);
        AddTimer(segundos, () => ApagarFumaca(alca));
        return HookResult.Handled;
    }

    // CSmokeGrenadeProjectile::Create(origem, ângulo, velocidade, giro, quem jogou, item, time) do libserver.so (Linux).
    // A do MatchZy no servidor parou de casar com o jogo; esta casa uma vez só no jogo de 06/11/2026. Se o CS2 mudar e ela
    // deixar de casar, a fumaça só não sai (fica no registro), o resto da Mutação continua.
    private const string AssinaturaDaFumaca =
        "55 4C 89 C1 48 89 E5 41 57 41 56 49 89 FE 41 55 45 89 CD 41 54 4D 89 C4 53 48 81 EC ? ? ? ? 48 89 95 ? ? ? ? 48 89 F2";
    private const int ItemDaGranadaDeFumaca = 45;
    private MemoryFunctionWithReturn<nint, nint, nint, nint, nint, int, int, CSmokeGrenadeProjectile>? criarFumaca;
    private bool fumacaDoJogoProcurada;

    private MemoryFunctionWithReturn<nint, nint, nint, nint, nint, int, int, CSmokeGrenadeProjectile>? CriarFumacaDoJogo()
    {
        if (fumacaDoJogoProcurada) return criarFumaca;
        fumacaDoJogoProcurada = true;
        try
        {
            criarFumaca = new(AssinaturaDaFumaca);
        }
        catch (Exception erro)
        {
            Console.WriteLine($"[Magnatas] A função do jogo que cria a fumaça não casou: {erro.Message}");
        }
        return criarFumaca;
    }

    // A alça inteira (número do objeto e o serial dele): o número sozinho volta a ser usado por outra coisa.
    private readonly List<uint> fumacasNoChao = new();
    private const uint MascaraDoNumeroDoObjeto = 0x7FFF;

    private void ApagarFumaca(uint alca)
    {
        fumacasNoChao.Remove(alca);
        var entidade = Utilities.GetEntityFromIndex<CBaseEntity>((int)(alca & MascaraDoNumeroDoObjeto));
        if (entidade is { IsValid: true } && entidade.EntityHandle.Raw == alca && entidade.DesignerName == "smokegrenade_projectile")
            entidade.Remove();
    }

    /// <summary>No reinício da rodada, as fumaças do G que ainda estão no chão saem, e os relógios delas não acham nada.</summary>
    private void ApagarFumacasDoG()
    {
        foreach (var alca in fumacasNoChao.ToList()) ApagarFumaca(alca);
    }

    /// <summary>Pergunta ao site qual mutante cada conta comprou e está usando. Site fora do ar: todos ficam com o comum.</summary>
    private async Task BuscarMutantesDaLoja(List<ulong> contas)
    {
        if (Config.SiteUrl == "" || Config.Token == "" || contas.Count == 0 || (!BlindadoNoServidor() && !FumacaNoServidor() && !HealixNoServidor())) return;
        try
        {
            using var pedido = new HttpRequestMessage(HttpMethod.Get, $"{Config.SiteUrl.TrimEnd('/')}/api/servidor/visuais?steamids={string.Join(",", contas)}");
            pedido.Headers.Authorization = new AuthenticationHeaderValue("Bearer", Config.Token);
            using var resposta = await Site.SendAsync(pedido);
            if (!resposta.IsSuccessStatusCode)
            {
                Console.WriteLine($"[Magnatas] O site recusou os mutantes da loja: {(int)resposta.StatusCode}.");
                return;
            }
            using var dados = JsonDocument.Parse(await resposta.Content.ReadAsStringAsync());
            var achados = new Dictionary<ulong, string>();
            foreach (var conta in dados.RootElement.EnumerateObject())
            {
                if (!ulong.TryParse(conta.Name, out var id)) continue;
                if (conta.Value.TryGetProperty("mutante", out var mutante) && mutante.GetString() is { } nome) achados[id] = nome;
            }
            Server.NextFrame(() =>
            {
                foreach (var conta in contas)
                {
                    if (achados.TryGetValue(conta, out var nome)) skinsPorConta[conta] = nome;
                    else skinsPorConta.Remove(conta);
                }
            });
        }
        catch (Exception erro)
        {
            Console.WriteLine($"[Magnatas] Falha ao buscar os mutantes da loja: {erro.GetType().Name}.");
        }
    }

    /// <summary>Só para teste: põe (ou tira, com "nenhum") o mutante da loja nos bots, todos ou só o da vaga dada.</summary>
    [ConsoleCommand("magnatas_mutacao_skin", "Teste: mutante da loja nos bots (blindado|fumaca|healix|nenhum [vaga])")]
    [CommandHelper(minArgs: 1, usage: "<blindado|fumaca|healix|nenhum> [vaga]", whoCanExecute: CommandUsage.SERVER_ONLY)]
    public void SkinDeTeste(CCSPlayerController? chamador, CommandInfo comando)
    {
        if (Config.Regra != "mutacao") return;
        var skin = comando.GetArg(1);
        int? vaga = comando.ArgCount > 2 && int.TryParse(comando.GetArg(2), out var numero) ? numero : null;
        foreach (var bot in Utilities.GetPlayers().Where(jogador => jogador is { IsValid: true, IsBot: true } && (vaga == null || jogador.Slot == vaga)))
        {
            if (skin is "blindado" or "fumaca" or "healix") skinsDeTeste[bot.Slot] = skin;
            else skinsDeTeste.Remove(bot.Slot);
            comando.ReplyToCommand($"vaga={bot.Slot} skin={SkinDe(bot) ?? "comum"}");
        }
    }

    /// <summary>Só para teste: sobe os bots mutantes vivos (ou só o da vaga dada) até o nível pedido, para ver o boneco de cada nível.</summary>
    [ConsoleCommand("magnatas_mutacao_nivel", "Teste: sobe bots mutantes até o nível dado (nivel [vaga])")]
    [CommandHelper(minArgs: 1, usage: "<nivel> [vaga]", whoCanExecute: CommandUsage.SERVER_ONLY)]
    public void SubirBotDeNivel(CCSPlayerController? chamador, CommandInfo comando)
    {
        if (Config.Regra != "mutacao" || !int.TryParse(comando.GetArg(1), out var nivel)) return;
        var novo = mutanteDaRodada.Niveis.FirstOrDefault(item => item.Nivel == nivel);
        if (novo == null)
        {
            comando.ReplyToCommand("nivel_invalido");
            return;
        }
        int? vaga = comando.ArgCount > 2 && int.TryParse(comando.GetArg(2), out var numero) ? numero : null;
        // Pessoa só pela vaga e só no teste com bots, para o Adm ver um mutante da loja num nível alto (11/11/2026).
        foreach (var bot in Utilities.GetPlayers().Where(jogador => jogador is { IsValid: true, PawnIsAlive: true, Team: CsTeam.Terrorist } && (jogador.IsBot || (vaga != null && testeComBots)) && (vaga == null || jogador.Slot == vaga)))
        {
            var antes = NivelDe(bot);
            // Só sobe: descer pela conta da vida deixaria um bot ferido com vida negativa.
            if (novo.Nivel <= antes.Nivel) continue;
            infeccoes[bot.Slot] = novo.InfeccoesParaChegar;
            SubirDeNivel(bot, antes, novo);
            comando.ReplyToCommand($"vaga={bot.Slot} nivel={novo.Nivel}");
        }
    }

    [ConsoleCommand("magnatas_mutacao_ver","Mostra humanos, mutantes e a rodada, para conferir o modo")]
    [CommandHelper(whoCanExecute: CommandUsage.SERVER_ONLY)]
    public void VerMutacao(CCSPlayerController? chamador, CommandInfo comando)
    {
        if (Config.Regra != "mutacao") return;
        foreach (var jogador in Utilities.GetPlayers().Where(jogador => jogador is { IsValid: true }))
        {
            var corpo = jogador.PlayerPawn.Value;
            var armas = corpo?.WeaponServices?.MyWeapons.Select(item => item.Value?.DesignerName ?? "?") ?? Enumerable.Empty<string>();
            comando.ReplyToCommand($"vaga={jogador.Slot} time={jogador.Team} vivo={jogador.PawnIsAlive} vida={corpo?.Health}/{corpo?.MaxHealth} velocidade={corpo?.AbsVelocity.Length():0} modificador={corpo?.VelocityModifier:0.00} nivel={(jogador.Team == CsTeam.Terrorist ? NivelDe(jogador).Nivel : 0)} armas={string.Join(",", armas)}");
        }
        comando.ReplyToCommand($"em_andamento={rodadaEmAndamento} esperando={esperandoJogadores} teste_bots={testeComBots} zumbi={ZumbiNoServidor()} sorteio={sorteioFeito} rodadas={rodadasDaPartida} humanos={vitoriasDosHumanos} mutantes={vitoriasDosMutantes} transformacoes={transformacoes} municao={ConVar<int>.Find("sv_infinite_ammo")?.Value}");
    }
}
