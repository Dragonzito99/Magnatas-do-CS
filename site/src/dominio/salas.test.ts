import { eq } from 'drizzle-orm';
import { beforeEach, expect, test } from 'vitest';
import type { Bd } from '@/bd/conexao';
import { filaMix, partidaJogadores, partidas, salaMembros, salas, type Usuario } from '@/bd/esquema';
import { criarBancoDeTeste, criarUsuario } from '@/bd/teste';
import { ContaSemAcesso, JaOcupado } from './disponibilidade';
import { criarSala, entrarNaSala, expulsarDaSala, listarSalas, minhaSala, SalaCheia, SalaEmPartida, SemPermissaoNaSala, sairDaSala } from './salas';

let bd: Bd;

beforeEach(async () => {
  bd = await criarBancoDeTeste();
});

const membro = () => criarUsuario(bd, { estado: 'ativo' });

async function membrosDe(salaId: string): Promise<string[]> {
  const linhas = await bd.select().from(salaMembros).where(eq(salaMembros.salaId, salaId));
  return linhas.map((linha) => linha.usuarioId);
}

async function salaCom(total: number): Promise<{ salaId: string; contas: Usuario[] }> {
  const lider = await membro();
  const { id: salaId } = await criarSala(bd, lider, 'Sala');
  const contas = [lider];
  for (let i = 1; i < total; i += 1) {
    const conta = await membro();
    await entrarNaSala(bd, conta, salaId);
    contas.push(conta);
  }
  return { salaId, contas };
}

test('quem cria a sala vira líder e primeiro membro', async () => {
  const lider = await membro();
  const sala = await criarSala(bd, lider, 'Os sem mira');
  expect(sala).toMatchObject({ nome: 'Os sem mira', liderId: lider.id });
  expect(await membrosDe(sala.id)).toEqual([lider.id]);
});

test.each(['', '   ', 'x'.repeat(31)])('nome inválido é recusado: %j', async (nome) => {
  await expect(criarSala(bd, await membro(), nome)).rejects.toThrow(/nome/i);
});

test('o nome é salvo sem espaços em volta', async () => {
  expect((await criarSala(bd, await membro(), '  Time  ')).nome).toBe('Time');
});

test.each(['aguardando_verificacao', 'suspenso', 'banido'] as const)('conta %s não cria nem entra', async (estado) => {
  const conta = await criarUsuario(bd, { estado });
  await expect(criarSala(bd, conta, 'Sala')).rejects.toThrow(ContaSemAcesso);
  const { salaId } = await salaCom(1);
  await expect(entrarNaSala(bd, conta, salaId)).rejects.toThrow(ContaSemAcesso);
});

test('estado é conferido no banco, não no objeto da sessão', async () => {
  const conta = await criarUsuario(bd, { estado: 'banido' });
  const daSessao: Usuario = { ...conta, estado: 'ativo' };
  await expect(criarSala(bd, daSessao, 'Sala')).rejects.toThrow(ContaSemAcesso);
});

test('a sala aceita 5 pessoas e recusa a sexta com SalaCheia', async () => {
  const { salaId } = await salaCom(5);
  expect(await membrosDe(salaId)).toHaveLength(5);
  await expect(entrarNaSala(bd, await membro(), salaId)).rejects.toThrow(SalaCheia);
  expect(await membrosDe(salaId)).toHaveLength(5);
});

test('quem já está em sala não entra em outra nem cria outra', async () => {
  const { contas } = await salaCom(1);
  const { salaId: outra } = await salaCom(1);
  await expect(entrarNaSala(bd, contas[0], outra)).rejects.toThrow(JaOcupado);
  await expect(criarSala(bd, contas[0], 'Outra')).rejects.toThrow(JaOcupado);
});

test('entrar de novo na mesma sala é recusado', async () => {
  const { salaId, contas } = await salaCom(1);
  await expect(entrarNaSala(bd, contas[0], salaId)).rejects.toThrow(JaOcupado);
});

test('quem está no mix não entra em sala', async () => {
  const conta = await membro();
  await bd.insert(filaMix).values({ usuarioId: conta.id });
  const { salaId } = await salaCom(1);
  await expect(entrarNaSala(bd, conta, salaId)).rejects.toThrow(JaOcupado);
});

test.each(['aguardando_servidor', 'carregando', 'aguardando_jogadores', 'ao_vivo'] as const)(
  'quem está em partida no estado %s não entra em sala',
  async (estado) => {
    const conta = await membro();
    const [partida] = await bd.insert(partidas).values({ tipo: 'mix', estado, mapa: 'de_mirage' }).returning();
    await bd.insert(partidaJogadores).values({ partidaId: partida.id, usuarioId: conta.id, time: 1 });
    const { salaId } = await salaCom(1);
    await expect(entrarNaSala(bd, conta, salaId)).rejects.toThrow(JaOcupado);
  },
);

