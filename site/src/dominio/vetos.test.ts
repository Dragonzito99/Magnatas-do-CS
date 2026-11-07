import { eq } from 'drizzle-orm';
import { beforeEach, expect, test } from 'vitest';
import type { Bd } from '@/bd/conexao';
import { partidas, salas, vetos, type Partida, type Usuario } from '@/bd/esquema';
import { criarBancoDeTeste, criarUsuario } from '@/bd/teste';
import { aceitarPartida } from './aceites';
import { aceitarDesafio, desafiar } from './desafios';
import { MAPAS } from './partidas';
import { criarSala, entrarNaSala, SemPermissaoNaSala } from './salas';
import { PRAZO_DO_VETO_MS, resolverVetosVencidos, vetarMapa, VetoIndisponivel, vetosDaPartida, vezDeVetar } from './vetos';

let bd: Bd;
const AGORA = new Date('2026-11-06T22:00:00Z');

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

/** Partida de desafio já nos vetos, com o cara ou coroa fixado no time 1 (a sala que desafiou). */
async function partidaVetando(primeiro: 1 | 2 = 1) {
  const [a, b] = [await salaCom(), await salaCom()];
  const desafio = await desafiar(bd, a.contas[0], b.id, AGORA);
  const partida = await aceitarDesafio(bd, b.contas[0], desafio.id, AGORA);
  for (const conta of [...a.contas, ...b.contas]) await aceitarPartida(bd, conta, partida.id, AGORA);
  await bd.update(partidas).set({ primeiroAVetar: primeiro }).where(eq(partidas.id, partida.id));
  const lideres = { 1: a.contas[0], 2: b.contas[0] } as const;
  return { partida, a, b, lideres };
}

async function partidaDe(id: string): Promise<Partida> {
  const [linha] = await bd.select().from(partidas).where(eq(partidas.id, id));
  return linha;
}

test('o prazo de cada veto é 20 segundos', () => {
  expect(PRAZO_DO_VETO_MS).toBe(20_000);
});

test('vezDeVetar alterna a partir de quem ganhou o cara ou coroa', () => {
  expect(vezDeVetar(2, 0)).toBe(2);
  expect(vezDeVetar(2, 1)).toBe(1);
  expect(vezDeVetar(2, 2)).toBe(2);
  expect(vezDeVetar(1, 0)).toBe(1);
  expect(vezDeVetar(1, 5)).toBe(2);
});

test('6 vetos alternados deixam o mapa da partida e chamam o servidor', async () => {
  const { partida, lideres } = await partidaVetando(2);
  const ordem = [2, 1, 2, 1, 2, 1] as const;
  for (let i = 0; i < 6; i += 1) {
    const quando = new Date(AGORA.getTime() + i * 1000);
    await vetarMapa(bd, lideres[ordem[i]], partida.id, MAPAS[i], quando);
    const depois = await partidaDe(partida.id);
    if (i < 5) {
      expect(depois.estado).toBe('vetando');
      expect(depois.vetoAte).toEqual(new Date(quando.getTime() + PRAZO_DO_VETO_MS));
    }
  }
  const final = await partidaDe(partida.id);
  expect(final).toMatchObject({ estado: 'aguardando_servidor', mapa: MAPAS[6], vetoAte: null });
  expect(final.estadoDesde).toEqual(new Date(AGORA.getTime() + 5000));
  const feitos = await bd.select().from(vetos).where(eq(vetos.partidaId, partida.id));
  expect(feitos.map((veto) => [veto.ordem, veto.time, veto.mapa, veto.automatico])).toEqual(MAPAS.slice(0, 6).map((mapa, i) => [i + 1, ordem[i], mapa, false]));
});

