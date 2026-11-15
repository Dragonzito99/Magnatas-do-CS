import type { DiasAVenda } from '@/dominio/loja';

/*
 * Catálogo da Ilha Lemnos. PROPOSTA de 15/11/2026: os preços só valem depois do OK do dono.
 * As armas são as do CS2, sem visual próprio (dono). Com grana, cada arma é de uso único; com Magcoin, por dias ou para
 * sempre, e volta ao baú quando o jogador morre.
 */

export type ArmaLemnos = {
  id: string;
  nome: string;
  classe: string;
  lugar: 'principal' | 'secundaria';
  precoGrana: number;
  precoMagcoinDias: Record<DiasAVenda, number>;
  precoMagcoinSempre: number;
};
export type GranadaLemnos = { id: string; nome: string; classe: string; precoGrana: number };
export type MochilaLemnos = { id: string; nome: string; espacos: number; precoGranaDias: Record<DiasAVenda, number> | null; precoMagcoinSempre: number | null };
export type SaqueLemnos = { id: string; nome: string; raridade: 'comum' | 'raro' | 'lendario' | 'dinheiro'; valor: number };

const PISTOLA = { lugar: 'secundaria', precoGrana: 10, precoMagcoinDias: { 1: 5, 3: 12, 5: 18, 9: 28 }, precoMagcoinSempre: 120 } as const;
const SMG = { lugar: 'principal', precoGrana: 25, precoMagcoinDias: { 1: 10, 3: 25, 5: 38, 9: 60 }, precoMagcoinSempre: 220 } as const;
const RIFLE = { lugar: 'principal', precoGrana: 45, precoMagcoinDias: { 1: 15, 3: 35, 5: 55, 9: 85 }, precoMagcoinSempre: 300 } as const;

const arma = (id: string, nome: string, faixa: Omit<ArmaLemnos, 'id' | 'nome' | 'classe'>): ArmaLemnos => ({ id, nome, classe: `weapon_${id}`, ...faixa });

export const ARMAS: readonly ArmaLemnos[] = [
  arma('glock', 'Glock-18', PISTOLA),
  arma('usp_silencer', 'USP-S', PISTOLA),
  arma('p250', 'P250', PISTOLA),
  arma('deagle', 'Desert Eagle', { lugar: 'secundaria', precoGrana: 20, precoMagcoinDias: { 1: 8, 3: 20, 5: 30, 9: 45 }, precoMagcoinSempre: 180 }),
  arma('mp9', 'MP9', SMG),
  arma('mac10', 'MAC-10', SMG),
  arma('ump45', 'UMP-45', SMG),
  arma('ak47', 'AK-47', RIFLE),
  arma('m4a1', 'M4A4', RIFLE),
  arma('m4a1_silencer', 'M4A1-S', RIFLE),
  arma('galilar', 'Galil AR', RIFLE),
  arma('famas', 'FAMAS', RIFLE),
  arma('awp', 'AWP', { lugar: 'principal', precoGrana: 90, precoMagcoinDias: { 1: 20, 3: 50, 5: 75, 9: 110 }, precoMagcoinSempre: 400 }),
];

export const GRANADAS: readonly GranadaLemnos[] = [
  { id: 'hegrenade', nome: 'Granada', classe: 'weapon_hegrenade', precoGrana: 8 },
  { id: 'flashbang', nome: 'Flash', classe: 'weapon_flashbang', precoGrana: 4 },
  { id: 'smokegrenade', nome: 'Fumaça', classe: 'weapon_smokegrenade', precoGrana: 4 },
  { id: 'molotov', nome: 'Molotov', classe: 'weapon_molotov', precoGrana: 10 },
];

export const MOCHILA_BASICA = 'basica';

export const MOCHILAS: readonly MochilaLemnos[] = [
  { id: MOCHILA_BASICA, nome: 'Mochila básica', espacos: 8, precoGranaDias: null, precoMagcoinSempre: null },
  { id: 'media', nome: 'Mochila média', espacos: 12, precoGranaDias: { 1: 40, 3: 100, 5: 150, 9: 240 }, precoMagcoinSempre: 120 },
  { id: 'grande', nome: 'Mochila grande', espacos: 16, precoGranaDias: { 1: 70, 3: 180, 5: 270, 9: 430 }, precoMagcoinSempre: 200 },
  { id: 'tatica', nome: 'Mochila tática', espacos: 20, precoGranaDias: { 1: 100, 3: 250, 5: 380, 9: 600 }, precoMagcoinSempre: 300 },
];

