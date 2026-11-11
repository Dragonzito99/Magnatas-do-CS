import Image from 'next/image';
import Link from 'next/link';
import { exigirAcesso } from '@/auth/guarda';
import { obterBd } from '@/bd/conexao';
import { bombandoAgora } from '@/dominio/bombando';
import { jogosDaInicio } from '@/dominio/cartoes-de-noticias';
import { enderecoDoDiscord } from '@/dominio/discord';
import { mvpsDoPeriodo, periodoDeBrasilia } from '@/dominio/mvps';
import { ultimasNoticias } from '@/dominio/noticias';
import { noticiasSteamDaTela } from '@/dominio/noticias-steam';
import { rankingDaComunidade } from '@/dominio/ranking';
import { tierSDaTela } from '@/dominio/tier-s';
import { controladorDoAmbiente } from '@/servidor-jogo/controlador';
import { Atualizar } from '../atualizar';
import { Avatar } from '../avatar';
import { CarrosselDeNoticias } from './carrossel';
import { JogosDosTimes } from './jogos-dos-times';

const TOTAL_DO_MIX = 10;
const NOTICIAS_NO_CARROSSEL = 4;
const dataCurta = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', timeZone: 'America/Sao_Paulo' });
// Notícia sem foto ganha a de um mapa, para o cartão nunca ficar vazio.
const FOTOS_DE_RESERVA = ['/mapas/egypt.webp', '/mapas/laboratory.webp', '/mapas/biochemical-hotel.webp', '/mapas/silent-village.webp'];

/** O primeiro parágrafo da notícia, cortado, para o cartão. */
function chamada(texto: string): string {
  const primeiro = texto.split(/\n\s*\n/)[0];
  return primeiro.length > 160 ? `${primeiro.slice(0, 157)}...` : primeiro;
}

function IconeDoDiscord() {
  return (
    <svg className="icone-discord" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M20.3 4.4A19.8 19.8 0 0 0 15.4 3l-.6 1.3a18.4 18.4 0 0 0-5.6 0L8.6 3a19.7 19.7 0 0 0-4.9 1.4C.6 9 0 13.6.3 18.1a19.9 19.9 0 0 0 6 3l1.3-2.1a12.9 12.9 0 0 1-2-1l.5-.4a14.2 14.2 0 0 0 12 0l.5.4c-.6.4-1.3.7-2 1l1.3 2.1a19.8 19.8 0 0 0 6-3c.5-5.2-.8-9.7-3.6-13.7ZM8.5 15.3c-1.2 0-2.2-1.1-2.2-2.4s1-2.4 2.2-2.4 2.2 1.1 2.2 2.4-1 2.4-2.2 2.4Zm7 0c-1.2 0-2.2-1.1-2.2-2.4s1-2.4 2.2-2.4 2.2 1.1 2.2 2.4-1 2.4-2.2 2.4Z" />
    </svg>
  );
}

