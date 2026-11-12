import { eq } from 'drizzle-orm';
import { beforeEach, expect, test } from 'vitest';
import type { Bd } from '@/bd/conexao';
import { banimentos, chamados, claMembros, clas, desafios, partidaJogadores, partidas, presentes, salaMembros, type Partida, type Usuario } from '@/bd/esquema';
import { criarBancoDeTeste, criarUsuario } from '@/bd/teste';
import { chamarParaCla, criarCla, pedirParaEntrar } from './clas';
import { contarCasos, denunciar } from './denuncias';
import { desafiar } from './desafios';
import { casosDe, notificacoesDe } from './notificacoes';
import { abrirPresente } from './presentes';
import { criarSala, entrarNaSala } from './salas';

let bd: Bd;
let jogador: Usuario;
const AGORA = new Date('2026-11-03T12:00:00Z');

beforeEach(async () => {
  bd = await criarBancoDeTeste();
  jogador = await criarUsuario(bd, { estado: 'ativo' });
});

async function salaCompleta(nome: string): Promise<{ id: string; lider: Usuario; outro: Usuario }> {
  const lider = await criarUsuario(bd, { estado: 'ativo', apelido: nome });
  const { id } = await criarSala(bd, lider);
  let outro = lider;
  for (let i = 1; i < 5; i += 1) {
    outro = await criarUsuario(bd, { estado: 'ativo' });
    await entrarNaSala(bd, outro, id);
  }
  return { id, lider, outro };
}

async function partidaDe(contas: Usuario[], estado: Partida['estado']): Promise<Partida> {
  const [partida] = await bd.insert(partidas).values({ tipo: 'mix', estado, mapa: 'de_mirage' }).returning();
  await bd.insert(partidaJogadores).values(contas.map((conta) => ({ partidaId: partida.id, usuarioId: conta.id, time: 1 })));
  return partida;
}

test('líder vê o desafio recebido, com link para as salas', async () => {
  const origem = await salaCompleta('Alfa');
  const alvo = await salaCompleta('Bravo');
  await desafiar(bd, origem.lider, alvo.id, AGORA);
  expect(await notificacoesDe(bd, alvo.lider, AGORA)).toEqual([
    { tipo: 'desafio', texto: 'A sala Alfa desafiou a sua.', href: '/jogar?modo=competitivo', quantidade: 1 },
  ]);
});

test('desafio enviado não notifica quem desafiou', async () => {
  const origem = await salaCompleta('Alfa');
  const alvo = await salaCompleta('Bravo');
  await desafiar(bd, origem.lider, alvo.id, AGORA);
  expect(await notificacoesDe(bd, origem.lider, AGORA)).toEqual([]);
});

test('membro que não lidera não recebe o aviso de desafio', async () => {
  const origem = await salaCompleta('Alfa');
  const alvo = await salaCompleta('Bravo');
  await desafiar(bd, origem.lider, alvo.id, AGORA);
  expect(await notificacoesDe(bd, alvo.outro, AGORA)).toEqual([]);
});

test('desafio vencido não notifica', async () => {
  const origem = await salaCompleta('Alfa');
  const alvo = await salaCompleta('Bravo');
  await desafiar(bd, origem.lider, alvo.id, AGORA);
  expect(await bd.select().from(desafios)).toHaveLength(1);
  const depois = new Date(AGORA.getTime() + 61_000);
  expect(await notificacoesDe(bd, alvo.lider, depois)).toEqual([]);
});

test('partida aguardando jogadores notifica quem joga, com link para a partida', async () => {
  const partida = await partidaDe([jogador], 'aguardando_jogadores');
  expect(await notificacoesDe(bd, jogador, AGORA)).toEqual([
    { tipo: 'partida', texto: 'Sua partida está pronta. Entre no servidor.', href: `/partidas/${partida.id}`, quantidade: 1 },
  ]);
});

test.each([['ao_vivo'], ['carregando'], ['encerrada']] as const)('partida %s não notifica', async (estado) => {
  await partidaDe([jogador], estado);
  expect(await notificacoesDe(bd, jogador, AGORA)).toEqual([]);
});

test('equipe vê chamados, denúncias e propostas, e a soma bate com contarCasos', async () => {
  const gm = await criarUsuario(bd, { estado: 'ativo', papel: 'gm' });
  const acusado = await criarUsuario(bd, { estado: 'ativo' });
  const outro = await criarUsuario(bd, { estado: 'ativo' });
  const partida = await partidaDe([jogador, acusado, outro], 'ao_vivo');
  await bd.insert(chamados).values({ partidaId: partida.id, chamadoPor: jogador.id });
  await denunciar(bd, jogador, { partidaId: partida.id, acusadoId: acusado.id, motivo: 'x' });
  await denunciar(bd, outro, { partidaId: partida.id, acusadoId: acusado.id, motivo: 'y' });
  await bd.insert(banimentos).values({ usuarioId: acusado.id, motivo: 'z', propostoPor: gm.id });

  const lista = await notificacoesDe(bd, gm, AGORA);
  expect(lista).toEqual([
    { tipo: 'chamados', texto: '1 chamado aberto', href: '/olho-de-aguia', quantidade: 1 },
    { tipo: 'denuncias', texto: '2 denúncias abertas', href: '/olho-de-aguia', quantidade: 2 },
    { tipo: 'propostas', texto: '1 proposta de banimento', href: '/olho-de-aguia', quantidade: 1 },
  ]);
  expect(lista.reduce((total, item) => total + item.quantidade, 0)).toBe(await contarCasos(bd, gm));
});

