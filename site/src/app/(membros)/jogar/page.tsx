import { headers } from 'next/headers';
import Image from 'next/image';
import Link from 'next/link';
import { exigirAcesso } from '@/auth/guarda';
import { pode } from '@/auth/permissoes';
import { obterBd } from '@/bd/conexao';
import { ehCelular } from '@/dominio/aparelho';
import { clasDosUsuarios } from '@/dominio/clas';
import { amigosDe } from '@/dominio/amigos';
import { membrosOnline } from '@/dominio/denuncias';
import { desafiosDaSala, opcoesDeDesafio } from '@/dominio/desafios';
import { estadoDoCartao, listarServidoresDaDiversao, mapaDoCartao, MODOS_DE_DIVERSAO, type ModoDeDiversao } from '@/dominio/diversao';
import { situacaoDasFaltas } from '@/dominio/faltas';
import { kdDosJogadores } from '@/dominio/ficha';
import { principaisDe } from '@/dominio/insignias';
import { FILTROS_DO_JOGAR, lerFiltroDoJogar, mostraNoFiltro } from '@/dominio/jogar';
import { juncoesDaSala } from '@/dominio/juncoes';
import { manutencaoAtual } from '@/dominio/manutencao';
import { verMix } from '@/dominio/mix';
import { partidaAtualDe, partidasEmAndamento } from '@/dominio/partidas';
import { listarSalas, minhaSala, TAMANHO_DA_SALA, type SalaComMembros } from '@/dominio/salas';
import { estadosDaTela } from '@/dominio/sob-demanda';
import { nomeDaPartida, nomeDoMapa } from '@/dominio/textos-da-partida';
import { controladorDoAmbiente } from '@/servidor-jogo/controlador';
import { diversaoDoAmbiente } from '@/servidor-jogo/diversao-do-ambiente';
import { Atualizar } from '../atualizar';
import { AvisoDeBloqueio } from '../aviso-de-bloqueio';
import { AguardandoAtualizacao } from '../aviso-de-manutencao';
import { entrar as entrarNoMix, sair as sairDoMix } from '../mix/acoes';
import { OnlineAgora } from '../online-agora';
import { ERROS_DA_DIVERSAO, RodapeDoCartao, SEM_RESPOSTA } from './rodape-da-diversao';
import { BarraDaSala, BotaoCriarSala, BotaoDaSala, BotaoDeDesafio, LinhaDaSala, VagasEmCirculo } from './sala';

const TOTAL_DO_MIX = 10;
const FOTO_DO_MIX = '/mapas/mirage.webp';
const FOTO_DA_SALA = '/mapas/dust2.webp';

const DESCRICAO_DO_MODO: Record<ModoDeDiversao, string> = {
  cada_um: 'Sem time: todo mundo contra todo mundo.',
  equipe: 'Renasce na base. Ganha o time que fizer mais abates.',
  mutacao: 'Quem é pego vira mutante. O último humano ganha a super Negev.',
  fantasma: 'Invisíveis de faca contra armados.',
  lemnos: 'Entre com seu kit, pegue o saque e chegue vivo à extração.',
};

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
  'nao-amigo': 'Só dá para chamar quem é seu amigo.',
  convite: 'Esse convite não vale mais.',
  ...ERROS_DA_DIVERSAO,
};

