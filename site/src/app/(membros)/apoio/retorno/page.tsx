import Link from 'next/link';
import { exigirAcesso } from '@/auth/guarda';
import { obterBd } from '@/bd/conexao';
import { PACOTES, pedidoDoUsuario } from '@/dominio/pagamentos';
import { Atualizar } from '../../atualizar';

type Estado = 'pronto' | 'confirmando' | 'assinatura' | 'recusado';

const RECUSADOS = new Set(['rejected', 'failure', 'cancelled', 'null']);
const ICONE: Record<Estado, string> = { pronto: '✓', confirmando: '', assinatura: '★', recusado: '✕' };

const reais = (centavos: number) => (centavos / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

/**
 * Volta do Mercado Pago. O crédito vem do aviso do Mercado Pago, conferido na API; esta tela só mostra o pedido
 * (se for dessa pessoa) e se atualiza sozinha até as MagCoins entrarem.
 */
export default async function RetornoDoPagamento({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; collection_status?: string; external_reference?: string; preapproval_id?: string }>;
}) {
  const usuario = await exigirAcesso('/apoio');
  const { status, collection_status, external_reference, preapproval_id } = await searchParams;
  const situacao = collection_status ?? status ?? '';
  const pedido = await pedidoDoUsuario(obterBd(), usuario.id, external_reference);

  const estado: Estado =
    pedido?.estado === 'pago'
      ? 'pronto'
      : RECUSADOS.has(situacao)
        ? 'recusado'
        : preapproval_id || situacao === 'authorized'
          ? 'assinatura'
          : 'confirmando';

  return (
    <div className="tela-jogar">
      <section className={`retorno-pagamento ${estado}`} aria-live="polite">
        <span className="selo-do-retorno" aria-hidden="true">
          {ICONE[estado]}
        </span>

        {estado === 'pronto' && pedido && (
          <>
            <small className="sobretitulo">Obrigado pelo apoio</small>
            <h1>Pagamento aprovado</h1>
            <p className="ganho-do-retorno">
              <b>+{pedido.magcoins.toLocaleString('pt-BR')}</b> MagCoins
            </p>
            <p className="apoio">
              Já estão na sua conta. Agora você tem <b className="grana-destaque">{usuario.magcoin.toLocaleString('pt-BR')} MagCoins</b>.
            </p>
          </>
        )}

        {estado === 'confirmando' && (
          <>
            <small className="sobretitulo">Quase lá</small>
            <h1>Confirmando o pagamento</h1>
            {pedido && (
              <p className="ganho-do-retorno">
                <b>+{pedido.magcoins.toLocaleString('pt-BR')}</b> MagCoins
              </p>
            )}
            <p className="apoio">
              {situacao === 'approved'
                ? 'O Mercado Pago aprovou. Suas MagCoins entram em instantes; esta tela atualiza sozinha.'
                : 'Seu pagamento está em análise. Assim que o Mercado Pago aprovar, entra sozinho na sua conta.'}
            </p>
            {pedido?.estado === 'aberto' && <Atualizar segundos={3} />}
          </>
        )}

        {estado === 'assinatura' && (
          <>
            <small className="sobretitulo">Obrigado pelo apoio</small>
            <h1>Assinatura autorizada</h1>
            <p className="apoio">As vantagens entram assim que o Mercado Pago aprovar o primeiro pagamento.</p>
          </>
        )}

        {estado === 'recusado' && (
          <>
            <small className="sobretitulo">Não deu certo</small>
            <h1>Pagamento não aprovado</h1>
            <p className="apoio">Nada foi cobrado. Você pode tentar de novo com PIX ou outro cartão.</p>
          </>
        )}

        {pedido && estado !== 'recusado' && (
          <dl className="resumo-do-retorno">
            <div>
              <dt>Pacote</dt>
              <dd>{PACOTES[pedido.pacote].nome}</dd>
            </div>
            <div>
              <dt>Valor</dt>
              <dd>{reais(pedido.valorCentavos)}</dd>
            </div>
          </dl>
        )}

        <div className="acoes-do-retorno">
          {estado === 'recusado' ? (
            <Link href="/apoio" className="botao ouro">
              Tentar de novo
            </Link>
          ) : (
            <Link href="/loja" className="botao ouro">
              Ir para a loja
            </Link>
          )}
          <Link href="/compras" className="botao cinza">
            Ver minhas compras
          </Link>
        </div>
        {estado !== 'recusado' && (
          <Link href="/apoio" className="botao-texto">
            Voltar para o apoio
          </Link>
        )}
      </section>
    </div>
  );
}