test('tipo sem pendência não aparece', async () => {
  const gm = await criarUsuario(bd, { estado: 'ativo', papel: 'gm' });
  expect(await notificacoesDe(bd, gm, AGORA)).toEqual([]);
});

test('jogador denunciado não recebe nenhuma notificação', async () => {
  const outro = await criarUsuario(bd, { estado: 'ativo' });
  const partida = await partidaDe([jogador, outro], 'encerrada');
  await denunciar(bd, outro, { partidaId: partida.id, acusadoId: jogador.id, motivo: 'x' });
  expect(await notificacoesDe(bd, jogador, AGORA)).toEqual([]);
});

test('casosDe soma só o que é da aba Olho de Águia', () => {
  expect(
    casosDe([
      { tipo: 'partida', texto: '', href: '/partidas/1', quantidade: 1 },
      { tipo: 'desafio', texto: '', href: '/salas', quantidade: 2 },
      { tipo: 'chamados', texto: '', href: '/olho-de-aguia', quantidade: 3 },
      { tipo: 'denuncias', texto: '', href: '/olho-de-aguia', quantidade: 4 },
      { tipo: 'propostas', texto: '', href: '/olho-de-aguia', quantidade: 5 },
    ]),
  ).toBe(12);
});

test('GM com partida pronta vê as duas coisas', async () => {
  const gm = await criarUsuario(bd, { estado: 'ativo', papel: 'gm' });
  await partidaDe([gm], 'aguardando_jogadores');
  await bd.insert(banimentos).values({ usuarioId: jogador.id, motivo: 'z', propostoPor: gm.id });
  const tipos = (await notificacoesDe(bd, gm, AGORA)).map((item) => item.tipo);
  expect(tipos).toEqual(['partida', 'propostas']);
});

// Clãs: desafio de clã, chamado para o clã e pedidos para quem cuida do clã.
async function salaDoCla(claId: string, nome: string, cargo: 'dono' | 'capitao') {
  const sala = await salaCompleta(nome);
  const membros = await bd.select().from(salaMembros).where(eq(salaMembros.salaId, sala.id));
  for (const linha of membros) await bd.insert(claMembros).values({ usuarioId: linha.usuarioId, claId, cargo: linha.usuarioId === sala.lider.id ? cargo : 'membro' });
  return sala;
}

test('desafio de clã aparece com a sigla e o formato; o de treino, como treino', async () => {
  const [alfa] = await bd.insert(clas).values({ nome: 'Magnatas', sigla: 'MGN', cor: 'ouro', entrada: 'aberto' }).returning();
  const [bravo] = await bd.insert(clas).values({ nome: 'Forja', sigla: 'FRG', cor: 'roxo', entrada: 'aberto' }).returning();
  const origem = await salaDoCla(alfa.id, 'Alfa', 'dono');
  const alvo = await salaDoCla(bravo.id, 'Bravo', 'capitao');
  await desafiar(bd, origem.lider, alvo.id, AGORA, { formato: 'cla', mapas: 3 });
  expect(await notificacoesDe(bd, alvo.lider, AGORA)).toEqual([
    { tipo: 'desafio', texto: 'O clã [MGN] desafiou vocês para uma MD3', href: '/jogar?modo=competitivo', quantidade: 1 },
  ]);
  const treino = await salaDoCla(alfa.id, 'Charlie', 'capitao');
  const outraDoClaAlfa = await salaDoCla(alfa.id, 'Delta', 'capitao');
  await desafiar(bd, treino.lider, outraDoClaAlfa.id, AGORA, { formato: 'treino', mapas: 1 });
  expect((await notificacoesDe(bd, outraDoClaAlfa.lider, AGORA))[0].texto).toBe('Seu clã chamou vocês para um treino MD1');
});

test('quem foi chamado para um clã vê o aviso, e o dono vê os pedidos para entrar', async () => {
  const dono = await criarUsuario(bd, { estado: 'ativo' });
  const cla = await criarCla(bd, dono, { nome: 'Magnatas', sigla: 'MGN', cor: 'ouro', entrada: 'convite', descricao: '' }, AGORA);
  await chamarParaCla(bd, dono, cla.id, jogador.id, AGORA);
  expect(await notificacoesDe(bd, jogador, AGORA)).toEqual([{ tipo: 'cla', texto: 'O clã [MGN] chamou você', href: '/clas', quantidade: 1 }]);
  for (let i = 0; i < 2; i += 1) await pedirParaEntrar(bd, await criarUsuario(bd, { estado: 'ativo' }), cla.id, AGORA);
  expect(await notificacoesDe(bd, dono, AGORA)).toEqual([{ tipo: 'cla', texto: '2 pedidos para entrar no clã', href: '/clas', quantidade: 2 }]);
});

test('o presente fechado do Premium avisa no sino até ser aberto', async () => {
  await bd.insert(presentes).values({ usuarioId: jogador.id });
  expect(await notificacoesDe(bd, jogador, AGORA)).toContainEqual({ tipo: 'presente', texto: 'Chegou seu presente de Magnata. Abra no baú!', href: '/bau#presente', quantidade: 1 });
  await abrirPresente(bd, jogador, 'mutante-blindado', AGORA);
  expect((await notificacoesDe(bd, jogador, AGORA)).some((item) => item.tipo === 'presente')).toBe(false);
});
