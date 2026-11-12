import Link from 'next/link';
import { redirect } from 'next/navigation';
import { destinoPara } from '@/auth/destino';
import { usuarioAtual } from '@/auth/sessao-atual';
import { obterBd } from '@/bd/conexao';
import { aplicarResultadoVerificacao, verificacaoPendenteDe } from '@/dominio/verificacao';
import { buscarDecisaoNaDidit, decidida, resultadoDaDecisao } from '@/verificacao/didit';
import { Atualizar } from '../../(membros)/atualizar';
import { MolduraDaVerificacao } from '../moldura';

export const dynamic = 'force-dynamic';

/**
 * A volta da Didit. Confere a decisão na hora: aprovada vai para as boas-vindas, recusada volta com o motivo. Se a Didit
 * ainda estiver conferindo (análise manual), a tela espera e se atualiza sozinha.
 */
export default async function RetornoDaVerificacao() {
  const usuario = await usuarioAtual();
  // Quem já foi aprovado pelo aviso da Didit cai direto no site.
  const destino = destinoPara(usuario, '/verificacao');
  if (destino) redirect(destino === '/inicio' ? '/bem-vindo' : destino);
  if (!usuario) redirect('/');

  const bd = obterBd();
  const pendente = await verificacaoPendenteDe(bd, usuario.id);
  if (!pendente || pendente.provedor !== 'didit') redirect('/verificacao');

  const chave = process.env.DIDIT_API_KEY ?? '';
  const decisao = await buscarDecisaoNaDidit(chave, pendente.referencia).catch(() => null);
  if (decisao && decidida(decisao.status)) {
    const desfecho = await aplicarResultadoVerificacao(bd, resultadoDaDecisao(pendente.referencia, decisao, usuario.id), process.env.CPF_HMAC_CHAVE ?? '');
    redirect(desfecho === 'aprovada' ? '/bem-vindo' : `/verificacao?resultado=${desfecho}`);
  }
  // Desistiu no meio ou a sessão venceu: começa de novo.
  if (decisao && ['Abandoned', 'Expired', 'Not Started'].includes(decisao.status ?? '')) redirect('/verificacao');

  return (
    <MolduraDaVerificacao passo="Quase lá" titulo="Conferindo seus documentos">
      <Atualizar segundos={5} />
      <div className="conferindo" aria-live="polite">
        <span className="girando-da-verificacao" aria-hidden="true" />
        <p>A Didit está conferindo o documento e a selfie. Normalmente leva menos de um minuto, e esta tela muda sozinha quando terminar.</p>
      </div>
      <p className="privacidade-da-verificacao">Se a conferência precisar de uma pessoa olhando, pode levar mais tempo. Pode fechar e voltar depois: o resultado fica guardado.</p>
      <Link className="botao-da-shop vazado" href="/verificacao/retorno">
        Conferir de novo
      </Link>
    </MolduraDaVerificacao>
  );
}