test.each(['encerrada', 'cancelada'] as const)('partida %s não ocupa ninguém', async (estado) => {
  const conta = await membro();
  const [partida] = await bd.insert(partidas).values({ tipo: 'mix', estado, mapa: 'de_mirage' }).returning();
  await bd.insert(partidaJogadores).values({ partidaId: partida.id, usuarioId: conta.id, time: 1 });
  const { salaId } = await salaCom(1);
  await entrarNaSala(bd, conta, salaId);
  expect(await membrosDe(salaId)).toContain(conta.id);
});

test('dois pedidos pela última vaga: só um entra', async () => {
  const { salaId } = await salaCom(4);
  const [a, b] = [await membro(), await membro()];
  const resultados = await Promise.allSettled([entrarNaSala(bd, a, salaId), entrarNaSala(bd, b, salaId)]);
  expect(resultados.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
  expect(await membrosDe(salaId)).toHaveLength(5);
});

test('quando o líder sai, o membro mais antigo vira líder', async () => {
  const { salaId, contas } = await salaCom(3);
  await sairDaSala(bd, contas[0]);
  const [sala] = await bd.select().from(salas).where(eq(salas.id, salaId));
  expect(sala.liderId).toBe(contas[1].id);
  expect(await membrosDe(salaId)).toHaveLength(2);
});

test('quando um membro comum sai, o líder continua', async () => {
  const { salaId, contas } = await salaCom(2);
  await sairDaSala(bd, contas[1]);
  const [sala] = await bd.select().from(salas).where(eq(salas.id, salaId));
  expect(sala.liderId).toBe(contas[0].id);
});

test('quando o último sai, a sala é apagada', async () => {
  const { contas } = await salaCom(1);
  await sairDaSala(bd, contas[0]);
  expect(await bd.select().from(salas)).toEqual([]);
});

test('quem não está em sala sai sem erro', async () => {
  await expect(sairDaSala(bd, await membro())).resolves.toBeUndefined();
});

test('só o líder expulsa, e não expulsa a si mesmo', async () => {
  const { salaId, contas } = await salaCom(3);
  await expect(expulsarDaSala(bd, contas[1], contas[2].id)).rejects.toThrow(SemPermissaoNaSala);
  await expect(expulsarDaSala(bd, contas[0], contas[0].id)).rejects.toThrow(SemPermissaoNaSala);
  await expulsarDaSala(bd, contas[0], contas[2].id);
  expect(await membrosDe(salaId)).not.toContain(contas[2].id);
});

test('líder não expulsa quem é de outra sala', async () => {
  const { contas } = await salaCom(1);
  const { contas: outras } = await salaCom(2);
  await expect(expulsarDaSala(bd, contas[0], outras[1].id)).rejects.toThrow(SemPermissaoNaSala);
  expect(await membrosDe((await minhaSala(bd, outras[1].id))!.id)).toContain(outras[1].id);
});

test('sala em partida não aceita entrada, saída nem expulsão', async () => {
  const { salaId, contas } = await salaCom(2);
  const [partida] = await bd.insert(partidas).values({ tipo: 'desafio', estado: 'ao_vivo', mapa: 'de_mirage' }).returning();
  await bd.update(salas).set({ partidaId: partida.id }).where(eq(salas.id, salaId));
  await expect(entrarNaSala(bd, await membro(), salaId)).rejects.toThrow(SalaEmPartida);
  await expect(sairDaSala(bd, contas[1])).rejects.toThrow(SalaEmPartida);
  await expect(expulsarDaSala(bd, contas[0], contas[1].id)).rejects.toThrow(SalaEmPartida);
  expect(await membrosDe(salaId)).toHaveLength(2);
});

test('entrar em sala inexistente dá erro', async () => {
  await expect(entrarNaSala(bd, await membro(), '00000000-0000-0000-0000-000000000000')).rejects.toThrow(/Sala/);
});

test('lista traz salas completas primeiro, com os membros', async () => {
  const pequena = await salaCom(2);
  const completa = await salaCom(5);
  const lista = await listarSalas(bd);
  expect(lista.map((sala) => sala.id)).toEqual([completa.salaId, pequena.salaId]);
  expect(lista[0].membros).toHaveLength(5);
  expect(lista[1].membros[0]).toHaveProperty('apelido');
  expect(lista[1].membros[0]).not.toHaveProperty('cpfHmac');
});

test('minhaSala traz a sala da pessoa, ou null', async () => {
  const { salaId, contas } = await salaCom(1);
  expect((await minhaSala(bd, contas[0].id))?.id).toBe(salaId);
  expect(await minhaSala(bd, (await membro()).id)).toBeNull();
});
