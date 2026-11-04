import { eq } from 'drizzle-orm';
import { beforeEach, expect, test } from 'vitest';
import type { Bd } from '@/bd/conexao';
import { usuarios, xpPartidas, type Usuario } from '@/bd/esquema';
import { criarBancoDeTeste, criarUsuario } from '@/bd/teste';
import { respostaDoResultado } from './xp-diversao';

const TOKEN = 'token-de-teste';
const EQUIPE = 27019;
const CADA_UM = 27016;
const MUTACAO_INATIVO = 27020;

let bd: Bd;

beforeEach(async () => {
  bd = await criarBancoDeTeste();
});

function pedido(corpo: unknown, token = TOKEN): Request {
  return new Request('http://site/api/servidor/diversao/resultado', {
    method: 'POST',
    headers: { authorization: `Bearer ${token}` },
    body: typeof corpo === 'string' ? corpo : JSON.stringify(corpo),
  });
}

function jogador(conta: Usuario, dados: Record<string, unknown> = {}) {
  return { steamid64: conta.steamid64, abates: 12, minutos: 5, ateOFim: true, time: 'ct', ...dados };
}

function resultado(jogadores: unknown[], dados: Record<string, unknown> = {}) {
  return { porta: EQUIPE, partida: 'partida-1', duracaoMinutos: 5, vencedor: 'ct', jogadores, ...dados };
}

async function enviar(corpo: unknown) {
  const resposta = await respostaDoResultado(bd, pedido(corpo), TOKEN);
  expect(resposta.status).toBe(200);
  return (await resposta.json()).ganhos as { steamid64: string; xp: number; xpTotal: number; patente: string; subiu: boolean }[];
}

const membro = () => criarUsuario(bd, { estado: 'ativo' });
const xpDe = async (conta: Usuario) => (await bd.select().from(usuarios).where(eq(usuarios.id, conta.id)))[0].xpTotal;

test('token errado é recusado', async () => {
  const resposta = await respostaDoResultado(bd, pedido(resultado([]), 'errado'), TOKEN);
  expect(resposta.status).toBe(401);
});

test('corpo grande demais é recusado', async () => {
  const resposta = await respostaDoResultado(bd, pedido('x'.repeat(1024 * 1024 + 1)), TOKEN);
  expect(resposta.status).toBe(413);
});

test.each([
  ['texto que não é JSON', 'não é json'],
  ['sem porta', { partida: 'a', duracaoMinutos: 5, vencedor: null, jogadores: [] }],
  ['id de partida com símbolos', resultado([], { partida: 'a;b' })],
  ['id de partida comprido demais', resultado([], { partida: 'a'.repeat(65) })],
])('%s é recusado', async (_nome, corpo) => {
  expect((await respostaDoResultado(bd, pedido(corpo), TOKEN)).status).toBe(400);
});

test('abates negativos são recusados', async () => {
  const conta = await membro();
  expect((await respostaDoResultado(bd, pedido(resultado([jogador(conta, { abates: -5 })])), TOKEN)).status).toBe(400);
  expect(await xpDe(conta)).toBe(0);
});

test('mais de 32 jogadores é recusado', async () => {
  const conta = await membro();
  const muitos = Array.from({ length: 33 }, () => jogador(conta));
  expect((await respostaDoResultado(bd, pedido(resultado(muitos)), TOKEN)).status).toBe(400);
});

test.each([
  ['sem servidor', 27999],
  ['de servidor inativo', MUTACAO_INATIVO],
])('porta %s não grava nada', async (_nome, porta) => {
  const conta = await membro();
  const resposta = await respostaDoResultado(bd, pedido(resultado([jogador(conta)], { porta })), TOKEN);
  expect(resposta.status).toBe(404);
  expect(await bd.select().from(xpPartidas)).toEqual([]);
});

test('no Fantasma, o XP sai do time, e quem jogou menos da metade não ganha', async () => {
  const ct = await membro();
  const tr = await membro();
  const atrasado = await membro();
  const ganhos = await enviar(
    resultado([jogador(ct, { minutos: 20 }), jogador(tr, { minutos: 20, time: 'tr' }), jogador(atrasado, { minutos: 2 })], { porta: 27021, duracaoMinutos: 20, vencedor: 'ct' }),
  );
  expect(ganhos.find((g) => g.steamid64 === ct.steamid64)).toMatchObject({ xp: 840 });
  expect(ganhos.find((g) => g.steamid64 === tr.steamid64)).toMatchObject({ xp: 540 });
  expect(ganhos.find((g) => g.steamid64 === atrasado.steamid64)).toMatchObject({ xp: 0 });
});

test('no Equipe x Equipe, vencedor e perdedor ganham o XP da fórmula', async () => {
  const ct = await membro();
  const tr = await membro();
  const ganhos = await enviar(resultado([jogador(ct), jogador(tr, { time: 'tr' })]));
  expect(ganhos.find((g) => g.steamid64 === ct.steamid64)).toMatchObject({ xp: 840, xpTotal: 840, patente: 'Recruta', subiu: false });
  expect(ganhos.find((g) => g.steamid64 === tr.steamid64)).toMatchObject({ xp: 540 });
});

