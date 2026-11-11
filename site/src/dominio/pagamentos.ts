import { and, desc, eq, gt, inArray, or } from 'drizzle-orm';
import { pode } from '@/auth/permissoes';
import type { Bd } from '@/bd/conexao';
import { assinaturas, pedidos, usuarios, type Usuario } from '@/bd/esquema';
import { assinaturaConfere, type MercadoPago } from '@/pagamento/mercadopago';
import { exigirAtivo } from './disponibilidade';
import { registrarAuditoria, SemPermissao } from './equipe';
import { lancarMoeda } from './grana';
import { aplicarMensalidade, NIVEIS, type NivelDeMembro } from './membros';

/** Pacotes de MagCoin aprovados pelo dono em 10/11/2026. */
export const PACOTES = {
  pequeno: { nome: 'Pacote pequeno', precoCentavos: 1000, magcoins: 100 },
  medio: { nome: 'Pacote médio', precoCentavos: 2500, magcoins: 260 },
  grande: { nome: 'Pacote grande', precoCentavos: 5000, magcoins: 550 },
  // Para o Adm conferir os pagamentos de verdade gastando pouco; ninguém mais vê nem compra.
  teste: { nome: 'Teste do Adm', precoCentavos: 100, magcoins: 10, soAdm: true },
} as const;

/** Os pacotes que essa pessoa pode comprar: o de teste só aparece para quem pode ajustar a Grana (o Adm). */
export function pacotesPara(usuario: Pick<Usuario, 'papel' | 'estado'>): Pacote[] {
  return (Object.keys(PACOTES) as Pacote[]).filter((pacote) => !('soAdm' in PACOTES[pacote]) || pode(usuario, 'ajustar_grana'));
}
export type Pacote = keyof typeof PACOTES;

/** Quanto % de MagCoin o pacote dá a mais que o pequeno pelo mesmo dinheiro (o "bônus" da vitrine). */
export function bonusDoPacote(pacote: Pacote): number {
  const base = PACOTES.pequeno.magcoins / PACOTES.pequeno.precoCentavos;
  return Math.max(0, Math.round((PACOTES[pacote].magcoins / (PACOTES[pacote].precoCentavos * base) - 1) * 100));
}

export class JaEhMembro extends Error {
  constructor() {
    super('Você já tem uma assinatura ativa. Cancele a atual para trocar de nível.');
  }
}

export class EmailInvalido extends Error {
  constructor() {
    super('Escreva o e-mail da sua conta do Mercado Pago.');
  }
}

type Enderecos = { site: string };
const centavos = (reais: number) => Math.round(reais * 100);

