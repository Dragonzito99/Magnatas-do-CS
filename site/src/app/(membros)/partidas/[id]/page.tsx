import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { CSSProperties } from 'react';
import { z } from 'zod';
import { exigirAcesso } from '@/auth/guarda';
import { pode } from '@/auth/permissoes';
import { obterBd } from '@/bd/conexao';
import type { Partida } from '@/bd/esquema';
import { aceitesDaPartida, PRAZO_DO_ACEITE_MS, resolverAceitesVencidos } from '@/dominio/aceites';
import { linhaHltv, mvpDaPartida } from '@/dominio/desempenho';
import { ESTADOS_ATIVOS_DE_PARTIDA } from '@/dominio/disponibilidade';
import { fotoDoMapa } from '@/dominio/diversao';
import { elogiosFeitos, TIPOS_DE_ELOGIO } from '@/dominio/elogios';
import { dadosDeConexao, detalheDaPartida, gravacaoDaPartida, MAPAS, quemEntrouNoServidor, type JogadorDaPartida } from '@/dominio/partidas';
import { serieDaPartida } from '@/dominio/series';
import { FASES_DA_PARTIDA, faseDaPartida, NOME_DA_GRAVACAO, nomeDaPartida, nomeDoMapa, seloDaPartida, TEXTOS_DO_ESTADO, type FaseDaPartida } from '@/dominio/textos-da-partida';
import { LIMITE_AGUARDANDO_JOGADORES_MS } from '@/dominio/varredura';
import { resolverVetosVencidos, vetosDaPartida } from '@/dominio/vetos';
import { patenteDe, progressoDe } from '@/dominio/xp';
import { alocarEmSegundoPlano } from '@/servidor-jogo/alocar';
import { controladorDoAmbiente } from '@/servidor-jogo/controlador';
import { Atualizar } from '../../atualizar';
import { Avatar } from '../../avatar';
import { BotaoConfirmar } from '../../botao-confirmar';
import { BotaoCopiar } from '../../botao-copiar';
import { InsigniaDaPatente } from '../../insignia-da-patente';
import { aceitar, cancelar, chamar, denunciarJogador, elogiarJogador, vetar } from './acoes';
import { CaraOuCoroa } from './cara-ou-coroa';
import { Relogio } from './relogio';
import { RelogioRedondo } from './relogio-redondo';

const ERROS: Record<string, string> = {
  motivo: 'Escreva o motivo, com até 500 caracteres.',
  acusado: 'Escolha outro jogador desta partida.',
  repetida: 'Você já denunciou este jogador nesta partida.',
  'nao-jogou': 'Só quem joga a partida pode fazer isso.',
  chamado: 'Esta partida não recebe mais chamados.',
  'sem-acesso': 'Sua conta não pode fazer isso agora.',
  cancelar: 'Quem joga a partida não pode cancelar. Outra pessoa da equipe precisa fazer isso.',
  terminada: 'Esta partida já terminou.',
  aceite: 'Esta partida não está mais esperando o seu aceite.',
  veto: 'Este veto não vale agora: não é a sua vez, o mapa já saiu ou o prazo acabou.',
  'so-lider': 'Só o líder da sala veta.',
  elogio: 'Só quem jogou a partida elogia outro jogador dela, depois que ela termina.',
  'elogio-repetido': 'Você já elogiou este jogador nesta partida.',
};

const AVISOS: Record<string, string> = {
  denunciado: 'Denúncia enviada para a equipe.',
  chamado: 'A equipe foi chamada. Um GM vai entrar como espectador.',
  'sem-equipe': 'Não há ninguém da equipe online agora. Seu chamado virou uma denúncia, e a partida será analisada depois.',
  elogiado: 'Elogio enviado.',
};

const MOTIVO_DO_CANCELAMENTO: Record<NonNullable<Partida['motivoDoCancelamento']>, string> = {
  aceite: 'Nem todos aceitaram a partida.',
  equipe: 'A equipe cancelou a partida. Ela não conta nas estatísticas.',
  abandono: 'A partida ficou parada tempo demais. Ela não conta nas estatísticas.',
};

