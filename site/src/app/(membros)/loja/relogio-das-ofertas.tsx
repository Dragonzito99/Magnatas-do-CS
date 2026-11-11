'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

const doisDigitos = (numero: number) => String(numero).padStart(2, '0');

/** Quanto falta para as ofertas trocarem (meia-noite de Brasília). Ao zerar, a página busca as ofertas novas. */
export function RelogioDasOfertas({ fim }: { fim: string }) {
  const router = useRouter();
  const [agora, setAgora] = useState<number | null>(null);

  useEffect(() => {
    const tique = () => setAgora(Date.now());
    tique();
    const intervalo = setInterval(tique, 1000);
    return () => clearInterval(intervalo);
  }, []);

  const resta = agora === null ? null : Math.max(0, Math.floor((new Date(fim).getTime() - agora) / 1000));
  useEffect(() => {
    if (resta === 0) router.refresh();
  }, [resta, router]);

  if (resta === null) return <span className="relogio-das-ofertas">trocam à meia-noite</span>;
  return (
    <span className="relogio-das-ofertas">
      trocam em {doisDigitos(Math.floor(resta / 3600))}:{doisDigitos(Math.floor((resta % 3600) / 60))}:{doisDigitos(resta % 60)}
    </span>
  );
}
