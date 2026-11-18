'use client';

import { useEffect } from 'react';
import type { Partida } from '@/bd/esquema';
import { BIP_DO_ACEITE, biparNoAceite, ESPERA_ANTES_DO_BIP_MS, INTERVALO_DO_BIP_MS, vozDaEtapa } from '@/dominio/sons-da-partida';

const CHAVE_DAS_ETAPAS = 'magnatas:etapas-com-som';

/** A página se atualiza a cada 3 segundos: cada etapa só fala uma vez por aba. */
function jaFalou(etapa: string): boolean {
  try {
    const faladas: string[] = JSON.parse(sessionStorage.getItem(CHAVE_DAS_ETAPAS) ?? '[]');
    if (faladas.includes(etapa)) return true;
    sessionStorage.setItem(CHAVE_DAS_ETAPAS, JSON.stringify([...faladas.slice(-39), etapa]));
    return false;
  } catch {
    return false;
  }
}

// O navegador só toca som depois de a pessoa ter mexido na página; se recusar, segue sem som.
const tocar = (som: string) => void new Audio(som).play().catch(() => undefined);

/** Os sons das etapas (pedido do dono, 18/11/2026): a voz de cada etapa e o bip até a pessoa aceitar. */
export function SonsDaPartida({ partidaId, estado, jogaNaPartida, aceitou }: { partidaId: string; estado: Partida['estado']; jogaNaPartida: boolean; aceitou: boolean }) {
  useEffect(() => {
    const voz = vozDaEtapa(estado, jogaNaPartida);
    if (voz && !jaFalou(`${partidaId}:${estado}`)) tocar(voz);
  }, [partidaId, estado, jogaNaPartida]);

  const bipar = biparNoAceite(estado, jogaNaPartida, aceitou);
  useEffect(() => {
    if (!bipar) return;
    let repeticao: ReturnType<typeof setInterval> | undefined;
    const inicio = setTimeout(() => {
      tocar(BIP_DO_ACEITE);
      repeticao = setInterval(() => tocar(BIP_DO_ACEITE), INTERVALO_DO_BIP_MS);
    }, ESPERA_ANTES_DO_BIP_MS);
    return () => {
      clearTimeout(inicio);
      clearInterval(repeticao);
    };
  }, [bipar]);

  return null;
}
