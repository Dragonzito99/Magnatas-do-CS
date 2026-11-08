import Link from 'next/link';
import type { Cla } from '@/bd/esquema';

/** A sigla do clã na cor dele, como [MGN]. Com link, leva para a página do clã. */
export function SiglaDoCla({ cla, link = false }: { cla: Pick<Cla, 'id' | 'sigla' | 'cor'>; link?: boolean }) {
  const sigla = <span className={`sigla-cla cor-cla-${cla.cor}`}>[{cla.sigla}]</span>;
  if (!link) return sigla;
  return (
    <Link href={`/clas/${cla.id}`} className="link-da-sigla">
      {sigla}
    </Link>
  );
}
