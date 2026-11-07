import { asc, eq } from 'drizzle-orm';
import { beforeEach, expect, test } from 'vitest';
import type { Bd } from '@/bd/conexao';
import { filaMix, partidaJogadores, partidas, salaMembros, usuarios, type Usuario } from '@/bd/esquema';
import { criarBancoDeTeste, criarUsuario } from '@/bd/teste';
import { ContaSemAcesso, JaOcupado } from './disponibilidade';
import { entrarNoMix, sairDoMix, verMix } from './mix';
import { criarSala, entrarNaSala } from './salas';

let bd: Bd;

beforeEach(async () => {
  bd = await criarBancoDeTeste();
});

const membro = (banco = bd) => criarUsuario(banco, { estado: 'ativo' });

async function encherFila(total: number, banco = bd): Promise<Usuario[]> {
  const contas: Usuario[] = [];
  for (let i = 0; i < total; i += 1) {
    const conta = await membro(banco);
    await entrarNoMix(banco, conta);
    contas.push(conta);
  }
  return contas;
}

async function idsNaFila(): Promise<string[]> {
  const linhas = await bd.select().from(filaMix).orderBy(asc(filaMix.entrouEm));
  return linhas.map((linha) => linha.usuarioId);
}

test('entrar coloca a pessoa na fila, e sair tira', async () => {
  const conta = await membro();
  expect(await entrarNoMix(bd, conta)).toEqual({});
  const visto = await verMix(bd);
  expect(visto.total).toBe(1);
  expect(visto.jogadores[0]).toMatchObject({ id: conta.id, apelido: conta.apelido });
  expect(visto.jogadores[0]).not.toHaveProperty('cpfHmac');
  await sairDoMix(bd, conta);
  expect((await verMix(bd)).total).toBe(0);
});

test('quem não está na fila sai sem erro', async () => {
  await expect(sairDoMix(bd, await membro())).resolves.toBeUndefined();
});

test('quem está em sala ou partida não entra (JaOcupado)', async () => {
  const naSala = await membro();
  await criarSala(bd, naSala);
  await expect(entrarNoMix(bd, naSala)).rejects.toThrow(JaOcupado);

  const emPartida = await membro();
  const [partida] = await bd.insert(partidas).values({ tipo: 'mix', estado: 'ao_vivo', mapa: 'de_mirage' }).returning();
  await bd.insert(partidaJogadores).values({ partidaId: partida.id, usuarioId: emPartida.id, time: 1 });
  await expect(entrarNoMix(bd, emPartida)).rejects.toThrow(JaOcupado);
  expect((await verMix(bd)).total).toBe(0);
});

test.each(['aguardando_verificacao', 'suspenso', 'banido'] as const)('conta %s não entra', async (estado) => {
  await expect(entrarNoMix(bd, await criarUsuario(bd, { estado }))).rejects.toThrow(ContaSemAcesso);
});

test('entrar duas vezes não duplica', async () => {
  const conta = await membro();
  await entrarNoMix(bd, conta);
  expect(await entrarNoMix(bd, conta)).toEqual({});
  expect((await verMix(bd)).total).toBe(1);
});

