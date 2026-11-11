import { eq } from 'drizzle-orm';
import { beforeEach, expect, test } from 'vitest';
import type { Bd } from '@/bd/conexao';
import { partidaJogadores, partidas, salaMembros, salas, usuarios, type Usuario } from '@/bd/esquema';
import { criarBancoDeTeste, criarUsuario } from '@/bd/teste';
import {
  aceitarConviteDeSala,
  amigosDe,
  convidarParaSala,
  ConviteInvalido,
  convitesDeSalaPara,
  desfazerAmizade,
  NaoSaoAmigos,
  pedidosDeAmizadePara,
  pedirAmizade,
  procurarMembros,
  responderAmizade,
  situacaoDaAmizade,
} from './amigos';
import { criarSala } from './salas';

let bd: Bd;
let eu: Usuario;
let ele: Usuario;
const AGORA = new Date('2026-11-11T20:00:00Z');

beforeEach(async () => {
  bd = await criarBancoDeTeste();
  eu = await criarUsuario(bd, { estado: 'ativo', apelido: 'Dragonzit0' });
  ele = await criarUsuario(bd, { estado: 'ativo', apelido: 'Marfioso' });
});

async function amigos(a: Usuario, b: Usuario) {
  await pedirAmizade(bd, a, b.id, AGORA);
  await responderAmizade(bd, b, a.id, true, AGORA);
}

test('pedir amizade fica pendente até o outro aceitar, e aparece para ele', async () => {
  expect(await pedirAmizade(bd, eu, ele.id, AGORA)).toBe('pedido');
  expect(await situacaoDaAmizade(bd, eu.id, ele.id)).toBe('pedido_enviado');
  expect(await situacaoDaAmizade(bd, ele.id, eu.id)).toBe('pedido_recebido');
  expect((await pedidosDeAmizadePara(bd, ele.id)).map((pedido) => pedido.apelido)).toEqual(['Dragonzit0']);
  await responderAmizade(bd, ele, eu.id, true, AGORA);
  expect(await situacaoDaAmizade(bd, eu.id, ele.id)).toBe('amigos');
  expect(await pedidosDeAmizadePara(bd, ele.id)).toEqual([]);
});

test('pedido cruzado vira amizade, e pedir de novo não repete', async () => {
  await pedirAmizade(bd, eu, ele.id, AGORA);
  expect(await pedirAmizade(bd, eu, ele.id, AGORA)).toBe('ja_pedido');
  expect(await pedirAmizade(bd, ele, eu.id, AGORA)).toBe('aceita');
  expect(await situacaoDaAmizade(bd, eu.id, ele.id)).toBe('amigos');
  expect(await pedirAmizade(bd, eu, ele.id, AGORA)).toBe('ja_amigos');
});

test('recusar apaga o pedido, desfazer apaga a amizade, e não dá para pedir a si mesmo ou a conta inativa', async () => {
  await pedirAmizade(bd, eu, ele.id, AGORA);
  await responderAmizade(bd, ele, eu.id, false, AGORA);
  expect(await situacaoDaAmizade(bd, eu.id, ele.id)).toBe('nenhuma');
  await amigos(eu, ele);
  await desfazerAmizade(bd, eu, ele.id);
  expect(await situacaoDaAmizade(bd, ele.id, eu.id)).toBe('nenhuma');
  await expect(pedirAmizade(bd, eu, eu.id, AGORA)).rejects.toThrow();
  const banido = await criarUsuario(bd, { estado: 'banido' });
  await expect(pedirAmizade(bd, eu, banido.id, AGORA)).rejects.toThrow();
});