/** Cria o pedido e devolve o endereço da página de pagamento do Mercado Pago (PIX ou cartão). */
export async function abrirPedido(bd: Bd, mp: MercadoPago, usuario: Pick<Usuario, 'id' | 'papel' | 'estado'>, pacote: Pacote, enderecos: Enderecos): Promise<string> {
  const dados = PACOTES[pacote];
  if (!dados) throw new Error('Pacote desconhecido.');
  if (!pacotesPara(usuario).includes(pacote)) throw new SemPermissao();
  const pedido = await bd.transaction(async (tx) => {
    await exigirAtivo(tx, usuario);
    const [novo] = await tx.insert(pedidos).values({ usuarioId: usuario.id, pacote, valorCentavos: dados.precoCentavos, magcoins: dados.magcoins }).returning();
    return novo;
  });
  const preferencia = await mp.criarPreferencia({ pedidoId: pedido.id, titulo: `${dados.magcoins} MagCoins - Magnatas do CS`, valorCentavos: dados.precoCentavos, site: enderecos.site });
  return preferencia.init_point;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** O pedido que o Mercado Pago devolve na volta do pagamento, só se for dessa pessoa. */
export async function pedidoDoUsuario(bd: Bd, usuarioId: string, pedidoId: string | undefined) {
  if (!pedidoId || !UUID.test(pedidoId)) return null;
  const [pedido] = await bd
    .select()
    .from(pedidos)
    .where(and(eq(pedidos.id, pedidoId), eq(pedidos.usuarioId, usuarioId)));
  return pedido ?? null;
}

/**
 * Um aviso de pagamento: busca o pagamento na API e decide. Aprovado, com o valor do pacote e um pedido aberto, credita
 * as MagCoins (uma vez: a referência é o id do pagamento). Estornado ou contestado depois de pago, tira de volta.
 */
export async function processarPagamento(bd: Bd, mp: MercadoPago, pagamentoId: string): Promise<void> {
  const pagamento = await mp.buscarPagamento(pagamentoId);
  const referencia = pagamento.external_reference;
  if (!referencia || !/^[0-9a-f-]{36}$/i.test(referencia)) return;

  if (pagamento.status === 'approved') {
    await bd.transaction(async (tx) => {
      const [pedido] = await tx.select().from(pedidos).where(eq(pedidos.id, referencia)).for('update');
      if (!pedido || pedido.estado !== 'aberto' || centavos(pagamento.transaction_amount) !== pedido.valorCentavos) return;
      const [jaUsado] = await tx.select({ id: pedidos.id }).from(pedidos).where(eq(pedidos.mpPagamentoId, pagamento.id));
      if (jaUsado) return;
      await tx.update(pedidos).set({ estado: 'pago', mpPagamentoId: pagamento.id, pagoEm: new Date() }).where(eq(pedidos.id, pedido.id));
      await lancarMoeda(tx, {
        moeda: 'magcoin',
        usuarioId: pedido.usuarioId,
        tipo: 'pagamento',
        quantidade: pedido.magcoins,
        referencia: pagamento.id,
        detalhes: { pedidoId: pedido.id, pacote: pedido.pacote, valorCentavos: pedido.valorCentavos },
      });
      await registrarAuditoria(tx, { acao: 'magcoin_paga', alvoId: pedido.usuarioId, detalhes: { pedidoId: pedido.id, pagamento: pagamento.id, magcoins: pedido.magcoins } });
    });
    return;
  }

  if (pagamento.status === 'refunded' || pagamento.status === 'charged_back') {
    await bd.transaction(async (tx) => {
      const [pedido] = await tx.select().from(pedidos).where(and(eq(pedidos.id, referencia), eq(pedidos.mpPagamentoId, pagamento.id))).for('update');
      if (!pedido || pedido.estado !== 'pago') return;
      const [conta] = await tx.select({ magcoin: usuarios.magcoin }).from(usuarios).where(eq(usuarios.id, pedido.usuarioId)).for('update');
      const tirar = Math.min(pedido.magcoins, conta.magcoin);
      await lancarMoeda(tx, { moeda: 'magcoin', usuarioId: pedido.usuarioId, tipo: 'estorno', quantidade: -tirar, referencia: pagamento.id, detalhes: { pedidoId: pedido.id, motivo: pagamento.status } });
      await tx.update(pedidos).set({ estado: 'estornado' }).where(eq(pedidos.id, pedido.id));
      const faltou = pedido.magcoins - tirar;
      await registrarAuditoria(tx, {
        acao: faltou > 0 ? 'estorno_sem_saldo' : 'magcoin_estornada',
        alvoId: pedido.usuarioId,
        detalhes: { pedidoId: pedido.id, pagamento: pagamento.id, magcoins: pedido.magcoins, faltou },
      });
    });
  }
}

/** Cria a assinatura no Mercado Pago e devolve o endereço onde a pessoa autoriza a cobrança mensal no cartão. */
export async function assinar(bd: Bd, mp: MercadoPago, usuario: Pick<Usuario, 'id'>, nivel: NivelDeMembro, email: string, enderecos: Enderecos): Promise<string> {
  const texto = email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(texto) || texto.length > 200) throw new EmailInvalido();
  const dados = NIVEIS[nivel];
  if (!dados) throw new Error('Nível desconhecido.');
  const assinatura = await bd.transaction(async (tx) => {
    await exigirAtivo(tx, usuario);
    await tx.select({ id: usuarios.id }).from(usuarios).where(eq(usuarios.id, usuario.id)).for('update');
    const [ativa] = await tx
      .select({ id: assinaturas.id })
      .from(assinaturas)
      .where(and(eq(assinaturas.usuarioId, usuario.id), eq(assinaturas.estado, 'ativa'), gt(assinaturas.pagoAte, new Date())));
    if (ativa) throw new JaEhMembro();
    // Uma tentativa anterior que ficou sem pagar é trocada pela nova.
    await tx.update(assinaturas).set({ estado: 'cancelada', canceladaEm: new Date() }).where(and(eq(assinaturas.usuarioId, usuario.id), eq(assinaturas.estado, 'pendente')));
    const [nova] = await tx.insert(assinaturas).values({ usuarioId: usuario.id, nivel, email: texto }).returning();
    return nova;
  });
  const criada = await mp.criarAssinatura({ assinaturaId: assinatura.id, titulo: `${dados.nome} - Magnatas do CS`, valorCentavos: dados.precoCentavos, email: texto, site: enderecos.site });
  await bd.update(assinaturas).set({ mpAssinaturaId: criada.id }).where(eq(assinaturas.id, assinatura.id));
  return criada.init_point;
}

