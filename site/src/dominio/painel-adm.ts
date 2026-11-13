import { and, count, desc, eq, gt, gte, ilike, inArray, lt, ne, or, sql, sum } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import type { Bd } from '@/bd/conexao';
import {
  assinaturas,
  auditoria,
  convites,
  mensalidades,
  partidaJogadores,
  partidas,
  pedidos,
  servidores,
  usuarios,
  verificacoes,
  type Assinatura,
  type Partida,
  type Usuario,
} from '@/bd/esquema';

type Verificacao = typeof verificacoes.$inferSelect;
import { periodoDeBrasilia } from './mvps';

/**
 * O Painel ADM novo (dono, 13/11/2026: "um dash completo", "gerenciamento de usuário", "partidas rolando"). Só leitura:
 * as ações continuam nos domínios de cada coisa (equipe, banimentos, grana, convites, varredura).
 */

const DIA_MS = 24 * 60 * 60 * 1000;
const BRASILIA_MS = -3 * 60 * 60 * 1000;
const DIAS_DOS_GRAFICOS = 14;
const ESTADOS_ROLANDO = ['aguardando_aceite', 'vetando', 'aguardando_servidor', 'carregando', 'aguardando_jogadores', 'ao_vivo'] as const;

export type PontoDoGrafico = { dia: string; total: number };

/** Conta as datas por dia de Brasília, nos `dias` que terminam hoje, do mais antigo para hoje, com zero nos vazios. */
export function serieDeDias(datas: Date[], agora: Date, dias: number): PontoDoGrafico[] {
  const chave = (quando: Date) => new Date(quando.getTime() + BRASILIA_MS).toISOString().slice(0, 10);
  const totais = new Map<string, number>();
  for (const quando of datas) totais.set(chave(quando), (totais.get(chave(quando)) ?? 0) + 1);
  return Array.from({ length: dias }, (_, indice) => {
    const dia = new Date(agora.getTime() - (dias - 1 - indice) * DIA_MS);
    const [, mes, numero] = chave(dia).split('-');
    return { dia: `${numero}/${mes}`, total: totais.get(chave(dia)) ?? 0 };
  });
}

export type NumerosDoDash = {
  membros: { total: number; ativos: number; novosHoje: number; novos7Dias: number; aguardandoVerificacao: number; punidos: number };
  partidas: { hoje: number; semana: number };
  dinheiro: { magcoinsDoMesCentavos: number; mensalidadesDoMesCentavos: number; premiumAtivos: number; apoiadoresAtivos: number };
  convitesUsados7Dias: number;
  cadastrosPorDia: PontoDoGrafico[];
  partidasPorDia: PontoDoGrafico[];
};