const TITULO_DA_FASE: Record<FaseDaPartida, [string, string]> = {
  aceite: ['Partida encontrada', 'Todos têm 30 segundos para aceitar a partida.'],
  vetos: ['Vetos', 'Os líderes vetam os mapas. O que sobrar é o mapa da partida.'],
  entrar: ['Entrar no servidor', 'O servidor está pronto. Todos precisam entrar para começar.'],
  vivo: ['Ao vivo', 'A partida está rolando.'],
  fim: ['Fim de jogo', 'A partida terminou. Veja como foi.'],
};

type Vetos = Awaited<ReturnType<typeof vetosDaPartida>>;
type Nomes = { 1: string; 2: string };

/** A foto do mapa, ou um fundo roxo para os mapas que ainda não têm foto. */
function fundoDoMapa(mapa: string | null, escurecer = 'linear-gradient(180deg, transparent, rgba(7, 4, 13, 0.9))'): CSSProperties {
  const foto = fotoDoMapa(mapa);
  return { backgroundImage: foto ? `${escurecer}, url(${foto})` : `${escurecer}, linear-gradient(135deg, #3b1a63, #120a1f)` };
}

function Patente({ xpTotal }: { xpTotal: number }) {
  const patente = patenteDe(xpTotal);
  return (
    <small className="patente-na-tabela">
      <InsigniaDaPatente patente={patente} classe="insignia-mini" />
      {patente.nome}
    </small>
  );
}

function Estrelas({ mvps }: { mvps: number }) {
  if (mvps === 0) return null;
  return <span title={`${mvps} ${mvps === 1 ? 'estrela' : 'estrelas'}`}>{mvps > 5 ? `★ ${mvps}` : '★'.repeat(mvps)}</span>;
}

