import { and, eq, inArray, isNotNull } from 'drizzle-orm';
import type { Bd } from '@/bd/conexao';
import { partidaJogadores, partidas, servidores, usuarios, type Partida, type Usuario } from '@/bd/esquema';
import type { ControladorServidor } from '@/servidor-jogo/controlador';
import { exigirLivre } from './disponibilidade';
import { exigirPermissao } from './equipe';
import { criarPartida } from './partidas';

export const NOMES_DO_TESTE = { 1: 'Seu time', 2: 'Bots' } as const;

/**
 * Só o Adm: uma partida competitiva com ele sozinho, para ver as telas e o servidor sem juntar 10 pessoas. Passa
 * pelo aceite, pelos vetos (os bots vetam sozinhos), pelo servidor e pelo fim, sem XP e sem entrar no perfil.
 */
export async function criarTesteDoCompetitivo(bd: Bd, adm: Pick<Usuario, 'id'>, agora: Date = new Date()): Promise<Partida> {
  return bd.transaction(async (tx) => {
    await exigirPermissao(tx, adm, 'testar_competitivo');
    await exigirLivre(tx, adm.id, agora);
    return criarPartida(tx, { tipo: 'teste', time1: [adm.id], time2: [], agora, nomes: { ...NOMES_DO_TESTE } });
  });
}

/**
 * O servidor zera os bots ao preparar e ao começar, então a varredura repõe a cada volta. Antes de começar, espera o
 * Adm entrar e força o início, porque o time dos bots nunca fica "pronto".
 */
export async function chamarBotsDosTestes(bd: Bd, controlador: ControladorServidor): Promise<void> {
  const testes = await bd
    .select({ partida: partidas, servidor: servidores })
    .from(partidas)
    .innerJoin(servidores, eq(servidores.id, partidas.servidorId))
    .where(and(eq(partidas.tipo, 'teste'), inArray(partidas.estado, ['aguardando_jogadores', 'ao_vivo']), isNotNull(partidas.servidorId)));
  for (const { partida, servidor } of testes) {
    const contas = await bd
      .select({ steamid64: usuarios.steamid64 })
      .from(partidaJogadores)
      .innerJoin(usuarios, eq(usuarios.id, partidaJogadores.usuarioId))
      .where(eq(partidaJogadores.partidaId, partida.id));
    const { contas: conectados } = await controlador.estadoDoServidor(servidor);
    if (!contas.some((conta) => conectados.includes(conta.steamid64))) continue;
    await controlador.chamarBots(servidor, partida.estado === 'aguardando_jogadores');
  }
}
