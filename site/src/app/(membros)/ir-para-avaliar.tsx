'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { deveIrParaAvaliar } from '@/dominio/ir-para-avaliar';

const SEGUNDOS = 15;

function jaFoiPara(destino: string): boolean {
  try {
    return sessionStorage.getItem(`ir-para-avaliar:${destino}`) === '1';
  } catch {
    return false;
  }
}

function marcarIda(destino: string): void {
  try {
    sessionStorage.setItem(`ir-para-avaliar:${destino}`, '1');
  } catch {
    // Sem guardar na aba, a ida ainda acontece; só pode repetir depois.
  }
}

/**
 * Quem terminou de jogar e saiu do servidor vai sozinho para a partida, para ver o resultado e avaliar (dono,
 * 11/11/2026). Só pergunta enquanto há algo a avaliar e com a aba à vista.
 */
export function IrParaAvaliar() {
  const router = useRouter();

  useEffect(() => {
    let parado = false;
    async function perguntar() {
      if (document.hidden) return;
      try {
        const resposta = await fetch('/api/avaliar/destino', { cache: 'no-store' });
        if (!resposta.ok || parado) return;
        const { ir } = (await resposta.json()) as { ir: string | null };
        if (!deveIrParaAvaliar(ir, location.pathname, location.search, ir ? jaFoiPara(ir) : false) || !ir) return;
        marcarIda(ir);
        router.push(ir);
      } catch {
        // Sem rede agora: tenta de novo na próxima vez.
      }
    }
    void perguntar();
    const intervalo = setInterval(perguntar, SEGUNDOS * 1000);
    return () => {
      parado = true;
      clearInterval(intervalo);
    };
  }, [router]);

  return null;
}
