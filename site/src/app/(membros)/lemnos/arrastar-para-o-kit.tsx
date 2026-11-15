'use client';

import { useRouter } from 'next/navigation';
import { createContext, useCallback, useContext, useEffect, useState, useTransition, type ReactNode } from 'react';
import { mexerNoKit } from './acoes';

export type LugarDoKit = 'principal' | 'secundaria' | 'granada' | 'mochila';

const ERROS: Record<string, string> = {
  'em-campo': 'Você está na ilha agora. Saia do servidor para trocar o kit.',
  item: 'Não deu: confira se você tem esse item e se cabe no espaço.',
  conta: 'Sua conta não pode trocar o kit agora.',
};

type Arrasto = {
  lugar: LugarDoKit | null;
  mudar: (lugar: LugarDoKit | null) => void;
  ligado: boolean;
  mexer: (campos: Record<string, string>, depois?: () => void) => void;
  mexendo: boolean;
};
const ContextoDoArrasto = createContext<Arrasto>({ lugar: null, mudar: () => {}, ligado: false, mexer: () => {}, mexendo: false });

/**
 * O kit se troca no lugar, sem recarregar a página nem voltar para o topo (dono, 15/11/2026): arrastando do baú (só o
 * espaço certo acende), pela janela de escolher ou tirando uma granada. Um aviso pequeno no rodapé diz se deu certo.
 */
export function AreaDoArrasto({ ligado, children }: { ligado: boolean; children: ReactNode }) {
  const [lugar, mudar] = useState<LugarDoKit | null>(null);
  const [aviso, setAviso] = useState<{ texto: string; bom: boolean } | null>(null);
  const [mexendo, iniciar] = useTransition();
  const roteador = useRouter();

  useEffect(() => {
    if (!aviso) return;
    const espera = setTimeout(() => setAviso(null), 2500);
    return () => clearTimeout(espera);
  }, [aviso]);

  const mexer = useCallback(
    (campos: Record<string, string>, depois?: () => void) => {
      const dados = new FormData();
      for (const [nome, valor] of Object.entries(campos)) dados.set(nome, valor);
      iniciar(async () => {
        const resposta = await mexerNoKit(dados);
        setAviso(resposta.ok ? { texto: 'Kit salvo', bom: true } : { texto: ERROS[resposta.erro] ?? 'Não deu certo.', bom: false });
        depois?.();
        roteador.refresh();
      });
    },
    [roteador],
  );

  return (
    <ContextoDoArrasto.Provider value={{ lugar, mudar, ligado, mexer, mexendo }}>
      {children}
      {aviso && (
        <p role="status" className={aviso.bom ? 'aviso-do-kit' : 'aviso-do-kit ruim'}>
          {aviso.texto}
        </p>
      )}
    </ContextoDoArrasto.Provider>
  );
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
  const { lugar: arrastando, mudar, mexer, mexendo } = useContext(ContextoDoArrasto);
  const [emCima, setEmCima] = useState(false);
  const classes = ['lugar-do-kit', arrastando ? (arrastando === lugar ? 'aceita' : 'apagado') : '', emCima ? 'em-cima' : '', mexendo ? 'trocando' : ''].filter(Boolean).join(' ');
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
        mexer({ lugar, valor: pedido.itemId, acao: 'por' });
      }}
    >
      {children}
    </div>
  );
}

/**
 * Um botão que troca o kit sem recarregar: escolher na janela (que fecha sem voltar ao topo) ou tirar uma granada.
 */
export function BotaoDoKit({
  campos,
  fecharJanela = false,
  className,
  rotulo,
  disabled = false,
  children,
}: {
  campos: Record<string, string>;
  fecharJanela?: boolean;
  className?: string;
  rotulo?: string;
  disabled?: boolean;
  children: ReactNode;
}) {
  const { mexer, mexendo } = useContext(ContextoDoArrasto);
  const roteador = useRouter();
  return (
    <button
      type="button"
      className={className}
      aria-label={rotulo}
      title={rotulo}
      disabled={disabled || mexendo}
      onClick={() => mexer(campos, fecharJanela ? () => roteador.replace('/lemnos', { scroll: false }) : undefined)}
    >
      {children}
    </button>
  );
}