export async function numerosDoDash(bd: Bd, agora: Date = new Date()): Promise<NumerosDoDash> {
  const hoje = periodoDeBrasilia(agora, 'dia');
  const mes = periodoDeBrasilia(agora, 'mes');
  const semana = new Date(hoje.fim.getTime() - 7 * DIA_MS);
  const inicioDosGraficos = new Date(hoje.fim.getTime() - DIAS_DOS_GRAFICOS * DIA_MS);
  const contar = (condicao: ReturnType<typeof and>) => sql<number>`cast(count(*) filter (where ${condicao}) as integer)`;

  const [[membros], [jogos], [magcoins], [mensal], [assinantes], [convitesUsados], cadastros, criadas] = await Promise.all([
    bd
      .select({
        total: sql<number>`cast(count(*) as integer)`,
        ativos: contar(eq(usuarios.estado, 'ativo')),
        novosHoje: contar(gte(usuarios.criadoEm, hoje.inicio)),
        novos7Dias: contar(gte(usuarios.criadoEm, semana)),
        aguardandoVerificacao: contar(eq(usuarios.estado, 'aguardando_verificacao')),
        punidos: contar(inArray(usuarios.estado, ['suspenso', 'banido'])),
      })
      .from(usuarios),
    bd
      .select({ hoje: contar(gte(partidas.criadoEm, hoje.inicio)), semana: contar(gte(partidas.criadoEm, semana)) })
      .from(partidas)
      .where(ne(partidas.estado, 'cancelada')),
    bd
      .select({ total: sum(pedidos.valorCentavos) })
      .from(pedidos)
      .where(and(eq(pedidos.estado, 'pago'), gte(pedidos.pagoEm, mes.inicio), lt(pedidos.pagoEm, mes.fim))),
    bd
      .select({ total: sum(mensalidades.valorCentavos) })
      .from(mensalidades)
      .where(and(gte(mensalidades.pagoEm, mes.inicio), lt(mensalidades.pagoEm, mes.fim))),
    bd
      .select({ premium: contar(eq(assinaturas.nivel, 'premium')), apoiadores: contar(ne(assinaturas.nivel, 'premium')) })
      .from(assinaturas)
      .where(and(eq(assinaturas.estado, 'ativa'), gt(assinaturas.pagoAte, agora))),
    bd.select({ total: count() }).from(convites).where(gte(convites.usadoEm, semana)),
    bd.select({ quando: usuarios.criadoEm }).from(usuarios).where(gte(usuarios.criadoEm, inicioDosGraficos)),
    bd
      .select({ quando: partidas.criadoEm })
      .from(partidas)
      .where(and(gte(partidas.criadoEm, inicioDosGraficos), ne(partidas.estado, 'cancelada'))),
  ]);

  return {
    membros,
    partidas: jogos,
    dinheiro: {
      magcoinsDoMesCentavos: Number(magcoins.total ?? 0),
      mensalidadesDoMesCentavos: Number(mensal.total ?? 0),
      premiumAtivos: assinantes.premium,
      apoiadoresAtivos: assinantes.apoiadores,
    },
    convitesUsados7Dias: convitesUsados.total,
    cadastrosPorDia: serieDeDias(
      cadastros.map((linha) => linha.quando),
      agora,
      DIAS_DOS_GRAFICOS,
    ),
    partidasPorDia: serieDeDias(
      criadas.map((linha) => linha.quando),
      agora,
      DIAS_DOS_GRAFICOS,
    ),
  };
}

export type FiltroDeUsuarios = { termo?: string; estado?: Usuario['estado']; papel?: Usuario['papel']; premium?: boolean };
export type UsuarioDaLista = Pick<Usuario, 'id' | 'apelido' | 'avatarUrl' | 'steamid64' | 'papel' | 'estado' | 'grana' | 'magcoin' | 'vistoEm' | 'criadoEm'>;

/** O termo vira texto: % e _ não são padrões. */
function semCuringas(termo: string): string {
  return termo.replace(/[\\%_]/g, (letra) => `\\${letra}`);
}

export async function buscarUsuarios(bd: Bd, filtro: FiltroDeUsuarios, agora: Date = new Date(), limite = 100): Promise<UsuarioDaLista[]> {
  const termo = filtro.termo?.trim();
  const condicoes = [
    termo ? or(ilike(usuarios.apelido, `%${semCuringas(termo)}%`), eq(usuarios.steamid64, termo)) : undefined,
    filtro.estado ? eq(usuarios.estado, filtro.estado) : undefined,
    filtro.papel ? eq(usuarios.papel, filtro.papel) : undefined,
    filtro.premium
      ? inArray(
          usuarios.id,
          bd
            .select({ id: assinaturas.usuarioId })
            .from(assinaturas)
            .where(and(eq(assinaturas.nivel, 'premium'), eq(assinaturas.estado, 'ativa'), gt(assinaturas.pagoAte, agora))),
        )
      : undefined,
  ];
  return bd
    .select({
      id: usuarios.id,
      apelido: usuarios.apelido,
      avatarUrl: usuarios.avatarUrl,
      steamid64: usuarios.steamid64,
      papel: usuarios.papel,
      estado: usuarios.estado,
      grana: usuarios.grana,
      magcoin: usuarios.magcoin,
      vistoEm: usuarios.vistoEm,
      criadoEm: usuarios.criadoEm,
    })
    .from(usuarios)
    .where(and(...condicoes))
    .orderBy(desc(usuarios.criadoEm))
    .limit(limite);
}

export type LinhaDoRegistro = {
  id: string;
  acao: string;
  detalhes: unknown;
  criadoEm: Date;
  atorId: string | null;
  atorApelido: string | null;
  alvoId: string | null;
  alvoApelido: string | null;
};

const ator = alias(usuarios, 'ator');
const alvo = alias(usuarios, 'alvo');

