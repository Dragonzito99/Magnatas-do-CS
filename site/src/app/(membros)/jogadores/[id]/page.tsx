import Link from 'next/link';
import { notFound } from 'next/navigation';
import { z } from 'zod';
import { exigirAcesso } from '@/auth/guarda';
import { pode } from '@/auth/permissoes';
import { obterBd } from '@/bd/conexao';
import { elogiosDoJogador } from '@/dominio/elogios';
import { fichaDoJogador } from '@/dominio/ficha';
import { NOME_DO_ESTADO, NOME_DO_PAPEL } from '@/dominio/textos-da-conta';
import { NOME_DA_GRAVACAO, nomeDaPartida, nomeDoMapa } from '@/dominio/textos-da-partida';
import { PATENTES, patenteDe } from '@/dominio/xp';
import { Avatar } from '../../avatar';
import { MarcarPatenteVista } from './marcar-patente-vista';
import { Punicoes } from './punicoes';

const NOME_DA_DENUNCIA = { aberta: 'Aberta', em_analise: 'Em análise', encerrada: 'Encerrada' };

const dataCurta = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeZone: 'America/Sao_Paulo' });
const numero = new Intl.NumberFormat('pt-BR');
const NOME_DA_ORIGEM = { partida: 'Mix ou Sala', diversao: 'Diversão' };
const NOME_DO_RESULTADO = { vitoria: 'Vitória', empate: 'Empate', derrota: 'Derrota' };

const ERROS: Record<string, string> = {
  motivo: 'Escreva o motivo, com até 500 caracteres.',
  alvo: 'A situação desta conta não permite isso.',
  proposta: 'Já existe uma proposta de banimento aberta para esta conta.',
  decidido: 'Este banimento já foi decidido.',
  'quem-propos': 'Quem propôs não pode confirmar. Outro Adm precisa decidir.',
  permissao: 'Você não tem permissão para isso.',
};

