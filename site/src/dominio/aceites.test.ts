import { asc, eq } from 'drizzle-orm';
import { beforeEach, expect, test } from 'vitest';
import type { Bd } from '@/bd/conexao';
import { faltas, filaMix, partidaJogadores, partidas, salaMembros, salas, usuarios, type Usuario } from '@/bd/esquema';
import { criarBancoDeTeste, criarUsuario } from '@/bd/teste';
import { AceiteIndisponivel, aceitarPartida, aceitesDaPartida, avisoPendente, PRAZO_DO_ACEITE_MS, resolverAceitesVencidos } from './aceites';
import { aceitarDesafio, desafiar } from './desafios';
import { JaOcupado } from './disponibilidade';
import { entrarNoMix } from './mix';
import { MAPAS, partidaAtualDe } from './partidas';
import { criarSala, entrarNaSala } from './salas';
import { PRAZO_DO_VETO_MS } from './vetos';

let bd: Bd;
const AGORA = new Date('2026-11-06T22:00:00Z');
const VENCIDO = new Date(AGORA.getTime() + PRAZO_DO_ACEITE_MS);

beforeEach(async () => {
  bd = await criarBancoDeTeste();
});

const membro = () => criarUsuario(bd, { estado: 'ativo' });

async function salaCom(total = 5): Promise<{ id: string; contas: Usuario[] }> {
  const lider = await membro();
  const { id } = await criarSala(bd, lider);
  const contas = [lider];
  for (let i = 1; i < total; i += 1) {
    const conta = await membro();
    await entrarNaSala(bd, conta, id);
    contas.push(conta);
  }
  return { id, contas };
}

async function desafioAceito() {
  const [a, b] = [await salaCom(), await salaCom()];
  const desafio = await desafiar(bd, a.contas[0], b.id, AGORA);
  const partida = await aceitarDesafio(bd, b.contas[0], desafio.id, AGORA);
  return { partida, a, b, todos: [...a.contas, ...b.contas] };
}

async function mixFechado() {
  const contas: Usuario[] = [];
  let partidaId: string | undefined;
  for (let i = 0; i < 10; i += 1) {
    const conta = await membro();
    contas.push(conta);
    ({ partidaId } = await entrarNoMix(bd, conta, { agora: new Date(AGORA.getTime() + i * 1000) }));
  }
  const [partida] = await bd.select().from(partidas).where(eq(partidas.id, partidaId!));
  return { partida, contas };
}

async function partidaDe(id: string) {
  const [linha] = await bd.select().from(partidas).where(eq(partidas.id, id));
  return linha;
}

async function membrosDe(salaId: string): Promise<string[]> {
  const linhas = await bd.select().from(salaMembros).where(eq(salaMembros.salaId, salaId));
  return linhas.map((linha) => linha.usuarioId);
}

test('aceitar o desafio cria a partida aguardando aceite, sem mapa e com 30 segundos', async () => {
  const { partida } = await desafioAceito();
  expect(PRAZO_DO_ACEITE_MS).toBe(30_000);
  expect(partida).toMatchObject({ estado: 'aguardando_aceite', mapa: null, aceiteAte: VENCIDO });
});

test('os 10 aceitando, o desafio vai para os vetos com o cara ou coroa feito', async () => {
  const { partida, todos } = await desafioAceito();
  for (const conta of todos.slice(0, 9)) await aceitarPartida(bd, conta, partida.id, AGORA);
  expect((await partidaDe(partida.id)).estado).toBe('aguardando_aceite');
  await aceitarPartida(bd, todos[9], partida.id, AGORA);
  const depois = await partidaDe(partida.id);
  expect(depois.estado).toBe('vetando');
  expect([1, 2]).toContain(depois.primeiroAVetar);
  expect(depois.vetoAte).toEqual(new Date(AGORA.getTime() + PRAZO_DO_VETO_MS));
  expect(depois.mapa).toBeNull();
});

test('os 10 aceitando, o mix sorteia o mapa e espera servidor', async () => {
  const { partida, contas } = await mixFechado();
  expect(partida).toMatchObject({ estado: 'aguardando_aceite', mapa: null });
  for (const conta of contas) await aceitarPartida(bd, conta, partida.id, AGORA);
  const depois = await partidaDe(partida.id);
  expect(depois.estado).toBe('aguardando_servidor');
  expect(MAPAS).toContain(depois.mapa);
  expect(depois.estadoDesde).toEqual(AGORA);
});

