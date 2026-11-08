import { beforeEach, expect, test } from 'vitest';
import type { Bd } from '@/bd/conexao';
import { estadosDaDiversao, partidas, servidoresDiversao } from '@/bd/esquema';
import { criarBancoDeTeste } from '@/bd/teste';
import { partidasDoDia, servidoresDoPainel } from './painel';

let bd: Bd;

beforeEach(async () => {
  bd = await criarBancoDeTeste();
});

test('partidasDoDia conta as partidas criadas hoje em Brasília, sem as canceladas', async () => {
  const agora = new Date('2026-11-08T15:00:00Z');
  await bd.insert(partidas).values([
    { tipo: 'mix', estado: 'encerrada', criadoEm: new Date('2026-11-08T04:00:00Z') },
    { tipo: 'desafio', estado: 'ao_vivo', criadoEm: new Date('2026-11-08T14:00:00Z') },
    { tipo: 'mix', estado: 'cancelada', criadoEm: new Date('2026-11-08T12:00:00Z') },
    // 23h do dia 7 em Brasília: é ontem.
    { tipo: 'mix', estado: 'encerrada', criadoEm: new Date('2026-11-08T02:00:00Z') },
  ]);
  expect(await partidasDoDia(bd, agora)).toBe(2);
});

test('servidoresDoPainel lista os servidores ativos da Diversão com o modo, o mapa e se estão ligados', async () => {
  // O banco de teste já vem com os servidores da migração: começa do zero.
  await bd.delete(estadosDaDiversao);
  await bd.delete(servidoresDiversao);
  const [fantasma, equipe] = await bd
    .insert(servidoresDiversao)
    .values([
      { modo: 'fantasma', armas: 'Todas', mapa: 'laboratory', foto: '/x.webp', porta: 27020, ativo: true, ordem: 2 },
      { modo: 'equipe', armas: 'Todas', mapa: 'egypt', foto: '/x.webp', porta: 27021, ativo: true, ordem: 1 },
      { modo: 'mutacao', armas: 'Todas', mapa: 'hotel', foto: '/x.webp', porta: 27022, ativo: false, ordem: 3 },
    ])
    .returning();
  await bd.insert(estadosDaDiversao).values({ servidorId: fantasma.id, estado: 'ligado', desde: new Date() });
  expect(await servidoresDoPainel(bd)).toEqual([
    { id: equipe.id, modo: 'Equipe x Equipe', mapa: 'egypt', estado: 'desligado' },
    { id: fantasma.id, modo: 'Fantasma', mapa: 'laboratory', estado: 'ligado' },
  ]);
});
