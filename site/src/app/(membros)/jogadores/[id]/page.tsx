import Image from 'next/image';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { z } from 'zod';
import { exigirAcesso } from '@/auth/guarda';
import { pode } from '@/auth/permissoes';
import { obterBd } from '@/bd/conexao';
import { fotoDoMapa } from '@/dominio/diversao';
import { elogiosDoJogador } from '@/dominio/elogios';
import { claDoUsuario } from '@/dominio/clas';
import { fichaDoJogador, kdDe, ultimasPartidasDoPerfil } from '@/dominio/ficha';
import { moldurasDe } from '@/dominio/loja';
import { NIVEIS, nivelAtivo } from '@/dominio/membros';
import { NOME_DO_ESTADO, NOME_DO_PAPEL } from '@/dominio/textos-da-conta';
import { NOME_DA_GRAVACAO, nomeDaPartida, nomeDoMapa } from '@/dominio/textos-da-partida';
import { PATENTES, patenteDe } from '@/dominio/xp';
import { Avatar } from '../../avatar';
import { chamar } from '../../clas/acoes';
import { ERROS_DO_CLA } from '../../clas/bloco-do-cla';
import { SiglaDoCla } from '../../clas/sigla-do-cla';
import { InsigniaDaPatente } from '../../insignia-da-patente';
import { MarcarPatenteVista } from './marcar-patente-vista';
import { Punicoes } from './punicoes';

const NOME_DA_DENUNCIA = {
  aberta: 'Aberta',
  em_analise: 'Em análise',
  encerrada: 'Encerrada',
};

const diaEMes = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', timeZone: 'America/Sao_Paulo' });
const dataCurta = new Intl.DateTimeFormat('pt-BR', {
  dateStyle: 'short',
  timeZone: 'America/Sao_Paulo',
});
const numero = new Intl.NumberFormat('pt-BR');
const NOME_DO_RESULTADO = {
  vitoria: 'Vitória',
  empate: 'Empate',
  derrota: 'Derrota',
};

const ERROS: Record<string, string> = {
  motivo: 'Escreva o motivo, com até 500 caracteres.',
  alvo: 'A situação desta conta não permite isso.',
  proposta: 'Já existe uma proposta de banimento aberta para esta conta.',
  decidido: 'Este banimento já foi decidido.',
  'quem-propos': 'Quem propôs não pode confirmar. Outro Adm precisa decidir.',
  permissao: 'Você não tem permissão para isso.',
};

