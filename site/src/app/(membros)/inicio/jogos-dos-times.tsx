'use client';

import { useEffect, useState } from 'react';
import type { SlideDeJogo } from '@/dominio/cartoes-de-noticias';

const SEGUNDOS_POR_JOGO = 6;

/** O cartão Times BR da Início: as logos dos dois times e, com mais de um jogo, um depois do outro (dono, 11/11/2026). */
export function JogosDosTimes({ jogos }: { jogos: SlideDeJogo[] }) {
  const [atual, setAtual] = useState(0);

  useEffect(() => {
    if (jogos.length < 2) return;
    const relogio = setInterval(() => setAtual((indice) => (indice + 1) % jogos.length), SEGUNDOS_POR_JOGO * 1000);
    return () => clearInterval(relogio);
  }, [jogos.length, atual]);

  const jogo = jogos[atual] ?? jogos[0];
  if (!jogo) return null;

  return (
    <div className="carrossel-dos-times">
      <a key={jogo.href + jogo.titulo} href={jogo.href} target="_blank" rel="noreferrer" className="cartao-destaque pequeno jogo-dos-times">
        <span className="logos-do-jogo" aria-hidden="true">
          <Logo time={jogo.time1} />
          <span className="x-do-confronto">x</span>
          <Logo time={jogo.time2} />
        </span>
        <span className="selo-modo verde">Times BR</span>
        <h3>{jogo.titulo}</h3>
        <p>{jogo.legenda}</p>
      </a>
      {jogos.length > 1 && (
        <div className="pontos-do-carrossel">
          {jogos.map((item, indice) => (
            <button
              key={item.href + item.titulo}
              type="button"
              className={indice === atual ? 'ponto ativo' : 'ponto'}
              aria-label={`Mostrar ${item.titulo}`}
              aria-current={indice === atual ? 'true' : undefined}
              onClick={() => setAtual(indice)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function Logo({ time }: { time: SlideDeJogo['time1'] }) {
  if (!time.logo) return <span className="sigla-do-time">{time.nome}</span>;
  // eslint-disable-next-line @next/next/no-img-element
  return <img className="logo-do-time" src={time.logo} alt="" width={52} height={52} />;
}