test('no empate, os dois times ganham a metade do bônus', async () => {
  const ct = await membro();
  const tr = await membro();
  await enviar(resultado([jogador(ct), jogador(tr, { time: 'tr' })], { vencedor: 'empate' }));
  expect(await xpDe(ct)).toBe(690);
  expect(await xpDe(tr)).toBe(690);
});

test('no Equipe x Equipe, quem jogou menos da metade do tempo fica com 0', async () => {
  const conta = await membro();
  await enviar(resultado([jogador(conta, { minutos: 2 })]));
  expect(await xpDe(conta)).toBe(0);
});

test('quem não estava no fim fica com 0', async () => {
  const conta = await membro();
  await enviar(resultado([jogador(conta, { ateOFim: false })]));
  expect(await xpDe(conta)).toBe(0);
});

test('no Cada um por si, o terço de cima vence', async () => {
  const contas = [];
  for (let i = 0; i < 6; i += 1) contas.push(await membro());
  await enviar({
    porta: CADA_UM,
    partida: 'ciclo-1',
    duracaoMinutos: 20,
    vencedor: null,
    jogadores: contas.map((conta, i) => ({ steamid64: conta.steamid64, abates: 10 - i, minutos: 20, ateOFim: true })),
  });
  expect(await xpDe(contas[0])).toBe(800);
  expect(await xpDe(contas[1])).toBe(780);
  expect(await xpDe(contas[2])).toBe(460);
});

test('no Cada um por si, o terço arredonda para cima', async () => {
  const contas = [];
  for (let i = 0; i < 4; i += 1) contas.push(await membro());
  await enviar({
    porta: CADA_UM,
    partida: 'ciclo-1',
    duracaoMinutos: 20,
    vencedor: null,
    jogadores: contas.map((conta, i) => ({ steamid64: conta.steamid64, abates: 10 - i, minutos: 20, ateOFim: true })),
  });
  expect(await xpDe(contas[1])).toBe(780);
  expect(await xpDe(contas[2])).toBe(460);
});

test('no Cada um por si, quem tem 0 abates nunca vence', async () => {
  const conta = await membro();
  await enviar({ porta: CADA_UM, partida: 'ciclo-1', duracaoMinutos: 20, vencedor: null, jogadores: [{ steamid64: conta.steamid64, abates: 0, minutos: 20, ateOFim: true }] });
  expect(await xpDe(conta)).toBe(300);
});

test('no Cada um por si, quem jogou menos de 5 minutos fica com 0', async () => {
  const conta = await membro();
  await enviar({ porta: CADA_UM, partida: 'ciclo-1', duracaoMinutos: 20, vencedor: null, jogadores: [{ steamid64: conta.steamid64, abates: 5, minutos: 4, ateOFim: true }] });
  expect(await xpDe(conta)).toBe(0);
});

test('conta de fora e conta suspensa não ganham nem aparecem na resposta', async () => {
  const dentro = await membro();
  const suspensa = await criarUsuario(bd, { estado: 'suspenso' });
  const ganhos = await enviar(resultado([jogador(dentro), jogador(suspensa), { steamid64: '76561199999999999', abates: 3, minutos: 5, ateOFim: true, time: 'tr' }]));
  expect(ganhos.map((g) => g.steamid64)).toEqual([dentro.steamid64]);
  expect(await xpDe(suspensa)).toBe(0);
});

test('reenviar o mesmo resultado devolve a mesma resposta, sem somar', async () => {
  const conta = await membro();
  const corpo = resultado([jogador(conta)]);
  const primeira = await enviar(corpo);
  const segunda = await enviar(corpo);
  expect(segunda).toEqual(primeira);
  expect(await xpDe(conta)).toBe(840);
});

test('um número absurdo de abates não passa do teto', async () => {
  const conta = await membro();
  await enviar(resultado([jogador(conta, { abates: 9999 })]));
  expect(await xpDe(conta)).toBe(1100);
});

test('a resposta avisa quando a pessoa sobe de patente', async () => {
  const conta = await membro();
  await bd.update(usuarios).set({ xpTotal: 4000 }).where(eq(usuarios.id, conta.id));
  const [ganho] = await enviar(resultado([jogador(conta)]));
  expect(ganho).toMatchObject({ patente: 'Magnata Jr.', subiu: true });
});

test('a mesma partida em servidores diferentes conta separada', async () => {
  const conta = await membro();
  await enviar(resultado([jogador(conta)]));
  await enviar({ porta: CADA_UM, partida: 'partida-1', duracaoMinutos: 20, vencedor: null, jogadores: [{ steamid64: conta.steamid64, abates: 1, minutos: 20, ateOFim: true }] });
  expect(await bd.select().from(xpPartidas).where(eq(xpPartidas.usuarioId, conta.id))).toHaveLength(2);
});
