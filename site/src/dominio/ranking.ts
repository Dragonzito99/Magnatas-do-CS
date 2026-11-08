import { and, asc, count, desc, eq, gt, gte, inArray, lt, min, sql, sum } from 'drizzle-orm';
import type { Bd } from '@/bd/conexao';
import { partidaJogadores, partidas, usuarios, xpPartidas } from '@/bd/esquema';
import { kdDe, porcentagem, umaCasa } from './ficha';
import type { UsuarioPublico } from './salas';
import { patenteDe, type Patente } from './xp';

export const MINIMO_DE_PARTIDAS_NO_MES = 5;
const LIMITE_DA_COMUNIDADE = 100;
// O Brasil não tem horário de verão desde 2019, então o deslocamento é fixo.
const DESLOCAMENTO_DE_BRASILIA = '-03:00';

export type Mes = { ano: number; mes: number };

export type LinhaDoRanking = {
  posicao: number;
  jogador: UsuarioPublico;
  partidas: number;
  vitoriasPct: number;
  abates: number;
  mortes: number;
  adr: number;
  kd: number;
};

export function mesDe(data: Date): Mes {
  const [ano, mes] = new Intl.DateTimeFormat('en-CA', { year: 'numeric', month: '2-digit', timeZone: 'America/Sao_Paulo' })
    .format(data)
    .split('-')
    .map(Number);
  return { ano, mes };
}

export const mesAnterior = ({ ano, mes }: Mes): Mes => (mes === 1 ? { ano: ano - 1, mes: 12 } : { ano, mes: mes - 1 });
export const proximoMes = ({ ano, mes }: Mes): Mes => (mes === 12 ? { ano: ano + 1, mes: 1 } : { ano, mes: mes + 1 });
export const textoDoMes = ({ ano, mes }: Mes) => `${ano}-${String(mes).padStart(2, '0')}`;
const inicioDoMes = (mes: Mes) => new Date(`${textoDoMes(mes)}-01T00:00:00${DESLOCAMENTO_DE_BRASILIA}`);

/** Lê o mês do endereço da página, e devolve null para o que não for um mês válido. */
export function lerMes(texto: string | undefined): Mes | null {
  const achado = /^(\d{4})-(\d{2})$/.exec(texto ?? '');
  if (!achado) return null;
  const mes = Number(achado[2]);
  return mes >= 1 && mes <= 12 ? { ano: Number(achado[1]), mes } : null;
}

export async function rankingDoMes(bd: Bd, mes: Mes): Promise<{ linhas: LinhaDoRanking[]; foraDoRanking: number }> {
  const contas = await bd
    .select({
      id: usuarios.id,
      apelido: usuarios.apelido,
      avatarUrl: usuarios.avatarUrl,
      partidas: count(),
      vitorias: sql`count(*) filter (where ${partidas.vencedor} = ${partidaJogadores.time})`.mapWith(Number),
      abates: sum(partidaJogadores.kills).mapWith(Number),
      mortes: sum(partidaJogadores.deaths).mapWith(Number),
      dano: sum(partidaJogadores.damage).mapWith(Number),
      rodadas: sum(partidaJogadores.rodadas).mapWith(Number),
    })
    .from(partidaJogadores)
    .innerJoin(partidas, eq(partidaJogadores.partidaId, partidas.id))
    .innerJoin(usuarios, eq(partidaJogadores.usuarioId, usuarios.id))
    .where(
      and(
        eq(partidas.estado, 'encerrada'),
        eq(partidas.tipo, 'mix'),
        gte(partidas.encerradaEm, inicioDoMes(mes)),
        lt(partidas.encerradaEm, inicioDoMes(proximoMes(mes))),
        // Conta suspensa ou banida não aparece como exemplo para o clube.
        eq(usuarios.estado, 'ativo'),
      ),
    )
    .groupBy(usuarios.id);

  const classificados = contas.filter((conta) => conta.partidas >= MINIMO_DE_PARTIDAS_NO_MES);
  const linhas = classificados
    .map((conta) => ({
      jogador: { id: conta.id, apelido: conta.apelido, avatarUrl: conta.avatarUrl },
      partidas: conta.partidas,
      vitoriasPct: porcentagem(conta.vitorias, conta.partidas),
      abates: conta.abates,
      mortes: conta.mortes,
      adr: conta.rodadas > 0 ? umaCasa(conta.dano / conta.rodadas) : 0,
      kd: kdDe(conta.abates, conta.mortes),
    }))
    .sort((a, b) => b.kd - a.kd || b.abates - a.abates || a.jogador.apelido.localeCompare(b.jogador.apelido))
    .map((linha, indice) => ({ posicao: indice + 1, ...linha }));

  return { linhas, foraDoRanking: contas.length - classificados.length };
}

/** Até onde as setas de mês podem voltar. */
export async function primeiroMesComPartida(bd: Bd): Promise<Mes | null> {
  const [{ primeira }] = await bd
    .select({ primeira: min(partidas.encerradaEm) })
    .from(partidas)
    .where(and(eq(partidas.estado, 'encerrada'), eq(partidas.tipo, 'mix')));
  return primeira ? mesDe(primeira) : null;
}

export type LinhaDaComunidade = { posicao: number; jogador: UsuarioPublico; patente: Patente; xp: number; partidas: number; vitoriasPct: number };

/** Por XP de sempre: mostra quem tem a patente mais alta do clube. */
export async function rankingDaComunidade(bd: Bd, limite: number = LIMITE_DA_COMUNIDADE): Promise<LinhaDaComunidade[]> {
  const contas = await bd
    .select({ id: usuarios.id, apelido: usuarios.apelido, avatarUrl: usuarios.avatarUrl, xp: usuarios.xpTotal })
    .from(usuarios)
    .where(and(eq(usuarios.estado, 'ativo'), gt(usuarios.xpTotal, 0)))
    .orderBy(desc(usuarios.xpTotal), asc(usuarios.apelido))
    .limit(limite);
  const ids = contas.map((conta) => conta.id);
  const jogos =
    ids.length === 0
      ? []
      : await bd
          .select({
            usuarioId: xpPartidas.usuarioId,
            partidas: count(),
            vitorias: sql<number>`count(*) filter (where ${xpPartidas.resultado} = 'vitoria')`.mapWith(Number),
          })
          .from(xpPartidas)
          .where(inArray(xpPartidas.usuarioId, ids))
          .groupBy(xpPartidas.usuarioId);
  const porConta = new Map(jogos.map((linha) => [linha.usuarioId, linha]));
  return contas.map(({ xp, ...jogador }, indice) => {
    const jogo = porConta.get(jogador.id);
    return { posicao: indice + 1, jogador, patente: patenteDe(xp), xp, partidas: jogo?.partidas ?? 0, vitoriasPct: porcentagem(jogo?.vitorias ?? 0, jogo?.partidas ?? 0) };
  });
}

/** Onde a pessoa está no ranking e quanto XP falta para passar quem está logo acima. Fora da lista é null. */
export function minhaPosicao(
  linhas: { posicao: number; jogador: { id: string; apelido: string }; xp: number }[],
  usuarioId: string,
): { posicao: number; faltam: number; acima: string | null } | null {
  const indice = linhas.findIndex((linha) => linha.jogador.id === usuarioId);
  if (indice < 0) return null;
  const acima = linhas[indice - 1];
  if (!acima) return { posicao: linhas[indice].posicao, faltam: 0, acima: null };
  return { posicao: linhas[indice].posicao, faltam: acima.xp - linhas[indice].xp + 1, acima: acima.jogador.apelido };
}
