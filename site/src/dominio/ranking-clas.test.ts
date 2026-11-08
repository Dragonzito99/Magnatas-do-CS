import { beforeEach, describe, expect, test } from 'vitest';
import type { Bd } from '@/bd/conexao';
import { claMembros, clas, partidas, series, type Cla } from '@/bd/esquema';
import { criarBancoDeTeste, criarUsuario } from '@/bd/teste';
import { confrontosQueContam, numerosDoCla, rankingDeClas, ultimasDoCla, type ConfrontoDeCla } from './ranking-clas';

let bd: Bd;

beforeEach(async () => {
  bd = await criarBancoDeTeste();
});

async function cla(nome: string, sigla: string, membros = 1): Promise<Cla> {
  const [novo] = await bd.insert(clas).values({ nome, sigla, cor: 'ouro', entrada: 'aberto' }).returning();
  for (let i = 0; i < membros; i += 1) {
    const conta = await criarUsuario(bd, { estado: 'ativo' });
    await bd.insert(claMembros).values({ usuarioId: conta.id, claId: novo.id, cargo: i === 0 ? 'dono' : 'membro' });
  }
  return novo;
}

async function jogo(a: Cla, b: Cla, quando: string, vencedor: 1 | 2 | null, extra: Partial<typeof partidas.$inferInsert> = {}) {
  const [partida] = await bd
    .insert(partidas)
    .values({
      tipo: 'cla',
      estado: 'encerrada',
      mapa: 'de_mirage',
      claTime1Id: a.id,
      claTime2Id: b.id,
      vencedor,
      placar1: vencedor === 2 ? 9 : 13,
      placar2: vencedor === 2 ? 13 : vencedor === null ? 13 : 9,
      encerradaEm: new Date(quando),
      ...extra,
    })
    .returning();
  return partida;
}

const confronto = (id: string, claA: string, claB: string, data: string): ConfrontoDeCla => ({
  id,
  data: new Date(data),
  claA,
  claB,
  vencedor: claA,
  mapas: 1,
  placar: '13 x 9',
  mapa: 'de_mirage',
});

describe('confrontosQueContam', () => {
  test('do mesmo par no mesmo dia de Brasília, só o primeiro conta', () => {
    const lista = [confronto('3', 'a', 'b', '2026-11-08T20:00:00Z'), confronto('1', 'a', 'b', '2026-11-08T12:00:00Z'), confronto('2', 'b', 'a', '2026-11-08T15:00:00Z')];
    expect(confrontosQueContam(lista).map((item) => item.id)).toEqual(['1']);
  });

  test('23h do dia 7 e 1h do dia 8 em Brasília são dias diferentes', () => {
    const lista = [confronto('1', 'a', 'b', '2026-11-08T02:00:00Z'), confronto('2', 'a', 'b', '2026-11-08T04:00:00Z')];
    expect(confrontosQueContam(lista)).toHaveLength(2);
  });

  test('contra clãs diferentes no mesmo dia, os dois contam', () => {
    const lista = [confronto('1', 'a', 'b', '2026-11-08T12:00:00Z'), confronto('2', 'a', 'c', '2026-11-08T13:00:00Z')];
    expect(confrontosQueContam(lista)).toHaveLength(2);
  });
});

