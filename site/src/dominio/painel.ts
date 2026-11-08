import { and, asc, count, eq, gte, lt, ne } from 'drizzle-orm';
import type { Bd } from '@/bd/conexao';
import { partidas, servidoresDiversao, type EstadoDaDiversao } from '@/bd/esquema';
import { MODOS_DE_DIVERSAO } from './diversao';
import { periodoDeBrasilia } from './mvps';
import { estadosDaTela } from './sob-demanda';

/** O número "Partidas hoje" do Painel ADM: as criadas hoje em Brasília que não foram canceladas. */
export async function partidasDoDia(bd: Bd, agora: Date = new Date()): Promise<number> {
  const { inicio, fim } = periodoDeBrasilia(agora, 'dia');
  const [{ total }] = await bd
    .select({ total: count() })
    .from(partidas)
    .where(and(gte(partidas.criadoEm, inicio), lt(partidas.criadoEm, fim), ne(partidas.estado, 'cancelada')));
  return total;
}

export type ServidorDoPainel = { id: string; modo: string; mapa: string; estado: EstadoDaDiversao['estado'] };

/** Os servidores ativos da Diversão, na ordem da tela Jogar, e se estão ligados agora. */
export async function servidoresDoPainel(bd: Bd): Promise<ServidorDoPainel[]> {
  const servidores = await bd.select().from(servidoresDiversao).where(eq(servidoresDiversao.ativo, true)).orderBy(asc(servidoresDiversao.ordem));
  const estados = await estadosDaTela(
    bd,
    servidores.map((servidor) => servidor.id),
  );
  return servidores.map((servidor) => ({
    id: servidor.id,
    modo: MODOS_DE_DIVERSAO.find((modo) => modo.valor === servidor.modo)?.nome ?? servidor.modo,
    mapa: servidor.mapa,
    estado: estados.get(servidor.id)?.estado ?? 'desligado',
  }));
}