export const SAQUES: readonly SaqueLemnos[] = [
  { id: 'relogio', nome: 'Relógio', raridade: 'comum', valor: 3 },
  { id: 'celular', nome: 'Celular', raridade: 'comum', valor: 5 },
  { id: 'radio', nome: 'Rádio', raridade: 'comum', valor: 4 },
  { id: 'joias', nome: 'Joias', raridade: 'raro', valor: 20 },
  { id: 'notebook', nome: 'Notebook', raridade: 'raro', valor: 25 },
  { id: 'documentos', nome: 'Documentos', raridade: 'raro', valor: 15 },
  { id: 'barra_de_ouro', nome: 'Barra de ouro', raridade: 'lendario', valor: 100 },
  { id: 'maleta_de_diamantes', nome: 'Maleta de diamantes', raridade: 'lendario', valor: 120 },
  // O maço de notas vira grana na hora da extração; não vai para o baú.
  { id: 'maco_de_notas', nome: 'Maço de notas', raridade: 'dinheiro', valor: 8 },
];

/** Quem entra sem secundária ganha esta pistola, que nunca se perde (decisão do plano, 15/11/2026). */
export const PISTOLA_DE_GRACA = { classe: 'weapon_glock', nome: 'Glock-18' } as const;

export const armaLemnos = (id: string) => ARMAS.find((item) => item.id === id);
export const granadaLemnos = (id: string) => GRANADAS.find((item) => item.id === id);
export const mochilaLemnos = (id: string) => MOCHILAS.find((item) => item.id === id);
export const saqueLemnos = (id: string) => SAQUES.find((item) => item.id === id);

/** O nome de qualquer item do catálogo, para o baú e as estatísticas. */
export function nomeLemnos(id: string): string {
  return (armaLemnos(id) ?? granadaLemnos(id) ?? mochilaLemnos(id) ?? saqueLemnos(id))?.nome ?? id;
}

/** O item do catálogo pela classe do jogo, para armas achadas no mapa. */
export function armaPelaClasse(classe: string) {
  return ARMAS.find((item) => item.classe === classe);
}
export function granadaPelaClasse(classe: string) {
  return GRANADAS.find((item) => item.classe === classe);
}

export type RaridadeLemnos = 'comum' | 'raro' | 'epico' | 'lendario';

const SMGS = ['mp9', 'mac10', 'ump45'];
const FUZIS = ['ak47', 'm4a1', 'm4a1_silencer', 'galilar', 'famas'];

/** A imagem do item no site: as armas padrão do CS2 (sem skin) e ícones próprios para mochila e saque. */
export function imagemLemnos(id: string): string {
  if (armaLemnos(id) || granadaLemnos(id)) return `/lemnos/armas/${id}.webp`;
  if (mochilaLemnos(id)) return '/lemnos/itens/mochila.svg';
  return `/lemnos/itens/${id}.svg`;
}

export function categoriaLemnos(id: string): string {
  if (granadaLemnos(id)) return 'Granada';
  if (mochilaLemnos(id)) return 'Mochila';
  if (saqueLemnos(id)) return saqueLemnos(id)?.raridade === 'dinheiro' ? 'Dinheiro' : 'Saque';
  if (id === 'awp') return 'Sniper';
  if (FUZIS.includes(id)) return 'Fuzil';
  if (SMGS.includes(id)) return 'Submetralhadora';
  return 'Pistola';
}

/** A cor do cartão, no mesmo jeito da Magnata Shop: quanto mais forte o item, mais rara a cor. */
export function raridadeLemnos(id: string): RaridadeLemnos {
  const saque = saqueLemnos(id);
  if (saque) return saque.raridade === 'dinheiro' ? 'raro' : saque.raridade;
  const mochila = mochilaLemnos(id);
  if (mochila) return mochila.espacos >= 20 ? 'lendario' : mochila.espacos >= 16 ? 'epico' : mochila.espacos >= 12 ? 'raro' : 'comum';
  if (id === 'awp') return 'lendario';
  if (FUZIS.includes(id)) return 'epico';
  if (SMGS.includes(id) || id === 'deagle') return 'raro';
  return 'comum';
}