export default async function FichaDoJogador({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ erro?: string; aviso?: string }> }) {
  const { id } = await params;
  const { erro, aviso } = await searchParams;
  const usuario = await exigirAcesso(`/jogadores/${id}`);
  if (!z.uuid().safeParse(id).success) notFound();
  const ficha = await fichaDoJogador(obterBd(), usuario, id);
  if (!ficha) notFound();
  const [elogios, ultimas, claDele, meuCla, molduras, membro] = await Promise.all([
    elogiosDoJogador(obterBd(), id),
    ultimasPartidasDoPerfil(obterBd(), id),
    claDoUsuario(obterBd(), id),
    claDoUsuario(obterBd(), usuario.id),
    moldurasDe(obterBd(), [id]),
    nivelAtivo(obterBd(), id),
  ]);
  // Dono ou Capitão chama daqui quem ainda não tem clã.
  const possoChamar = !!meuCla && meuCla.cargo !== 'membro' && !claDele && usuario.id !== id;
  const { jogador, estatisticas, historico, porMapa, melhorPartida, steamid64, equipe, xpTotal, progresso } = ficha;
  const patenteNova = usuario.id === jogador.id && patenteDe(usuario.xpTotal).nivel > usuario.patenteVista;
  const fotoMelhor = melhorPartida ? fotoDoMapa(melhorPartida.mapa) : null;

  return (
    <>
      <section className="capa-perfil">
        <div className="capa-perfil-linha">
          <Avatar usuario={jogador} moldura={molduras.get(id)} />
          <div className="capa-perfil-nome">
            <h1>
              <span className="ficha-nome">{jogador.apelido}</span>
            </h1>
            <div className="capa-perfil-selos">
              <span className="selo">{NOME_DO_PAPEL[jogador.papel]}</span>
              {membro && <span className={`selo selo-de-membro ${membro}`}>{NIVEIS[membro].nome}</span>}
              <span className="patente-na-tabela">
                <InsigniaDaPatente patente={progresso.patente} classe="insignia-mini" />
                {progresso.patente.nome}
              </span>
              {claDele && (
                <span className="selo-do-cla">
                  <SiglaDoCla cla={claDele} link /> {claDele.nome}
                </span>
              )}
              <span className="apoio">Na Magnatas desde {dataCurta.format(jogador.criadoEm)}</span>
            </div>
          </div>
          {possoChamar && (
            <form action={chamar}>
              <input type="hidden" name="claId" value={meuCla.id} />
              <input type="hidden" name="usuarioId" value={jogador.id} />
              <button type="submit" className="botao ouro pequeno">
                Chamar para o clã [{meuCla.sigla}]
              </button>
            </form>
          )}
          {steamid64 && (
            <a className="botao contorno pequeno" href={`https://steamcommunity.com/profiles/${steamid64}`} target="_blank" rel="noreferrer">
              Ver na Steam
            </a>
          )}
        </div>
      </section>
      {erro && (ERROS[erro] ?? ERROS_DO_CLA[erro]) && (
        <p role="alert" className="aviso">
          {ERROS[erro] ?? ERROS_DO_CLA[erro]}
        </p>
      )}
      {aviso === 'chamado' && <p className="aviso">Chamado enviado. A pessoa vê no sino e aceita na tela de Clãs.</p>}
      {patenteNova && <MarcarPatenteVista />}
      <section className="painel patente-e-xp">
        <InsigniaDaPatente patente={progresso.patente} classe="insignia-perfil" />
        <div className="patente-resumo-largo">
          <strong>{progresso.patente.nome}</strong>
          <span className="apoio">
            {progresso.patente.grupo} · degrau {progresso.patente.nivel} de {PATENTES.length}
          </span>
          <div className="barra-xp" role="progressbar" aria-label="Progresso até a próxima patente" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progresso.porcentagem}>
            <i style={{ width: `${progresso.porcentagem}%` }} />
          </div>
          <span className="apoio">
            {progresso.proxima
              ? `${numero.format(xpTotal)} de ${numero.format(progresso.proxima.xp)} XP para ${progresso.proxima.nome}`
              : `${numero.format(xpTotal)} XP. Patente máxima`}
          </span>
        </div>
        <Link href="/patentes" className="botao contorno pequeno">
          Ver todas as patentes
        </Link>
      </section>
      <div className="numeros principais">
        <div className="destaque">
          <small>K/D</small>
          <b className="mono">{estatisticas.kd.toFixed(2)}</b>
        </div>
        <div>
          <small>Vitórias</small>
          <b className="mono">{estatisticas.vitoriasPct}%</b>
          <small>
            {estatisticas.vitorias} de {estatisticas.partidas} {estatisticas.partidas === 1 ? 'partida' : 'partidas'}
          </small>
        </div>
        <div>
          <small>Dano por rodada</small>
          <b className="mono">{estatisticas.adr}</b>
        </div>
        <div>
          <small>Abates na cabeça</small>
          <b className="mono">{estatisticas.hsPct}%</b>
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
          Abates por partida
          <b className="mono">{estatisticas.abatesPorPartida}</b>
        </div>
      </div>
      <div className="perfil-colunas">
        <div className="pilha">
          <section className="painel">
            <div className="cabeca-painel">
              <h2>Últimas partidas</h2>
              <a href="#historico" className="link-ouro">
                Ver histórico
              </a>
            </div>
            {ultimas.length === 0 && <p className="vazio">Ainda não jogou nenhuma partida.</p>}
            {ultimas.length > 0 && (
              <table className="tabela tabela-ultimas">
                <thead>
                  <tr>
                    <th scope="col">Data</th>
                    <th scope="col">Modo</th>
                    <th scope="col" className="so-computador">
                      Mapa
                    </th>
                    <th scope="col">Resultado</th>
                    <th scope="col" className="so-computador">
                      Placar
                    </th>
                    <th scope="col" title="Abates divididos pelas mortes">
                      KDR
                    </th>
                    <th scope="col">XP</th>
                  </tr>
                </thead>
                <tbody>
                  {ultimas.map((linha, indice) => (
                    <tr key={indice}>
                      <th scope="row">{diaEMes.format(linha.data)}</th>
                      <td>{linha.modo}</td>
                      <td className="so-computador">{linha.mapa ?? '—'}</td>
                      <td>
                        <span className={linha.resultado === 'vitoria' ? 'res vitoria' : linha.resultado === 'derrota' ? 'res derrota' : 'res'}>
                          {NOME_DO_RESULTADO[linha.resultado]}
                        </span>
                      </td>
                      <td className="so-computador">{linha.placar ?? '—'}</td>
                      <td>
                        {linha.mortes === null ? '—' : kdDe(linha.abates, linha.mortes).toFixed(2)}
                      </td>
                      <td>
                        <b className="xp-ganho">+{numero.format(linha.xp)}</b>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>
          <section className="painel" id="historico">
            <div className="cabeca-painel">
              <h2>Histórico</h2>
              <span>Mix e salas encerrados</span>
            </div>
            {historico.length === 0 && <p className="vazio">Ainda não jogou nenhuma partida de mix ou sala.</p>}
            {historico.map((partida) => (
              <div className="linha linha-historico" key={partida.id}>
                <div>
                  <Link href={`/partidas/${partida.id}`}>{nomeDaPartida(partida)}</Link>
                  <small>
                    {nomeDoMapa(partida.mapa)}
                    {partida.encerradaEm && `, ${dataCurta.format(partida.encerradaEm)}`}
                  </small>
                </div>
                <span className={partida.venceu ? 'res vitoria' : 'res derrota'}>{partida.venceu ? 'Vitória' : 'Derrota'}</span>
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
        </div>
        <div className="pilha">
          <section className="painel">
            <div className="cabeca-painel">
              <h2>Por mapa</h2>
            </div>
            {porMapa.length === 0 && <p className="vazio">Ainda não há partidas.</p>}
            {porMapa.length > 0 && (
              <div className="mapas-do-perfil">
                {porMapa.map((linha) => {
                  const foto = fotoDoMapa(linha.mapa);
                  return (
                    <div className="mapa-do-perfil" key={linha.mapa}>
                      {foto && <Image src={foto} alt="" width={480} height={270} />}
                      <b>{nomeDoMapa(linha.mapa)}</b>
                      <span>
                        {linha.vitoriasPct}% de vitórias · {linha.partidas} {linha.partidas === 1 ? 'partida' : 'partidas'} · K/D {linha.kd.toFixed(2)}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
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
              <h2>Melhor partida</h2>
            </div>
            {melhorPartida ? (
              <Link href={`/partidas/${melhorPartida.id}`} className="mapa-do-perfil melhor">
                {fotoMelhor && <Image src={fotoMelhor} alt="" width={480} height={270} />}
                <b>
                  {melhorPartida.kills} {melhorPartida.kills === 1 ? 'abate' : 'abates'}
                </b>
                <span>
                  K/D {melhorPartida.kd.toFixed(2)} · {nomeDaPartida(melhorPartida)} · {nomeDoMapa(melhorPartida.mapa)}
                </span>
              </Link>
            ) : (
              <p className="vazio">Ainda não há partidas.</p>
            )}
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
              <span>Convidado por: {equipe.convidadoPor ? <Link href={`/jogadores/${equipe.convidadoPor.id}`}>{equipe.convidadoPor.apelido}</Link> : 'sem registro'}</span>
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
                    {NOME_DA_DENUNCIA[denuncia.estado]}, por {denuncia.denunciantePorApelido}, na{' '}
                    <Link href={`/partidas/${denuncia.partidaId}`}>partida #{denuncia.partidaNumero}</Link>
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
