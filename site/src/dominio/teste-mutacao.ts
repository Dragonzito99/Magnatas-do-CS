import { and, eq, inArray, isNotNull } from 'drizzle-orm';
import type { Bd } from '@/bd/conexao';
import { estadosDaDiversao, servidoresDiversao, type EstadoDaDiversao, type ServidorDiversao, type Usuario } from '@/bd/esquema';
import type { ControladorServidor } from '@/servidor-jogo/controlador';
import { alvoDoServidor, type SituacaoDoServidor } from './diversao';
import { exigirPermissao } from './equipe';
import { pedirParaLigar, ServidorIndisponivel, type ControleDaDiversao } from './sob-demanda';

/** O mapa do teste: os da Mutação não têm o caminho que os bots seguem. */
export const MAPA_DO_TESTE = 'de_dust2';

export class MutacaoOcupada extends Error {
  constructor() {
    super('A Mutação está com gente jogando agora. Tente o teste quando ela esvaziar.');
    this.name = 'MutacaoOcupada';
  }
}

export async function servidorDaMutacao(bd: Bd): Promise<ServidorDiversao | null> {
  const [servidor] = await bd
    .select()
    .from(servidoresDiversao)
    .where(and(eq(servidoresDiversao.modo, 'mutacao'), eq(servidoresDiversao.ativo, true), isNotNull(servidoresDiversao.nomeNoServidor)));
  return servidor ?? null;
}

/**
 * Só o Adm: a Mutação na Dust 2 com bots, sem XP. Liga o servidor se preciso e deixa o teste pedido; a varredura
 * manda o comando quando o servidor responder. Com gente jogando de verdade, recusa para não derrubar a partida.
 */
export async function pedirTesteDaMutacao(
  bd: Bd,
  controle: ControleDaDiversao,
  perguntar: (servidor: ServidorDiversao) => Promise<SituacaoDoServidor>,
  adm: Pick<Usuario, 'id'>,
  maximo: number,
  agora: Date = new Date(),
): Promise<void> {
  await exigirPermissao(bd, adm, 'testar_mutacao');
  const servidor = await servidorDaMutacao(bd);
  if (!servidor) throw new ServidorIndisponivel();
  const [guardado] = await bd.select().from(estadosDaDiversao).where(eq(estadosDaDiversao.servidorId, servidor.id));
  if (guardado?.teste) return;
  const situacao = await perguntar(servidor);
  if (situacao.ligado && situacao.jogando > 0) throw new MutacaoOcupada();
  if (!situacao.ligado) {
    const resultado = await pedirParaLigar(bd, controle, servidor.id, adm, maximo, agora);
    if (resultado === 'desligado') throw new ServidorIndisponivel();
  }
  await bd
    .insert(estadosDaDiversao)
    .values({ servidorId: servidor.id, estado: 'ligado', desde: agora, teste: 'pedido' })
    .onConflictDoUpdate({ target: estadosDaDiversao.servidorId, set: { teste: 'pedido' } });
}

/** Roda na varredura: manda o comando aos servidores que já respondem e encerra o teste dos que desligaram. */
export async function aplicarTestesDaMutacao(bd: Bd, controlador: ControladorServidor, hostPadrao: string | undefined): Promise<void> {
  await bd
    .update(estadosDaDiversao)
    .set({ teste: null })
    .where(and(eq(estadosDaDiversao.estado, 'desligado'), isNotNull(estadosDaDiversao.teste)));
  const pedidos = await bd
    .select({ servidor: servidoresDiversao })
    .from(estadosDaDiversao)
    .innerJoin(servidoresDiversao, eq(servidoresDiversao.id, estadosDaDiversao.servidorId))
    .where(and(eq(estadosDaDiversao.teste, 'pedido'), eq(estadosDaDiversao.estado, 'ligado'), inArray(servidoresDiversao.modo, ['mutacao'])));
  for (const { servidor } of pedidos) {
    const alvo = alvoDoServidor(servidor, hostPadrao);
    if (!alvo) continue;
    try {
      await controlador.comecarTesteComBots(alvo);
    } catch (erro) {
      console.warn('O servidor da Mutação ainda não aceitou o teste com bots:', erro);
      continue;
    }
    await bd
      .update(estadosDaDiversao)
      .set({ teste: 'ativo' })
      .where(and(eq(estadosDaDiversao.servidorId, servidor.id), eq(estadosDaDiversao.teste, 'pedido')));
  }
}

export type EtapaDoTeste = 'livre' | 'ligando' | 'preparando' | 'pronto';

/** Em que pé está o teste, para a aba Testes. Pronto só com a Dust 2 de pé: antes disso, o Entrar levaria ao mapa errado. */
export function etapaDoTeste(guardado: Pick<EstadoDaDiversao, 'estado' | 'teste'> | undefined, situacao: SituacaoDoServidor): EtapaDoTeste {
  if (!guardado?.teste) return 'livre';
  if (guardado.estado === 'ligando') return 'ligando';
  if (guardado.teste === 'ativo' && situacao.ligado && situacao.mapa === MAPA_DO_TESTE) return 'pronto';
  return 'preparando';
}
