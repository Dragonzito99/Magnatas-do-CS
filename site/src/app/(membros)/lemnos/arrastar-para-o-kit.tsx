'use client';

import { createContext, useContext, useState, useTransition, type ReactNode } from 'react';
import { trocarPeca } from './acoes';

export type LugarDoKit = 'principal' | 'secundaria' | 'granada' | 'mochila';

type Arrasto = { lugar: LugarDoKit | null; mudar: (lugar: LugarDoKit | null) => void; ligado: boolean };
const ContextoDoArrasto = createContext<Arrasto>({ lugar: null, mudar: () => {}, ligado: false });

/**
 * Arrastar do baú para o kit, como num inventário de jogo (dono, 15/11/2026): enquanto um item é arrastado, só o espaço
 * certo acende; os outros apagam. Tocar no espaço continua valendo (no celular não dá para arrastar).
 */
export function AreaDoArrasto({ ligado, children }: { ligado: boolean; children: ReactNode }) {
  const [lugar, mudar] = useState<LugarDoKit | null>(null);
  return <ContextoDoArrasto.Provider value={{ lugar, mudar, ligado }}>{children}</ContextoDoArrasto.Provider>;
}

/** Um cartão do baú que pode ir para o kit. */
export function ItemQueArrasta({ lugar, itemId, className, children }: { lugar: LugarDoKit | null; itemId: string; className: string; children: ReactNode }) {
  const { mudar, ligado } = useContext(ContextoDoArrasto);
  if (!lugar || !ligado) return <div className={className}>{children}</div>;
  return (
    <div
      className={`${className} arrastavel`}
      draggable
      title="Arraste para o kit"
      onDragStart={(evento) => {
        evento.dataTransfer.setData('text/plain', JSON.stringify({ lugar, itemId }));
        evento.dataTransfer.effectAllowed = 'move';
        mudar(lugar);
      }}
      onDragEnd={() => mudar(null)}
    >
      {children}
    </div>
  );
}

/** Um espaço do kit que aceita o item certo. */
export function LugarQueRecebe({ lugar, children }: { lugar: LugarDoKit; children: ReactNode }) {
  const { lugar: arrastando, mudar } = useContext(ContextoDoArrasto);
  const [enviando, iniciar] = useTransition();
  const [emCima, setEmCima] = useState(false);
  const classes = ['lugar-do-kit', arrastando ? (arrastando === lugar ? 'aceita' : 'apagado') : '', emCima ? 'em-cima' : '', enviando ? 'trocando' : ''].filter(Boolean).join(' ');
  return (
    <div
      className={classes}
      onDragOver={(evento) => {
        if (arrastando !== lugar) return;
        evento.preventDefault();
        evento.dataTransfer.dropEffect = 'move';
        setEmCima(true);
      }}
      onDragLeave={() => setEmCima(false)}
      onDrop={(evento) => {
        evento.preventDefault();
        setEmCima(false);
        mudar(null);
        let pedido: { lugar?: string; itemId?: string } = {};
        try {
          pedido = JSON.parse(evento.dataTransfer.getData('text/plain'));
        } catch {
          return;
        }
        if (pedido.lugar !== lugar || !pedido.itemId) return;
        const dados = new FormData();
        dados.set('lugar', lugar);
        dados.set('valor', pedido.itemId);
        dados.set('acao', 'por');
        iniciar(() => trocarPeca(dados));
      }}
    >
      {children}
    </div>
  );
}
