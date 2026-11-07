import Link from 'next/link';
import { notFound } from 'next/navigation';
import { z } from 'zod';
import { exigirAcesso } from '@/auth/guarda';
import { pode } from '@/auth/permissoes';
import { obterBd } from '@/bd/conexao';
import type { Partida } from '@/bd/esquema';
import { aceitesDaPartida, resolverAceitesVencidos } from '@/dominio/aceites';
import { linhaHltv, mvpDaPartida } from '@/dominio/desempenho';
import { ESTADOS_ATIVOS_DE_PARTIDA } from '@/dominio/disponibilidade';
import { elogiosFeitos, TIPOS_DE_ELOGIO } from '@/dominio/elogios';
import { dadosDeConexao, detalheDaPartida, MAPAS, type JogadorDaPartida } from '@/dominio/partidas';
import { nomeDaPartida, nomeDoMapa, TEXTOS_DO_ESTADO } from '@/dominio/textos-da-partida';
import { resolverVetosVencidos, vetosDaPartida } from '@/dominio/vetos';
import { Atualizar } from '../../atualizar';
import { Avatar } from '../../avatar';
import { BotaoConfirmar } from '../../botao-confirmar';
import { aceitar, cancelar, chamar, denunciarJogador, elogiarJogador, vetar } from './acoes';
import { CaraOuCoroa } from './cara-ou-coroa';
import { Relogio } from './relogio';

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

type Vetos = Awaited<ReturnType<typeof vetosDaPartida>>;

function nomeDoTime(partida: Pick<Partida, 'vencedor'>, time: 1 | 2, nomes: { 1: string; 2: string }): string {
  return partida.vencedor === time ? `${nomes[time]}, vencedor` : nomes[time];
}

/** Placar no estilo da HLTV, um quadro por time. */
function Time({ titulo, jogadores, encerrada }: { titulo: string; jogadores: JogadorDaPartida[]; encerrada: boolean }) {
  return (
    <section className="painel">
      <div className="cabeca-painel">
        <h2>{titulo}</h2>
      </div>
      <table className="tabela tabela-hltv">
        <thead>
          <tr>
            <th scope="col">Jogador</th>
            <th scope="col" title="Abates e mortes">
              K-D
            </th>
            <th scope="col" title="Abates menos mortes">
              +/-
            </th>
            <th scope="col" title="Dano por rodada">
              ADR
            </th>
            <th scope="col" title="Rodadas com abate, assistência, sobrevivência ou troca">
              KAST
            </th>
            <th scope="col" title="Abates na cabeça">
              HS%
            </th>
            <th scope="col" title="Rating 1.0 da HLTV">
              Rating
            </th>
            {encerrada && <th scope="col">XP</th>}
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
                <td className="mono">{linha.kd}</td>
                <td className={`mono${linha.saldo > 0 ? ' positivo' : linha.saldo < 0 ? ' negativo' : ''}`}>
                  {linha.saldo > 0 ? `+${linha.saldo}` : linha.saldo}
                </td>
                <td className="mono">{linha.adr}</td>
                <td className="mono">{linha.kast}%</td>
                <td className="mono">{linha.hs}%</td>
                <td className="mono">{linha.rating.toFixed(2)}</td>
                {encerrada && <td className="mono">{jogador.xp ?? '—'}</td>}
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
    <section className="cartao-escuro">
      <span className="ao-vivo">Partida encontrada</span>
      <div className="numero-grande mono">
        {total}
        <small>/{jogadores.length} aceitaram</small>
      </div>
      <p>
        Todos têm 30 segundos para aceitar. Restam {partida.aceiteAte && <Relogio ate={partida.aceiteAte.toISOString()} />}
      </p>
      <div className="jogadores jogadores-do-aceite">
        {jogadores.map((jogador) => (
          <div className={`jogador${aceitou(jogador.id) ? ' aceitou' : ''}`} key={jogador.id}>
            <Avatar usuario={jogador} />
            <span className="nome">{jogador.apelido}</span>
            <small>{aceitou(jogador.id) ? 'aceitou' : '...'}</small>
          </div>
        ))}
      </div>
      {jogaNaPartida && !aceitou(usuarioId) && (
        <form action={aceitar}>
          <input type="hidden" name="partidaId" value={partida.id} />
          <button type="submit" className="botao ouro grande">
            Aceitar partida
          </button>
        </form>
      )}
    </section>
  );
}

