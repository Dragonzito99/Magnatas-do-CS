import { headers } from 'next/headers';
import Image from 'next/image';
import Link from 'next/link';
import { exigirAcesso } from '@/auth/guarda';
import { obterBd } from '@/bd/conexao';
import { ehCelular } from '@/dominio/aparelho';
import { clasDosUsuarios } from '@/dominio/clas';
import { desafiosDaSala, opcoesDeDesafio } from '@/dominio/desafios';
import { estadoDoCartao, listarServidoresDaDiversao, mapaDoCartao } from '@/dominio/diversao';
import { situacaoDasFaltas } from '@/dominio/faltas';
import { kdDosJogadores } from '@/dominio/ficha';
import { FILTROS_DO_JOGAR, lerFiltroDoJogar, mostraNoFiltro } from '@/dominio/jogar';
import { juncoesDaSala } from '@/dominio/juncoes';
import { verMix } from '@/dominio/mix';
import { partidaAtualDe, partidasEmAndamento } from '@/dominio/partidas';
import { listarSalas, minhaSala, TAMANHO_DA_SALA, type SalaComMembros } from '@/dominio/salas';
import { estadosDaTela } from '@/dominio/sob-demanda';
import { nomeDaPartida, nomeDoMapa } from '@/dominio/textos-da-partida';
import { controladorDoAmbiente } from '@/servidor-jogo/controlador';
import { diversaoDoAmbiente } from '@/servidor-jogo/diversao-do-ambiente';
import { Atualizar } from '../atualizar';
import { AvisoDeBloqueio } from '../aviso-de-bloqueio';
import { entrar as entrarNoMix, sair as sairDoMix } from '../mix/acoes';
import { OnlineAgora } from '../online-agora';
import { ERROS_DA_DIVERSAO, nomeDoModo, RodapeDoCartao, SEM_RESPOSTA } from './rodape-da-diversao';
import { BarraDaSala, BotaoDaSala, BotaoDeDesafio, CriarSalaCartao, SalaCartao } from './sala';

const TOTAL_DO_MIX = 10;
const FOTO_DO_MIX = '/mapas/mirage.webp';

const ERROS: Record<string, string> = {
  cheia: 'Esta sala já está completa.',
  'em-partida': 'Esta sala está em partida.',
  inexistente: 'Esta sala não existe mais.',
  'so-lider': 'Só o líder pode fazer isso.',
  ocupado: 'Você já está em uma sala, no mix ou em uma partida.',
  bloqueado: 'Você está sem jogar por não ter aceitado uma partida.',
  'sem-acesso': 'Sua conta não pode fazer isso agora.',
  incompleta: 'As duas salas precisam estar completas e com todos liberados para jogar.',
  desafio: 'Este desafio não está mais disponível.',
  juncao: 'Este pedido de junção não está mais disponível.',
  ...ERROS_DA_DIVERSAO,
};

