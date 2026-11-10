import Link from 'next/link';
import { exigirAcesso } from '@/auth/guarda';

const MENSAGENS: Record<string, string> = {
  approved: 'Pagamento aprovado! Suas MagCoins ou sua assinatura entram em instantes.',
  authorized: 'Assinatura autorizada! As vantagens entram assim que o primeiro pagamento for aprovado.',
  pending: 'Pagamento em análise. Assim que o Mercado Pago aprovar, entra sozinho na sua conta.',
  in_process: 'Pagamento em análise. Assim que o Mercado Pago aprovar, entra sozinho na sua conta.',
  rejected: 'O pagamento não foi aprovado. Nada foi cobrado; você pode tentar de novo.',
  failure: 'O pagamento não foi concluído. Nada foi cobrado; você pode tentar de novo.',
};

/** Volta do Mercado Pago. Só mostra uma mensagem: o crédito vem do aviso do Mercado Pago, conferido na API. */
export default async function RetornoDoPagamento({ searchParams }: { searchParams: Promise<{ status?: string; collection_status?: string }> }) {
  await exigirAcesso('/apoio');
  const { status, collection_status } = await searchParams;
  const mensagem = MENSAGENS[collection_status ?? status ?? ''] ?? MENSAGENS.pending;
  return (
    <div className="tela-jogar">
      <div className="topo-jogar">
        <h1>Obrigado pelo apoio</h1>
        <p className="apoio">{mensagem}</p>
      </div>
      <p className="apoio">
        <Link href="/compras">Ver minhas compras</Link> · <Link href="/apoio">Voltar para o apoio</Link> · <Link href="/loja">Ir para a loja</Link>
      </p>
    </div>
  );
}
