import { and, eq, inArray } from 'drizzle-orm';
import type { Bd } from '@/bd/conexao';
import { usuarios } from '@/bd/esquema';
import type { ControladorServidor, ServidorAlvo } from '@/servidor-jogo/controlador';

export const VAGAS_DO_MATA_MATA = 16;
const PORTA_PADRAO = 27016;
const TEMPO_GUARDADA_MS = 10_000;
const PRAZO_DA_PERGUNTA_MS = 3_000;

export type SituacaoDoMataMata = { ligado: boolean; jogando: number; vagas: number };

export function servidorDoMataMata(ambiente: { DIVERSAO_HOST?: string; DIVERSAO_PORTA?: string }): ServidorAlvo | null {
  const host = ambiente.DIVERSAO_HOST?.trim();
  if (!host) return null;
  const porta = ambiente.DIVERSAO_PORTA ? Number(ambiente.DIVERSAO_PORTA) : PORTA_PADRAO;
  return Number.isInteger(porta) && porta > 0 ? { host, porta } : null;
}

export function mataMataDoAmbiente(): ServidorAlvo | null {
  const { DIVERSAO_HOST, DIVERSAO_PORTA } = process.env;
  return servidorDoMataMata({ DIVERSAO_HOST, DIVERSAO_PORTA });
}

export function conexaoDoMataMata(servidor: ServidorAlvo, senha: string): string {
  return `steam://connect/${servidor.host}:${servidor.porta}/${encodeURIComponent(senha)}`;
}

/**
 * Este modo roda sem os plugins das partidas, então não existe lista de liberados dentro do jogo.
 * Quem não é membro ativo cai na varredura seguinte, em até 15 segundos.
 */
export async function fiscalizarMataMata(bd: Bd, controlador: ControladorServidor, servidor: ServidorAlvo): Promise<void> {
  // O modo pode estar desligado de propósito, e isso não é uma falha.
  const conectados = await controlador.jogadoresConectados(servidor).catch(() => [] as string[]);
  if (conectados.length === 0) return;
  const liberados = await bd
    .select({ steamid64: usuarios.steamid64 })
    .from(usuarios)
    .where(and(eq(usuarios.estado, 'ativo'), inArray(usuarios.steamid64, conectados)));
  const membros = new Set(liberados.map((conta) => conta.steamid64));
  for (const steamid64 of conectados) {
    if (membros.has(steamid64)) continue;
    await controlador.expulsar(servidor, steamid64).catch((erro) => {
      console.warn('Não foi possível tirar uma conta do modo Cada um por si:', erro);
    });
  }
}

let guardada: { ate: number; situacao: SituacaoDoMataMata } | null = null;

export function zerarSituacaoGuardada(): void {
  guardada = null;
}

/** Guarda a resposta por alguns segundos, para não perguntar ao servidor a cada página aberta. */
export async function situacaoDoMataMata(
  controlador: ControladorServidor,
  servidor: ServidorAlvo | null,
  agora: Date = new Date(),
  prazoMs: number = PRAZO_DA_PERGUNTA_MS,
): Promise<SituacaoDoMataMata> {
  if (!servidor) return { ligado: false, jogando: 0, vagas: VAGAS_DO_MATA_MATA };
  if (guardada && agora.getTime() < guardada.ate) return guardada.situacao;
  let relogio: ReturnType<typeof setTimeout> | undefined;
  const esgotado = new Promise<null>((resolver) => {
    relogio = setTimeout(() => resolver(null), prazoMs);
  });
  const conectados = await Promise.race([controlador.jogadoresConectados(servidor).catch(() => null), esgotado]);
  clearTimeout(relogio);
  const situacao = { ligado: conectados !== null, jogando: conectados?.length ?? 0, vagas: VAGAS_DO_MATA_MATA };
  guardada = { ate: agora.getTime() + TEMPO_GUARDADA_MS, situacao };
  return situacao;
}