/** Salas, mix e Diversão num lugar só, com filtros, como o dono pediu. */
export default async function Jogar({ searchParams }: { searchParams: Promise<{ modo?: string; erro?: string }> }) {
  const usuario = await exigirAcesso('/jogar');
  const { modo: texto, erro } = await searchParams;
  const filtro = lerFiltroDoJogar(texto);
  const bd = obterBd();

  const [salas, minha, partida, faltas, mix, andamento, todosServidores] = await Promise.all([
    listarSalas(bd),
    minhaSala(bd, usuario.id),
    partidaAtualDe(bd, usuario.id),
    situacaoDasFaltas(bd, usuario.id),
    verMix(bd),
    partidasEmAndamento(bd),
    listarServidoresDaDiversao(bd),
  ]);
  const [desafio] = minha ? await desafiosDaSala(bd, minha.id) : [];
  const juncoes = minha ? await juncoesDaSala(bd, minha.id) : [];
  const idsNasSalas = [...new Set(salas.flatMap((sala) => sala.membros.map((membro) => membro.id)))];
  const [kd, clasNasSalas] = await Promise.all([kdDosJogadores(bd, idsNasSalas), clasDosUsuarios(bd, idsNasSalas)]);

  const servidores = todosServidores.filter((servidor) => mostraNoFiltro(filtro, servidor.modo));
  const diversao = diversaoDoAmbiente(controladorDoAmbiente());
  const [situacoes, guardados] = await Promise.all([
    Promise.all(servidores.map((servidor) => (servidor.ativo ? diversao.situacaoDaTela(servidor) : SEM_RESPOSTA))),
    estadosDaTela(
      bd,
      servidores.map((servidor) => servidor.id),
    ),
  ]);
  const algumEsperando = servidores.some((servidor, indice) =>
    ['ligando', 'trocando_mapa'].includes(estadoDoCartao(servidor, situacoes[indice], guardados.get(servidor.id)?.estado)),
  );
  // eslint-disable-next-line react-hooks/purity -- página do servidor: a hora é lida uma vez por pedido.
  const agora = Date.now();
  const celular = ehCelular(await headers());

  const estouNoMix = mix.jogadores.some((jogador) => jogador.id === usuario.id);
  const souLider = !!minha && minha.liderId === usuario.id;
  const possoDesafiar = souLider && minha.membros.length === TAMANHO_DA_SALA && !minha.partidaId && !desafio;
  // Juntar: eu líder, minha sala fora de partida, a soma cabendo em 5 e nenhum pedido aberto com essa sala.
  const possoJuntarCom = (sala: SalaComMembros) =>
    souLider && !minha.partidaId && minha.membros.length + sala.membros.length <= TAMANHO_DA_SALA && !juncoes.some((juncao) => juncao.outraSalaId === sala.id);
  const outras = salas.filter((sala) => sala.id !== minha?.id);
  // Com as duas salas de clã, o desafio pode ser clã x clã ou treino.
  const opcoes = new Map(
    possoDesafiar
      ? await Promise.all(
          outras.filter((sala) => sala.membros.length === TAMANHO_DA_SALA && !sala.partidaId).map(async (sala) => [sala.id, await opcoesDeDesafio(bd, minha.id, sala.id)] as const),
        )
      : [],
  );
  const modoDaDiversao = filtro && filtro !== 'competitivo' && filtro !== 'mix' ? filtro : null;

  function acaoDaSala(sala: SalaComMembros) {
    if (sala.partidaId) return <span className="etiqueta">Em partida</span>;
    const completa = sala.membros.length === TAMANHO_DA_SALA;
    if (!completa && !minha && !partida) return <BotaoDaSala tipo="entrar" salaId={sala.id} />;
    if (completa && possoDesafiar) return <BotaoDeDesafio salaId={sala.id} opcoes={opcoes.get(sala.id) ?? ['comum']} />;
    if (!completa && possoJuntarCom(sala)) return <BotaoDaSala tipo="juntar" salaId={sala.id} />;
    return null;
  }

  return (
    <>
      {(minha || estouNoMix || algumEsperando || filtro === 'competitivo' || filtro === 'mix') && <Atualizar segundos={3} />}
      {minha && <BarraDaSala sala={minha} usuarioId={usuario.id} kd={kd} desafio={desafio} juncoes={juncoes} clas={clasNasSalas} />}
      <div className={minha ? 'tela-jogar com-sala' : 'tela-jogar'}>
        <AvisoDeBloqueio situacao={faltas} />
        <div className="topo-jogar">
          <h1>Jogar</h1>
          <p className="apoio">Escolha o que você quer jogar agora.</p>
        </div>
        {erro && ERROS[erro] && (
          <p role="alert" className="aviso">
            {ERROS[erro]}
          </p>
        )}
        <nav className="filtros-jogar" aria-label="Modos de jogo">
          {FILTROS_DO_JOGAR.map((item) => (
            <Link
              key={item.nome}
              className="filtro-jogar"
              href={item.valor ? `/jogar?modo=${item.valor}` : '/jogar'}
              aria-current={filtro === item.valor ? 'page' : undefined}
            >
              {item.nome}
            </Link>
          ))}
        </nav>

        <div className="grade-jogar">
          {mostraNoFiltro(filtro, 'mix') && (
            <article className="cartao-jogar">
              <div className="foto-jogar">
                <Image src={FOTO_DO_MIX} alt="" width={480} height={270} />
                <span className="selo-modo ouro">Mix</span>
              </div>
              <div className="corpo-jogar">
                <h2>Fila do mix</h2>
                <p>Entre sozinho. Com 10 na fila, os times são sorteados e a partida começa.</p>
                <div className="barra-ocupacao" aria-hidden="true">
                  <i style={{ width: `${(mix.total / TOTAL_DO_MIX) * 100}%` }} />
                </div>
                <div className="rodape-jogar">
                  <b className="ocupacao">
                    {mix.total}/{TOTAL_DO_MIX}
                  </b>
                  {!partida &&
                    (estouNoMix ? (
                      <form action={sairDoMix}>
                        <button type="submit" className="botao contorno pequeno">
                          Sair da fila
                        </button>
                      </form>
                    ) : faltas.bloqueadoAte || minha ? null : (
                      <form action={entrarNoMix}>
                        <button type="submit" className="botao ouro pequeno">
                          Entrar na fila
                        </button>
                      </form>
                    ))}
                </div>
              </div>
            </article>
          )}

          {mostraNoFiltro(filtro, 'competitivo') && !minha && !partida && !faltas.bloqueadoAte && <CriarSalaCartao />}
          {mostraNoFiltro(filtro, 'competitivo') && outras.map((sala) => <SalaCartao key={sala.id} sala={sala} kd={kd} acao={acaoDaSala(sala)} clas={clasNasSalas} />)}

          {servidores.map((servidor, indice) => {
            const mapa = mapaDoCartao(servidor, situacoes[indice]);
            const ligado = situacoes[indice].ligado;
            return (
              <article key={servidor.id} className="cartao-jogar">
                <div className="foto-jogar">
                  <Image src={mapa.foto} alt={`Mapa ${mapa.nome}`} width={480} height={270} />
                  <span className={ligado ? 'selo-modo verde' : 'selo-modo'}>{ligado ? 'Ao vivo' : nomeDoModo(servidor.modo)}</span>
                </div>
                <div className="corpo-jogar">
                  <h2>{nomeDoModo(servidor.modo)}</h2>
                  <p>{mapa.regra ?? servidor.armas}</p>
                  <small className="apoio">{mapa.nome}</small>
                  <div className="rodape-jogar rodape-servidor">
                    <RodapeDoCartao servidor={servidor} situacao={situacoes[indice]} guardado={guardados.get(servidor.id)} modo={modoDaDiversao} agora={agora} celular={celular} />
                  </div>
                </div>
              </article>
            );
          })}
        </div>

        {(filtro === null || filtro === 'mix' || filtro === 'competitivo') && andamento.length > 0 && (
          <section className="painel">
            <div className="cabeca-painel">
              <h2>Rolando agora</h2>
              <span>{andamento.length === 1 ? '1 partida' : `${andamento.length} partidas`}</span>
            </div>
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
        )}
        {filtro === 'competitivo' && <OnlineAgora />}
      </div>
    </>
  );
}
