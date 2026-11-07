'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useSyncExternalStore } from 'react';

function segundosAte(ate: number): number {
  return Math.max(0, Math.ceil((ate - Date.now()) / 1000));
}

/** Avisa quem está ouvindo a cada 250 ms, para o relógio andar sem guardar estado próprio. */
function assinarRelogio(aoMudar: () => void): () => void {
  const intervalo = setInterval(aoMudar, 250);
  return () => clearInterval(intervalo);
}

/** Conta os segundos até um prazo do servidor e recarrega a página quando ele acaba, para a tela seguir sozinha. */
export function Relogio({ ate }: { ate: string }) {
  const router = useRouter();
  const alvo = new Date(ate).getTime();
  const segundos = useSyncExternalStore(
    assinarRelogio,
    () => segundosAte(alvo),
    () => segundosAte(alvo),
  );

  useEffect(() => {
    if (segundos === 0) router.refresh();
  }, [segundos, router]);

  return (
    <span className={`relogio mono${segundos <= 5 ? ' urgente' : ''}`} aria-live="polite">
      {segundos}s
    </span>
  );
}
