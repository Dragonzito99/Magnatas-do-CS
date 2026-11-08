'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useSyncExternalStore } from 'react';
import { assinarRelogio, emMinutos, segundosAte } from './relogio';

const RAIO = 52;
const VOLTA = 2 * Math.PI * RAIO;

/** O relógio grande do aceite: o anel dourado esvazia até o prazo, e a página recarrega quando chega a zero. */
export function RelogioRedondo({ ate, totalSegundos }: { ate: string; totalSegundos: number }) {
  const router = useRouter();
  const alvo = new Date(ate).getTime();
  const segundos = useSyncExternalStore(
    assinarRelogio,
    () => segundosAte(alvo),
    () => -1,
  );

  useEffect(() => {
    if (segundos === 0) router.refresh();
  }, [segundos, router]);

  const restante = segundos < 0 ? 1 : Math.min(segundos / totalSegundos, 1);
  return (
    <div className={`relogio-redondo${segundos >= 0 && segundos <= 5 ? ' urgente' : ''}`} aria-live="polite">
      <svg viewBox="0 0 120 120" aria-hidden="true">
        <circle cx="60" cy="60" r={RAIO} className="anel-fundo" />
        <circle cx="60" cy="60" r={RAIO} className="anel" strokeDasharray={VOLTA} strokeDashoffset={VOLTA * (1 - restante)} transform="rotate(-90 60 60)" />
      </svg>
      <b className="mono">{segundos < 0 ? '…' : emMinutos(segundos)}</b>
    </div>
  );
}