/** O placar de um time como no rascunho: abates, mortes, assistências, dano por rodada, tiros na cabeça e estrelas. */
function TabelaDoTime({ titulo, jogadores, lado }: { titulo: string; jogadores: JogadorDaPartida[]; lado: 'a' | 'b' }) {
  return (
    <section className={`painel time-partida ${lado}`}>
      <div className="cabeca-painel">
        <h2>{titulo}</h2>
      </div>
      <table className="tabela tabela-placar">
        <thead>
          <tr>
            <th scope="col">Jogador</th>
            <th scope="col" title="Abates">
              K
            </th>
            <th scope="col" title="Mortes">
              M
            </th>
            <th scope="col" title="Assistências">
              A
            </th>
            <th scope="col" title="Dano por rodada">
              ADR
            </th>
            <th scope="col" title="Abates na cabeça">
              HS
            </th>
            <th scope="col">MVP</th>
          </tr>
        </thead>
        <tbody>
          {jogadores.map((jogador) => {
            const linha = linhaHltv(jogador);
            return (
              <tr key={jogador.id}>
                <th scope="row">
                  <span className="perfil">
                    <Avatar usuario={jogador} />
                    <Link className="nome" href={`/jogadores/${jogador.id}`}>
                      {jogador.apelido}
                    </Link>
                  </span>
                </th>
                <td className="mono">{jogador.kills}</td>
                <td className="mono">{jogador.deaths}</td>
                <td className="mono">{jogador.assists}</td>
                <td className="mono">{linha.adr}</td>
                <td className="mono">{linha.hs}%</td>
                <td className="estrelas">
                  <Estrelas mvps={jogador.mvps} />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </section>
  );
}

function Aceite({ partida, jogadores, aceites, usuarioId }: { partida: Partida; jogadores: JogadorDaPartida[]; aceites: { usuarioId: string; aceitou: boolean }[]; usuarioId: string }) {
  const aceitou = (id: string) => aceites.find((linha) => linha.usuarioId === id)?.aceitou ?? false;
  const jogaNaPartida = jogadores.some((jogador) => jogador.id === usuarioId);
  const total = aceites.filter((linha) => linha.aceitou).length;
  return (
    <section className="aceite">
      {partida.aceiteAte && <RelogioRedondo ate={partida.aceiteAte.toISOString()} totalSegundos={PRAZO_DO_ACEITE_MS / 1000} />}
      <h2>{jogaNaPartida ? 'Sua partida está pronta' : 'Esperando os jogadores aceitarem'}</h2>
      <p className="apoio">
        {seloDaPartida(partida)} · 5 contra 5 · {partida.mapa ? nomeDoMapa(partida.mapa) : 'o mapa sai dos vetos'}
      </p>
      <div className="aceite-pessoas">
        {jogadores.map((jogador) => (
          <span className={`pessoa-aceite${aceitou(jogador.id) ? ' aceitou' : ''}`} key={jogador.id} title={`${jogador.apelido}${aceitou(jogador.id) ? ' aceitou' : ''}`}>
            <Avatar usuario={jogador} />
          </span>
        ))}
      </div>
      <p className="apoio">
        {total} de {jogadores.length} aceitaram
      </p>
      {jogaNaPartida &&
        (aceitou(usuarioId) ? (
          <p className="apoio">Você aceitou. Esperando os outros.</p>
        ) : (
          <form action={aceitar}>
            <input type="hidden" name="partidaId" value={partida.id} />
            <button type="submit" className="botao ouro grande">
              ACEITAR
            </button>
          </form>
        ))}
    </section>
  );
}

function ListaDoTime({ nome, jogadores, lado }: { nome: string; jogadores: JogadorDaPartida[]; lado: 'a' | 'b' }) {
  return (
    <div className={`time-lista ${lado}`}>
      <h3>{nome}</h3>
      <ul>
        {jogadores.map((jogador) => (
          <li key={jogador.id}>
            <Avatar usuario={jogador} />
            <span>
              <Link href={`/jogadores/${jogador.id}`}>{jogador.apelido}</Link>
              <Patente xpTotal={jogador.xpTotal} />
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function TelaDeVetos({
  partida,
  vetos,
  nomes,
  meuTime,
  souLider,
  time1,
  time2,
}: {
  partida: Partida;
  vetos: Vetos;
  nomes: Nomes;
  meuTime: 1 | 2 | null;
  souLider: boolean;
  time1: JogadorDaPartida[];
  time2: JogadorDaPartida[];
}) {
  const minhaVez = souLider && meuTime !== null && vetos.vez === meuTime;
  const vetadoPor = (mapa: string) => vetos.vetados.find((veto) => veto.mapa === mapa);
  const sobrou = MAPAS.filter((mapa) => !vetadoPor(mapa)).length === 1;
  return (
    <>
      <div className="moeda-linha">
        <CaraOuCoroa vencedor={vetos.primeiroAVetar} nomes={nomes} />
      </div>
      <div className="vetos-tela">
        <ListaDoTime nome={nomes[1]} jogadores={time1} lado="a" />
        <div>
          <div className={minhaVez ? 'vez-do-veto minha' : 'vez-do-veto'}>
            <b>
              {minhaVez
                ? vetos.acaoDaVez === 'escolhe'
                  ? 'Sua vez de escolher'
                  : 'Sua vez de vetar'
                : vetos.vez
                  ? `Vez de ${nomes[vetos.vez]}${vetos.acaoDaVez === 'escolhe' ? ' escolher' : ''}`
                  : 'Vetos encerrados'}
            </b>
            {partida.vetoAte && vetos.vez && <Relogio ate={partida.vetoAte.toISOString()} minutos />}
          </div>
          <div className="vetos-grade">
            {MAPAS.map((mapa) => {
              const veto = vetadoPor(mapa);
              return (
                <div
                  key={mapa}
                  className={veto ? (veto.acao === 'escolhe' ? 'veto-mapa escolhido' : 'veto-mapa vetado') : sobrou ? 'veto-mapa sobrou' : 'veto-mapa'}
                  style={fundoDoMapa(mapa)}
                >
                  <b>{nomeDoMapa(mapa)}</b>
                  {veto ? (
                    <span className={veto.acao === 'escolhe' ? 'carimbo escolhido' : 'carimbo'}>
                      {veto.acao === 'escolhe' ? 'Escolhido' : 'Vetado'} · {nomes[veto.time]}
                      {veto.automatico && ' (automático)'}
                    </span>
                  ) : minhaVez ? (
                    <form action={vetar}>
                      <input type="hidden" name="partidaId" value={partida.id} />
                      <input type="hidden" name="mapa" value={mapa} />
                      <button type="submit" className={vetos.acaoDaVez === 'escolhe' ? 'botao-vetar escolher' : 'botao-vetar'}>
                        {vetos.acaoDaVez === 'escolhe' ? 'Escolher' : 'Vetar'}
                      </button>
                    </form>
                  ) : null}
                </div>
              );
            })}
          </div>
          {partida.mapasDaPartida === 3 && (
            <p className="apoio dica-do-veto">MD3: cada time veta um, escolhe um e veta mais um. O que sobrar é o desempate.</p>
          )}
          {!minhaVez && <p className="apoio dica-do-veto">Só o líder do time da vez veta. Escolha o mapa que você não quer jogar.</p>}
        </div>
        <ListaDoTime nome={nomes[2]} jogadores={time2} lado="b" />
      </div>
    </>
  );
}

function Elogios({ partida, jogadores, usuarioId, feitos }: { partida: Partida; jogadores: JogadorDaPartida[]; usuarioId: string; feitos: Set<string> }) {
  const candidatos = jogadores.filter((jogador) => jogador.id !== usuarioId && !feitos.has(jogador.id));
  return (
    <section className="painel" id="elogiar">
      <div className="cabeca-painel">
        <h2>Elogiar um jogador</h2>
        <span>Aponte uma coisa boa do Magnata</span>
      </div>
      {candidatos.length === 0 ? (
        <p className="vazio">Você já elogiou todo mundo que dava para elogiar nesta partida.</p>
      ) : (
        <form action={elogiarJogador} className="formulario-denuncia">
          <input type="hidden" name="partidaId" value={partida.id} />
          <select name="elogiadoId" aria-label="Jogador elogiado" required defaultValue="">
            <option value="" disabled>
              Escolha o jogador
            </option>
            {candidatos.map((jogador) => (
              <option key={jogador.id} value={jogador.id}>
                {jogador.apelido}
              </option>
            ))}
          </select>
          <select name="tipo" aria-label="Tipo de elogio" required defaultValue="">
            <option value="" disabled>
              O que ele tem de bom?
            </option>
            {TIPOS_DE_ELOGIO.map((tipo) => (
              <option key={tipo.valor} value={tipo.valor}>
                {tipo.nome}
              </option>
            ))}
          </select>
          <div>
            <button type="submit" className="botao ouro pequeno">
              Elogiar
            </button>
          </div>
        </form>
      )}
    </section>
  );
}

function Denunciar({ partida, jogadores, usuarioId }: { partida: Partida; jogadores: JogadorDaPartida[]; usuarioId: string }) {
  return (
    <section className="painel" id="denunciar">
      <div className="cabeca-painel">
        <h2>Denunciar um jogador</h2>
        <span>Só a equipe vê</span>
      </div>
      <form action={denunciarJogador} className="formulario-denuncia">
        <input type="hidden" name="partidaId" value={partida.id} />
        <select name="acusadoId" aria-label="Jogador denunciado" required defaultValue="">
          <option value="" disabled>
            Escolha o jogador
          </option>
          {jogadores
            .filter((jogador) => jogador.id !== usuarioId)
            .map((jogador) => (
              <option key={jogador.id} value={jogador.id}>
                {jogador.apelido}
              </option>
            ))}
        </select>
        <textarea name="motivo" aria-label="Motivo" placeholder="O que aconteceu? Se puder, diga a rodada." maxLength={500} required rows={3} />
        <div>
          <button type="submit" className="botao cinza pequeno">
            Enviar denúncia
          </button>
        </div>
      </form>
    </section>
  );
}

function ChamarEquipe({ partidaId }: { partidaId: string }) {
  return (
    <form action={chamar}>
      <input type="hidden" name="partidaId" value={partidaId} />
      <button type="submit" className="botao contorno">
        Chamar a equipe
      </button>
    </form>
  );
}

export default async function PaginaDaPartida({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ erro?: string; aviso?: string }>;
}) {
  const { id } = await params;
  const { erro, aviso } = await searchParams;
  const usuario = await exigirAcesso(`/partidas/${id}`);
  if (!z.uuid().safeParse(id).success) notFound();
  const bd = obterBd();
  // Prazo vencido não espera a varredura: a própria página resolve, para o relógio em 0 já mostrar o passo seguinte.
  // Se falhar, a página mostra o estado atual e a varredura resolve depois.
  try {
    await resolverAceitesVencidos(bd);
    await resolverVetosVencidos(bd);
  } catch (erro) {
    console.warn('Não foi possível resolver os prazos ao abrir a partida:', erro);
  }
  const detalhe = await detalheDaPartida(bd, id);
  if (!detalhe) notFound();

  const { partida, servidor, jogadores, salasDaPartida } = detalhe;
  // O último veto (inclusive o automático, feito acima) deixa a partida esperando servidor: já pede um, sem esperar a varredura.
  if (partida.estado === 'aguardando_servidor') alocarEmSegundoPlano(bd);
  const fase = faseDaPartida(partida.estado);
  const ativa = (ESTADOS_ATIVOS_DE_PARTIDA as readonly string[]).includes(partida.estado);
  const eu = jogadores.find((jogador) => jogador.id === usuario.id);
  const jogaNaPartida = !!eu;
  const meuTime = eu?.time === 1 || eu?.time === 2 ? eu.time : null;
  const podeChamar = jogaNaPartida && (partida.estado === 'ao_vivo' || partida.estado === 'aguardando_jogadores');
  const senha = process.env.SERVIDOR_SENHA ?? '';
  const conexao = dadosDeConexao(partida, servidor, { papel: usuario.papel, jogaNaPartida }, senha);
  const nomes: Nomes = {
    1: partida.nomeTime1 ?? salasDaPartida[1]?.nome ?? 'Time 1',
    2: partida.nomeTime2 ?? salasDaPartida[2]?.nome ?? 'Time 2',
  };
  // No teste não há sala: o Adm sozinho veta pelo time dele.
  const souLider = meuTime !== null && (salasDaPartida[meuTime]?.liderId === usuario.id || partida.tipo === 'teste');
  const ehEquipe = pode(usuario, 'moderar');

  const [aceites, vetos, feitos, noServidor, gravacao, serie] = await Promise.all([
    partida.estado === 'aguardando_aceite' ? aceitesDaPartida(bd, id) : [],
    partida.estado === 'vetando' ? vetosDaPartida(bd, id) : null,
    partida.estado === 'encerrada' && jogaNaPartida ? elogiosFeitos(bd, id, usuario.id) : new Set<string>(),
    partida.estado === 'aguardando_jogadores'
      ? quemEntrouNoServidor(
          bd,
          controladorDoAmbiente(),
          servidor,
          jogadores.map((jogador) => jogador.id),
        )
      : new Set<string>(),
    partida.estado === 'encerrada' && ehEquipe ? gravacaoDaPartida(bd, partida) : null,
    partida.serieId ? serieDaPartida(bd, partida.id) : null,
  ]);
  const mvp = partida.estado === 'encerrada' ? mvpDaPartida(jogadores) : null;
  const time1 = jogadores.filter((jogador) => jogador.time === 1);
  const time2 = jogadores.filter((jogador) => jogador.time === 2);
  const indiceDaFase = FASES_DA_PARTIDA.findIndex((item) => item.fase === fase);
  const [titulo, texto] =
    partida.estado === 'cancelada'
      ? ['Partida cancelada', partida.motivoDoCancelamento ? MOTIVO_DO_CANCELAMENTO[partida.motivoDoCancelamento] : TEXTOS_DO_ESTADO.cancelada.explicacao]
      : fase === 'entrar'
        ? [TITULO_DA_FASE.entrar[0], TEXTOS_DO_ESTADO[partida.estado].explicacao]
        : TITULO_DA_FASE[fase];
  const resultado =
    partida.estado !== 'encerrada' ? null : partida.vencedor === null ? 'empate' : meuTime === null ? 'neutro' : partida.vencedor === meuTime ? 'vitoria' : 'derrota';
  const minutos = partida.iniciadaEm && partida.encerradaEm ? Math.max(1, Math.round((partida.encerradaEm.getTime() - partida.iniciadaEm.getTime()) / 60_000)) : null;
  const progresso = eu ? progressoDe(eu.xpTotal) : null;
  // Na MD3 que continua, o fim do mapa leva ao mapa seguinte.
  const proximoMapa = serie?.partidas.find((item) => item.mapaDaSerie === (partida.mapaDaSerie ?? 0) + 1) ?? null;

  return (
    <>
      {ativa && <Atualizar segundos={3} />}
      <section className="capa-partida" style={fundoDoMapa(partida.mapa, 'linear-gradient(90deg, rgba(7, 4, 13, 0.95) 35%, rgba(7, 4, 13, 0.6))')}>
        <span className="selo-modo ouro">
          {seloDaPartida(partida)} · #{partida.numero}
        </span>
        <h1>{titulo}</h1>
        <p className="apoio">{texto}</p>
        <ol className="fases-partida" aria-label="Fases da partida">
          {FASES_DA_PARTIDA.map((item, indice) => (
            <li key={item.fase} className={indice === indiceDaFase ? 'ativa' : indice < indiceDaFase ? 'feita' : undefined} aria-current={indice === indiceDaFase ? 'step' : undefined}>
              {indice + 1} · {item.nome}
            </li>
          ))}
        </ol>
        {serie && (
          <nav className="linha-da-serie" aria-label="Mapas da série">
            <b>
              Mapa {partida.mapaDaSerie} de 3 · série {serie.serie.vitorias1} x {serie.serie.vitorias2}
              {serie.serie.estado === 'encerrada' && ' · série encerrada'}
              {serie.serie.estado === 'cancelada' && ' · série cancelada'}
            </b>
            {serie.serie.mapas.map((mapa, indice) => {
              const jogado = serie.partidas.find((item) => item.mapaDaSerie === indice + 1);
              const texto = `${indice + 1}. ${nomeDoMapa(mapa)}${indice === 2 ? ' (desempate)' : ''}${jogado?.estado === 'encerrada' ? ` · ${jogado.placar1} x ${jogado.placar2}` : ''}`;
              return jogado && jogado.id !== partida.id ? (
                <Link key={mapa} href={`/partidas/${jogado.id}`}>
                  {texto}
                </Link>
              ) : (
                <span key={mapa} className={jogado?.id === partida.id ? 'atual' : undefined}>
                  {texto}
                </span>
              );
            })}
          </nav>
        )}
      </section>

      {erro && ERROS[erro] && (
        <p role="alert" className="aviso">
          {ERROS[erro]}
        </p>
      )}
      {aviso && AVISOS[aviso] && <p className="aviso">{AVISOS[aviso]}</p>}

      {fase === 'aceite' && <Aceite partida={partida} jogadores={jogadores} aceites={aceites} usuarioId={usuario.id} />}

      {fase === 'vetos' && vetos && <TelaDeVetos partida={partida} vetos={vetos} nomes={nomes} meuTime={meuTime} souLider={souLider} time1={time1} time2={time2} />}

      {fase === 'entrar' && (
        <div className="entrar-tela">
          <div className="mapa-escolhido" style={fundoDoMapa(partida.mapa)}>
            <span className="selo-modo ouro">Mapa da partida</span>
            <b>{nomeDoMapa(partida.mapa)}</b>
          </div>
          <div className="painel entrar-bloco">
            <h2>{partida.estado === 'aguardando_jogadores' ? 'O servidor está pronto' : 'Preparando o servidor'}</h2>
            <p className="apoio">
              {partida.estado === 'aguardando_jogadores' ? 'Entre em até 10 minutos. A partida começa quando os 10 estiverem lá.' : TEXTOS_DO_ESTADO[partida.estado].explicacao}
            </p>
            {conexao && (
              <a className="botao ouro grande" href={conexao.url}>
                {jogaNaPartida ? 'CONECTAR AO SERVIDOR' : 'ASSISTIR COMO ESPECTADOR'}
              </a>
            )}
            {conexao && servidor && (
              <div className="connect">
                <code>
                  connect {servidor.host}:{servidor.porta}
                </code>
                <BotaoCopiar texto={`connect ${servidor.host}:${servidor.porta}; password ${senha}`} />
              </div>
            )}
            {partida.estado === 'aguardando_jogadores' && (
              <div className="relogio-linha">
                <Relogio ate={new Date(partida.estadoDesde.getTime() + LIMITE_AGUARDANDO_JOGADORES_MS).toISOString()} minutos /> para todos entrarem
              </div>
            )}
            {jogaNaPartida && partida.estado === 'aguardando_jogadores' && <p className="apoio">Esta tela fica aberta até a partida terminar. Se cair do jogo, volte por aqui.</p>}
            {podeChamar && <ChamarEquipe partidaId={partida.id} />}
          </div>
          <section className="painel">
            <div className="cabeca-painel">
              <h2>Quem já entrou</h2>
              {partida.estado === 'aguardando_jogadores' && (
                <span>
                  {noServidor.size} de {jogadores.length}
                </span>
              )}
            </div>
            <ul className="entrar-lista">
              {jogadores.map((jogador) => (
                <li key={jogador.id}>
                  <Avatar usuario={jogador} />
                  <span>{jogador.apelido}</span>
                  {partida.estado === 'aguardando_jogadores' &&
                    (noServidor.has(jogador.id) ? <b className="ok">No servidor</b> : <b className="falta">Ainda não entrou</b>)}
                </li>
              ))}
            </ul>
          </section>
        </div>
      )}

      {fase === 'vivo' && (
        <>
          <div className="placar-grande">
            <div className="lado a">
              <span>{nomes[1]}</span>
              <b className="mono">{partida.placar1}</b>
            </div>
            <div className="placar-meio">
              <span className="selo-modo verde">Ao vivo</span>
              <span>
                {nomeDoMapa(partida.mapa)} · rodada {partida.placar1 + partida.placar2 + 1}
              </span>
            </div>
            <div className="lado b">
              <b className="mono">{partida.placar2}</b>
              <span>{nomes[2]}</span>
            </div>
          </div>
          <div className="times-partida">
            <TabelaDoTime titulo={nomes[1]} jogadores={time1} lado="a" />
            <TabelaDoTime titulo={nomes[2]} jogadores={time2} lado="b" />
          </div>
          {(conexao || podeChamar) && (
            <div className="acoes-partida">
              {conexao && (
                <a className={jogaNaPartida ? 'botao ouro' : 'botao contorno'} href={conexao.url}>
                  {jogaNaPartida ? 'Voltar para o servidor' : 'Assistir como espectador'}
                </a>
              )}
              {podeChamar && <ChamarEquipe partidaId={partida.id} />}
            </div>
          )}
        </>
      )}

      {fase === 'fim' && (
        <>
          <div className={`resultado-partida ${resultado ?? 'cancelada'}`}>
            <b>
              {partida.estado === 'cancelada'
                ? 'CANCELADA'
                : resultado === 'vitoria'
                  ? 'VITÓRIA'
                  : resultado === 'derrota'
                    ? 'DERROTA'
                    : resultado === 'empate'
                      ? 'EMPATE'
                      : `VITÓRIA DE ${nomes[partida.vencedor as 1 | 2].toUpperCase()}`}
            </b>
            <span>
              {nomes[1]} {partida.placar1} x {partida.placar2} {nomes[2]} · {nomeDoMapa(partida.mapa)}
              {minutos && ` · ${minutos} minutos`}
              {partida.tipo === 'treino' && ' · Treino: não vale XP nem ranking'}
              {partida.tipo === 'teste' && ' · Teste contra bots: não vale XP nem aparece no perfil'}
            </span>
          </div>
          {partida.estado === 'encerrada' && (mvp || (eu && progresso)) && (
            <div className="fim-topo">
              {mvp && (
                <div className="painel mvp-bloco">
                  <Avatar usuario={mvp} />
                  <div>
                    <span className="selo-modo ouro">MVP da partida</span>
                    <b>{mvp.apelido}</b>
                    <span className="apoio">
                      {mvp.kills} abates · {linhaHltv(mvp).adr} de dano por rodada · {mvp.mvps} {mvp.mvps === 1 ? 'estrela' : 'estrelas'}
                    </span>
                  </div>
                </div>
              )}
              {eu && progresso && (
                <div className="painel xp-bloco">
                  <div>
                    <span className="apoio">Você ganhou</span>
                    <b className="xp-grande">{partida.tipo === 'treino' ? 'Treino: 0 XP' : partida.tipo === 'teste' ? 'Teste: 0 XP' : eu.xp === null ? 'XP chegando' : `+${eu.xp} XP`}</b>
                  </div>
                  <InsigniaDaPatente patente={progresso.patente} />
                  <div className="patente-texto">
                    <span>
                      {progresso.proxima
                        ? `${progresso.patente.nome} · faltam ${progresso.faltam} XP para ${progresso.proxima.nome}`
                        : `${progresso.patente.nome} · a patente mais alta`}
                    </span>
                    <div className="barra-xp">
                      <i style={{ width: `${progresso.porcentagem}%` }} />
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
          <div className="times-partida">
            <TabelaDoTime titulo={`${nomes[1]} · ${partida.placar1}`} jogadores={time1} lado="a" />
            <TabelaDoTime titulo={`${nomes[2]} · ${partida.placar2}`} jogadores={time2} lado="b" />
          </div>
          <div className="fim-botoes">
            {partida.estado === 'encerrada' && jogaNaPartida && (
              <a className="botao pequeno" href="#elogiar">
                Elogiar um jogador
              </a>
            )}
            {gravacao &&
              (gravacao.situacao === 'disponivel' ? (
                <a className="botao contorno pequeno" href={`/api/gravacoes/${gravacao.id}`}>
                  Baixar a gravação
                </a>
              ) : (
                <span className="etiqueta">{NOME_DA_GRAVACAO[gravacao.situacao]}</span>
              ))}
            {jogaNaPartida && (
              <a className="botao contorno pequeno" href="#denunciar">
                Denunciar um jogador
              </a>
            )}
            {proximoMapa ? (
              <Link className="botao ouro pequeno" href={`/partidas/${proximoMapa.id}`}>
                Ir para o mapa {proximoMapa.mapaDaSerie}
              </Link>
            ) : (
              <Link className="botao ouro pequeno" href="/jogar">
                Jogar de novo
              </Link>
            )}
          </div>
        </>
      )}

      {ativa && ehEquipe && !jogaNaPartida && (
        <form action={cancelar} className="acoes-partida">
          <input type="hidden" name="partidaId" value={partida.id} />
          <BotaoConfirmar
            mensagem={`Cancelar a ${nomeDaPartida(partida)}? Ela não conta nas estatísticas, e todo mundo fica livre para jogar de novo.`}
            className="botao cinza pequeno"
          >
            Cancelar partida
          </BotaoConfirmar>
        </form>
      )}

      {partida.estado === 'encerrada' && jogaNaPartida && <Elogios partida={partida} jogadores={jogadores} usuarioId={usuario.id} feitos={feitos} />}
      {jogaNaPartida && (fase === 'entrar' || fase === 'vivo' || fase === 'fim') && <Denunciar partida={partida} jogadores={jogadores} usuarioId={usuario.id} />}
    </>
  );
}
