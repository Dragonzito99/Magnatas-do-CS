import type { TipoDeGrana } from './grana';
import { itemDoCatalogo, NOME_DO_TIPO } from './loja';

type Linha = { tipo: TipoDeGrana; referencia: string; detalhes: unknown };

// Escritos aqui, e não importados de pagamentos e membros, para a tela do extrato não puxar o cliente do Mercado Pago.
const NOME_DO_PACOTE: Record<string, string> = { pequeno: 'Pacote pequeno', medio: 'Pacote médio', grande: 'Pacote grande' };
const NOME_DO_NIVEL: Record<string, string> = { bronze: 'Bronze', prata: 'Prata', ouro: 'Ouro', premium: 'Magnata Premium' };

/** O motivo de cada linha do extrato, em palavras do jogador. */
export function motivoDaLinha(linha: Linha): string {
  const detalhes = (linha.detalhes ?? {}) as { itemId?: string; dias?: number; motivo?: string; paraSempre?: boolean; pacote?: string; nivel?: string };
  if (linha.tipo === 'partida') return 'Partida';
  if (linha.tipo === 'abertura') return 'Abertura da loja: XP que você já tinha';
  if (linha.tipo === 'ajuste') return detalhes.motivo ? `Ajuste da equipe: ${detalhes.motivo}` : 'Ajuste da equipe';
  if (linha.tipo === 'pagamento') return `Compra de MagCoin: ${NOME_DO_PACOTE[detalhes.pacote ?? ''] ?? 'pacote'}`;
  if (linha.tipo === 'mensalidade') return `MagCoins do mês: ${NOME_DO_NIVEL[detalhes.nivel ?? ''] ?? 'membro'}`;
  if (linha.tipo === 'estorno') return 'Pagamento estornado';
  const prazo = detalhes.paraSempre ? 'para sempre' : detalhes.dias === 1 ? '1 dia' : `${detalhes.dias} dias`;
  const item = detalhes.itemId ? itemDoCatalogo(detalhes.itemId) : undefined;
  return item ? `Compra: ${NOME_DO_TIPO[item.tipo]} ${item.nome}, ${prazo}` : `Compra, ${prazo}`;
}
