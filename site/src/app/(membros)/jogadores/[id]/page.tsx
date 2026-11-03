import Link from 'next/link';
import { notFound } from 'next/navigation';
import { z } from 'zod';
import { exigirAcesso } from '@/auth/guarda';
import { obterBd } from '@/bd/conexao';
import type { Papel } from '@/bd/esquema';
import { fichaDoJogador, type SituacaoDaGravacao } from '@/dominio/ficha';
import { nomeDaPartida, nomeDoMapa } from '@/dominio/textos-da-partida';
import { Avatar } from '../../avatar';

const NOME_DO_PAPEL: Record<Papel, string> = { jogador: 'Jogador', gm: 'GM', adm: 'Adm' };
const NOME_DA_DENUNCIA = { aberta: 'Aberta', em_analise: 'Em análise', encerrada: 'Encerrada' };
const NOME_DA_GRAVACAO: Record<Exclude<SituacaoDaGravacao, 'disponivel'>, string> = {
  aguardando: 'Gravação chegando',
  sem: 'Sem gravação',
  apagada: 'Gravação apagada',
};

const dataCurta = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeZone: 'America/Sao_Paulo' });

export default async function FichaDoJogador({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const usuario = await exigirAcesso(`/jogadores/${id}`);
  if (!z.uuid().safeParse(id).success) notFound();
  const ficha = await fichaDoJogador(obterBd(), usuario, id);
  if (!ficha) notFound();
  const { jogador, estatisticas, historico, equipe } = ficha;

  return (
    <>
      <div className="ficha-topo">
        <Avatar usuario={jogador} />
        <div>
          <h1>{jogador.apelido}</h1>
          <span className="apoio">
            {NOME_DO_PAPEL[jogador.papel]}, desde {dataCurta.format(jogador.criadoEm)}
          </span>
        </div>
      </div>
      <div className="numeros">
        <div>
          <small>Partidas</small>
          <b>{estatisticas.partidas}</b>
        </div>
        <div>
          <small>Vitórias</small>
          <b>{estatisticas.vitorias}</b>
        </div>
        <div>
          <small>K/D</small>
          <b>{estatisticas.kd}</b>
        </div>
        <div>
          <small>Abates</small>
          <b>{estatisticas.abates}</b>
        </div>
        <div>
          <small>Na cabeça</small>
          <b>{estatisticas.hsPct}%</b>
        </div>
        <div>
          <small>Dano por rodada</small>
          <b>{estatisticas.adr}</b>
        </div>
      </div>
      <section className="painel">
        <div className="cabeca-painel">
          <h2>Histórico</h2>
          <span>Só partidas encerradas</span>
        </div>
        {historico.length === 0 && <p className="vazio">Ainda não jogou nenhuma partida.</p>}
        {historico.map((partida) => (
          <div className="linha" key={partida.id}>
            <div>
              <Link href={`/partidas/${partida.id}`}>{nomeDaPartida(partida)}</Link>
              <small>
                {nomeDoMapa(partida.mapa)}
                {partida.encerradaEm && `, ${dataCurta.format(partida.encerradaEm)}`}
              </small>
            </div>
            <span className={partida.venceu ? 'etiqueta ok' : 'etiqueta'}>{partida.venceu ? 'Vitória' : 'Derrota'}</span>
            <span className="mono">
              {partida.placar1} x {partida.placar2}
            </span>
            <span className="mono">
              {partida.kills}/{partida.deaths}/{partida.assists}
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
      {equipe && (
        <>
          <section className="painel">
            <div className="cabeca-painel">
              <h2>Dados da equipe</h2>
              <span>Só GM e Adm veem</span>
            </div>
            <div className="dados-da-equipe">
              <span>
                Situação da conta: <b>{equipe.estado}</b>
              </span>
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
