'use client';

import { useEffect, useState } from 'react';

const GIRO_MS = 1800;

/** A moeda gira uma vez e para no time que veta primeiro. O resultado já veio do servidor; aqui é só o show. */
export function CaraOuCoroa({ vencedor, nomes }: { vencedor: 1 | 2; nomes: { 1: string; 2: string } }) {
  const [girando, setGirando] = useState(true);

  useEffect(() => {
    const parar = setTimeout(() => setGirando(false), GIRO_MS);
    return () => clearTimeout(parar);
  }, []);

  return (
    <div className="cara-ou-coroa" aria-live="polite">
      <span className={`moeda${girando ? ' girando' : ''} lado-${vencedor}`} aria-hidden="true">
        {girando ? '' : vencedor}
      </span>
      <span>{girando ? 'Cara ou coroa...' : `Começa: ${nomes[vencedor]}`}</span>
    </div>
  );
}
