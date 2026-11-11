'use client';

import { useEffect, useState, type ReactNode } from 'react';

const SEGUNDOS_POR_DESTAQUE = 6;

/** Os lançamentos da Magnata Shop passam sozinhos no destaque, como as notícias da Início (dono, 11/11/2026). */
export function DestaquesDaShop({ destaques, nomes }: { destaques: ReactNode[]; nomes: string[] }) {
  const [atual, setAtual] = useState(0);

  useEffect(() => {
    if (destaques.length < 2) return;
    const relogio = setInterval(() => setAtual((indice) => (indice + 1) % destaques.length), SEGUNDOS_POR_DESTAQUE * 1000);
    return () => clearInterval(relogio);
  }, [destaques.length, atual]);

  return (
    <div className="carrossel-da-shop">
      {destaques[atual] ?? destaques[0]}
      {destaques.length > 1 && (
        <div className="pontos-do-carrossel">
          {nomes.map((nome, indice) => (
            <button
              key={nome}
              type="button"
              className={indice === atual ? 'ponto ativo' : 'ponto'}
              aria-label={`Mostrar ${nome}`}
              aria-current={indice === atual ? 'true' : undefined}
              onClick={() => setAtual(indice)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
