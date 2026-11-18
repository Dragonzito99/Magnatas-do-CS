'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useSyncExternalStore } from 'react';
import { SOM_DA_PARTIDA_ENCONTRADA } from '@/dominio/sons-da-partida';

const TITULO_DO_AVISO = 'Partida encontrada!';
const CORPO_DO_AVISO = 'Você tem 30 segundos para aceitar.';
const PISCADA_MS = 900;
const CHAVE_DOS_AVISADOS = 'magnatas:partidas-avisadas';

/** A conexão cai e volta sozinha, e o servidor reenvia a partida pendente: cada partida só avisa uma vez por aba. */
function jaAvisou(partidaId: string): boolean {
  try {
    const avisadas: string[] = JSON.parse(sessionStorage.getItem(CHAVE_DOS_AVISADOS) ?? '[]');
    if (avisadas.includes(partidaId)) return true;
    sessionStorage.setItem(CHAVE_DOS_AVISADOS, JSON.stringify([...avisadas.slice(-19), partidaId]));
    return false;
  } catch {
    return false;
  }
}

function podeNotificar(): boolean {
  return typeof Notification !== 'undefined';
}

/** A permissão só muda quando a pessoa responde ao pedido; quem pediu avisa os ouvintes. */
const ouvintesDaPermissao = new Set<() => void>();
function assinarPermissao(aoMudar: () => void): () => void {
  ouvintesDaPermissao.add(aoMudar);
  return () => ouvintesDaPermissao.delete(aoMudar);
}
const permissaoAtual = () => (podeNotificar() ? Notification.permission : 'denied');
const permissaoNoServidor = () => 'denied' as NotificationPermission;

/**
 * Mantém uma conexão aberta com o site e, quando uma partida aparece, avisa mesmo com a aba escondida:
 * som, notificação do sistema e título piscando. Com a aba visível, vai direto para a partida.
 */
export function AvisoDePartida() {
  const router = useRouter();
  const permissao = useSyncExternalStore(assinarPermissao, permissaoAtual, permissaoNoServidor);

  useEffect(() => {
    const fonte = new EventSource('/api/avisos');
    let piscando: ReturnType<typeof setInterval> | undefined;
    const tituloOriginal = document.title;

    const pararDePiscar = () => {
      if (!piscando) return;
      clearInterval(piscando);
      piscando = undefined;
      document.title = tituloOriginal;
    };
    const aoFicarVisivel = () => {
      if (!document.hidden) pararDePiscar();
    };
    document.addEventListener('visibilitychange', aoFicarVisivel);

    fonte.addEventListener('partida', (evento) => {
      const { partidaId } = JSON.parse((evento as MessageEvent<string>).data) as { partidaId: string };
      if (jaAvisou(partidaId)) return;
      const destino = `/partidas/${partidaId}`;
      // O navegador só toca som depois de a pessoa ter mexido na página; se recusar, segue sem som.
      new Audio(SOM_DA_PARTIDA_ENCONTRADA).play().catch(() => undefined);
      if (!document.hidden) {
        router.push(destino);
        return;
      }
      if (podeNotificar() && Notification.permission === 'granted') {
        const aviso = new Notification(TITULO_DO_AVISO, { body: CORPO_DO_AVISO, tag: partidaId });
        aviso.onclick = () => {
          window.focus();
          router.push(destino);
          aviso.close();
        };
      }
      pararDePiscar();
      let mostrandoAviso = false;
      piscando = setInterval(() => {
        mostrandoAviso = !mostrandoAviso;
        document.title = mostrandoAviso ? TITULO_DO_AVISO : tituloOriginal;
      }, PISCADA_MS);
      router.push(destino);
    });

    return () => {
      fonte.close();
      document.removeEventListener('visibilitychange', aoFicarVisivel);
      pararDePiscar();
    };
  }, [router]);

  if (permissao !== 'default') return null;
  return (
    <button
      type="button"
      className="botao cinza pequeno ativar-avisos"
      onClick={() => {
        Notification.requestPermission().finally(() => ouvintesDaPermissao.forEach((avisar) => avisar()));
      }}
    >
      Ativar avisos de partida
    </button>
  );
}
