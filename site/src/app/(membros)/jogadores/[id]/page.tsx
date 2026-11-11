import { notFound } from 'next/navigation';
import { z } from 'zod';
import { exigirAcesso } from '@/auth/guarda';
import { pode } from '@/auth/permissoes';
import { obterBd } from '@/bd/conexao';
import { situacaoDaAmizade } from '@/dominio/amigos';
import { claDoUsuario } from '@/dominio/clas';
import { fotoDoMapa } from '@/dominio/diversao';
import { elogiosDoJogador } from '@/dominio/elogios';
import { fichaDoJogador, ultimasPartidasDoPerfil } from '@/dominio/ficha';
import { insigniasDe, insigniasNaoVistas } from '@/dominio/insignias';
import { bauDe, moldurasDe } from '@/dominio/loja';
import { nivelAtivo } from '@/dominio/membros';
import { NOME_DO_ESTADO } from '@/dominio/textos-da-conta';
import { patenteDe } from '@/dominio/xp';
import { AbaBau } from './aba-bau';
import { AbaInsignias } from './aba-insignias';
import { AbaPartidas } from './aba-partidas';
import { ERROS_DO_CLA } from '../../clas/bloco-do-cla';
import { MarcarPatenteVista } from './marcar-patente-vista';
import { Punicoes } from './punicoes';
import { TopoDoPerfil, type AbaDoPerfil } from './topo-do-perfil';
import { VisaoGeral } from './visao-geral';
import Link from 'next/link';

const NOME_DA_DENUNCIA = {
  aberta: 'Aberta',
  em_analise: 'Em análise',
  encerrada: 'Encerrada',
};


const ERROS: Record<string, string> = {
  motivo: 'Escreva o motivo, com até 500 caracteres.',
  alvo: 'A situação desta conta não permite isso.',
  proposta: 'Já existe uma proposta de banimento aberta para esta conta.',
  decidido: 'Este banimento já foi decidido.',
  'quem-propos': 'Quem propôs não pode confirmar. Outro Adm precisa decidir.',
  permissao: 'Você não tem permissão para isso.',
};

const ABAS_DO_PERFIL: AbaDoPerfil[] = ['visao', 'insignias', 'partidas', 'bau'];
const PARTIDAS_NA_ABA = 100;
const PARTIDAS_NA_VISAO = 5;

/** O perfil novo (dono, 11/11/2026): topo com cara de jogo e quatro abas. As partes da equipe continuam no fim. */
export default async function FichaDoJogador({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ erro?: string; aviso?: string; aba?: string; modo?: string }>;
}) {
  const { id } = await params;
  const { erro, aviso, aba: abaPedida, modo } = await searchParams;
  const aba: AbaDoPerfil = ABAS_DO_PERFIL.find((valor) => valor === abaPedida) ?? 'visao';
  const usuario = await exigirAcesso(`/jogadores/${id}`);
  if (!z.uuid().safeParse(id).success) notFound();
  const bd = obterBd();
  const ficha = await fichaDoJogador(bd, usuario, id);
  if (!ficha) notFound();
  const [elogios, partidas, claDele, meuCla, molduras, membro, insignias, bau] = await Promise.all([
    elogiosDoJogador(bd, id),
    ultimasPartidasDoPerfil(bd, id, PARTIDAS_NA_ABA),
    claDoUsuario(bd, id),
    claDoUsuario(bd, usuario.id),
    moldurasDe(bd, [id]),
    nivelAtivo(bd, id),
    insigniasDe(bd, id),
    bauDe(bd, id),
  ]);
  const proprio = usuario.id === id;
  // Dono ou Capitão chama daqui quem ainda não tem clã.
  const possoChamar = !!meuCla && meuCla.cargo !== 'membro' && !claDele && !proprio;
  const amizade = !proprio ? await situacaoDaAmizade(bd, usuario.id, id) : null;
  const temNovas = proprio && aba === 'insignias' && (await insigniasNaoVistas(bd, id)).length > 0;
  const { jogador, steamid64, equipe, xpTotal, progresso, porMapa } = ficha;
  const patenteNova = proprio && patenteDe(usuario.xpTotal).nivel > usuario.patenteVista;

  const emUso = (tipo: string) => bau.find((posse) => posse.usando && posse.item.tipo === tipo)?.item;
  const cor = emUso('cor');
  const mutanteEmUso = emUso('mutante');
  const mutante = mutanteEmUso ? { nome: mutanteEmUso.nome, imagem: mutanteEmUso.evolucoes?.[0]?.imagem ?? mutanteEmUso.imagem ?? '' } : null;
  // O fundo do topo é o mapa em que a pessoa mais joga; sem foto conhecida, o fundo padrão.
  const contagemDeMapas = new Map<string, number>();
  for (const partida of partidas) if (partida.foto) contagemDeMapas.set(partida.foto, (contagemDeMapas.get(partida.foto) ?? 0) + 1);
  const fundo = fotoDoMapa(porMapa[0]?.mapa ?? null) ?? [...contagemDeMapas].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
  const contagem = (familia: string) => insignias.familias.find((item) => item.familia === familia)?.contagem ?? 0;

  return (
    <>
      <TopoDoPerfil
        jogador={jogador}
        membro={membro}
        progresso={progresso}
        xpTotal={xpTotal}
        claDele={claDele}
        principal={insignias.principal}
        corDoNome={cor?.corCss ?? null}
        moldura={molduras.get(id) ?? null}
        fundo={fundo}
        amizade={amizade}
        chamarPara={possoChamar && meuCla ? { id: meuCla.id, sigla: meuCla.sigla } : null}
        steamid64={steamid64 ?? null}
        aba={aba}
      />
      {erro && (ERROS[erro] ?? ERROS_DO_CLA[erro]) && (
        <p role="alert" className="aviso">
          {ERROS[erro] ?? ERROS_DO_CLA[erro]}
        </p>
      )}
      {aviso === 'chamado' && <p className="aviso">Chamado enviado. A pessoa vê no sino e aceita na tela de Clãs.</p>}
      {patenteNova && <MarcarPatenteVista />}

      {aba === 'visao' && (
        <VisaoGeral
          jogadorId={id}
          ficha={ficha}
          ultimas={partidas.slice(0, PARTIDAS_NA_VISAO)}
          insignias={insignias.familias}
          totalDeInsignias={insignias.total}
          mvps={contagem('estrela')}
          aces={contagem('ace')}
          mutante={mutante}
          elogios={elogios}
        />
      )}
      {aba === 'insignias' && <AbaInsignias familias={insignias.familias} principal={insignias.principal} total={insignias.total} proprio={proprio} temNovas={temNovas} />}
      {aba === 'partidas' && <AbaPartidas jogadorId={id} partidas={partidas} modo={modo ?? null} historico={ficha.historico} />}
      {aba === 'bau' && <AbaBau itens={bau} jogador={jogador} />}

      {equipe && aba === 'visao' && (
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
