'use client';

import { useEffect } from 'react';
import { marcarMinhasInsigniasVistas } from './acoes';

export function MarcarInsigniasVistas() {
  useEffect(() => {
    void marcarMinhasInsigniasVistas();
  }, []);
  return null;
}
