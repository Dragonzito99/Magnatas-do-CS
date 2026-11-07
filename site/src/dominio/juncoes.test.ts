import { eq } from 'drizzle-orm';
import { beforeEach, expect, test } from 'vitest';
import type { Bd } from '@/bd/conexao';
import { desafios, juncoes, partidas, salaMembros, salas, type Usuario } from '@/bd/esquema';
import { criarBancoDeTeste, criarUsuario } from '@/bd/teste';
import { desafiar } from './desafios';
import { aceitarJuncao, cancelarJuncao, expirarJuncoes, JuncaoIndisponivel, juncoesDaSala, pedirJuncao, PRAZO_DA_JUNCAO_MS, recusarJuncao } from './juncoes';
import { criarSala, entrarNaSala, SalaCheia, SalaEmPartida, sairDaSala, SemPermissaoNaSala } from './salas';

let bd: Bd;
const AGORA = new Date('2026-11-06T22:00:00Z');

beforeEach(async () => {
  bd = await criarBancoDeTeste();
});

const membro = () => criarUsuario(bd, { estado: 'ativo' });

async function salaCom(total: number): Promise<{ id: string; contas: Usuario[] }> {
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

async function membrosDe(salaId: string): Promise<string[]> {
  const linhas = await bd.select().from(salaMembros).where(eq(salaMembros.salaId, salaId));
  return linhas.map((linha) => linha.usuarioId).sort();
}

async function estadoDe(id: string) {
  const [linha] = await bd.select().from(juncoes).where(eq(juncoes.id, id));
  return linha?.estado;
}

test('o pedido de junção expira em 60 segundos, como o desafio', () => {
  expect(PRAZO_DA_JUNCAO_MS).toBe(60_000);
});

test('pedir e aceitar move todos para a sala que aceitou, que mantém líder e nome, e a outra some', async () => {
  const [pequena, maior] = [await salaCom(2), await salaCom(3)];
  const pedido = await pedirJuncao(bd, pequena.contas[0], maior.id, AGORA);
  expect(pedido).toMatchObject({ salaOrigemId: pequena.id, salaAlvoId: maior.id, estado: 'pendente', expiraEm: new Date(AGORA.getTime() + 60_000) });
  await aceitarJuncao(bd, maior.contas[0], pedido.id, AGORA);
  expect(await membrosDe(maior.id)).toEqual([...pequena.contas, ...maior.contas].map((conta) => conta.id).sort());
  expect(await bd.select().from(salas).where(eq(salas.id, pequena.id))).toEqual([]);
  const [sala] = await bd.select().from(salas).where(eq(salas.id, maior.id));
  expect(sala).toMatchObject({ liderId: maior.contas[0].id, nome: maior.contas[0].apelido });
  expect(await estadoDe(pedido.id)).toBe('aceito');
});

test('soma maior que 5 não pede', async () => {
  const [a, b] = [await salaCom(3), await salaCom(3)];
  await expect(pedirJuncao(bd, a.contas[0], b.id, AGORA)).rejects.toThrow(SalaCheia);
});

test('sala que cresceu depois do pedido faz o aceite falhar sem mover ninguém', async () => {
  const [a, b] = [await salaCom(2), await salaCom(3)];
  const pedido = await pedirJuncao(bd, a.contas[0], b.id, AGORA);
  await entrarNaSala(bd, await membro(), a.id);
  await expect(aceitarJuncao(bd, b.contas[0], pedido.id, AGORA)).rejects.toThrow(SalaCheia);
  expect(await membrosDe(a.id)).toHaveLength(3);
  expect(await membrosDe(b.id)).toHaveLength(3);
  expect(await estadoDe(pedido.id)).toBe('pendente');
});

test('pedido vence em 60 segundos: não dá para aceitar, e a varredura marca expirado', async () => {
  const [a, b] = [await salaCom(2), await salaCom(3)];
  const pedido = await pedirJuncao(bd, a.contas[0], b.id, AGORA);
  const depois = new Date(AGORA.getTime() + 60_000);
  await expect(aceitarJuncao(bd, b.contas[0], pedido.id, depois)).rejects.toThrow(JuncaoIndisponivel);
  await expirarJuncoes(bd, depois);
  expect(await estadoDe(pedido.id)).toBe('expirado');
  expect(await juncoesDaSala(bd, b.id, depois)).toEqual([]);
});

test('só líderes pedem e aceitam', async () => {
  const [a, b] = [await salaCom(2), await salaCom(3)];
  await expect(pedirJuncao(bd, a.contas[1], b.id, AGORA)).rejects.toThrow(SemPermissaoNaSala);
  await expect(pedirJuncao(bd, await membro(), b.id, AGORA)).rejects.toThrow(SemPermissaoNaSala);
  const pedido = await pedirJuncao(bd, a.contas[0], b.id, AGORA);
  await expect(aceitarJuncao(bd, b.contas[1], pedido.id, AGORA)).rejects.toThrow(SemPermissaoNaSala);
  await expect(aceitarJuncao(bd, a.contas[0], pedido.id, AGORA)).rejects.toThrow(SemPermissaoNaSala);
  await expect(recusarJuncao(bd, a.contas[0], pedido.id)).rejects.toThrow(SemPermissaoNaSala);
  await expect(cancelarJuncao(bd, b.contas[0], pedido.id)).rejects.toThrow(SemPermissaoNaSala);
});

test('recusar e cancelar encerram o pedido', async () => {
  const [a, b] = [await salaCom(2), await salaCom(3)];
  const recusado = await pedirJuncao(bd, a.contas[0], b.id, AGORA);
  await recusarJuncao(bd, b.contas[0], recusado.id);
  expect(await estadoDe(recusado.id)).toBe('recusado');
  const cancelado = await pedirJuncao(bd, a.contas[0], b.id, AGORA);
  await cancelarJuncao(bd, a.contas[0], cancelado.id);
  expect(await estadoDe(cancelado.id)).toBe('cancelado');
  await expect(aceitarJuncao(bd, b.contas[0], cancelado.id, AGORA)).rejects.toThrow(JuncaoIndisponivel);
});

test('sala em partida não pede nem aceita', async () => {
  const [a, b] = [await salaCom(2), await salaCom(3)];
  const pedido = await pedirJuncao(bd, a.contas[0], b.id, AGORA);
  const [partida] = await bd.insert(partidas).values({ tipo: 'desafio', estado: 'ao_vivo', mapa: 'de_mirage' }).returning();
  await bd.update(salas).set({ partidaId: partida.id }).where(eq(salas.id, b.id));
  await expect(aceitarJuncao(bd, b.contas[0], pedido.id, AGORA)).rejects.toThrow(SalaEmPartida);
  await expect(pedirJuncao(bd, a.contas[0], b.id, AGORA)).rejects.toThrow(SalaEmPartida);
});

test('um pedido por vez entre as mesmas salas, e para a mesma sala só se ainda couber', async () => {
  const [a, b] = [await salaCom(2), await salaCom(3)];
  await pedirJuncao(bd, a.contas[0], b.id, AGORA);
  await expect(pedirJuncao(bd, a.contas[0], b.id, AGORA)).rejects.toThrow(JuncaoIndisponivel);
});

test('juncoesDaSala mostra recebidos e enviados, com nome e tamanho da outra sala', async () => {
  const [a, b] = [await salaCom(2), await salaCom(3)];
  const pedido = await pedirJuncao(bd, a.contas[0], b.id, AGORA);
  expect(await juncoesDaSala(bd, b.id, AGORA)).toEqual([
    { id: pedido.id, expiraEm: pedido.expiraEm, recebido: true, outraSalaId: a.id, outraSalaNome: a.contas[0].apelido, outraSalaTamanho: 2 },
  ]);
  expect((await juncoesDaSala(bd, a.id, AGORA))[0]).toMatchObject({ recebido: false, outraSalaId: b.id, outraSalaTamanho: 3 });
});

test('a sala que pediu some com os desafios e pedidos pendentes dela', async () => {
  const [a, b, c] = [await salaCom(2), await salaCom(3), await salaCom(2)];
  const pedidoParaB = await pedirJuncao(bd, a.contas[0], b.id, AGORA);
  const pedidoParaC = await pedirJuncao(bd, a.contas[0], c.id, AGORA);
  await aceitarJuncao(bd, b.contas[0], pedidoParaB.id, AGORA);
  expect(await estadoDe(pedidoParaC.id)).toBe('cancelado');
});

test('quem sai da sala de origem cancela o pedido dela, como acontece com desafio', async () => {
  const [a, b] = [await salaCom(2), await salaCom(3)];
  const pedido = await pedirJuncao(bd, a.contas[0], b.id, AGORA);
  await sairDaSala(bd, a.contas[1]);
  expect(await estadoDe(pedido.id)).toBe('cancelado');
});

test('juntar duas salas completas depois com 5 permite desafiar', async () => {
  const [a, b, c] = [await salaCom(2), await salaCom(3), await salaCom(5)];
  const pedido = await pedirJuncao(bd, a.contas[0], b.id, AGORA);
  await aceitarJuncao(bd, b.contas[0], pedido.id, AGORA);
  const desafio = await desafiar(bd, b.contas[0], c.id, AGORA);
  expect((await bd.select().from(desafios).where(eq(desafios.id, desafio.id)))[0].estado).toBe('pendente');
});
