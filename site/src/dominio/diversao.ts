import { and, asc, eq, inArray, isNull, or } from 'drizzle-orm';
import type { Bd } from '@/bd/conexao';
import { estadosDaDiversao, servidoresDiversao, usuarios, type EstadoDaDiversao, type ServidorDiversao } from '@/bd/esquema';
import type { ControladorServidor, ServidorAlvo } from '@/servidor-jogo/controlador';

export type ModoDeDiversao = ServidorDiversao['modo'];
export type SituacaoDoServidor = { ligado: boolean; jogando: number; mapa?: string };

/** Nome e foto dos mapas que já rodam na Diversão, pelo nome interno que o jogo informa. */
/** `regra` troca a descrição do cartão quando o mapa muda o jeito de jogar do servidor. */
const MAPAS_CONHECIDOS: Record<string, { nome: string; foto: string; regra?: string }> = {
  de_dust2: { nome: 'Dust 2', foto: '/mapas/dust2.webp' },
  de_mirage: { nome: 'Mirage', foto: '/mapas/mirage.webp' },
  transportship: { nome: 'Transport Ship', foto: '/mapas/transport-ship.webp' },
  de_luxville: { nome: 'Luxville', foto: '/mapas/luxville.webp' },
  zm_biochemical_hotel: { nome: 'Biochemical Hotel', foto: '/mapas/biochemical-hotel.webp' },
  zm_silent_village: { nome: 'Silent Village', foto: '/mapas/silent-village.webp' },
  egypt: { nome: 'Egypt', foto: '/mapas/egypt.webp' },
  gm_laboratory: { nome: 'Laboratory', foto: '/mapas/laboratory.webp' },
};

/** Com vários mapas sorteados, o cartão mostra o que está rodando agora. Mapa novo sem foto usa a do cadastro. */
export function mapaDoCartao(servidor: { mapa: string; foto: string }, situacao: SituacaoDoServidor): { nome: string; foto: string; regra?: string } {
  if (!situacao.ligado || !situacao.mapa) return { nome: servidor.mapa, foto: servidor.foto };
  return MAPAS_CONHECIDOS[situacao.mapa] ?? { nome: situacao.mapa, foto: servidor.foto };
}
export type EstadoDoCartao = 'em_breve' | 'fora_do_ar' | 'desligado_sob_demanda' | 'ligando' | 'trocando_mapa' | 'cheio' | 'aberto';

export const MODOS_DE_DIVERSAO: readonly { valor: ModoDeDiversao; nome: string }[] = [
  { valor: 'cada_um', nome: 'Cada um por si' },
  { valor: 'equipe', nome: 'Equipe x Equipe' },
  { valor: 'mutacao', nome: 'Mutação' },
  { valor: 'fantasma', nome: 'Fantasma' },
];

const TEMPO_GUARDADA_MS = 10_000;
const PRAZO_DA_PERGUNTA_MS = 3_000;
const PRAZO_DA_FISCALIZACAO_MS = 15_000;

/** Valor desconhecido na página vira a aba Todos, representada por null. */
export function lerModo(valor: string | undefined): ModoDeDiversao | null {
  return MODOS_DE_DIVERSAO.find((modo) => modo.valor === valor)?.valor ?? null;
}

export function listarServidoresDaDiversao(bd: Bd): Promise<ServidorDiversao[]> {
  return bd.select().from(servidoresDiversao).orderBy(asc(servidoresDiversao.ordem));
}

export function alvoDoServidor(servidor: { host: string | null; porta: number }, hostPadrao: string | undefined): ServidorAlvo | null {
  const host = servidor.host?.trim() || hostPadrao?.trim();
  return host ? { host, porta: servidor.porta } : null;
}

export function linkDeEntrar(alvo: ServidorAlvo, senha: string): string {
  return `steam://connect/${alvo.host}:${alvo.porta}/${encodeURIComponent(senha)}`;
}

