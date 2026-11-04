import { and, count, eq, gte, inArray, lt, min, sql, sum } from 'drizzle-orm';
import type { Bd } from '@/bd/conexao';
import { partidaJogadores, partidas, usuarios } from '@/bd/esquema';
import { kdDe, porcentagem, umaCasa } from './ficha';
import type { UsuarioPublico } from './salas';

export const MINIMO_DE_PARTIDAS_NO_MES = 5;
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
        // A Diversão não conta no competitivo.
        inArray(partidas.tipo, ['mix', 'desafio']),
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
    .where(eq(partidas.estado, 'encerrada'));
  return primeira ? mesDe(primeira) : null;
}
