'use client';

import { useEffect } from 'react';
import { manterPresenca } from './presenca';

const SEGUNDOS_ENTRE_AVISOS = 60;

/**
 * Com a aba escondida a página para de se atualizar, mas a pessoa continua no site.
 * Fechar o navegador para os avisos, e a varredura tira a pessoa da sala depois de 5 minutos.
 */
export function ManterPresenca() {
  useEffect(() => {
    const intervalo = setInterval(() => {
      if (document.hidden) manterPresenca().catch(() => undefined);
    }, SEGUNDOS_ENTRE_AVISOS * 1000);
    return () => clearInterval(intervalo);
  }, []);

  return null;
}
