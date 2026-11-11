import { expect, test } from 'vitest';
import type { Bd } from '@/bd/conexao';
import { partidaJogadores, partidas, servidoresDiversao, xpPartidas } from '@/bd/esquema';
import { criarBancoDeTeste, criarUsuario } from '@/bd/teste';
import { contarFamilias, FAMILIAS, lerChaveDaInsignia, niveisAlcancados, nomeDaInsignia, PREMIOS } from './insignias';

const ZERO = { mira: 0, ace: 0, estrela: 0, vencedor: 0, mutacao: 0, veterano: 0 };

test('as metas e os prêmios são os da tabela aprovada', () => {
  expect(FAMILIAS.map((familia) => [familia.chave, familia.metas])).toEqual([
    ['mira', [50, 250, 1000, 3000, 10000]],
    ['ace', [1, 5, 20, 50, 100]],
    ['estrela', [10, 50, 200, 500, 1000]],
    ['vencedor', [5, 25, 100, 300, 1000]],
    ['mutacao', [5, 25, 100, 300, 1000]],
    ['veterano', [10, 50, 200, 500, 1500]],
  ]);
  expect(PREMIOS).toEqual([
    { grana: 50, xp: 200, mutanteDias: undefined },
    { grana: 100, xp: 500, mutanteDias: 1 },
    { grana: 200, xp: 1000, mutanteDias: 3 },
    { grana: 400, xp: 2000, mutanteDias: 5 },
    { grana: 800, xp: 5000, mutanteDias: null },
  ]);
});

test('alcançar uma meta dá todos os níveis até ela', () => {
  expect(niveisAlcancados({ ...ZERO, estrela: 231 })).toEqual([
    { familia: 'estrela', nivel: 0 },
    { familia: 'estrela', nivel: 1 },
    { familia: 'estrela', nivel: 2 },
  ]);
  expect(niveisAlcancados({ ...ZERO, mira: 49 })).toEqual([]);
  expect(niveisAlcancados({ ...ZERO, ace: 100 })).toHaveLength(5);
});

test('o nome e a chave da insígnia', () => {
  expect(nomeDaInsignia('estrela', 2)).toBe('Estrela Ouro');
  expect(lerChaveDaInsignia('mutacao:4')).toEqual({ familia: 'mutacao', nivel: 4 });
  expect(lerChaveDaInsignia('qualquer:9')).toBeNull();
  expect(lerChaveDaInsignia('mira:5')).toBeNull();
  expect(lerChaveDaInsignia(null)).toBeNull();
});

/** Partida de competitivo ou mix com a linha do jogador e, se valeu XP, a linha de xp_partidas. */
async function partidaDe(bd: Bd, usuarioId: string, dados: { tipo?: 'mix' | 'desafio' | 'teste'; venceu: boolean; hs: number; k5: number; mvps: number; valeuXp?: boolean }) {
  const [partida] = await bd.insert(partidas).values({ tipo: dados.tipo ?? 'mix', estado: 'encerrada', mapa: 'de_mirage', vencedor: 1 }).returning();
  await bd.insert(partidaJogadores).values({ partidaId: partida.id, usuarioId, time: dados.venceu ? 1 : 2, headshotKills: dados.hs, k5: dados.k5, mvps: dados.mvps });
  if (dados.valeuXp !== false) {
    await bd.insert(xpPartidas).values({ usuarioId, origem: 'partida', referencia: partida.id, abates: 10, resultado: dados.venceu ? 'vitoria' : 'derrota', xp: 100 });
  }
}

async function portaDo(bd: Bd, modo: 'mutacao' | 'fantasma'): Promise<number> {
  const servidores = await bd.select().from(servidoresDiversao);
  const servidor = servidores.find((item) => item.modo === modo);
  if (servidor) return servidor.porta;
  const porta = modo === 'mutacao' ? 28020 : 28030;
  await bd.insert(servidoresDiversao).values({ modo, armas: 'x', mapa: 'x', foto: '/x.webp', porta, ativo: true, ordem: porta });
  return porta;
}

test('a contagem usa só partidas que valeram XP e separa a Mutação pela porta do servidor', async () => {
  const bd = await criarBancoDeTeste();
  const conta = await criarUsuario(bd, { estado: 'ativo' });
  const vazia = await criarUsuario(bd, { estado: 'ativo' });
  await partidaDe(bd, conta.id, { venceu: true, hs: 30, k5: 1, mvps: 4 });
  await partidaDe(bd, conta.id, { venceu: false, hs: 25, k5: 0, mvps: 7 });
  // Teste do Adm: tem a linha da partida, mas não vale XP, então não conta.
  await partidaDe(bd, conta.id, { tipo: 'teste', venceu: true, hs: 99, k5: 9, mvps: 9, valeuXp: false });
  const mutacao = await portaDo(bd, 'mutacao');
  const fantasma = await portaDo(bd, 'fantasma');
  await bd.insert(xpPartidas).values([
    { usuarioId: conta.id, origem: 'diversao', referencia: `diversao:${mutacao}:1`, abates: 3, resultado: 'vitoria', xp: 100 },
    { usuarioId: conta.id, origem: 'diversao', referencia: `diversao:${mutacao}:2`, abates: 1, resultado: 'derrota', xp: 50 },
    { usuarioId: conta.id, origem: 'diversao', referencia: `diversao:${fantasma}:1`, abates: 5, resultado: 'vitoria', xp: 100 },
  ]);

  const contagem = await contarFamilias(bd, [conta.id, vazia.id]);
  expect(contagem.get(conta.id)).toEqual({ mira: 55, ace: 1, estrela: 11, vencedor: 1, mutacao: 1, veterano: 5 });
  expect(contagem.get(vazia.id)).toEqual({ mira: 0, ace: 0, estrela: 0, vencedor: 0, mutacao: 0, veterano: 0 });
});