test('fora da vez, mapa já vetado ou mapa fora da lista é recusado', async () => {
  const { partida, lideres } = await partidaVetando(1);
  await expect(vetarMapa(bd, lideres[2], partida.id, MAPAS[0], AGORA)).rejects.toThrow(VetoIndisponivel);
  await vetarMapa(bd, lideres[1], partida.id, MAPAS[0], AGORA);
  await expect(vetarMapa(bd, lideres[2], partida.id, MAPAS[0], AGORA)).rejects.toThrow(VetoIndisponivel);
  await expect(vetarMapa(bd, lideres[2], partida.id, 'de_cache', AGORA)).rejects.toThrow(VetoIndisponivel);
  await expect(vetarMapa(bd, lideres[2], partida.id, MAPAS[1], new Date(AGORA.getTime() + PRAZO_DO_VETO_MS))).rejects.toThrow(VetoIndisponivel);
});

test('quem não é líder não veta', async () => {
  const { partida, a } = await partidaVetando(1);
  await expect(vetarMapa(bd, a.contas[1], partida.id, MAPAS[0], AGORA)).rejects.toThrow(SemPermissaoNaSala);
  await expect(vetarMapa(bd, await membro(), partida.id, MAPAS[0], AGORA)).rejects.toThrow(SemPermissaoNaSala);
});

test('líder que mudou durante os vetos: o novo líder veta', async () => {
  const { partida, a } = await partidaVetando(1);
  await bd.update(salas).set({ liderId: a.contas[3].id }).where(eq(salas.id, a.id));
  await expect(vetarMapa(bd, a.contas[0], partida.id, MAPAS[0], AGORA)).rejects.toThrow(SemPermissaoNaSala);
  await expect(vetarMapa(bd, a.contas[3], partida.id, MAPAS[0], AGORA)).resolves.toBeUndefined();
});

test('veto vencido vira aleatório pelo time da vez, e o prazo recomeça', async () => {
  const { partida } = await partidaVetando(2);
  const vencido = new Date(AGORA.getTime() + PRAZO_DO_VETO_MS);
  await resolverVetosVencidos(bd, new Date(vencido.getTime() - 1));
  expect(await bd.select().from(vetos)).toEqual([]);
  await resolverVetosVencidos(bd, vencido);
  const [feito] = await bd.select().from(vetos).where(eq(vetos.partidaId, partida.id));
  expect(feito).toMatchObject({ ordem: 1, time: 2, automatico: true });
  expect(MAPAS).toContain(feito.mapa);
  const depois = await partidaDe(partida.id);
  expect(depois.vetoAte).toEqual(new Date(AGORA.getTime() + 2 * PRAZO_DO_VETO_MS));
  expect(depois.estado).toBe('vetando');
});

test('seis vetos automáticos seguidos fecham o mapa', async () => {
  const { partida } = await partidaVetando(1);
  for (let i = 1; i <= 6; i += 1) await resolverVetosVencidos(bd, new Date(AGORA.getTime() + i * PRAZO_DO_VETO_MS));
  const depois = await partidaDe(partida.id);
  expect(depois.estado).toBe('aguardando_servidor');
  expect(MAPAS).toContain(depois.mapa);
  expect(await bd.select().from(vetos)).toHaveLength(6);
});

test('vetosDaPartida mostra o cara ou coroa, a vez, o prazo, os vetados e os que restam', async () => {
  const { partida, lideres } = await partidaVetando(2);
  await vetarMapa(bd, lideres[2], partida.id, MAPAS[3], AGORA);
  const situacao = await vetosDaPartida(bd, partida.id);
  expect(situacao).toEqual({
    primeiroAVetar: 2,
    vez: 1,
    vetoAte: new Date(AGORA.getTime() + PRAZO_DO_VETO_MS),
    vetados: [{ mapa: MAPAS[3], time: 2, automatico: false }],
    restantes: MAPAS.filter((mapa) => mapa !== MAPAS[3]),
  });
});

test('partida fora dos vetos não aceita veto', async () => {
  const { partida, lideres } = await partidaVetando(1);
  await bd.update(partidas).set({ estado: 'cancelada' }).where(eq(partidas.id, partida.id));
  await expect(vetarMapa(bd, lideres[1], partida.id, MAPAS[0], AGORA)).rejects.toThrow(VetoIndisponivel);
});
