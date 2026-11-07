'use client';

import { useEffect, useSyncExternalStore, type ReactNode } from 'react';
import { useFormStatus } from 'react-dom';
import { avisarEntrada } from './acoes';

const CHAVE = 'magnatas:diversao-esperando';
/** Depois disso a espera vence: o jogo não abre sozinho horas depois de um pedido que falhou. */
const VALIDADE_DA_ESPERA_MS = 5 * 60_000;

type Espera = { servidorId: string; ate: number };

function lerEspera(): Espera | null {
  try {
    const espera = JSON.parse(sessionStorage.getItem(CHAVE) ?? 'null') as Espera | null;
    return espera && espera.ate > Date.now() ? espera : null;
  } catch {
    return null;
  }
}

function guardarEspera(servidorId: string): void {
  try {
    sessionStorage.setItem(CHAVE, JSON.stringify({ servidorId, ate: Date.now() + VALIDADE_DA_ESPERA_MS }));
    window.dispatchEvent(new Event('magnatas:espera'));
  } catch {
    // Sem sessionStorage, o jogador só não entra sozinho: o botão Entrar continua lá.
  }
}

function assinarEspera(aoMudar: () => void): () => void {
  window.addEventListener('magnatas:espera', aoMudar);
  return () => window.removeEventListener('magnatas:espera', aoMudar);
}

/** Botão do cartão desligado: guarda a espera nesta aba e manda ligar. */
export function BotaoLigar({ servidorId }: { servidorId: string }) {
  const { pending } = useFormStatus();
  return (
    <button className="botao ouro pequeno" type="submit" disabled={pending} onClick={() => guardarEspera(servidorId)}>
      {pending ? 'Ligando...' : 'Ligar e entrar'}
    </button>
  );
}

/** Para quem chegou enquanto outro ligava: entra na mesma espera. */
export function EntrarQuandoLigar({ servidorId }: { servidorId: string }) {
  const esperando = useSyncExternalStore(
    assinarEspera,
    () => lerEspera()?.servidorId === servidorId,
    () => false,
  );
  if (esperando) return <span className="etiqueta">Você entra assim que ligar</span>;
  return (
    <button className="botao cinza pequeno" type="button" onClick={() => guardarEspera(servidorId)}>
      Entrar quando ligar
    </button>
  );
}

/** Envolve Entrar e Copiar: o clique avisa o site, que segura o servidor ligado enquanto a pessoa conecta. */
export function AvisarAoEntrar({ servidorId, children }: { servidorId: string; children: ReactNode }) {
  return (
    <span className="avisar-ao-entrar" onClickCapture={() => void avisarEntrada(servidorId).catch(() => undefined)}>
      {children}
    </span>
  );
}

/** No cartão aberto: se esta aba estava esperando este servidor, abre o jogo uma vez. */
export function EsperarEEntrar({ servidorId, link }: { servidorId: string; link: string }) {
  useEffect(() => {
    if (lerEspera()?.servidorId !== servidorId) return;
    try {
      sessionStorage.removeItem(CHAVE);
    } catch {
      return;
    }
    void avisarEntrada(servidorId).catch(() => undefined);
    window.location.href = link;
  }, [servidorId, link]);
  return null;
}

function assinarRelogio(aoMudar: () => void): () => void {
  const intervalo = setInterval(aoMudar, 1000);
  return () => clearInterval(intervalo);
}

/** Tempo desde o pedido, em m:ss. No servidor e na hidratação fica em branco, sem desencontro. */
export function TempoLigando({ desde }: { desde: string }) {
  const inicio = new Date(desde).getTime();
  const segundos = useSyncExternalStore(
    assinarRelogio,
    () => Math.max(0, Math.floor((Date.now() - inicio) / 1000)),
    () => -1,
  );
  if (segundos < 0) return null;
  return (
    <span className="mono tempo-ligando">
      {Math.floor(segundos / 60)}:{String(segundos % 60).padStart(2, '0')}
    </span>
  );
}
