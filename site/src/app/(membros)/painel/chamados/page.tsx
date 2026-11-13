import Link from 'next/link';
import { redirect } from 'next/navigation';
import { exigirAcesso } from '@/auth/guarda';
import { pode } from '@/auth/permissoes';
import { obterBd } from '@/bd/conexao';
import { chamadosEmAndamento, chamadosRecentes } from '@/dominio/olho-de-aguia';
import { nomeDaPartida, TEXTOS_DO_ESTADO } from '@/dominio/textos-da-partida';
import { Atualizar } from '../../atualizar';
import { atender } from '../../olho-de-aguia/acoes';
import { TelaDoPainel } from '../lateral-do-painel';

const quando = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short', timeZone: 'America/Sao_Paulo' });
const NOME_DO_ESTADO = { atendido: 'Atendido', virou_denuncia: 'Virou denúncia', aberto: 'Aberto' } as const;

/** Chamados: quem pediu ajuda numa partida agora, e os já resolvidos (dono, 13/11/2026: separado do Olho de Águia). */
export default async function Chamados({ searchParams }: { searchParams: Promise<{ erro?: string }> }) {
  const usuario = await exigirAcesso('/painel/chamados');
  if (!pode(usuario, 'moderar')) redirect('/painel');
  const { erro } = await searchParams;
  const bd = obterBd();
  const [abertos, recentes] = await Promise.all([chamadosEmAndamento(bd, usuario), chamadosRecentes(bd, usuario)]);

  return (
    <>
      <Atualizar segundos={10} />
      <TelaDoPainel usuario={usuario} atual="chamados" titulo="Chamados" extra={<span className="apoio">{abertos.length} esperando</span>}>
        {erro === 'jogando' && (
          <p role="alert" className="aviso">
            Você joga essa partida, então outra pessoa da equipe precisa atender.
          </p>
        )}
        {erro === 'chamado' && (
          <p role="alert" className="aviso">
            Este chamado não está mais disponível.
          </p>
        )}
        <h3 className="faixa-adm">Esperando a equipe</h3>
        {abertos.length === 0 && <p className="vazio cartao-adm">Ninguém chamou a equipe agora.</p>}
        <div className="grade-adm">
          {abertos.map((chamado) => (
            <div key={chamado.id} className="cartao-servidor-adm" data-cor="vermelho">
              <span className="tipo-adm">Chamado agora</span>
              <b>{nomeDaPartida({ tipo: chamado.partidaTipo, numero: chamado.partidaNumero })}</b>
              <p>
                {chamado.chamadoPorApelido} pediu ajuda · {TEXTOS_DO_ESTADO[chamado.estado].etiqueta.toLowerCase()}
              </p>
              <form action={atender} className="botoes-adm">
                <input type="hidden" name="chamadoId" value={chamado.id} />
                <button type="submit" className="botao ouro pequeno">
                  Atender e assistir
                </button>
              </form>
            </div>
          ))}
        </div>

        <h3 className="faixa-adm">Já resolvidos</h3>
        <section className="cartao-adm">
          {recentes.length === 0 && <p className="vazio">Nenhum chamado ainda.</p>}
          {recentes.map((chamado) => (
            <div key={chamado.id} className="linha-simples-adm">
              <span>
                <Link href={`/partidas/${chamado.partidaId}`}>{nomeDaPartida({ tipo: chamado.partidaTipo, numero: chamado.partidaNumero })}</Link> ·{' '}
                {NOME_DO_ESTADO[chamado.estado]}
              </span>
              <small>
                Chamado por {chamado.chamadoPorApelido}
                {chamado.atendidoPorApelido ? ` · atendido por ${chamado.atendidoPorApelido}` : ''} · {quando.format(chamado.criadoEm)}
              </small>
            </div>
          ))}
        </section>
      </TelaDoPainel>
    </>
  );
}