/** O console do jogo não tem como escapar estes caracteres, e eles quebrariam o comando ou abririam outro. */
export function comandoDeConectar(alvo: ServidorAlvo, senha: string): string | null {
  if (/["\r\n;]/.test(senha)) return null;
  return `password "${senha}"; connect ${alvo.host}:${alvo.porta}`;
}

/** O que o servidor responde vale mais que o estado guardado; desligado sob demanda mostra o botão de ligar. */
export function estadoDoCartao(
  servidor: { ativo: boolean; vagas: number; sobDemanda?: boolean; nomeNoServidor?: string | null },
  situacao: SituacaoDoServidor,
  estado?: EstadoDaDiversao['estado'],
): EstadoDoCartao {
  if (!servidor.ativo) return 'em_breve';
  if (situacao.ligado) return situacao.jogando >= servidor.vagas ? 'cheio' : 'aberto';
  if (estado === 'ligando') return 'ligando';
  // Ligado para o site, mas sem responder agora: quase sempre é a troca de mapa.
  if (estado === 'ligado') return 'trocando_mapa';
  return servidor.sobDemanda && servidor.nomeNoServidor ? 'desligado_sob_demanda' : 'fora_do_ar';
}

function aguardarNoMaximo<T>(promessa: Promise<T>, prazoMs: number, seEsgotar: T): Promise<T> {
  let relogio: ReturnType<typeof setTimeout> | undefined;
  const esgotado = new Promise<T>((resolver) => {
    relogio = setTimeout(() => resolver(seEsgotar), prazoMs);
  });
  return Promise.race([promessa, esgotado]).finally(() => clearTimeout(relogio));
}

/**
 * Estes modos rodam sem os plugins das partidas, então não existe lista de liberados dentro do jogo.
 * Quem não é membro ativo cai na varredura seguinte, em até 15 segundos.
 */
export async function fiscalizarServidor(bd: Bd, controlador: ControladorServidor, alvo: ServidorAlvo): Promise<void> {
  // O servidor pode estar desligado de propósito, e isso não é uma falha.
  const conectados = await controlador.jogadoresConectados(alvo).catch(() => [] as string[]);
  if (conectados.length === 0) return;
  const liberados = await bd
    .select({ steamid64: usuarios.steamid64 })
    .from(usuarios)
    .where(and(eq(usuarios.estado, 'ativo'), inArray(usuarios.steamid64, conectados)));
  const membros = new Set(liberados.map((conta) => conta.steamid64));
  for (const steamid64 of conectados) {
    if (membros.has(steamid64)) continue;
    await controlador.expulsar(alvo, steamid64).catch((erro) => {
      console.warn('Não foi possível tirar uma conta de um servidor da Diversão:', erro);
    });
  }
}

/** Todos ao mesmo tempo, e cada um com prazo, para um servidor travado não prender os outros. */
export async function fiscalizarDiversao(
  bd: Bd,
  controlador: ControladorServidor,
  hostPadrao: string | undefined,
  prazoMs: number = PRAZO_DA_FISCALIZACAO_MS,
): Promise<void> {
  // Desligado pelo site não tem ninguém para fiscalizar. Sem estado ainda, pergunta: pode estar ligado desde antes.
  const ativos = await bd
    .select({ host: servidoresDiversao.host, porta: servidoresDiversao.porta })
    .from(servidoresDiversao)
    .leftJoin(estadosDaDiversao, eq(estadosDaDiversao.servidorId, servidoresDiversao.id))
    .where(and(eq(servidoresDiversao.ativo, true), or(isNull(estadosDaDiversao.estado), inArray(estadosDaDiversao.estado, ['ligando', 'ligado']))));
  await Promise.all(
    ativos.map(async (servidor) => {
      const alvo = alvoDoServidor(servidor, hostPadrao);
      if (alvo) await aguardarNoMaximo(fiscalizarServidor(bd, controlador, alvo), prazoMs, undefined);
    }),
  );
}

const guardadas = new Map<string, { ate: number; situacao: SituacaoDoServidor }>();

export function zerarSituacoesGuardadas(): void {
  guardadas.clear();
}

/** Pergunta agora, sem guardar: a varredura decide ligar e desligar pela resposta de agora. */
export async function perguntarAoServidor(
  controlador: ControladorServidor,
  alvo: ServidorAlvo | null,
  prazoMs: number = PRAZO_DA_PERGUNTA_MS,
): Promise<SituacaoDoServidor> {
  if (!alvo) return { ligado: false, jogando: 0 };
  const estado = await aguardarNoMaximo(controlador.estadoDoServidor(alvo).catch(() => null), prazoMs, null);
  return estado ? { ligado: true, jogando: estado.contas.length, ...(estado.mapa ? { mapa: estado.mapa } : {}) } : { ligado: false, jogando: 0 };
}

/** Guarda a resposta por alguns segundos, para não perguntar ao servidor a cada página aberta. */
export async function situacaoDoServidor(
  controlador: ControladorServidor,
  alvo: ServidorAlvo | null,
  agora: Date = new Date(),
  prazoMs: number = PRAZO_DA_PERGUNTA_MS,
): Promise<SituacaoDoServidor> {
  if (!alvo) return { ligado: false, jogando: 0 };
  const chave = `${alvo.host}:${alvo.porta}`;
  const guardada = guardadas.get(chave);
  if (guardada && agora.getTime() < guardada.ate) return guardada.situacao;
  const situacao = await perguntarAoServidor(controlador, alvo, prazoMs);
  guardadas.set(chave, { ate: agora.getTime() + TEMPO_GUARDADA_MS, situacao });
  return situacao;
}
