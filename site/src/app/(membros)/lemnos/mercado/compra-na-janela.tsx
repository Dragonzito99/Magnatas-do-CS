'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useFormStatus } from 'react-dom';
import { Preco } from '../../loja/preco-da-shop';

export type OpcaoDeCompra = {
  /** O que vai no campo do formulário: a quantidade, os dias ou "sempre". */
  valor: string;
  rotulo: string;
  preco: number;
  /** A frase do botão grande, como "Comprar 1× FAMAS por 45 Grana". */
  frase: string;
  /** Quanto falta, se não dá para comprar agora. */
  falta: number;
  largo?: boolean;
};

export type GrupoDeCompra = {
  titulo: string;
  moeda: 'grana' | 'magcoin';
  acao: (dados: FormData) => Promise<void>;
  campo: 'quantidade' | 'dias';
  opcoes: OpcaoDeCompra[];
};

function BotaoDeComprar({ frase }: { frase: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="comprar-da-janela" disabled={pending}>
      {pending ? 'Comprando...' : frase}
    </button>
  );
}

/**
 * A compra dentro da janela do item, como nas lojas de jogo: toca na opção, ela fica marcada, e o botão grande embaixo
 * diz exatamente o que vai ser comprado. Sem a caixa de confirmação do navegador.
 */
export function CompraNaJanela({ grupos, escondidos }: { grupos: GrupoDeCompra[]; escondidos: Record<string, string> }) {
  const [escolhida, setEscolhida] = useState<{ grupo: number; opcao: number } | null>(null);
  const grupo = escolhida ? grupos[escolhida.grupo] : null;
  const opcao = grupo && escolhida ? grupo.opcoes[escolhida.opcao] : null;

  return (
    <div className="compra-na-janela">
      {grupos.map((cada, indiceDoGrupo) => {
        const faltaMagcoin = cada.moeda === 'magcoin' && cada.opcoes.some((item) => item.falta > 0);
        const normais = cada.opcoes.map((item, indice) => ({ item, indice })).filter(({ item }) => !item.largo);
        const largas = cada.opcoes.map((item, indice) => ({ item, indice })).filter(({ item }) => item.largo);
        const botao = ({ item, indice }: { item: OpcaoDeCompra; indice: number }) => {
          const marcada = escolhida?.grupo === indiceDoGrupo && escolhida.opcao === indice;
          const classes = [item.largo ? 'para-sempre-da-janela' : 'dia-da-janela', marcada ? 'escolhido' : '', item.falta > 0 ? 'sem-saldo' : ''].filter(Boolean).join(' ');
          return (
            <button
              key={item.valor}
              type="button"
              className={classes}
              disabled={item.falta > 0}
              aria-pressed={marcada}
              title={item.falta > 0 ? `Faltam ${item.falta} ${cada.moeda === 'grana' ? 'Grana' : 'MagCoins'}` : undefined}
              onClick={() => setEscolhida({ grupo: indiceDoGrupo, opcao: indice })}
            >
              <span>{item.rotulo}</span>
              <Preco valor={item.preco} moeda={cada.moeda} />
            </button>
          );
        };
        return (
          <div key={cada.titulo} className="grupo-da-compra">
            <span className="rotulo-da-janela">{cada.titulo}</span>
            {normais.length > 0 && <div className="dias-da-janela">{normais.map(botao)}</div>}
            {largas.map(botao)}
            {faltaMagcoin && (
              <Link href="/apoio" className="falta-da-janela">
                Sem MagCoins suficientes? Comprar MagCoin
              </Link>
            )}
          </div>
        );
      })}

      {grupo && opcao ? (
        <form action={grupo.acao} className="confirmar-da-janela">
          {Object.entries(escondidos).map(([nome, valor]) => (
            <input key={nome} type="hidden" name={nome} value={valor} />
          ))}
          <input type="hidden" name={grupo.campo} value={opcao.valor} />
          <BotaoDeComprar frase={opcao.frase} />
        </form>
      ) : (
        <p className="escolha-uma-opcao">Escolha uma opção acima.</p>
      )}
    </div>
  );
}