function selecionarRegistro(bd: Bd) {
  return bd
    .select({
      id: auditoria.id,
      acao: auditoria.acao,
      detalhes: auditoria.detalhes,
      criadoEm: auditoria.criadoEm,
      atorId: auditoria.atorId,
      atorApelido: ator.apelido,
      alvoId: auditoria.alvoId,
      alvoApelido: alvo.apelido,
    })
    .from(auditoria)
    .leftJoin(ator, eq(ator.id, auditoria.atorId))
    .leftJoin(alvo, eq(alvo.id, auditoria.alvoId));
}

/** Tudo o que a equipe fez, o mais novo primeiro. */
export async function registroDaEquipe(bd: Bd, limite = 100): Promise<LinhaDoRegistro[]> {
  return selecionarRegistro(bd).orderBy(desc(auditoria.criadoEm)).limit(limite);
}

export type FichaDoUsuario = {
  usuario: Usuario;
  convidadoPor: Pick<Usuario, 'id' | 'apelido'> | null;
  convidados: Pick<Usuario, 'id' | 'apelido' | 'estado' | 'criadoEm'>[];
  convitesGerados: number;
  assinatura: Assinatura | null;
  verificacao: Verificacao | null;
  partidasJogadas: number;
  historico: LinhaDoRegistro[];
};

export async function fichaDoUsuario(bd: Bd, id: string, agora: Date = new Date()): Promise<FichaDoUsuario | null> {
  const [usuario] = await bd.select().from(usuarios).where(eq(usuarios.id, id));
  if (!usuario) return null;
  const [convidadoPor, convidados, [gerados], [assinatura], [verificacao], [jogadas], historico] = await Promise.all([
    usuario.convidadoPor
      ? bd.select({ id: usuarios.id, apelido: usuarios.apelido }).from(usuarios).where(eq(usuarios.id, usuario.convidadoPor))
      : Promise.resolve([]),
    bd
      .select({ id: usuarios.id, apelido: usuarios.apelido, estado: usuarios.estado, criadoEm: usuarios.criadoEm })
      .from(usuarios)
      .where(eq(usuarios.convidadoPor, id))
      .orderBy(desc(usuarios.criadoEm)),
    bd.select({ total: count() }).from(convites).where(eq(convites.criadoPor, id)),
    // A assinatura que vale agora; sem ela, a mais recente.
    bd
      .select()
      .from(assinaturas)
      .where(eq(assinaturas.usuarioId, id))
      .orderBy(desc(sql`(${assinaturas.estado} = 'ativa' and ${assinaturas.pagoAte} > ${agora})`), desc(assinaturas.criadoEm))
      .limit(1),
    bd.select().from(verificacoes).where(eq(verificacoes.usuarioId, id)).orderBy(desc(verificacoes.criadoEm)).limit(1),
    bd
      .select({ total: count() })
      .from(partidaJogadores)
      .innerJoin(partidas, eq(partidas.id, partidaJogadores.partidaId))
      .where(and(eq(partidaJogadores.usuarioId, id), eq(partidas.estado, 'encerrada'))),
    selecionarRegistro(bd)
      .where(or(eq(auditoria.alvoId, id), eq(auditoria.atorId, id)))
      .orderBy(desc(auditoria.criadoEm))
      .limit(50),
  ]);
  return {
    usuario,
    convidadoPor: convidadoPor[0] ?? null,
    convidados,
    convitesGerados: gerados.total,
    assinatura: assinatura ?? null,
    verificacao: verificacao ?? null,
    partidasJogadas: jogadas.total,
    historico,
  };
}

export type PartidaRolando = { partida: Partida; servidorNome: string | null; servidorHost: string | null; servidorPorta: number | null };

/** As partidas ainda não encerradas, a mais antiga primeiro: a que está há mais tempo parada aparece em cima. */
export async function partidasRolando(bd: Bd): Promise<PartidaRolando[]> {
  return bd
    .select({ partida: partidas, servidorNome: servidores.nome, servidorHost: servidores.host, servidorPorta: servidores.porta })
    .from(partidas)
    .leftJoin(servidores, eq(servidores.id, partidas.servidorId))
    .where(inArray(partidas.estado, [...ESTADOS_ROLANDO]))
    .orderBy(partidas.criadoEm);
}

/** Os servidores do competitivo e qual partida cada um está rodando. */
export async function servidoresDoCompetitivo(bd: Bd) {
  return bd.select().from(servidores).orderBy(servidores.nome);
}
