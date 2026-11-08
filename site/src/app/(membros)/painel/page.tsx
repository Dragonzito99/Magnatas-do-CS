import Link from 'next/link';
import { redirect } from 'next/navigation';
import { exigirAcesso } from '@/auth/guarda';
import { pode } from '@/auth/permissoes';
import { obterBd } from '@/bd/conexao';
import { listarBanimentosAbertos } from '@/dominio/banimentos';
import { contagemDeCasos, membrosOnline } from '@/dominio/denuncias';
import { nomeDoMapaConhecido } from '@/dominio/diversao';
import { listarMembros } from '@/dominio/equipe';
import { chamadosEmAndamento, listarCasosDeDenuncia } from '@/dominio/olho-de-aguia';
import { partidasDoDia, servidoresDoPainel } from '@/dominio/painel';
import { NOME_DO_PAPEL } from '@/dominio/textos-da-conta';
import { nomeDaPartida, nomeDoMapa, TEXTOS_DO_ESTADO } from '@/dominio/textos-da-partida';
import { Atualizar } from '../atualizar';
import { atender } from '../olho-de-aguia/acoes';
import { TelaDoPainel } from './lateral-do-painel';

const CASOS_NO_RESUMO = 4;
const NOME_DO_ESTADO_DO_SERVIDOR = { ligado: 'Ligado', ligando: 'Ligando', desligado: 'Desligado' } as const;

