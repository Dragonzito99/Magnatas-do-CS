import { eq } from 'drizzle-orm';
import type { Bd } from '@/bd/conexao';
import { manutencaoDosServidores, type Usuario } from '@/bd/esquema';
import { exigirPermissao, registrarAuditoria } from './equipe';

type Transacao = Parameters<Parameters<Bd['transaction']>[0]>[0];

/** Servidores em manutenção (dono, 11/11/2026): nada de fila, sala ou ligar servidor até eles voltarem. */
export class EmManutencao extends Error {
  constructor() {
    super('Os servidores estão em manutenção.');
  }
}

export type Manutencao = { automatica: boolean; motivo: string | null; desde: Date };

export async function manutencaoAtual(bd: Bd | Transacao): Promise<Manutencao | null> {
  const [linha] = await bd.select().from(manutencaoDosServidores).where(eq(manutencaoDosServidores.id, 1));
  return linha?.ligada ? { automatica: linha.automatica, motivo: linha.motivo, desde: linha.desde } : null;
}

export async function exigirServidoresNoAr(bd: Bd | Transacao): Promise<void> {
  if (await manutencaoAtual(bd)) throw new EmManutencao();
}

async function gravar(bd: Bd, ator: Pick<Usuario, 'id'>, ligada: boolean, agora: Date): Promise<void> {
  await bd.transaction(async (tx) => {
    await exigirPermissao(tx, ator, 'cuidar_dos_servidores');
    const valores = { ligada, automatica: false, motivo: null, desde: agora, atorId: ator.id };
    await tx
      .insert(manutencaoDosServidores)
      .values({ id: 1, ...valores })
      .onConflictDoUpdate({ target: manutencaoDosServidores.id, set: valores });
    await registrarAuditoria(tx, { atorId: ator.id, acao: ligada ? 'ligar_manutencao' : 'desligar_manutencao' });
  });
}

export async function ligarManutencao(bd: Bd, ator: Pick<Usuario, 'id'>, agora: Date = new Date()): Promise<void> {
  await gravar(bd, ator, true, agora);
}

export async function desligarManutencao(bd: Bd, ator: Pick<Usuario, 'id'>, agora: Date = new Date()): Promise<void> {
  await gravar(bd, ator, false, agora);
}
