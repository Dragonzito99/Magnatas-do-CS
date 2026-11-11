'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

/** Esc fecha a janela do item, como nas lojas de jogo. */
export function FecharComEsc({ para }: { para: string }) {
  const router = useRouter();
  useEffect(() => {
    const aoApertar = (evento: KeyboardEvent) => {
      if (evento.key === 'Escape') router.replace(para, { scroll: false });
    };
    window.addEventListener('keydown', aoApertar);
    return () => window.removeEventListener('keydown', aoApertar);
  }, [para, router]);
  return null;
}