test('aceitar duas vezes não muda nada, e a lista mostra quem aceitou', async () => {
  const { partida, todos } = await desafioAceito();
  await aceitarPartida(bd, todos[0], partida.id, AGORA);
  await aceitarPartida(bd, todos[0], partida.id, AGORA);
  const lista = await aceitesDaPartida(bd, partida.id);
  expect(lista).toHaveLength(10);
  expect(lista.filter((linha) => linha.aceitou).map((linha) => linha.usuarioId)).toEqual([todos[0].id]);
});

test('aceitar depois dos 30 segundos é recusado', async () => {
  const { partida, todos } = await desafioAceito();
  await expect(aceitarPartida(bd, todos[0], partida.id, VENCIDO)).rejects.toThrow(AceiteIndisponivel);
});

test('quem não joga a partida não aceita', async () => {
  const { partida } = await desafioAceito();
  await expect(aceitarPartida(bd, await membro(), partida.id, AGORA)).rejects.toThrow(AceiteIndisponivel);
});

test('vencido no desafio: partida cancelada, quem não aceitou sai da sala com falta, e as salas ficam livres com o resto', async () => {
  const { partida, a, b, todos } = await desafioAceito();
  for (const conta of todos) if (conta.id !== a.contas[4].id) await aceitarPartida(bd, conta, partida.id, AGORA);
  await resolverAceitesVencidos(bd, VENCIDO);
  expect((await partidaDe(partida.id)).estado).toBe('cancelada');
  const [salaA] = await bd.select().from(salas).where(eq(salas.id, a.id));
  const [salaB] = await bd.select().from(salas).where(eq(salas.id, b.id));
  expect(salaA.partidaId).toBeNull();
  expect(salaB.partidaId).toBeNull();
  expect(await membrosDe(a.id)).toEqual(a.contas.slice(0, 4).map((conta) => conta.id));
  expect(await membrosDe(b.id)).toHaveLength(5);
  const registradas = await bd.select().from(faltas);
  expect(registradas.map((falta) => falta.usuarioId)).toEqual([a.contas[4].id]);
  expect(registradas[0].partidaId).toBe(partida.id);
});

test('líder que não aceitou sai, e a liderança passa adiante', async () => {
  const { partida, a, todos } = await desafioAceito();
  for (const conta of todos) if (conta.id !== a.contas[0].id) await aceitarPartida(bd, conta, partida.id, AGORA);
  await resolverAceitesVencidos(bd, VENCIDO);
  const [salaA] = await bd.select().from(salas).where(eq(salas.id, a.id));
  expect(salaA.liderId).toBe(a.contas[1].id);
});

test('vencido no mix: quem aceitou volta para a fila na ordem de antes, quem não aceitou não volta, e ninguém leva falta', async () => {
  const { partida, contas } = await mixFechado();
  for (const conta of contas.slice(1)) await aceitarPartida(bd, conta, partida.id, AGORA);
  // O mix fechou 9 segundos depois de AGORA, então o prazo dele termina mais tarde.
  await resolverAceitesVencidos(bd, partida.aceiteAte!);
  expect((await partidaDe(partida.id)).estado).toBe('cancelada');
  const fila = await bd.select().from(filaMix).orderBy(asc(filaMix.entrouEm));
  expect(fila.map((linha) => linha.usuarioId)).toEqual(contas.slice(1).map((conta) => conta.id));
  expect(fila.map((linha) => linha.entrouEm.getTime())).toEqual(contas.slice(1).map((_, i) => AGORA.getTime() + (i + 1) * 1000));
  expect(await bd.select().from(faltas)).toEqual([]);
});

test('alguém suspenso durante o aceite: a partida cai sem falta para ninguém', async () => {
  const { partida, a, todos } = await desafioAceito();
  for (const conta of todos.slice(0, 8)) await aceitarPartida(bd, conta, partida.id, AGORA);
  await bd.update(usuarios).set({ estado: 'suspenso' }).where(eq(usuarios.id, todos[8].id));
  await resolverAceitesVencidos(bd, VENCIDO);
  expect((await partidaDe(partida.id)).estado).toBe('cancelada');
  expect(await bd.select().from(faltas)).toEqual([]);
  // O faltoso ativo sai da sala mesmo assim.
  expect(await membrosDe(a.id)).not.toContain(todos[9].id);
});

test('antes do prazo a varredura não mexe', async () => {
  const { partida } = await desafioAceito();
  await resolverAceitesVencidos(bd, new Date(VENCIDO.getTime() - 1));
  expect((await partidaDe(partida.id)).estado).toBe('aguardando_aceite');
});

