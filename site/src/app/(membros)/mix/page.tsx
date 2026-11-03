import Link from 'next/link';
import { exigirAcesso } from '@/auth/guarda';
import { obterBd } from '@/bd/conexao';
import { verMix } from '@/dominio/mix';
import { partidaAtualDe, partidasEmAndamento } from '@/dominio/partidas';
import { nomeDaPartida, nomeDoMapa } from '@/dominio/textos-da-partida';
import { Atualizar } from '../atualizar';
import { Avatar } from '../avatar';
import { OnlineAgora } from '../online-agora';
import { entrar, sair } from './acoes';

const TOTAL = 10;

const ERROS: Record<string, string> = {
  ocupado: 'Você já está em uma sala ou em uma partida. Saia antes de entrar no mix.',
  'sem-acesso': 'Sua conta não pode fazer isso agora.',
};

export default async function Mix({ searchParams }: { searchParams: Promise<{ erro?: string }> }) {
  const usuario = await exigirAcesso('/mix');
  const { erro } = await searchParams;
  const bd = obterBd();
  const [mix, partida, andamento] = await Promise.all([verMix(bd), partidaAtualDe(bd, usuario.id), partidasEmAndamento(bd)]);
  const estouNaFila = mix.jogadores.some((jogador) => jogador.id === usuario.id);
  const faltam = TOTAL - mix.total;

  return (
    <>
      <Atualizar segundos={3} />
      <div className="topo-pagina">
        <h1>Mix</h1>
        {!partida &&
          (estouNaFila ? (
            <form action={sair}>
              <button type="submit" className="botao cinza pequeno">
                Sair do mix
              </button>
            </form>
          ) : (
            <form action={entrar}>
              <button type="submit" className="botao laranja pequeno">
                Entrar no mix
              </button>
            </form>
          ))}
      </div>
      {erro && ERROS[erro] && (
        <p role="alert" className="aviso">
          {ERROS[erro]}
        </p>
      )}
      {partida && (
        <p className="aviso">
          Você está em uma partida. <Link href={`/partidas/${partida.id}`}>Abrir a partida</Link>
        </p>
      )}
      <div className="grade">
        <div className="pilha">
          <section className="painel">
            <div className="cabeca-painel">
              <h2>Quem está na sala</h2>
              <span>
                {mix.total} de {TOTAL}
              </span>
            </div>
            <div className="jogadores">
              {Array.from({ length: TOTAL }, (_, indice) => {
                const jogador = mix.jogadores[indice];
                if (!jogador) {
                  return (
                    <div className="jogador" key={indice}>
                      <span className="avatar livre" />
                      livre
                    </div>
                  );
                }
                return (
                  <div className="jogador" key={jogador.id}>
                    <Avatar usuario={jogador} />
                    <span className="nome">{jogador.apelido}</span>
                  </div>
                );
              })}
            </div>
          </section>
          <section className="painel">
            <div className="cabeca-painel">
              <h2>Em andamento</h2>
              <span>{andamento.length === 1 ? '1 partida' : `${andamento.length} partidas`}</span>
            </div>
            {andamento.length === 0 && <p className="vazio">Nenhuma partida rolando agora.</p>}
            {andamento.map((item) => (
              <div className="linha" key={item.id}>
                <div>
                  <Link href={`/partidas/${item.id}`}>{nomeDaPartida(item)}</Link>
                  <small>{nomeDoMapa(item.mapa)}</small>
                </div>
                <span className="mono">
                  {item.placar1} x {item.placar2}
                </span>
              </div>
            ))}
          </section>
        </div>
        <div className="pilha">
          <section className="cartao-escuro">
            <span className="ao-vivo">Mix aberto</span>
            <div className="numero-grande mono">
              {mix.total}
              <small>/{TOTAL}</small>
            </div>
            <div className="barras" aria-hidden="true">
              {Array.from({ length: TOTAL }, (_, indice) => (
                <div key={indice} className={indice < mix.total ? 'ligada' : ''} />
              ))}
            </div>
            <p>{faltam === 1 ? 'Falta 1 para começar' : `Faltam ${faltam} para começar`}</p>
          </section>
          <OnlineAgora />
        </div>
      </div>
    </>
  );
}