function Vetos({ partida, vetos, nomes, meuTime, souLider }: { partida: Partida; vetos: Vetos; nomes: { 1: string; 2: string }; meuTime: 1 | 2 | null; souLider: boolean }) {
  const minhaVez = souLider && meuTime !== null && vetos.vez === meuTime;
  const vetadoPor = (mapa: string) => vetos.vetados.find((veto) => veto.mapa === mapa);
  return (
    <section className="cartao-escuro">
      <span className="ao-vivo">Vetos</span>
      <CaraOuCoroa vencedor={vetos.primeiroAVetar} nomes={nomes} />
      <p>
        {vetos.vez && `Vez de ${nomes[vetos.vez]}. `}
        {partida.vetoAte && <Relogio ate={partida.vetoAte.toISOString()} />}
        {minhaVez ? ' Escolha o mapa que você não quer jogar.' : ' Só o líder da vez veta.'}
      </p>
      <ul className="mapas-do-veto">
        {MAPAS.map((mapa) => {
          const veto = vetadoPor(mapa);
          return (
            <li key={mapa} className={veto ? 'vetado' : ''}>
              <span className="nome-do-mapa">{nomeDoMapa(mapa)}</span>
              {veto ? (
                <small>
                  {nomes[veto.time]}
                  {veto.automatico && ', automático'}
                </small>
              ) : minhaVez ? (
                <form action={vetar}>
                  <input type="hidden" name="partidaId" value={partida.id} />
                  <input type="hidden" name="mapa" value={mapa} />
                  <button type="submit" className="botao contorno pequeno">
                    Vetar
                  </button>
                </form>
              ) : null}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function Elogios({ partida, jogadores, usuarioId, feitos }: { partida: Partida; jogadores: JogadorDaPartida[]; usuarioId: string; feitos: Set<string> }) {
  const candidatos = jogadores.filter((jogador) => jogador.id !== usuarioId && !feitos.has(jogador.id));
  return (
    <section className="painel">
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
  const estado = TEXTOS_DO_ESTADO[partida.estado];
  const ativa = (ESTADOS_ATIVOS_DE_PARTIDA as readonly string[]).includes(partida.estado);
  const eu = jogadores.find((jogador) => jogador.id === usuario.id);
  const jogaNaPartida = !!eu;
  const meuTime = eu?.time === 1 || eu?.time === 2 ? eu.time : null;
  const podeChamar = jogaNaPartida && (partida.estado === 'ao_vivo' || partida.estado === 'aguardando_jogadores');
  const conexao = dadosDeConexao(partida, servidor, { papel: usuario.papel, jogaNaPartida }, process.env.SERVIDOR_SENHA ?? '');
  const nomes = { 1: salasDaPartida[1]?.nome ?? 'Time 1', 2: salasDaPartida[2]?.nome ?? 'Time 2' } as const;
  const souLider = meuTime !== null && salasDaPartida[meuTime]?.liderId === usuario.id;

  const [aceites, vetos, feitos] = await Promise.all([
    partida.estado === 'aguardando_aceite' ? aceitesDaPartida(bd, id) : [],
    partida.estado === 'vetando' ? vetosDaPartida(bd, id) : null,
    partida.estado === 'encerrada' && jogaNaPartida ? elogiosFeitos(bd, id, usuario.id) : new Set<string>(),
  ]);
  const mvp = partida.estado === 'encerrada' ? mvpDaPartida(jogadores) : null;
  const time1 = jogadores.filter((jogador) => jogador.time === 1);
  const time2 = jogadores.filter((jogador) => jogador.time === 2);

  return (
    <>
      {ativa && <Atualizar segundos={3} />}
      <div className="topo-pagina">
        <h1>{nomeDaPartida(partida)}</h1>
        <span className="etiqueta">{nomeDoMapa(partida.mapa)}</span>
      </div>
      {erro && ERROS[erro] && (
        <p role="alert" className="aviso">
          {ERROS[erro]}
        </p>
      )}
      {aviso && AVISOS[aviso] && <p className="aviso">{AVISOS[aviso]}</p>}

      {partida.estado === 'aguardando_aceite' && <Aceite partida={partida} jogadores={jogadores} aceites={aceites} usuarioId={usuario.id} />}
      {partida.estado === 'vetando' && vetos && <Vetos partida={partida} vetos={vetos} nomes={nomes} meuTime={meuTime} souLider={souLider} />}

      {partida.estado !== 'aguardando_aceite' && partida.estado !== 'vetando' && (
        <section className="cartao-escuro">
          <span className="ao-vivo">{estado.etiqueta}</span>
          {mvp ? (
            <div className="mvp">
              <Avatar usuario={mvp} />
              <div>
                <small>MVP da partida</small>
                <b>{mvp.apelido}</b>
                <span>
                  {mvp.mvps} {mvp.mvps === 1 ? 'estrela' : 'estrelas'}, {mvp.kills} abates
                </span>
              </div>
            </div>
          ) : null}
          <div className="numero-grande mono">
            {partida.placar1}
            <small> x </small>
            {partida.placar2}
          </div>
          <p>{partida.estado === 'cancelada' && partida.aceiteAte && !partida.mapa ? 'Partida cancelada: nem todos aceitaram.' : estado.explicacao}</p>
          {ativa && jogaNaPartida && <p>Esta tela fica aberta até a partida terminar. Se cair do jogo, volte por aqui.</p>}
          <div className="acoes">
            {conexao && (
              <a className="botao ouro" href={conexao.url}>
                {jogaNaPartida ? 'Conectar ao servidor' : 'Assistir como espectador'}
              </a>
            )}
            {podeChamar && (
              <form action={chamar}>
                <input type="hidden" name="partidaId" value={partida.id} />
                <button type="submit" className="botao contorno">
                  Chamar a equipe
                </button>
              </form>
            )}
          </div>
        </section>
      )}

      {ativa && pode(usuario, 'moderar') && !jogaNaPartida && (
        <form action={cancelar} className="acoes">
          <input type="hidden" name="partidaId" value={partida.id} />
          <BotaoConfirmar
            mensagem={`Cancelar a ${nomeDaPartida(partida)}? Ela não conta nas estatísticas, e todo mundo fica livre para jogar de novo.`}
            className="botao cinza pequeno"
          >
            Cancelar partida
          </BotaoConfirmar>
        </form>
      )}

      {partida.estado !== 'aguardando_aceite' && partida.estado !== 'vetando' && (
        <div className="grade-times">
          <Time titulo={nomeDoTime(partida, 1, nomes)} jogadores={time1} encerrada={partida.estado === 'encerrada'} />
          <Time titulo={nomeDoTime(partida, 2, nomes)} jogadores={time2} encerrada={partida.estado === 'encerrada'} />
        </div>
      )}

      {partida.estado === 'encerrada' && jogaNaPartida && <Elogios partida={partida} jogadores={jogadores} usuarioId={usuario.id} feitos={feitos} />}

      {jogaNaPartida && partida.estado !== 'aguardando_aceite' && partida.estado !== 'vetando' && (
        <section className="painel">
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
                .filter((jogador) => jogador.id !== usuario.id)
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
      )}
    </>
  );
}
