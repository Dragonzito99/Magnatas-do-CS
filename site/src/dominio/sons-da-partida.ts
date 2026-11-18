import type { Partida } from '@/bd/esquema';

// As vozes foram gravadas pelo dono (18/11/2026). O bip foi feito aqui, por síntese.
export const SOM_DA_PARTIDA_ENCONTRADA = '/sons/partida-encontrada.mp3';
export const BIP_DO_ACEITE = '/sons/bip-do-aceite.mp3';
/** Entre um bip e outro, enquanto a pessoa não aceita. */
export const INTERVALO_DO_BIP_MS = 1200;
/** O bip só começa depois da voz da partida encontrada, para não falar por cima dela. */
export const ESPERA_ANTES_DO_BIP_MS = 3800;

const VOZ_DA_ETAPA: Partial<Record<Partida['estado'], string>> = {
  vetando: '/sons/escolher-o-mapa.mp3',
  aguardando_jogadores: '/sons/entrar-no-servidor.mp3',
};

/** A voz que toca quando a partida chega a esta etapa. Quem só assiste a partida não ouve nada. */
export function vozDaEtapa(estado: Partida['estado'], jogaNaPartida: boolean): string | null {
  return jogaNaPartida ? (VOZ_DA_ETAPA[estado] ?? null) : null;
}

/** O bip repete enquanto a partida espera o aceite de quem joga nela. */
export function biparNoAceite(estado: Partida['estado'], jogaNaPartida: boolean, aceitou: boolean): boolean {
  return estado === 'aguardando_aceite' && jogaNaPartida && !aceitou;
}
