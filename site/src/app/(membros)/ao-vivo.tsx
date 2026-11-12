'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

export const EVENTO_AO_VIVO = 'magnatas:ao-vivo';

/**
 * Escuta o /api/ao-vivo e, a cada novidade, atualiza a barra de amigos, os números e a janela de conversa na hora,
 * sem F5. Várias novidades juntas viram uma atualização só.
 */
export function AoVivo() {
  const router = useRouter();

  useEffect(() => {
    let espera: ReturnType<typeof setTimeout> | undefined;
    const fonte = new EventSource('/api/ao-vivo');
    fonte.onmessage = (mensagem) => {
      try {
        window.dispatchEvent(new CustomEvent(EVENTO_AO_VIVO, { detail: JSON.parse(mensagem.data) }));
      } catch {
        // Aviso estragado: a atualização abaixo já resolve.
      }
      clearTimeout(espera);
      espera = setTimeout(() => router.refresh(), 150);
    };
    return () => {
      clearTimeout(espera);
      fonte.close();
    };
  }, [router]);

  return null;
}
