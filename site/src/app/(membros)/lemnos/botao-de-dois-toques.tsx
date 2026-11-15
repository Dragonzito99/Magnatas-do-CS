'use client';

import { useEffect, useState } from 'react';
import { useFormStatus } from 'react-dom';

/**
 * Botão que confirma no próprio botão, sem a caixa do navegador: o primeiro toque pergunta ("Tem certeza?"), o segundo
 * envia. Volta ao normal sozinho depois de alguns segundos.
 */
export function BotaoDeDoisToques({ className, pergunta, children }: { className: string; pergunta: string; children: React.ReactNode }) {
  const [perguntando, setPerguntando] = useState(false);
  const { pending } = useFormStatus();
  useEffect(() => {
    if (!perguntando) return;
    const espera = setTimeout(() => setPerguntando(false), 4000);
    return () => clearTimeout(espera);
  }, [perguntando]);
  if (pending)
    return (
      <button type="button" className={className} disabled>
        Vendendo...
      </button>
    );
  if (perguntando)
    return (
      <button type="submit" className={`${className} perguntando`}>
        {pergunta}
      </button>
    );
  return (
    <button type="button" className={className} onClick={() => setPerguntando(true)}>
      {children}
    </button>
  );
}