test('aceite simultâneo do último jogador e varredura no fim do prazo deixam um estado só', async () => {
  const { partida, todos } = await desafioAceito();
  for (const conta of todos.slice(0, 9)) await aceitarPartida(bd, conta, partida.id, AGORA);
  await Promise.allSettled([aceitarPartida(bd, todos[9], partida.id, new Date(VENCIDO.getTime() - 1)), resolverAceitesVencidos(bd, VENCIDO)]);
  const depois = await partidaDe(partida.id);
  expect(['vetando', 'cancelada']).toContain(depois.estado);
  const registradas = await bd.select().from(faltas);
  if (depois.estado === 'vetando') expect(registradas).toEqual([]);
  else expect(registradas).toHaveLength(1);
});

test('avisoPendente devolve a partida só enquanto a pessoa não aceitou e o estado é aguardando aceite', async () => {
  const { partida, todos } = await desafioAceito();
  expect(await avisoPendente(bd, todos[0].id, AGORA)).toEqual({ partidaId: partida.id, aceiteAte: VENCIDO });
  await aceitarPartida(bd, todos[0], partida.id, AGORA);
  expect(await avisoPendente(bd, todos[0].id, AGORA)).toBeNull();
  expect(await avisoPendente(bd, todos[1].id, VENCIDO)).toBeNull();
  expect(await avisoPendente(bd, (await membro()).id, AGORA)).toBeNull();
});

test('a partida criada já com mapa nasce aguardando servidor, para os testes antigos e o caminho sem aceite', async () => {
  const [partida] = await bd.insert(partidas).values({ tipo: 'mix', mapa: 'de_mirage' }).returning();
  expect(partida.estado).toBe('aguardando_servidor');
  expect(await bd.select().from(partidaJogadores)).toEqual([]);
});

test('quem está numa partida aguardando aceite ou nos vetos não está livre para sala nem mix', async () => {
  const { partida, todos } = await desafioAceito();
  await expect(entrarNoMix(bd, todos[0], { agora: AGORA })).rejects.toThrow(JaOcupado);
  expect(await partidaAtualDe(bd, todos[0].id)).toMatchObject({ id: partida.id, estado: 'aguardando_aceite' });
  for (const conta of todos) await aceitarPartida(bd, conta, partida.id, AGORA);
  await expect(entrarNoMix(bd, todos[0], { agora: AGORA })).rejects.toThrow(JaOcupado);
  expect(await partidaAtualDe(bd, todos[0].id)).toMatchObject({ id: partida.id, estado: 'vetando' });
});

test('mix cancelado por falta de aceite: quem aceitou volta e, com gente nova na fila, fecha outra partida na hora', async () => {
  const { partida, contas } = await mixFechado();
  for (const conta of contas.slice(1)) await aceitarPartida(bd, conta, partida.id, AGORA);
  // Uma pessoa entrou na fila durante os 30 segundos.
  const nova = await membro();
  await entrarNoMix(bd, nova, { agora: new Date(AGORA.getTime() + 15_000) });
  await resolverAceitesVencidos(bd, partida.aceiteAte!);
  const ativas = await bd.select().from(partidas).where(eq(partidas.estado, 'aguardando_aceite'));
  expect(ativas).toHaveLength(1);
  const jogadores = await bd.select().from(partidaJogadores).where(eq(partidaJogadores.partidaId, ativas[0].id));
  expect(jogadores.map((j) => j.usuarioId).sort()).toEqual([...contas.slice(1), nova].map((c) => c.id).sort());
  expect(await bd.select().from(filaMix)).toEqual([]);
});

test('a partida do desafio guarda o nome das duas salas, que continua depois que as salas se desfazem', async () => {
  const { partida, a, b } = await desafioAceito();
  expect(partida).toMatchObject({ nomeTime1: a.contas[0].apelido, nomeTime2: b.contas[0].apelido });
});

test('partida cancelada por falta de aceite guarda o motivo', async () => {
  const { partida } = await desafioAceito();
  await resolverAceitesVencidos(bd, VENCIDO);
  expect((await partidaDe(partida.id)).motivoDoCancelamento).toBe('aceite');
});

test.each([['cla'], ['treino']] as const)('os 10 aceitando, a partida de %s também vai para os vetos', async (tipo) => {
  const { partida, todos } = await desafioAceito();
  await bd.update(partidas).set({ tipo }).where(eq(partidas.id, partida.id));
  for (const conta of todos) await aceitarPartida(bd, conta, partida.id, AGORA);
  const depois = await partidaDe(partida.id);
  expect(depois.estado).toBe('vetando');
  expect(depois.mapa).toBeNull();
});