test('a lista de amigos mostra quem joga primeiro, depois online, depois offline', async () => {
  const outro = await criarUsuario(bd, { estado: 'ativo', apelido: 'Alfa' });
  const sumido = await criarUsuario(bd, { estado: 'ativo', apelido: 'Zé' });
  await amigos(eu, ele);
  await amigos(eu, outro);
  await amigos(eu, sumido);
  const pedidoNaoAceito = await criarUsuario(bd, { estado: 'ativo', apelido: 'Pendente' });
  await pedirAmizade(bd, eu, pedidoNaoAceito.id, AGORA);
  await bd.update(usuarios).set({ vistoEm: AGORA }).where(eq(usuarios.id, outro.id));
  await bd.update(usuarios).set({ vistoEm: AGORA }).where(eq(usuarios.id, ele.id));
  await bd.update(usuarios).set({ vistoEm: new Date(AGORA.getTime() - 60 * 60_000) }).where(eq(usuarios.id, sumido.id));
  const [partida] = await bd.insert(partidas).values({ numero: 1, tipo: 'mix', estado: 'ao_vivo' }).returning();
  await bd.insert(partidaJogadores).values({ partidaId: partida.id, usuarioId: ele.id, time: 1 });
  const lista = await amigosDe(bd, eu.id, AGORA);
  expect(lista.map((amigo) => [amigo.apelido, amigo.situacao])).toEqual([
    ['Marfioso', 'jogando'],
    ['Alfa', 'online'],
    ['Zé', 'offline'],
  ]);
});

test('convidar um amigo para a sala: chega para ele, vence em 2 minutos e aceitar coloca na sala', async () => {
  await amigos(eu, ele);
  const sala = await criarSala(bd, eu, AGORA);
  await convidarParaSala(bd, eu, ele.id, AGORA);
  const [convite] = await convitesDeSalaPara(bd, ele.id, AGORA);
  expect(convite).toMatchObject({ deApelido: 'Dragonzit0', salaId: sala.id, membros: 1 });
  expect(await convitesDeSalaPara(bd, ele.id, new Date(AGORA.getTime() + 2 * 60_000 + 1))).toEqual([]);
  await aceitarConviteDeSala(bd, ele, convite.id, AGORA);
  const [vinculo] = await bd.select().from(salaMembros).where(eq(salaMembros.usuarioId, ele.id));
  expect(vinculo.salaId).toBe(sala.id);
  expect(await convitesDeSalaPara(bd, ele.id, AGORA)).toEqual([]);
});

test('só amigo pode ser chamado, e o convite cai com a sala cheia, em partida ou vencido', async () => {
  const sala = await criarSala(bd, eu, AGORA);
  await expect(convidarParaSala(bd, eu, ele.id, AGORA)).rejects.toBeInstanceOf(NaoSaoAmigos);
  await amigos(eu, ele);
  await convidarParaSala(bd, eu, ele.id, AGORA);
  const [convite] = await convitesDeSalaPara(bd, ele.id, AGORA);
  await expect(aceitarConviteDeSala(bd, ele, convite.id, new Date(AGORA.getTime() + 3 * 60_000))).rejects.toBeInstanceOf(ConviteInvalido);
  await convidarParaSala(bd, eu, ele.id, AGORA);
  const [partida] = await bd.insert(partidas).values({ numero: 2, tipo: 'mix', estado: 'ao_vivo' }).returning();
  await bd.update(salas).set({ partidaId: partida.id }).where(eq(salas.id, sala.id));
  expect(await convitesDeSalaPara(bd, ele.id, AGORA)).toEqual([]);
});

test('procurar membros acha pelo apelido, sem a própria conta e sem banidos, com a situação da amizade', async () => {
  await criarUsuario(bd, { estado: 'banido', apelido: 'Marfioso Banido' });
  await pedirAmizade(bd, eu, ele.id, AGORA);
  expect(await procurarMembros(bd, eu.id, 'a')).toEqual([]);
  const achados = await procurarMembros(bd, eu.id, 'marf');
  expect(achados.map((membro) => [membro.apelido, membro.situacao])).toEqual([['Marfioso', 'pedido_enviado']]);
  expect(await procurarMembros(bd, eu.id, 'Dragon')).toEqual([]);
});