export default async function FichaDoJogador({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ erro?: string }>;
}) {
  const { id } = await params;
  const { erro } = await searchParams;
  const usuario = await exigirAcesso(`/jogadores/${id}`);
  if (!z.uuid().safeParse(id).success) notFound();
  const ficha = await fichaDoJogador(obterBd(), usuario, id);
  if (!ficha) notFound();
  const elogios = await elogiosDoJogador(obterBd(), id);
  const { jogador, estatisticas, historico, porMapa, melhorPartida, steamid64, equipe, xpTotal, progresso, ultimosXp } = ficha;
  const patenteNova = usuario.id === jogador.id && patenteDe(usuario.xpTotal).nivel > usuario.patenteVista;

  return (
    <>
      <div className="ficha-topo">
        <Avatar usuario={jogador} />
        <div>
          <h1>
            <span className="ficha-nome">{jogador.apelido}</span>
            <span className="selo">{NOME_DO_PAPEL[jogador.papel]}</span>
          </h1>
          <span className="apoio">Na Magnatas desde {dataCurta.format(jogador.criadoEm)}</span>
        </div>
        {steamid64 && (
          <a className="botao cinza pequeno" href={`https://steamcommunity.com/profiles/${steamid64}`} target="_blank" rel="noreferrer">
            Ver na Steam
          </a>
        )}
      </div>
      {erro && ERROS[erro] && (
        <p role="alert" className="aviso">
          {ERROS[erro]}
        </p>
      )}
      <div className="numeros principais">
        <div className="destaque">
          <b className="mono">{estatisticas.kd.toFixed(2)}</b>
          <small>K/D</small>
        </div>
        <div>
          <b className="mono">{estatisticas.vitoriasPct}%</b>
          <small>Vitórias</small>
          <small>
            {estatisticas.vitorias} de {estatisticas.partidas} {estatisticas.partidas === 1 ? 'partida' : 'partidas'}
          </small>
        </div>
        <div>
          <b className="mono">{estatisticas.adr}</b>
          <small>Dano por rodada</small>
        </div>
        <div>
          <b className="mono">{estatisticas.hsPct}%</b>
          <small>Abates na cabeça</small>
        </div>
      </div>
      <div className="numeros-menores">
        <div>
          Abates<b className="mono">{estatisticas.abates}</b>
        </div>
        <div>
          Mortes<b className="mono">{estatisticas.mortes}</b>
        </div>
        <div>
          Assistências<b className="mono">{estatisticas.assistencias}</b>
        </div>
        <div>
          Abates por partida<b className="mono">{estatisticas.abatesPorPartida}</b>
        </div>
      </div>
      {patenteNova && <MarcarPatenteVista />}
      <section className="painel patente-perfil">
        <div className="patente-resumo">
          <div className="patente-topo">
            <svg className="coroa-patente" viewBox="0 0 24 18" aria-hidden="true">
              <path d="M2 16 1 4l6 5 5-8 5 8 6-5-1 12z" />
            </svg>
            <div>
              <strong>{progresso.patente.nome}</strong>
              <span className="apoio">
                Nível {progresso.patente.nivel} de {PATENTES.length}
              </span>
            </div>
          </div>
          <div className="barra-xp" role="progressbar" aria-label="Progresso até a próxima patente" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progresso.porcentagem}>
            <i style={{ width: `${progresso.porcentagem}%` }} />
          </div>
          <span className="apoio">
            {progresso.proxima
              ? `${numero.format(xpTotal)} de ${numero.format(progresso.proxima.xp)} XP para ${progresso.proxima.nome}`
              : `${numero.format(xpTotal)} XP. Patente máxima`}
          </span>
        </div>
        {ultimosXp.length > 0 && (
          <>
            <div className="cabeca-painel">
              <h2>Últimas partidas</h2>
              <span>As 10 mais recentes</span>
            </div>
            <table className="tabela">
              <thead>
                <tr>
                  <th scope="col">Data</th>
                  <th scope="col">Partida</th>
                  <th scope="col" className="so-computador">
                    Resultado
                  </th>
                  <th scope="col" className="so-computador">
                    Abates
                  </th>
                  <th scope="col">XP</th>
                </tr>
              </thead>
              <tbody>
                {ultimosXp.map((linha, indice) => (
                  <tr key={indice}>
                    <th scope="row">{dataCurta.format(linha.criadoEm)}</th>
                    <td>{NOME_DA_ORIGEM[linha.origem]}</td>
                    <td className="so-computador">{NOME_DO_RESULTADO[linha.resultado]}</td>
                    <td className="so-computador">{linha.abates}</td>
                    <td>
                      <b>+{numero.format(linha.xp)}</b>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}
      </section>
      <div className="grade">
        <section className="painel">
          <div className="cabeca-painel">
            <h2>Histórico</h2>
            <span>Só partidas encerradas</span>
          </div>
          {historico.length === 0 && <p className="vazio">Ainda não jogou nenhuma partida.</p>}
          {historico.map((partida) => (
            <div className="linha linha-historico" key={partida.id}>
              <div>
                <Link href={`/partidas/${partida.id}`}>{nomeDaPartida(partida)}</Link>
                <small>
                  {nomeDoMapa(partida.mapa)}
                  {partida.encerradaEm && `, ${dataCurta.format(partida.encerradaEm)}`}
                </small>
              </div>
              <span className={partida.venceu ? 'resultado ganhou' : 'resultado'}>
                <svg className="icone" viewBox="0 0 24 24" aria-hidden="true">
                  {partida.venceu ? (
                    <path d="M20 6 9 17l-5-5" />
                  ) : (
                    <>
                      <path d="M18 6 6 18" />
                      <path d="m6 6 12 12" />
                    </>
                  )}
                </svg>
                {partida.venceu ? 'Vitória' : 'Derrota'}
              </span>
              <span className="mono">
                {partida.placar1} x {partida.placar2}
              </span>
              <span className="mono" title="Abates, mortes e assistências">
                {partida.kills}/{partida.deaths}/{partida.assists}
              </span>
              <span className="mono" title="Dano por rodada">
                {partida.adr}
              </span>
              {partida.gravacao &&
                (partida.gravacao === 'disponivel' ? (
                  <a className="botao cinza pequeno" href={`/api/gravacoes/${partida.gravacaoId}`}>
                    Baixar gravação
                  </a>
                ) : (
                  <span className="etiqueta">{NOME_DA_GRAVACAO[partida.gravacao]}</span>
                ))}
            </div>
          ))}
        </section>
        <div className="pilha">
          <section className="painel">
            <div className="cabeca-painel">
              <h2>Elogios</h2>
              <span>{elogios.reduce((total, elogio) => total + elogio.total, 0)}</span>
            </div>
            {elogios.length === 0 ? (
              <p className="vazio">Ainda sem elogios.</p>
            ) : (
              <div className="elogios-do-jogador">
                {elogios.map((elogio) => (
                  <span className="elogio" key={elogio.tipo}>
                    {elogio.nome} <b>×{elogio.total}</b>
                  </span>
                ))}
              </div>
            )}
          </section>
          <section className="painel">
            <div className="cabeca-painel">
              <h2>Por mapa</h2>
            </div>
            {porMapa.length === 0 && <p className="vazio">Ainda não há partidas.</p>}
            {porMapa.length > 0 && (
              <table className="tabela">
                <thead>
                  <tr>
                    <th scope="col">Mapa</th>
                    <th scope="col">Partidas</th>
                    <th scope="col">Vitórias</th>
                    <th scope="col">K/D</th>
                  </tr>
                </thead>
                <tbody>
                  {porMapa.map((linha) => (
                    <tr key={linha.mapa}>
                      <th scope="row">{nomeDoMapa(linha.mapa)}</th>
                      <td>{linha.partidas}</td>
                      <td>{linha.vitoriasPct}%</td>
                      <td>{linha.kd.toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>
          <section className="painel melhor-partida">
            <svg className="icone" viewBox="0 0 24 24" aria-hidden="true">
              <path d="M8 21h8" />
              <path d="M12 17v4" />
              <path d="M7 4h10v6a5 5 0 0 1-10 0z" />
              <path d="M7 6H4a3 3 0 0 0 3 4" />
              <path d="M17 6h3a3 3 0 0 1-3 4" />
            </svg>
            <div>
              <small>Melhor partida</small>
              {melhorPartida ? (
                <>
                  <b>
                    {melhorPartida.kills} {melhorPartida.kills === 1 ? 'abate' : 'abates'}, K/D {melhorPartida.kd.toFixed(2)}
                  </b>
                  <small>
                    <Link href={`/partidas/${melhorPartida.id}`}>{nomeDaPartida(melhorPartida)}</Link>, {nomeDoMapa(melhorPartida.mapa)}
                  </small>
                </>
              ) : (
                <b>Ainda não há partidas</b>
              )}
            </div>
          </section>
        </div>
      </div>
      {equipe && (
        <>
          <section className="painel">
            <div className="cabeca-painel">
              <h2>Dados da equipe</h2>
              <span>Só GM e Adm veem</span>
            </div>
            <div className="dados-da-equipe">
              <span>Situação da conta: {NOME_DO_ESTADO[equipe.estado]}</span>
              <span>
                SteamID: <span className="mono">{equipe.steamid64}</span>
              </span>
              <span>
                Convidado por:{' '}
                {equipe.convidadoPor ? <Link href={`/jogadores/${equipe.convidadoPor.id}`}>{equipe.convidadoPor.apelido}</Link> : 'sem registro'}
              </span>
              <span>
                Convidou:{' '}
                {equipe.convidados.length === 0
                  ? 'ninguém'
                  : equipe.convidados.map((convidado, indice) => (
                      <span key={convidado.id}>
                        {indice > 0 && ', '}
                        <Link href={`/jogadores/${convidado.id}`}>{convidado.apelido}</Link>
                      </span>
                    ))}
              </span>
            </div>
          </section>
          <Punicoes
            jogadorId={jogador.id}
            apelido={jogador.apelido}
            papel={jogador.papel}
            estado={equipe.estado}
            banimentos={equipe.banimentos}
            ehProprio={jogador.id === usuario.id}
            leitorEhAdm={pode(usuario, 'decidir_banimento')}
          />
          <section className="painel">
            <div className="cabeca-painel">
              <h2>Denúncias contra este jogador</h2>
              <span>{equipe.denuncias.length}</span>
            </div>
            {equipe.denuncias.length === 0 && <p className="vazio">Nenhuma denúncia.</p>}
            {equipe.denuncias.map((denuncia) => (
              <div className="caso" key={denuncia.id}>
                <div>
                  <b>{denuncia.motivo}</b>
                  <small>
                    {NOME_DA_DENUNCIA[denuncia.estado]}, por {denuncia.denunciantePorApelido}, na <Link href={`/partidas/${denuncia.partidaId}`}>partida #{denuncia.partidaNumero}</Link>
                  </small>
                </div>
                {denuncia.conclusao && <span className="apoio">Conclusão: {denuncia.conclusao}</span>}
              </div>
            ))}
          </section>
        </>
      )}
    </>
  );
}
