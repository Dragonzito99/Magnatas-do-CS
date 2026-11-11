'use client';

import { useEffect } from 'react';

/** Guarda a altura do cabeçalho numa variável do CSS, para a barra de amigos começar logo embaixo dele. */
export function MedirCabecalho() {
  useEffect(() => {
    const cabecalho = document.querySelector('.cabecalho');
    if (!cabecalho) return;
    const medir = () => document.documentElement.style.setProperty('--altura-do-cabecalho', `${cabecalho.getBoundingClientRect().height}px`);
    medir();
    const observador = new ResizeObserver(medir);
    observador.observe(cabecalho);
    return () => observador.disconnect();
  }, []);
  return null;
}
