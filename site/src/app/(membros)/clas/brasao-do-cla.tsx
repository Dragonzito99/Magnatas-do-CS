import type { Cla } from '@/bd/esquema';

export type TamanhoDoBrasao = 'grande' | 'medio' | 'podio' | 'pequeno';

/** O brasão do clã: um escudo na cor dele com a sigla dentro. Aparece na capa, na busca e no ranking. */
export function BrasaoDoCla({ cla, tamanho = 'medio' }: { cla: Pick<Cla, 'sigla' | 'cor'>; tamanho?: TamanhoDoBrasao }) {
  return (
    <span className={`brasao-do-cla ${tamanho} borda-cla-${cla.cor}`} aria-hidden="true">
      <b>{cla.sigla}</b>
    </span>
  );
}
