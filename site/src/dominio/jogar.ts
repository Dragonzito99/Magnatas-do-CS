import { MODOS_DE_DIVERSAO, type ModoDeDiversao } from './diversao';

export type FiltroDoJogar = 'competitivo' | 'mix' | ModoDeDiversao;

// Na ordem que o dono pediu: primeiro o que é 5 contra 5, depois os modos da Diversão.
export const FILTROS_DO_JOGAR: { valor: FiltroDoJogar | null; nome: string }[] = [
  { valor: null, nome: 'Todos' },
  { valor: 'competitivo', nome: 'Competitivo' },
  { valor: 'mix', nome: 'Mix' },
  ...(['cada_um', 'equipe', 'fantasma', 'mutacao'] as const).map((valor) => ({
    valor,
    nome: MODOS_DE_DIVERSAO.find((modo) => modo.valor === valor)?.nome ?? valor,
  })),
];

export function lerFiltroDoJogar(texto: string | undefined): FiltroDoJogar | null {
  return FILTROS_DO_JOGAR.find((filtro) => filtro.valor !== null && filtro.valor === texto)?.valor ?? null;
}

export function mostraNoFiltro(filtro: FiltroDoJogar | null, tipo: FiltroDoJogar): boolean {
  return filtro === null || filtro === tipo;
}
