import type { TipoDeGrana } from './grana';
import { itemDoCatalogo, NOME_DO_TIPO } from './loja';

type Linha = { tipo: TipoDeGrana; referencia: string; detalhes: unknown };

// Escritos aqui, e não importados de pagamentos e membros, para a tela do extrato não puxar o cliente do Mercado Pago.
const NOME_DO_PACOTE: Record<string, string> = { pequeno: 'Pacote pequeno', medio: 'Pacote médio', grande: 'Pacote grande' };
const NOME_DO_NIVEL: Record<string, string> = { bronze: 'Bronze', prata: 'Prata', ouro: 'Ouro', premium: 'Magnata Premium' };

/** O motivo de cada linha do extrato, em palavras do jogador. */
export function motivoDaLinha(linha: Linha): string {
  const detalhes = (linha.detalhes ?? {}) as { itemId?: string; dias?: number; motivo?: string; paraSempre?: boolean; pacote?: string; nivel?: string; nome?: string };
  if (linha.tipo === 'partida') return 'Partida';
  if (linha.tipo === 'insignia') return `Insígnia ${detalhes.nome ?? ''}`.trim();
  if (linha.tipo === 'abertura') return 'Abertura da loja: XP que você já tinha';
  if (linha.tipo === 'ajuste') return detalhes.motivo ? `Ajuste da equipe: ${detalhes.motivo}` : 'Ajuste da equipe';
  if (linha.tipo === 'pagamento') return `Compra de MagCoin: ${NOME_DO_PACOTE[detalhes.pacote ?? ''] ?? 'pacote'}`;
  if (linha.tipo === 'mensalidade') return `MagCoins do mês: ${NOME_DO_NIVEL[detalhes.nivel ?? ''] ?? 'membro'}`;
  if (linha.tipo === 'estorno') return 'Pagamento estornado';
  const prazo = detalhes.paraSempre ? 'para sempre' : detalhes.dias === 1 ? '1 dia' : `${detalhes.dias} dias`;
  const item = detalhes.itemId ? itemDoCatalogo(detalhes.itemId) : undefined;
  return item ? `Compra: ${NOME_DO_TIPO[item.tipo]} ${item.nome}, ${prazo}` : `Compra, ${prazo}`;
}

export type LinhaDescrita = { titulo: string; detalhe: string; itemId?: string };

/** A mesma linha em duas partes, para a lista de Minhas compras: o nome em destaque e o detalhe embaixo. */
export function descreverLinha(linha: Linha): LinhaDescrita {
  const detalhes = (linha.detalhes ?? {}) as { itemId?: string; dias?: number; motivo?: string; paraSempre?: boolean; pacote?: string; nivel?: string; desconto?: number; nome?: string };
  if (linha.tipo === 'partida') return { titulo: 'Partida', detalhe: 'Grana pelo XP da partida' };
  if (linha.tipo === 'abertura') return { titulo: 'Abertura da loja', detalhe: 'XP que você já tinha' };
  if (linha.tipo === 'ajuste') return { titulo: 'Ajuste da equipe', detalhe: detalhes.motivo ?? '' };
  if (linha.tipo === 'pagamento') return { titulo: 'Compra de MagCoin', detalhe: NOME_DO_PACOTE[detalhes.pacote ?? ''] ?? 'Pacote' };
  if (linha.tipo === 'mensalidade') return { titulo: 'MagCoins do mês', detalhe: NOME_DO_NIVEL[detalhes.nivel ?? ''] ?? 'Membro' };
  if (linha.tipo === 'estorno') return { titulo: 'Pagamento estornado', detalhe: '' };
  if (linha.tipo === 'insignia') return { titulo: 'Insígnia', detalhe: detalhes.nome ?? '' };
  const prazo = detalhes.paraSempre ? 'para sempre' : detalhes.dias === 1 ? '1 dia' : `${detalhes.dias} dias`;
  const item = detalhes.itemId ? itemDoCatalogo(detalhes.itemId) : undefined;
  if (!item) return { titulo: 'Compra', detalhe: prazo };
  const partes = [NOME_DO_TIPO[item.tipo], prazo, ...(detalhes.desconto ? [`oferta -${detalhes.desconto}%`] : [])];
  return { titulo: item.nome, detalhe: partes.join(' · '), itemId: item.id };
}
