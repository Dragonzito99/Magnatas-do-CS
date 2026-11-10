'use client';

import { useEffect, useState } from 'react';

type Evolucao = { nivel: number; nome: string; imagem: string; escudo: number };

const SEGUNDOS_EM_CADA = 3.5;

/** As evoluções do mutante andando, uma depois da outra. Clicar num nível para nele; o giro volta sozinho depois. */
export function EvolucoesDoMutante({ evolucoes }: { evolucoes: Evolucao[] }) {
  const [atual, setAtual] = useState(0);
  const [parado, setParado] = useState(false);

  useEffect(() => {
    if (parado) {
      const voltar = setTimeout(() => setParado(false), SEGUNDOS_EM_CADA * 3 * 1000);
      return () => clearTimeout(voltar);
    }
    const giro = setInterval(() => setAtual((indice) => (indice + 1) % evolucoes.length), SEGUNDOS_EM_CADA * 1000);
    return () => clearInterval(giro);
  }, [parado, evolucoes.length]);

  const evolucao = evolucoes[atual];
  return (
    <div className="evolucoes-do-mutante">
      <div className="palco-das-evolucoes">
        {evolucoes.map((item, indice) => (
          // eslint-disable-next-line @next/next/no-img-element
          <img key={item.nivel} src={item.imagem} alt={`Nível ${item.nivel}: ${item.nome}`} className={indice === atual ? 'evolucao ativa' : 'evolucao'} />
        ))}
      </div>
      <p className="legenda-da-evolucao">
        <b>Nível {evolucao.nivel}</b> · {evolucao.nome} · escudo de {evolucao.escudo} s
      </p>
      <div className="niveis-da-evolucao" role="group" aria-label="Escolher o nível">
        {evolucoes.map((item, indice) => (
          <button
            key={item.nivel}
            type="button"
            className={indice === atual ? 'nivel-da-evolucao ativo' : 'nivel-da-evolucao'}
            aria-pressed={indice === atual}
            onClick={() => {
              setAtual(indice);
              setParado(true);
            }}
          >
            {item.nivel}
          </button>
        ))}
      </div>
    </div>
  );
}