/** A Início como no rascunho: capa com JOGAR AGORA, notícia passando, cartões de destaque e o que é o Magnatas. */
export default async function Inicio() {
  const usuario = await exigirAcesso('/inicio');
  const bd = obterBd();
  const agora = new Date();
  const [bombando, noticias, mvpsDoDia, steam, tierS, ranking] = await Promise.all([
    bombandoAgora(bd, controladorDoAmbiente(), process.env.DIVERSAO_HOST, process.env.SERVIDOR_SENHA ?? ''),
    ultimasNoticias(bd, NOTICIAS_NO_CARROSSEL),
    mvpsDoPeriodo(bd, periodoDeBrasilia(agora, 'dia'), 1),
    noticiasSteamDaTela(bd, 1),
    tierSDaTela(bd),
    rankingDaComunidade(bd, 1000),
  ]);
  const aoVivo = bombando.cartoes.find((cartao) => cartao.tipo === 'diversao') ?? bombando.cartoes[0];
  const mvp = mvpsDoDia[0];
  const cs2 = steam[0];
  const jogosDosTimes = jogosDaInicio(tierS?.jogos ?? [], agora);
  const minhaPosicao = ranking.find((linha) => linha.jogador.id === usuario.id)?.posicao;
  const topo = ranking[0];
  const discord = enderecoDoDiscord(process.env.DISCORD_URL);
  const slides = noticias.map((noticia, indice) => ({
    id: noticia.id,
    titulo: noticia.titulo,
    resumo: chamada(noticia.texto),
    imagem: noticia.imagem ?? FOTOS_DE_RESERVA[indice % FOTOS_DE_RESERVA.length],
    fixada: noticia.fixada,
  }));

  return (
    <>
      <Atualizar segundos={30} />
      <section className="capa-inicio">
        <Image className="capa-personagem esquerda" src="/marca/personagem.webp" alt="" width={756} height={800} priority />
        <Image className="capa-personagem direita" src="/marca/personagem.webp" alt="" width={756} height={800} priority />
        <div className="capa-centro">
          <Image className="capa-logo" src="/marca/logo.webp" alt="Magnatas do CS" width={1000} height={334} priority />
          <p className="capa-frase">
            Jogue <b>·</b> Vença <b>·</b> Faça parte
          </p>
          <Link href="/jogar" className="botao-capa">
            JOGAR AGORA
            <small>
              {bombando.naFilaDoMix} de {TOTAL_DO_MIX} na fila do mix · {bombando.naDiversao} jogando na Diversão
            </small>
          </Link>
        </div>
      </section>

      <section className="destaques-inicio">
        <CarrosselDeNoticias noticias={slides} />
        {aoVivo ? (
          <Link href="/jogar" className="cartao-destaque">
            <Image src={aoVivo.foto ?? '/mapas/dust2.webp'} alt="" width={480} height={540} />
            <span className="selo-modo verde">Ao vivo agora</span>
            <h2>{aoVivo.titulo}</h2>
            <p>
              {aoVivo.mapa ? `${aoVivo.mapa} · ` : ''}
              {aoVivo.ocupacao}
            </p>
          </Link>
        ) : (
          <Link href="/jogar" className="cartao-destaque">
            <Image src="/mapas/laboratory.webp" alt="" width={480} height={540} />
            <span className="selo-modo verde">Ao vivo agora</span>
            <h2>Ninguém jogando</h2>
            <p>Os servidores ligam na hora. Abra um.</p>
          </Link>
        )}
        <Link href="/patentes" className="cartao-destaque">
          <Image src="/mapas/biochemical-hotel.webp" alt="" width={480} height={540} />
          <span className="selo-modo">Novo</span>
          <h2>Patentes com níveis</h2>
          <p>83 degraus, do Recruta ao Magnata Lendário.</p>
        </Link>
      </section>

      <section className="miudos-inicio">
        <Link href={mvp ? `/jogadores/${mvp.id}` : '/ranking'} className="cartao-destaque pequeno">
          <Image src="/mapas/dust2.webp" alt="" width={480} height={270} />
          <span className="selo-modo ouro">MVP do dia</span>
          <h3>{mvp ? mvp.apelido : 'Ninguém ainda'}</h3>
          <p>{mvp ? `${mvp.mvps} ${mvp.mvps === 1 ? 'estrela' : 'estrelas'}` : 'A primeira estrela do dia está esperando'}</p>
        </Link>
        {cs2 ? (
          <a href={cs2.url} target="_blank" rel="noreferrer" className="cartao-destaque pequeno">
            <Image src="/mapas/mirage.webp" alt="" width={480} height={270} />
            <span className="selo-modo">CS2 oficial</span>
            <h3>{cs2.titulo}</h3>
            <p>{dataCurta.format(cs2.publicadaEm)}</p>
          </a>
        ) : (
          <Link href="/noticias?tipo=cs2" className="cartao-destaque pequeno">
            <Image src="/mapas/mirage.webp" alt="" width={480} height={270} />
            <span className="selo-modo">CS2 oficial</span>
            <h3>Sem novidades</h3>
          </Link>
        )}
        {jogosDosTimes.length > 0 ? (
          <JogosDosTimes jogos={jogosDosTimes} />
        ) : (
          <Link href="/noticias?tipo=times" className="cartao-destaque pequeno">
            <Image src="/mapas/transport-ship.webp" alt="" width={480} height={270} />
            <span className="selo-modo verde">Times BR</span>
            <h3>Sem jogos agora</h3>
          </Link>
        )}
        {topo ? (
          <Link href={`/jogadores/${topo.jogador.id}`} className="cartao-destaque pequeno topo-do-ranking">
            <Image src="/mapas/luxville.webp" alt="" width={480} height={270} />
            <span className="selo-modo ouro">Top 1 do ranking</span>
            <span className="pessoa-do-topo">
              <span className="foto-do-topo">
                <span className="coroa-do-topo" aria-hidden="true">
                  👑
                </span>
                <Avatar usuario={topo.jogador} />
              </span>
              <span className="nome-do-topo">
                <h3>{topo.jogador.apelido}</h3>
                <p>{topo.patente.nome}</p>
              </span>
            </span>
            <p>{minhaPosicao === 1 ? 'O topo é seu!' : minhaPosicao ? `Você está em ${minhaPosicao}º` : 'Jogue uma partida para entrar'}</p>
          </Link>
        ) : (
          <Link href="/ranking" className="cartao-destaque pequeno">
            <Image src="/mapas/luxville.webp" alt="" width={480} height={270} />
            <span className="selo-modo ouro">Top 1 do ranking</span>
            <h3>Vaga aberta</h3>
            <p>Jogue uma partida para ser o primeiro</p>
          </Link>
        )}
        {discord ? (
          <a href={discord} target="_blank" rel="noreferrer" className="cartao-discord">
            <IconeDoDiscord />
            <b>Faça parte do nosso Discord</b>
          </a>
        ) : (
          <div className="cartao-discord desligado">
            <IconeDoDiscord />
            <b>Discord em breve</b>
          </div>
        )}
      </section>

      <div className="mais-novidades">
        <Link href="/noticias">Ver mais novidades</Link>
      </div>

      <h2 className="secao-titulo">
        O que é o <b>Magnatas</b>?
      </h2>
      <section className="o-que-e">
        <Link href="/jogar?modo=competitivo" className="cartao-destaque">
          <Image src="/mapas/dust2.webp" alt="" width={480} height={270} />
          <span className="selo-modo ouro">Competitivo</span>
          <h3>Mix e salas 5x5</h3>
          <p>Partidas com servidor próprio, vetos e gravação de cada rodada.</p>
        </Link>
        <Link href="/jogar" className="cartao-destaque">
          <Image src="/mapas/laboratory.webp" alt="" width={480} height={270} />
          <span className="selo-modo verde">Diversão</span>
          <h3>Modos do CrossFire</h3>
          <p>Fantasma, Mutação, Equipe x Equipe e Cada um por si.</p>
        </Link>
        <Link href="/jogo" className="cartao-destaque">
          <Image src="/mapas/silent-village.webp" alt="" width={480} height={270} />
          <span className="selo-modo">Comunidade</span>
          <h3>Só gente verificada</h3>
          <p>Patentes, ranking e o Olho de Águia de olho nos trapaceiros.</p>
        </Link>
      </section>
    </>
  );
}