test('dois pedidos juntos da mesma pessoa, sala e mix, deixam ela em um lugar só', async () => {
  const conta = await membro();
  const { id: salaId } = await criarSala(bd, await membro());
  const resultados = await Promise.allSettled([entrarNoMix(bd, conta), entrarNaSala(bd, conta, salaId)]);
  expect(resultados.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
  const naFila = await bd.select().from(filaMix).where(eq(filaMix.usuarioId, conta.id));
  const naSala = await bd.select().from(salaMembros).where(eq(salaMembros.usuarioId, conta.id));
  expect(naFila.length + naSala.length).toBe(1);
});

test('o décimo fecha o mix: cria a partida, esvazia a fila e sorteia dois times de 5', async () => {
  const contas = await encherFila(9);
  expect(await bd.select().from(partidas)).toEqual([]);
  const ultimo = await membro();
  const { partidaId } = await entrarNoMix(bd, ultimo);
  expect(partidaId).toBeDefined();
  const [partida] = await bd.select().from(partidas);
  expect(partida).toMatchObject({ id: partidaId, tipo: 'mix', estado: 'aguardando_aceite' });
  const jogadores = await bd.select().from(partidaJogadores).where(eq(partidaJogadores.partidaId, partida.id));
  expect(jogadores.filter((j) => j.time === 1)).toHaveLength(5);
  expect(jogadores.filter((j) => j.time === 2)).toHaveLength(5);
  expect(jogadores.map((j) => j.usuarioId).sort()).toEqual([...contas, ultimo].map((c) => c.id).sort());
  expect(await idsNaFila()).toEqual([]);
});

test('dois entrando ao mesmo tempo no 9/10 e 10/10 criam uma partida só', async () => {
  await encherFila(8);
  const [a, b] = [await membro(), await membro()];
  const resultados = await Promise.all([entrarNoMix(bd, a), entrarNoMix(bd, b)]);
  expect(resultados.filter((r) => r.partidaId)).toHaveLength(1);
  expect(await bd.select().from(partidas)).toHaveLength(1);
  expect(await idsNaFila()).toEqual([]);
});

test('com 12 pedidos, os 10 mais antigos jogam e 2 ficam na fila', async () => {
  // Fila já passada do limite, com ordem definida, para provar quem é escolhido.
  const antigos: Usuario[] = [];
  for (let i = 0; i < 11; i += 1) {
    const conta = await membro();
    await bd.insert(filaMix).values({ usuarioId: conta.id, entrouEm: new Date(Date.UTC(2026, 0, 1, 0, i)) });
    antigos.push(conta);
  }
  const ultimo = await membro();
  const { partidaId } = await entrarNoMix(bd, ultimo);
  const jogadores = await bd.select().from(partidaJogadores).where(eq(partidaJogadores.partidaId, partidaId!));
  expect(jogadores.map((j) => j.usuarioId).sort()).toEqual(antigos.slice(0, 10).map((c) => c.id).sort());
  expect(await idsNaFila()).toEqual([antigos[10].id, ultimo.id]);
});

test('sementes diferentes geram times diferentes', async () => {
  async function time1ComSemente(semente: number): Promise<number[]> {
    const banco = await criarBancoDeTeste();
    const contas = await encherFila(9, banco);
    const ultimo = await membro(banco);
    const { partidaId } = await entrarNoMix(banco, ultimo, { semente });
    const jogadores = await banco.select().from(partidaJogadores).where(eq(partidaJogadores.partidaId, partidaId!));
    const ordem = [...contas, ultimo].map((c) => c.id);
    return jogadores
      .filter((j) => j.time === 1)
      .map((j) => ordem.indexOf(j.usuarioId))
      .sort((x, y) => x - y);
  }
  const [um, outroUm, dois] = [await time1ComSemente(1), await time1ComSemente(1), await time1ComSemente(2)];
  expect(um).toEqual(outroUm);
  expect(um).not.toEqual(dois);
});

test('conta suspensa enquanto estava na fila não entra na partida e deixa a vaga para o próximo', async () => {
  const contas = await encherFila(9);
  await bd.update(usuarios).set({ estado: 'suspenso' }).where(eq(usuarios.id, contas[2].id));
  expect((await verMix(bd)).total).toBe(8);

  const decimo = await membro();
  expect(await entrarNoMix(bd, decimo)).toEqual({});
  expect(await idsNaFila()).not.toContain(contas[2].id);

  const proximo = await membro();
  const { partidaId } = await entrarNoMix(bd, proximo);
  const jogadores = await bd.select().from(partidaJogadores).where(eq(partidaJogadores.partidaId, partidaId!));
  expect(jogadores).toHaveLength(10);
  expect(jogadores.map((j) => j.usuarioId)).not.toContain(contas[2].id);
  expect(jogadores.map((j) => j.usuarioId)).toContain(proximo.id);
});
