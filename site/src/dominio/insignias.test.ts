import { expect, test } from 'vitest';
import type { Bd } from '@/bd/conexao';
import { eq } from 'drizzle-orm';
import { insigniasDoJogador, itensDoJogador, partidaJogadores, partidas, servidoresDiversao, usuarios, xpPartidas } from '@/bd/esquema';
import { criarBancoDeTeste, criarUsuario } from '@/bd/teste';
import { conferirInsignias, conferirInsigniasDeTodos, contarFamilias, escolherPrincipal, InsigniaQueNaoTem, insigniasDe, marcarInsigniasVistas, principaisDe, FAMILIAS, lerChaveDaInsignia, niveisAlcancados, nomeDaInsignia, PREMIOS } from './insignias';
import { ITENS_A_VENDA } from './loja';
import { notificacoesDe } from './notificacoes';

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

const AGORA = new Date('2026-11-11T12:00:00Z');
const DIA = 24 * 60 * 60 * 1000;

async function contaDe(bd: Bd, id: string) {
  const [conta] = await bd.select({ grana: usuarios.grana, xpTotal: usuarios.xpTotal, principal: usuarios.insigniaPrincipal }).from(usuarios).where(eq(usuarios.id, id));
  return conta;
}

test('conquistar Estrela até o Ouro paga os três prêmios uma vez só e vira a principal', async () => {
  const bd = await criarBancoDeTeste();
  const conta = await criarUsuario(bd, { estado: 'ativo' });
  await partidaDe(bd, conta.id, { venceu: false, hs: 0, k5: 0, mvps: 231 });
  const xpAntes = (await contaDe(bd, conta.id)).xpTotal;

  const novas = await bd.transaction((tx) => conferirInsignias(tx, [conta.id], AGORA, () => 0));
  expect(novas.map((nova) => `${nova.familia}:${nova.nivel}`)).toEqual(['estrela:0', 'estrela:1', 'estrela:2']);
  const depois = await contaDe(bd, conta.id);
  expect(depois.grana).toBe(50 + 100 + 200);
  expect(depois.xpTotal - xpAntes).toBe(200 + 500 + 1000);
  expect(depois.principal).toBe('estrela:2');
  // O sorteio caiu duas vezes no primeiro mutante: 1 + 3 dias.
  const primeiro = ITENS_A_VENDA().filter((item) => item.tipo === 'mutante')[0];
  const [posse] = await bd.select().from(itensDoJogador).where(eq(itensDoJogador.usuarioId, conta.id));
  expect(posse.itemId).toBe(primeiro.id);
  expect(posse.expiraEm).toEqual(new Date(AGORA.getTime() + 4 * DIA));

  // De novo: nada novo, nada pago.
  expect(await bd.transaction((tx) => conferirInsignias(tx, [conta.id], AGORA, () => 0))).toEqual([]);
  expect((await contaDe(bd, conta.id)).grana).toBe(350);
});

test('duas conferências juntas da mesma conta pagam uma vez só', async () => {
  const bd = await criarBancoDeTeste();
  const conta = await criarUsuario(bd, { estado: 'ativo' });
  await partidaDe(bd, conta.id, { venceu: false, hs: 0, k5: 0, mvps: 231 });
  await Promise.all([1, 2].map(() => bd.transaction((tx) => conferirInsignias(tx, [conta.id], AGORA, () => 0))));
  expect(await bd.select().from(insigniasDoJogador).where(eq(insigniasDoJogador.usuarioId, conta.id))).toHaveLength(3);
  expect((await contaDe(bd, conta.id)).grana).toBe(350);
});

test('Lendária com todos os mutantes já para sempre dá Grana a mais no lugar do mutante', async () => {
  const bd = await criarBancoDeTeste();
  const conta = await criarUsuario(bd, { estado: 'ativo' });
  const mutantes = ITENS_A_VENDA().filter((item) => item.tipo === 'mutante');
  await bd.insert(itensDoJogador).values(mutantes.map((item) => ({ usuarioId: conta.id, itemId: item.id, expiraEm: null })));
  await partidaDe(bd, conta.id, { venceu: false, hs: 0, k5: 100, mvps: 0 });
  await bd.transaction((tx) => conferirInsignias(tx, [conta.id], AGORA, () => 0));
  const [lendaria] = await bd.select().from(insigniasDoJogador).where(eq(insigniasDoJogador.nivel, 4));
  expect(lendaria).toMatchObject({ familia: 'ace', grana: 800 + 1000, mutanteId: null });
});

test('a conferência da estreia passa por todas as contas ativas e, rodada de novo, não paga nada', async () => {
  const bd = await criarBancoDeTeste();
  const contas = await Promise.all([1, 2, 3].map(() => criarUsuario(bd, { estado: 'ativo' })));
  for (const conta of contas) await partidaDe(bd, conta.id, { venceu: false, hs: 50, k5: 0, mvps: 0 });
  expect(await conferirInsigniasDeTodos(bd, 2)).toBe(3);
  expect(await conferirInsigniasDeTodos(bd, 2)).toBe(0);
});

test('a leitura das insígnias, a escolha da principal e o aviso no sino', async () => {
  const bd = await criarBancoDeTeste();
  const conta = await criarUsuario(bd, { estado: 'ativo' });
  await partidaDe(bd, conta.id, { venceu: false, hs: 0, k5: 0, mvps: 60 });
  await bd.transaction((tx) => conferirInsignias(tx, [conta.id], AGORA, () => 0));

  const lidas = await insigniasDe(bd, conta.id);
  const estrela = lidas.familias.find((familia) => familia.familia === 'estrela');
  expect(estrela).toMatchObject({ contagem: 60, nivel: 1, proximaMeta: 200 });
  expect(estrela?.conquistadas.map((item) => item.nivel)).toEqual([0, 1]);
  expect(lidas.total).toBe(2);
  expect(lidas.principal).toEqual({ familia: 'estrela', nivel: 1 });

  await escolherPrincipal(bd, conta.id, 'estrela', 0);
  expect((await principaisDe(bd, [conta.id])).get(conta.id)).toEqual({ familia: 'estrela', nivel: 0 });
  await expect(escolherPrincipal(bd, conta.id, 'mira', 0)).rejects.toBeInstanceOf(InsigniaQueNaoTem);
  // Uma principal gravada que a conta não tem não aparece.
  await bd.update(usuarios).set({ insigniaPrincipal: 'mira:4' }).where(eq(usuarios.id, conta.id));
  expect((await principaisDe(bd, [conta.id])).has(conta.id)).toBe(false);

  const [atual] = await bd.select().from(usuarios).where(eq(usuarios.id, conta.id));
  const avisos = (await notificacoesDe(bd, atual, AGORA)).filter((item) => item.tipo === 'insignia');
  expect(avisos).toEqual([{ tipo: 'insignia', texto: '2 novas insígnias: +150 Grana e +700 XP', href: `/jogadores/${conta.id}?aba=insignias`, quantidade: 1 }]);
  await marcarInsigniasVistas(bd, conta.id);
  expect((await notificacoesDe(bd, atual, AGORA)).filter((item) => item.tipo === 'insignia')).toEqual([]);
});
