import Image from 'next/image';
import Link from 'next/link';
import { exigirAcesso } from '@/auth/guarda';
import { PATENTES } from '@/dominio/xp';

const PASSOS = [
  { titulo: 'Entre com convite', texto: 'O Magnatas é fechado. Um membro te convida e você confirma quem é: só gente de verdade joga aqui.' },
  { titulo: 'Escolha o que jogar', texto: 'Na tela Jogar ficam o mix, as salas de competitivo e os modos da Diversão. Filtre e clique em Entrar.' },
  { titulo: 'Jogue no nosso servidor', texto: 'Toda partida roda num servidor do Magnatas, com gravação. O Olho de Águia confere as denúncias.' },
  { titulo: 'Suba de patente', texto: `Cada partida jogada até o fim dá XP. São ${PATENTES.length} degraus, do Recruta ao Magnata Lendário.` },
];

// As regras do rascunho aprovado pelo dono.
const REGRAS = [
  { titulo: 'Sem trapaça', texto: 'Qualquer programa que dê vantagem é banimento. Toda partida competitiva é gravada e o Olho de Águia assiste às denúncias.' },
  { titulo: 'Respeito', texto: 'Xingar, humilhar ou ameaçar alguém leva a suspensão. Brincadeira tem limite.' },
  { titulo: 'Jogue até o fim', texto: 'Quem sai no meio deixa o time na mão e não ganha XP da partida.' },
  { titulo: 'Uma conta por pessoa', texto: 'A verificação de identidade garante que cada pessoa tem uma conta só.' },
  { titulo: 'Denuncie direito', texto: 'Use o botão Denunciar na tela da partida. Denúncia falsa também é punida.' },
];

const MODOS = [
  { nome: 'Competitivo', selo: 'ouro', foto: '/mapas/dust2.webp', texto: '5 contra 5 em salas. Juntem a sala, desafiem outra e vetem os mapas.', filtro: 'competitivo' },
  { nome: 'Mix', selo: 'ouro', foto: '/mapas/mirage.webp', texto: 'Entre sozinho na fila. Com 10, os times são sorteados e a partida começa.', filtro: 'mix' },
  { nome: 'Cada um por si', selo: '', foto: '/mapas/luxville.webp', texto: 'Mata-mata sem time: AK e Desert, só pistola ou AWP.', filtro: 'cada_um' },
  { nome: 'Equipe x Equipe', selo: '', foto: '/mapas/egypt.webp', texto: 'Mata-mata em times, voltando na hora, em mapas do CrossFire.', filtro: 'equipe' },
  { nome: 'Fantasma', selo: 'verde', foto: '/mapas/laboratory.webp', texto: 'Fantasmas invisíveis só com faca contra soldados armados.', filtro: 'fantasma' },
  { nome: 'Mutação', selo: 'verde', foto: '/mapas/biochemical-hotel.webp', texto: 'Um mutante aparece e contamina quem ele pega. Fuja ou vire um.', filtro: 'mutacao' },
];

const MAPAS = [
  { nome: 'Mirage', foto: '/mapas/mirage.webp', modo: 'Competitivo e mix' },
  { nome: 'Dust 2', foto: '/mapas/dust2.webp', modo: 'Competitivo e mix' },
  { nome: 'Egypt', foto: '/mapas/egypt.webp', modo: 'Equipe x Equipe' },
  { nome: 'Transport Ship', foto: '/mapas/transport-ship.webp', modo: 'Equipe x Equipe' },
  { nome: 'Luxville', foto: '/mapas/luxville.webp', modo: 'Equipe x Equipe' },
  { nome: 'Laboratory', foto: '/mapas/laboratory.webp', modo: 'Fantasma' },
  { nome: 'Biochemical Hotel', foto: '/mapas/biochemical-hotel.webp', modo: 'Mutação' },
  { nome: 'Silent Village', foto: '/mapas/silent-village.webp', modo: 'Mutação' },
];

/** Tudo o que alguém novo precisa saber para jogar no Magnatas. */
export default async function Jogo() {
  await exigirAcesso('/jogo');
  return (
    <>
      <div className="topo-jogar">
        <h1>O jogo</h1>
        <p className="apoio">Tudo o que você precisa saber para jogar no Magnatas.</p>
      </div>
      <nav className="filtros-jogar" aria-label="Partes da página">
        <a className="filtro-jogar" href="#como-funciona">
          Como funciona
        </a>
        <a className="filtro-jogar" href="#modos">
          Modos
        </a>
        <a className="filtro-jogar" href="#mapas">
          Mapas
        </a>
        <Link className="filtro-jogar" href="/patentes">
          Patentes
        </Link>
      </nav>

      <h2 className="secao-titulo" id="como-funciona">
        Como <b>funciona</b>
      </h2>
      <section className="passos">
        {PASSOS.map((passo, indice) => (
          <div className="passo" key={passo.titulo}>
            <b>{indice + 1}</b>
            <h3>{passo.titulo}</h3>
            <p>{passo.texto}</p>
          </div>
        ))}
      </section>

      <h2 className="secao-titulo" id="modos">
        Os <b>modos</b>
      </h2>
      <section className="modos-info">
        {MODOS.map((modo) => (
          <Link key={modo.nome} href={`/jogar?modo=${modo.filtro}`} className="cartao-destaque modo-info">
            <Image src={modo.foto} alt="" width={480} height={270} />
            <span className={modo.selo ? `selo-modo ${modo.selo}` : 'selo-modo'}>{modo.nome}</span>
            <p>{modo.texto}</p>
          </Link>
        ))}
      </section>

      <h2 className="secao-titulo" id="mapas">
        Os <b>mapas</b>
      </h2>
      <section className="mapas-jogo">
        {MAPAS.map((mapa) => (
          <div key={mapa.nome} className="cartao-destaque mapa-info">
            <Image src={mapa.foto} alt="" width={480} height={270} />
            <h3>{mapa.nome}</h3>
            <p>{mapa.modo}</p>
          </div>
        ))}
      </section>

      <h2 className="secao-titulo" id="regras">
        As <b>regras</b>
      </h2>
      <ol className="regras">
        {REGRAS.map((regra, indice) => (
          <li key={regra.titulo}>
            <b>{indice + 1}</b>
            <div>
              <h3>{regra.titulo}</h3>
              <p>{regra.texto}</p>
            </div>
          </li>
        ))}
      </ol>
    </>
  );
}