/** Salas, mix e Diversão num lugar só, com filtros, como o dono pediu. */
export default async function Jogar({ searchParams }: { searchParams: Promise<{ modo?: string; erro?: string; aviso?: string }> }) {
  const usuario = await exigirAcesso('/jogar');
  const { modo: texto, erro, aviso } = await searchParams;
  const filtro = lerFiltroDoJogar(texto);
  const bd = obterBd();

  const [salas, minha, partida, faltas, mix, andamento, todosServidores, online, manutencao] = await Promise.all([
    listarSalas(bd),
    minhaSala(bd, usuario.id),
    partidaAtualDe(bd, usuario.id),
    situacaoDasFaltas(bd, usuario.id),
    verMix(bd),
    partidasEmAndamento(bd),
    listarServidoresDaDiversao(bd),
    membrosOnline(bd),
    manutencaoAtual(bd),
  ]);
  const [desafio] = minha ? await desafiosDaSala(bd, minha.id) : [];
  const juncoes = minha ? await juncoesDaSala(bd, minha.id) : [];
  const amigos = minha ? await amigosDe(bd, usuario.id) : [];
  const idsNasSalas = [...new Set(salas.flatMap((sala) => sala.membros.map((membro) => membro.id)))];
  const [kd, clasNasSalas, principais] = await Promise.all([kdDosJogadores(bd, idsNasSalas), clasDosUsuarios(bd, idsNasSalas), principaisDe(bd, idsNasSalas)]);

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

  const competitivoNaTela = mostraNoFiltro(filtro, 'competitivo') || mostraNoFiltro(filtro, 'mix');
  const porModo = MODOS_DE_DIVERSAO.map((modo) => ({
    modo,
    itens: servidores.map((servidor, indice) => ({ servidor, indice })).filter(({ servidor }) => servidor.modo === modo.valor),
  })).filter((grupo) => grupo.itens.length > 0);
  const posso = !partida && !faltas.bloqueadoAte;

  return (
    <>
      {(minha || estouNoMix || algumEsperando || filtro === 'competitivo' || filtro === 'mix') && <Atualizar segundos={3} />}
      {minha && <BarraDaSala sala={minha} usuarioId={usuario.id} kd={kd} desafio={desafio} juncoes={juncoes} clas={clasNasSalas} amigos={amigos} principais={principais} />}
      <div className={minha ? 'tela-jogar com-sala' : 'tela-jogar'}>
        <AvisoDeBloqueio situacao={faltas} />
        <div className="carteira-da-shop">
          <h1>Jogar</h1>
          <span className="moeda-da-shop clube-ao-vivo">
            <i aria-hidden="true" />
            <b>{online.length}</b>
            <small>online</small>
          </span>
          <span className="moeda-da-shop">
            <b>{mix.total}</b>
            <small>na fila do mix</small>
          </span>
          <span className="moeda-da-shop">
            <b>{andamento.length}</b>
            <small>{andamento.length === 1 ? 'partida rolando' : 'partidas rolando'}</small>
          </span>
        </div>
        {erro && ERROS[erro] && (
          <p role="alert" className="aviso">
            {ERROS[erro]}
          </p>
        )}
        {aviso === 'chamado' && <p className="aviso">Convite enviado. Ele vale por 2 minutos.</p>}
        <nav className="filtros-da-shop" aria-label="Modos de jogo">
          {FILTROS_DO_JOGAR.map((item) => (
            <Link key={item.nome} href={item.valor ? `/jogar?modo=${item.valor}` : '/jogar'} aria-current={filtro === item.valor ? 'page' : undefined}>
              {item.nome}
            </Link>
          ))}
        </nav>

        {competitivoNaTela && (
          <>
            <div className="secao-da-shop">
              <h2>Competitivo</h2>
              <span className="legenda-da-secao">Vale XP, patente e ranking · 5 contra 5</span>
            </div>
            <div className="blocos-do-competitivo">
              {mostraNoFiltro(filtro, 'mix') && (
                <article className={manutencao ? 'bloco-de-jogo ouro travado' : 'bloco-de-jogo ouro'} style={{ backgroundImage: `url(${FOTO_DO_MIX})` }}>
                  <span className="selo-do-bloco">Mix</span>
                  <h3>Fila do Mix</h3>
                  <p>Entre sozinho. Com 10 na fila, os times são sorteados e a partida começa.</p>
                  <VagasEmCirculo pessoas={mix.jogadores} total={TOTAL_DO_MIX} />
                  <div className="acao-do-bloco">
                    {manutencao && !estouNoMix && <AguardandoAtualizacao />}
                    {!partida &&
                      (estouNoMix ? (
                        <form action={sairDoMix}>
                          <button type="submit" className="botao-da-shop vazado">
                            Sair da fila
                          </button>
                        </form>
                      ) : faltas.bloqueadoAte || minha || manutencao ? null : (
                        <form action={entrarNoMix}>
                          <button type="submit" className="botao-da-shop">
                            Entrar na fila
                          </button>
                        </form>
                      ))}
                    <span>
                      <b>
                        {mix.total}/{TOTAL_DO_MIX}
                      </b>{' '}
                      <small>{mix.total >= TOTAL_DO_MIX ? 'fila cheia' : `faltam ${TOTAL_DO_MIX - mix.total}`}</small>
                    </span>
                  </div>
                </article>
              )}
              {mostraNoFiltro(filtro, 'competitivo') && (
                <article className={manutencao ? 'bloco-de-jogo roxo travado' : 'bloco-de-jogo roxo'} style={{ backgroundImage: `url(${FOTO_DA_SALA})` }}>
                  <span className="selo-do-bloco">Sala 5x5</span>
                  <h3>Jogue com o seu time</h3>
                  <p>Monte uma sala de 5, chame os amigos e desafie outra sala completa. Com o seu clã, vale o ranking de clãs.</p>
                  <div className="acao-do-bloco">
                    {minha ? <span className="legenda-da-secao">Você já está numa sala.</span> : manutencao ? <AguardandoAtualizacao /> : posso && <BotaoCriarSala />}
                    <span>
                      <b>{outras.length}</b> <small>{outras.length === 1 ? 'sala aberta' : 'salas abertas'}</small>
                    </span>
                  </div>
                </article>
              )}
            </div>
            {mostraNoFiltro(filtro, 'competitivo') && outras.length > 0 && (
              <div className="salas-abertas">
                {outras.map((sala) => (
                  <LinhaDaSala key={sala.id} sala={sala} kd={kd} acao={acaoDaSala(sala)} clas={clasNasSalas} />
                ))}
              </div>
            )}
          </>
        )}

        {porModo.length > 0 && (
          <>
            <div className="secao-da-shop">
              <h2>Diversão</h2>
              <span className="legenda-da-secao">Vale XP · liga na hora, em cerca de 1 minuto</span>
            </div>
            <div className="modos-da-diversao">
              {porModo.map(({ modo, itens }) => {
                const capa = mapaDoCartao(itens[0].servidor, situacoes[itens[0].indice]);
                return (
                  <article key={modo.valor} className={`modo-da-diversao modo-${modo.valor}${manutencao ? ' travado' : ''}`}>
                    <div className="foto-do-modo">
                      <Image src={capa.foto} alt="" width={400} height={300} />
                      <span className="selo-do-bloco">{modo.nome}</span>
                    </div>
                    <div className="dados-do-modo">
                      <h3>{modo.nome}</h3>
                      <p>{DESCRICAO_DO_MODO[modo.valor]}</p>
                      {itens.map(({ servidor, indice }) => {
                        const mapa = mapaDoCartao(servidor, situacoes[indice]);
                        return (
                          <div key={servidor.id} className="variacao-da-diversao">
                            <span>
                              <b>{mapa.regra ?? servidor.armas}</b>
                              <small>
                                {mapa.nome}
                                {situacoes[indice].ligado && <em className="no-ar"> · ao vivo</em>}
                              </small>
                            </span>
                            <span className="rodape-da-variacao">
                              <RodapeDoCartao servidor={servidor} situacao={situacoes[indice]} guardado={guardados.get(servidor.id)} modo={modoDaDiversao} agora={agora} celular={celular} emManutencao={!!manutencao} podeLigar={pode(usuario, 'ligar_diversao')} />
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </article>
                );
              })}
            </div>
          </>
        )}

        {competitivoNaTela && andamento.length > 0 && (
          <>
            <div className="secao-da-shop">
              <h2>Rolando agora</h2>
              <span className="legenda-da-secao">{andamento.length === 1 ? '1 partida' : `${andamento.length} partidas`}</span>
            </div>
            <div className="partidas-ao-vivo">
              {andamento.map((item) => (
                <Link key={item.id} href={`/partidas/${item.id}`} className="partida-ao-vivo">
                  <span className="topo-da-partida">
                    <span>
                      {nomeDaPartida(item)} · {nomeDoMapa(item.mapa)}
                    </span>
                    <em>Ao vivo</em>
                  </span>
                  <span className="placar-ao-vivo">
                    <span>{item.nomeTime1 ?? 'Time 1'}</span>
                    <b>
                      {item.placar1 ?? 0} : {item.placar2 ?? 0}
                    </b>
                    <span>{item.nomeTime2 ?? 'Time 2'}</span>
                  </span>
                </Link>
              ))}
            </div>
          </>
        )}
        {filtro === 'competitivo' && <OnlineAgora />}
      </div>
    </>
  );
}
