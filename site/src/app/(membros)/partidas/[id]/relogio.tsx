'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useSyncExternalStore } from 'react';

export function segundosAte(ate: number): number {
  return Math.max(0, Math.ceil((ate - Date.now()) / 1000));
}

/** 583 vira 9:43, para prazos de vários minutos. */
export function emMinutos(segundos: number): string {
  return `${Math.floor(segundos / 60)}:${String(segundos % 60).padStart(2, '0')}`;
}

/** Avisa quem está ouvindo a cada 250 ms, para o relógio andar sem guardar estado próprio. */
export function assinarRelogio(aoMudar: () => void): () => void {
  const intervalo = setInterval(aoMudar, 250);
  return () => clearInterval(intervalo);
}

/** Conta os segundos até um prazo do servidor e recarrega a página quando ele acaba, para a tela seguir sozinha. */
export function Relogio({ ate, minutos = false }: { ate: string; minutos?: boolean }) {
  const router = useRouter();
  const alvo = new Date(ate).getTime();
  // No servidor (e na hidratação) o valor é um marcador fixo: o número só aparece no navegador, sem desencontro.
  const segundos = useSyncExternalStore(
    assinarRelogio,
    () => segundosAte(alvo),
    () => -1,
  );

  useEffect(() => {
    if (segundos === 0) router.refresh();
  }, [segundos, router]);

  if (segundos < 0) return <span className="relogio mono">…</span>;
  return (
    <span className={`relogio mono${segundos <= 5 ? ' urgente' : ''}`} aria-live="polite">
      {minutos ? emMinutos(segundos) : `${segundos}s`}
    </span>
  );
}