/** O Resumo do Painel ADM, como no rascunho: os números do clube, os casos, os chamados, os servidores e a equipe. */
export default async function PainelAdm() {
  const usuario = await exigirAcesso('/painel');
  if (!pode(usuario, 'ver_equipe')) redirect('/inicio');

  const bd = obterBd();
  const moderar = pode(usuario, 'moderar');
  const [contagem, membros, online, hoje, servidores, casos, propostas, chamados] = await Promise.all([
    moderar ? contagemDeCasos(bd, usuario) : null,
    listarMembros(bd),
    membrosOnline(bd),
    partidasDoDia(bd),
    servidoresDoPainel(bd),
    moderar ? listarCasosDeDenuncia(bd, usuario) : [],
    moderar ? listarBanimentosAbertos(bd, usuario) : [],
    moderar ? chamadosEmAndamento(bd, usuario) : [],
  ]);
  const ativos = membros.filter((membro) => membro.estado === 'ativo').length;
  const abertos = contagem ? contagem.chamados + contagem.denuncias + contagem.propostas : 0;
  const equipe = membros.filter((membro) => membro.papel !== 'jogador');

  return (
    <>
      <Atualizar segundos={30} />
      <div className="topo-jogar">
        <h1>Painel ADM</h1>
        <p className="apoio">Só a equipe vê esta área. Cada um vê as partes que o cargo permite.</p>
      </div>
      <TelaDoPainel usuario={usuario} atual="resumo">
        <div className="numeros-painel">
          <div className={abertos > 0 ? 'numero-painel alerta' : 'numero-painel'}>
            <span>Casos abertos</span>
            <b>{abertos}</b>
          </div>
          <div className="numero-painel">
            <span>Membros ativos</span>
            <b>{ativos}</b>
          </div>
          <div className="numero-painel ok">
            <span>Online agora</span>
            <b>{online.length}</b>
          </div>
          <div className="numero-painel">
            <span>Partidas hoje</span>
            <b>{hoje}</b>
          </div>
        </div>

        {moderar && (
          <section className="painel">
            <div className="cabeca-painel">
              <h2>Olho de Águia</h2>
              <Link href="/olho-de-aguia">Ver tudo</Link>
            </div>
            {casos.length === 0 && propostas.length === 0 && <p className="vazio">Nenhum caso aberto. Tudo tranquilo.</p>}
            {casos.slice(0, CASOS_NO_RESUMO).map((caso) => (
              <div className="linha-caso" key={caso.chave}>
                <div>
                  {nomeDaPartida(caso.partida)} · {nomeDoMapa(caso.partida.mapa)}
                  <small>
                    Denunciada por {caso.denuncias.length} {caso.denuncias.length === 1 ? 'jogador' : 'jogadores'}
                    {caso.acusado ? ` · contra ${caso.acusado.apelido}` : ''}
                  </small>
                </div>
                <span className="selo-caso vermelho">Denúncia</span>
                <Link className="botao ouro pequeno" href={`/olho-de-aguia?caso=${caso.chave}`}>
                  Revisar
                </Link>
              </div>
            ))}
            {propostas.slice(0, CASOS_NO_RESUMO).map((proposta) => (
              <div className="linha-caso" key={proposta.id}>
                <div>
                  Proposta de banimento · {proposta.alvoApelido}
                  <small>Proposta por {proposta.propostoPorApelido}. A decisão fica na ficha do jogador.</small>
                </div>
                <span className="selo-caso">Proposta</span>
                <Link className="botao contorno pequeno" href={`/jogadores/${proposta.usuarioId}`}>
                  Revisar
                </Link>
              </div>
            ))}
          </section>
        )}

        <div className="colunas-painel">
          {moderar && (
            <section className="painel">
              <div className="cabeca-painel">
                <h2>Chamados</h2>
                <Link href="/olho-de-aguia#chamados">Ver tudo</Link>
              </div>
              {chamados.length === 0 && <p className="vazio">Ninguém chamou a equipe agora.</p>}
              {chamados.map((chamado) => (
                <div className="linha-caso" key={chamado.id}>
                  <div>
                    {chamado.chamadoPorApelido} pediu ajuda
                    <small>
                      {nomeDaPartida({ tipo: chamado.partidaTipo, numero: chamado.partidaNumero })} · {TEXTOS_DO_ESTADO[chamado.estado].etiqueta.toLowerCase()}
                    </small>
                  </div>
                  <span className="selo-caso vermelho">Aberto</span>
                  <form action={atender}>
                    <input type="hidden" name="chamadoId" value={chamado.id} />
                    <button type="submit" className="botao ouro pequeno">
                      Atender
                    </button>
                  </form>
                </div>
              ))}
            </section>
          )}
          <section className="painel">
            <div className="cabeca-painel">
              <h2>Servidores</h2>
              <Link href="/jogar">Ver no Jogar</Link>
            </div>
            {servidores.length === 0 && <p className="vazio">Nenhum servidor da Diversão ativo.</p>}
            {servidores.map((servidor) => (
              <div className="linha-caso" key={servidor.id}>
                <div>
                  {servidor.modo}
                  <small>{nomeDoMapaConhecido(servidor.mapa) ?? servidor.mapa}</small>
                </div>
                <span className={servidor.estado === 'ligado' ? 'selo-caso verde' : 'selo-caso'}>{NOME_DO_ESTADO_DO_SERVIDOR[servidor.estado]}</span>
              </div>
            ))}
            <p className="apoio nota-do-painel">Os servidores da Diversão ligam quando alguém pede para jogar.</p>
          </section>
        </div>

        <section className="painel">
          <div className="cabeca-painel">
            <h2>Membros e cargos</h2>
            <Link href="/equipe">Ver todos</Link>
          </div>
          {equipe.map((membro) => (
            <div className="linha-caso" key={membro.id}>
              <div>
                <Link href={`/jogadores/${membro.id}`}>{membro.apelido}</Link>
                <small>
                  {membro.convidadoPorApelido ? `Convidado por ${membro.convidadoPorApelido}` : 'Sem convite registrado'} · {membro.convitesRestantes}{' '}
                  {membro.convitesRestantes === 1 ? 'convite' : 'convites'}
                </small>
              </div>
              <span className="selo-caso">{NOME_DO_PAPEL[membro.papel]}</span>
              <Link className="botao contorno pequeno" href="/equipe">
                Editar
              </Link>
            </div>
          ))}
        </section>
      </TelaDoPainel>
    </>
  );
}