describe('rankingDeClas', () => {
  test('ordena por vitórias, depois aproveitamento, depois nome, e treino não conta', async () => {
    const alfa = await cla('Alfa', 'ALF', 3);
    const bravo = await cla('Bravo', 'BRV');
    const charlie = await cla('Charlie', 'CHA');
    const delta = await cla('Delta', 'DEL');
    await jogo(alfa, bravo, '2026-11-01T20:00:00Z', 1);
    await jogo(alfa, charlie, '2026-11-02T20:00:00Z', 1);
    await jogo(bravo, charlie, '2026-11-03T20:00:00Z', 1);
    await jogo(delta, charlie, '2026-11-04T20:00:00Z', 1);
    await jogo(delta, bravo, '2026-11-05T20:00:00Z', 2);
    await jogo(charlie, charlie, '2026-11-06T20:00:00Z', 1, { tipo: 'treino' });
    const linhas = await rankingDeClas(bd);
    expect(linhas.map((linha) => [linha.posicao, linha.cla.sigla, linha.vitorias, linha.jogos, linha.aproveitamento, linha.membros])).toEqual([
      [1, 'ALF', 2, 2, 100, 3],
      [2, 'BRV', 2, 3, 67, 1],
      [3, 'DEL', 1, 2, 50, 1],
      [4, 'CHA', 0, 3, 0, 1],
    ]);
  });

  test('o mesmo par no mesmo dia soma uma vez só', async () => {
    const alfa = await cla('Alfa', 'ALF');
    const bravo = await cla('Bravo', 'BRV');
    await jogo(alfa, bravo, '2026-11-01T18:00:00Z', 1);
    await jogo(alfa, bravo, '2026-11-01T19:00:00Z', 1);
    await jogo(alfa, bravo, '2026-11-01T20:00:00Z', 1);
    const [primeiro] = await rankingDeClas(bd);
    expect(primeiro).toMatchObject({ vitorias: 1, jogos: 1 });
  });

  test('série MD3 encerrada vale uma vitória, e a cancelada não vale', async () => {
    const alfa = await cla('Alfa', 'ALF');
    const bravo = await cla('Bravo', 'BRV');
    const [md3] = await bd.insert(series).values({ mapas: ['de_mirage', 'de_nuke', 'de_dust2'], estado: 'encerrada', vitorias1: 2, vitorias2: 1, vencedor: 1 }).returning();
    await jogo(alfa, bravo, '2026-11-01T18:00:00Z', 1, { serieId: md3.id, mapaDaSerie: 1, mapasDaPartida: 3 });
    await jogo(alfa, bravo, '2026-11-01T19:00:00Z', 2, { serieId: md3.id, mapaDaSerie: 2, mapasDaPartida: 3 });
    await jogo(alfa, bravo, '2026-11-01T20:00:00Z', 1, { serieId: md3.id, mapaDaSerie: 3, mapasDaPartida: 3 });
    const [cancelada] = await bd.insert(series).values({ mapas: ['de_mirage', 'de_nuke', 'de_dust2'], estado: 'cancelada' }).returning();
    await jogo(alfa, bravo, '2026-11-02T18:00:00Z', 2, { serieId: cancelada.id, mapaDaSerie: 1, mapasDaPartida: 3 });
    const linhas = await rankingDeClas(bd);
    expect(linhas.map((linha) => [linha.cla.sigla, linha.vitorias, linha.jogos])).toEqual([
      ['ALF', 1, 1],
      ['BRV', 0, 1],
    ]);
  });

  test('clã desfeito sai do ranking, e clã sem jogo aparece com zero', async () => {
    const alfa = await cla('Alfa', 'ALF');
    const [desfeito] = await bd.insert(clas).values({ nome: 'Velho', sigla: 'VLH', cor: 'prata', entrada: 'aberto', desfeitoEm: new Date() }).returning();
    await jogo(desfeito, alfa, '2026-11-01T18:00:00Z', 1);
    expect((await rankingDeClas(bd)).map((linha) => [linha.cla.sigla, linha.vitorias, linha.jogos])).toEqual([['ALF', 0, 1]]);
  });
});

describe('numeros e últimas do clã', () => {
  test('a página do clã mostra posição, vitórias, aproveitamento, membros e as últimas, dizendo quais não contaram', async () => {
    const alfa = await cla('Alfa', 'ALF', 2);
    const bravo = await cla('Bravo', 'BRV');
    await jogo(alfa, bravo, '2026-11-01T18:00:00Z', 1);
    await jogo(bravo, alfa, '2026-11-01T19:00:00Z', 1);
    await jogo(bravo, alfa, '2026-11-02T19:00:00Z', null);
    expect(await numerosDoCla(bd, alfa.id)).toEqual({ posicao: 1, vitorias: 1, aproveitamento: 50, membros: 2 });
    const ultimas = await ultimasDoCla(bd, alfa.id);
    expect(ultimas.map((linha) => [linha.adversario.sigla, linha.resultado, linha.placar, linha.contou])).toEqual([
      ['BRV', 'empate', '13 x 13', true],
      ['BRV', 'derrota', '9 x 13', false],
      ['BRV', 'vitoria', '13 x 9', true],
    ]);
  });
});
