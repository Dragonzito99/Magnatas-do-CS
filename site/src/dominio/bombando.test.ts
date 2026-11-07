import { eq } from 'drizzle-orm';
import { beforeEach, expect, test } from 'vitest';
import type { Bd } from '@/bd/conexao';
import { partidas, salas, servidoresDiversao } from '@/bd/esquema';
import { criarBancoDeTeste, criarUsuario } from '@/bd/teste';
import { controladorFalso } from '@/servidor-jogo/controlador';
import { bombandoAgora } from './bombando';
import { zerarSituacoesGuardadas } from './diversao';
import { entrarNoMix } from './mix';
import { criarSala, entrarNaSala } from './salas';

let bd: Bd;
const STEAM = (n: number) => `765611980000${String(n).padStart(5, '0')}`;

beforeEach(async () => {
  bd = await criarBancoDeTeste();
  zerarSituacoesGuardadas();
});

const membro = (apelido?: string) => criarUsuario(bd, { estado: 'ativo', ...(apelido ? { apelido } : {}) });

async function salaCom(lider: string, total: number): Promise<string> {
  const { id } = await criarSala(bd, await membro(lider));
  for (let i = 1; i < total; i += 1) await entrarNaSala(bd, await membro(), id);
  return id;
}

async function servidor(porta: number, host = 'diversao.local') {
  await bd.insert(servidoresDiversao).values({ modo: 'equipe', armas: 'Todas', mapa: 'Dust 2', foto: '/x.webp', host, porta, ativo: true, ordem: porta, vagas: 16 });
}

test('a sala mais cheia vem primeiro; sala completa e sala em partida ficam de fora', async () => {
  await salaCom('Pequena', 2);
  await salaCom('Quase', 4);
  await salaCom('Cheia', 5);
  const emPartida = await salaCom('Jogando', 3);
  const [partida] = await bd.insert(partidas).values({ tipo: 'desafio', estado: 'ao_vivo', mapa: 'de_mirage' }).returning();
  await bd.update(salas).set({ partidaId: partida.id }).where(eq(salas.id, emPartida));
  const { cartoes } = await bombandoAgora(bd, controladorFalso(), undefined);
  expect(cartoes.map((cartao) => [cartao.titulo, cartao.ocupacao])).toEqual([
    ['Sala do Quase', '4/5'],
    ['Sala do Pequena', '2/5'],
  ]);
  expect(cartoes[0]).toMatchObject({ tipo: 'sala', href: '/jogar?modo=competitivo', jogando: 4 });
});

test('o Mix aparece só com gente na fila', async () => {
  expect((await bombandoAgora(bd, controladorFalso(), undefined)).cartoes).toEqual([]);
  for (let i = 0; i < 7; i += 1) await entrarNoMix(bd, await membro());
  const { cartoes } = await bombandoAgora(bd, controladorFalso(), undefined);
  expect(cartoes).toEqual([{ tipo: 'mix', titulo: 'Mix', ocupacao: '7/10', jogando: 7, href: '/jogar?modo=mix' }]);
});

test('servidor da Diversão com gente aparece com o link de entrar; fora do ar ou vazio some', async () => {
  await servidor(27019);
  await servidor(27020);
  await servidor(27021, 'caiu.local');
  const controlador = controladorFalso({
    conectados: { 'diversao.local': [STEAM(1), STEAM(2), STEAM(3)] },
    hostsComFalha: ['caiu.local'],
  });
  const { cartoes } = await bombandoAgora(bd, controlador, undefined);
  const diversao = cartoes.filter((cartao) => cartao.tipo === 'diversao');
  expect(diversao).toHaveLength(2);
  expect(diversao[0]).toMatchObject({ titulo: 'Equipe x Equipe', ocupacao: '3/16', jogando: 3 });
  expect(diversao[0].href.startsWith('steam://connect/diversao.local:')).toBe(true);
});

test('no máximo 4 cartões, os mais cheios primeiro', async () => {
  for (const [nome, total] of [['A', 1], ['B', 2], ['C', 3], ['D', 4], ['E', 2]] as const) await salaCom(nome, total);
  for (let i = 0; i < 9; i += 1) await entrarNoMix(bd, await membro());
  const { cartoes } = await bombandoAgora(bd, controladorFalso(), undefined);
  expect(cartoes).toHaveLength(4);
  expect(cartoes.map((cartao) => cartao.jogando)).toEqual([9, 4, 3, 2]);
});

test('partidas ao vivo: só as ao vivo, até 3', async () => {
  for (let i = 0; i < 4; i += 1) await bd.insert(partidas).values({ tipo: 'mix', estado: 'ao_vivo', mapa: 'de_mirage' });
  await bd.insert(partidas).values({ tipo: 'mix', estado: 'aguardando_servidor', mapa: 'de_mirage' });
  const { aoVivo } = await bombandoAgora(bd, controladorFalso(), undefined);
  expect(aoVivo).toHaveLength(3);
  expect(aoVivo.every((partida) => partida.estado === 'ao_vivo')).toBe(true);
});
