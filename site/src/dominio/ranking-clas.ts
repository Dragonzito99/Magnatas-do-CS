import { and, count, eq, inArray, isNull } from 'drizzle-orm';
import type { Bd } from '@/bd/conexao';
import { claMembros, clas, partidas, series, type Cla } from '@/bd/esquema';
import { porcentagem } from './ficha';

/** Um clã x clã terminado: uma MD1 ou uma série MD3. O placar é do lado do clã A. */
export type ConfrontoDeCla = {
  id: string;
  data: Date;
  claA: string;
  claB: string;
  vencedor: string | null;
  mapas: 1 | 3;
  placar: string;
  mapa: string | null;
};

const diaDeBrasilia = new Intl.DateTimeFormat('en-CA', { year: 'numeric', month: '2-digit', day: '2-digit', timeZone: 'America/Sao_Paulo' });

/** Anti-farm: do mesmo par de clãs, no mesmo dia de Brasília, só o primeiro confronto conta. */
export function confrontosQueContam(confrontos: ConfrontoDeCla[]): ConfrontoDeCla[] {
  const vistos = new Set<string>();
  return [...confrontos]
    .sort((a, b) => a.data.getTime() - b.data.getTime())
    .filter((confronto) => {
      const chave = `${[confronto.claA, confronto.claB].sort().join('|')}|${diaDeBrasilia.format(confronto.data)}`;
      if (vistos.has(chave)) return false;
      vistos.add(chave);
      return true;
    });
}

/** Todos os clã x clã terminados: as MD1 soltas e as séries MD3 encerradas. Treino e série cancelada ficam de fora. */
async function confrontos(bd: Bd): Promise<ConfrontoDeCla[]> {
  const linhas = await bd
    .select({
      id: partidas.id,
      serieId: partidas.serieId,
      claTime1Id: partidas.claTime1Id,
      claTime2Id: partidas.claTime2Id,
      vencedor: partidas.vencedor,
      placar1: partidas.placar1,
      placar2: partidas.placar2,
      mapa: partidas.mapa,
      encerradaEm: partidas.encerradaEm,
    })
    .from(partidas)
    .where(and(eq(partidas.tipo, 'cla'), eq(partidas.estado, 'encerrada')));
  const lista: ConfrontoDeCla[] = [];
  const doTime = (linha: (typeof linhas)[number], time: number | null) => (time === 1 ? linha.claTime1Id : time === 2 ? linha.claTime2Id : null);

  for (const linha of linhas) {
    if (linha.serieId || !linha.claTime1Id || !linha.claTime2Id || !linha.encerradaEm) continue;
    lista.push({
      id: linha.id,
      data: linha.encerradaEm,
      claA: linha.claTime1Id,
      claB: linha.claTime2Id,
      vencedor: doTime(linha, linha.vencedor),
      mapas: 1,
      placar: `${linha.placar1} x ${linha.placar2}`,
      mapa: linha.mapa,
    });
  }

  const encerradas = await bd.select().from(series).where(eq(series.estado, 'encerrada'));
  for (const serie of encerradas) {
    const mapas = linhas.filter((linha) => linha.serieId === serie.id && linha.encerradaEm);
    const primeira = mapas[0];
    if (!primeira?.claTime1Id || !primeira.claTime2Id) continue;
    const ultima = mapas.reduce((mais, linha) => (linha.encerradaEm! > mais.encerradaEm! ? linha : mais));
    lista.push({
      id: serie.id,
      data: ultima.encerradaEm!,
      claA: primeira.claTime1Id,
      claB: primeira.claTime2Id,
      vencedor: doTime(primeira, serie.vencedor),
      mapas: 3,
      placar: `${serie.vitorias1} x ${serie.vitorias2}`,
      mapa: null,
    });
  }
  return lista;
}

export type LinhaDoRankingDeClas = {
  posicao: number;
  cla: Pick<Cla, 'id' | 'nome' | 'sigla' | 'cor'>;
  vitorias: number;
  jogos: number;
  aproveitamento: number;
  membros: number;
};

/** Por vitórias, depois aproveitamento, depois nome. Não zera. */
export async function rankingDeClas(bd: Bd): Promise<LinhaDoRankingDeClas[]> {
  const ativos = await bd
    .select({ id: clas.id, nome: clas.nome, sigla: clas.sigla, cor: clas.cor, membros: count(claMembros.usuarioId) })
    .from(clas)
    .leftJoin(claMembros, eq(claMembros.claId, clas.id))
    .where(isNull(clas.desfeitoEm))
    .groupBy(clas.id);
  const contam = confrontosQueContam(await confrontos(bd));
  const linhas = ativos.map(({ membros, ...cla }) => {
    const dele = contam.filter((confronto) => confronto.claA === cla.id || confronto.claB === cla.id);
    const vitorias = dele.filter((confronto) => confronto.vencedor === cla.id).length;
    return { cla, vitorias, jogos: dele.length, aproveitamento: porcentagem(vitorias, dele.length), membros };
  });
  linhas.sort((a, b) => b.vitorias - a.vitorias || b.aproveitamento - a.aproveitamento || a.cla.nome.localeCompare(b.cla.nome, 'pt-BR'));
  return linhas.map((linha, indice) => ({ posicao: indice + 1, ...linha }));
}

export async function numerosDoCla(bd: Bd, claId: string): Promise<{ posicao: number | null; vitorias: number; aproveitamento: number; membros: number }> {
  const linha = (await rankingDeClas(bd)).find((item) => item.cla.id === claId);
  if (!linha) return { posicao: null, vitorias: 0, aproveitamento: 0, membros: 0 };
  return { posicao: linha.posicao, vitorias: linha.vitorias, aproveitamento: linha.aproveitamento, membros: linha.membros };
}

export type UltimaDoCla = {
  id: string;
  data: Date;
  adversario: Pick<Cla, 'id' | 'sigla' | 'nome'>;
  resultado: 'vitoria' | 'derrota' | 'empate';
  placar: string;
  mapas: 1 | 3;
  mapa: string | null;
  contou: boolean;
};

/** As últimas do clã, mais nova primeiro, com o placar do lado dele. Inclui as que o anti-farm deixou de fora. */
export async function ultimasDoCla(bd: Bd, claId: string, limite: number = 5): Promise<UltimaDoCla[]> {
  const todos = await confrontos(bd);
  const contam = new Set(confrontosQueContam(todos).map((confronto) => confronto.id));
  const dele = todos
    .filter((confronto) => confronto.claA === claId || confronto.claB === claId)
    .sort((a, b) => b.data.getTime() - a.data.getTime())
    .slice(0, limite);
  const ids = [...new Set(dele.map((confronto) => (confronto.claA === claId ? confronto.claB : confronto.claA)))];
  const adversarios = ids.length === 0 ? [] : await bd.select({ id: clas.id, sigla: clas.sigla, nome: clas.nome }).from(clas).where(inArray(clas.id, ids));
  return dele.flatMap((confronto) => {
    const souA = confronto.claA === claId;
    const adversario = adversarios.find((cla) => cla.id === (souA ? confronto.claB : confronto.claA));
    if (!adversario) return [];
    const [a, b] = confronto.placar.split(' x ');
    return [
      {
        id: confronto.id,
        data: confronto.data,
        adversario,
        resultado: confronto.vencedor === null ? 'empate' : confronto.vencedor === claId ? 'vitoria' : 'derrota',
        placar: souA ? confronto.placar : `${b} x ${a}`,
        mapas: confronto.mapas,
        mapa: confronto.mapa,
        contou: contam.has(confronto.id),
      },
    ];
  });
}
