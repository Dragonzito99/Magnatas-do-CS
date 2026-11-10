import type { TipoDeGrana } from './grana';
import { itemDoCatalogo, NOME_DO_TIPO } from './loja';

type Linha = { tipo: TipoDeGrana; referencia: string; detalhes: unknown };

/** O motivo de cada linha do extrato, em palavras do jogador. */
export function motivoDaLinha(linha: Linha): string {
  const detalhes = (linha.detalhes ?? {}) as { itemId?: string; dias?: number; motivo?: string };
  if (linha.tipo === 'partida') return 'Partida';
  if (linha.tipo === 'abertura') return 'Abertura da loja: XP que você já tinha';
  if (linha.tipo === 'ajuste') return detalhes.motivo ? `Ajuste da equipe: ${detalhes.motivo}` : 'Ajuste da equipe';
  const dias = detalhes.dias === 1 ? '1 dia' : `${detalhes.dias} dias`;
  const item = detalhes.itemId ? itemDoCatalogo(detalhes.itemId) : undefined;
  return item ? `Compra: ${NOME_DO_TIPO[item.tipo]} ${item.nome}, ${dias}` : `Compra, ${dias}`;
}
