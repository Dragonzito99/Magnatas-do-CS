'use client';

import { useEffect } from 'react';
import { marcarMinhaPatenteVista } from './acoes';

export function MarcarPatenteVista() {
  useEffect(() => {
    void marcarMinhaPatenteVista();
  }, []);
  return null;
}
