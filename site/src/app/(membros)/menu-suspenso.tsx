'use client';

import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';

/** Abre ao clicar e fecha ao trocar de página, ao clicar fora ou com Esc. */
export function MenuSuspenso({
  rotulo,
  titulo,
  classe,
  children,
}: {
  rotulo: React.ReactNode;
  titulo: string;
  classe: string;
  children: React.ReactNode;
}) {
  const caminho = usePathname();
  // Guardar o caminho em que abriu fecha o menu sozinho quando a página muda.
  const [abertoEm, setAbertoEm] = useState<string | null>(null);
  const aberto = abertoEm === caminho;
  const raiz = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!aberto) return;
    const aoClicar = (evento: PointerEvent) => {
      if (!raiz.current?.contains(evento.target as Node)) setAbertoEm(null);
    };
    const aoTeclar = (evento: KeyboardEvent) => {
      if (evento.key === 'Escape') setAbertoEm(null);
    };
    document.addEventListener('pointerdown', aoClicar);
    document.addEventListener('keydown', aoTeclar);
    return () => {
      document.removeEventListener('pointerdown', aoClicar);
      document.removeEventListener('keydown', aoTeclar);
    };
  }, [aberto]);

  return (
    <div className="menu-suspenso" ref={raiz}>
      <button
        type="button"
        className={classe}
        aria-expanded={aberto}
        aria-label={titulo}
        onClick={() => setAbertoEm(aberto ? null : caminho)}
      >
        {rotulo}
      </button>
      {aberto && (
        <div
          className="suspenso"
          onClick={(evento) => {
            // Link para a página atual não muda o caminho, então fecha aqui.
            if ((evento.target as Element).closest('a')) setAbertoEm(null);
          }}
        >
          {children}
        </div>
      )}
    </div>
  );
}
