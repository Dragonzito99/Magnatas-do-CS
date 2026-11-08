'use client';

import { useState } from 'react';

export function BotaoCopiar({ texto, rotulo = 'Copiar' }: { texto: string; rotulo?: string }) {
  const [copiado, setCopiado] = useState(false);

  async function copiar() {
    await navigator.clipboard.writeText(texto);
    setCopiado(true);
    setTimeout(() => setCopiado(false), 2000);
  }

  return (
    <button type="button" className="botao cinza pequeno" onClick={copiar}>
      {copiado ? 'Copiado' : rotulo}
    </button>
  );
}
