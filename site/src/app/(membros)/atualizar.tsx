'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

/** Mantém os dados da página em dia sozinha, e descansa com a aba escondida. */
export function Atualizar({ segundos }: { segundos: number }) {
  const router = useRouter();

  useEffect(() => {
    const intervalo = setInterval(() => {
      if (!document.hidden) router.refresh();
    }, segundos * 1000);
    return () => clearInterval(intervalo);
  }, [router, segundos]);

  return null;
}