/** Aviso de uma mensalidade cobrada: conta só se o pagamento foi aprovado e o valor é o do nível. */
export async function processarMensalidade(bd: Bd, mp: MercadoPago, autorizadoId: string): Promise<void> {
  const autorizado = await mp.buscarPagamentoAutorizado(autorizadoId);
  if (!autorizado.payment || autorizado.payment.status !== 'approved') return;
  const paymentId = autorizado.payment.id;
  await bd.transaction(async (tx) => {
    const [assinatura] = await tx.select().from(assinaturas).where(eq(assinaturas.mpAssinaturaId, autorizado.preapproval_id));
    if (!assinatura || centavos(autorizado.transaction_amount) !== NIVEIS[assinatura.nivel].precoCentavos) return;
    const contou = await aplicarMensalidade(tx, {
      assinaturaId: assinatura.id,
      mpPagamentoId: paymentId,
      valorCentavos: centavos(autorizado.transaction_amount),
      pagoEm: new Date(autorizado.date_created),
    });
    if (contou) await registrarAuditoria(tx, { acao: 'mensalidade_paga', alvoId: assinatura.usuarioId, detalhes: { nivel: assinatura.nivel, pagamento: paymentId } });
  });
}

/** Aviso de mudança na assinatura (autorizada, cancelada): o estado vem da API. */
export async function processarAssinatura(bd: Bd, mp: MercadoPago, mpAssinaturaId: string): Promise<void> {
  const remota = await mp.buscarAssinatura(mpAssinaturaId);
  const [assinatura] = await bd.select().from(assinaturas).where(eq(assinaturas.mpAssinaturaId, remota.id));
  if (!assinatura || (remota.external_reference && remota.external_reference !== assinatura.id)) return;
  if (remota.status === 'cancelled' && assinatura.estado !== 'cancelada') {
    await bd.update(assinaturas).set({ estado: 'cancelada', canceladaEm: new Date() }).where(eq(assinaturas.id, assinatura.id));
  } else if (remota.status === 'authorized' && assinatura.estado === 'pendente') {
    await bd.update(assinaturas).set({ estado: 'ativa' }).where(eq(assinaturas.id, assinatura.id));
  }
}

/** Cancela no Mercado Pago a assinatura da pessoa. O que já foi pago vale até o fim. */
export async function cancelarAssinatura(bd: Bd, mp: MercadoPago, usuario: Pick<Usuario, 'id'>): Promise<boolean> {
  const [assinatura] = await bd
    .select()
    .from(assinaturas)
    .where(and(eq(assinaturas.usuarioId, usuario.id), or(eq(assinaturas.estado, 'ativa'), eq(assinaturas.estado, 'pendente'))))
    .orderBy(desc(assinaturas.criadoEm));
  if (!assinatura) return false;
  if (assinatura.mpAssinaturaId) await mp.cancelarAssinatura(assinatura.mpAssinaturaId);
  await bd.update(assinaturas).set({ estado: 'cancelada', canceladaEm: new Date() }).where(eq(assinaturas.id, assinatura.id));
  await registrarAuditoria(bd, { atorId: usuario.id, acao: 'assinatura_cancelada', alvoId: usuario.id, detalhes: { nivel: assinatura.nivel } });
  return true;
}

/** A assinatura mais recente da pessoa, para a página de apoio. */
export async function minhaAssinatura(bd: Bd, usuarioId: string) {
  const [assinatura] = await bd
    .select()
    .from(assinaturas)
    .where(and(eq(assinaturas.usuarioId, usuarioId), inArray(assinaturas.estado, ['ativa', 'cancelada', 'pendente'])))
    .orderBy(desc(assinaturas.criadoEm))
    .limit(1);
  return assinatura ?? null;
}

/**
 * Entrada dos avisos do Mercado Pago. Com a chave secreta configurada e o cabeçalho presente, a assinatura tem que
 * conferir. O aviso só diz "olhe o pagamento N": o que vale é a resposta da API.
 */
export async function receberAviso(
  bd: Bd,
  mp: MercadoPago,
  aviso: { tipo: string; dataId: string; cabecalhos: Record<string, string | undefined> },
  segredo: string | undefined,
): Promise<200 | 400 | 401> {
  const dataId = aviso.dataId.trim();
  if (!dataId || dataId.length > 100) return 400;
  const assinatura = aviso.cabecalhos['x-signature'];
  if (segredo && assinatura && !assinaturaConfere({ xSignature: assinatura, xRequestId: aviso.cabecalhos['x-request-id'] ?? '', dataId, segredo })) return 401;
  if (aviso.tipo === 'payment') await processarPagamento(bd, mp, dataId);
  else if (aviso.tipo === 'subscription_authorized_payment') await processarMensalidade(bd, mp, dataId);
  else if (aviso.tipo === 'subscription_preapproval') await processarAssinatura(bd, mp, dataId);
  return 200;
}
