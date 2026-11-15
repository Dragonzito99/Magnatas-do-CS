import { beforeEach, expect, test } from 'vitest';
import type { Bd } from '@/bd/conexao';
import { lemnosEventos, lemnosPunicoes, type Usuario } from '@/bd/esquema';
import { criarBancoDeTeste, criarUsuario } from '@/bd/teste';
import { lancarGrana } from '@/dominio/grana';
import { banimentosDaIlha, granaDaIlhaPorDia, paresSuspeitos } from './painel';

let bd: Bd;
let ana: Usuario;
const AGORA = new Date('2026-11-15T15:00:00Z');
const HORA = 60 * 60 * 1000;

beforeEach(async () => {
  bd = await criarBancoDeTeste();
  ana = await criarUsuario(bd, { estado: 'ativo' });
});

test('grana por dia separa venda de dinheiro, e não conta outras grana', async () => {
  await bd.transaction(async (tx) => {
    await lancarGrana(tx, { usuarioId: ana.id, tipo: 'venda', quantidade: 23, referencia: 'v1' });
    await lancarGrana(tx, { usuarioId: ana.id, tipo: 'lemnos', quantidade: 8, referencia: 'l1' });
    await lancarGrana(tx, { usuarioId: ana.id, tipo: 'ajuste', quantidade: 500, referencia: 'a1' });
  });
  const dias = await granaDaIlhaPorDia(bd, 14, new Date());
  expect(dias).toHaveLength(14);
  expect(dias[13]).toMatchObject({ venda: 23, dinheiro: 8 });
  expect(dias.slice(0, 13).every((dia) => dia.venda === 0 && dia.dinheiro === 0)).toBe(true);
});

test('5 mortes do mesmo par em 24h aparecem; 4 não', async () => {
  const morte = (numero: number, matador: string, morto: string, horasAtras = 1) =>
    bd.insert(lemnosEventos).values({ tipo: 'morte', referencia: `m${matador}${morto}${numero}`, detalhes: { matador, morto }, criadoEm: new Date(AGORA.getTime() - horasAtras * HORA) });
  for (let i = 0; i < 5; i += 1) await morte(i, '76561198000000001', '76561198000000002');
  for (let i = 0; i < 4; i += 1) await morte(i, '76561198000000003', '76561198000000004');
  for (let i = 0; i < 5; i += 1) await morte(i, '76561198000000005', '76561198000000006', 30);
  expect(await paresSuspeitos(bd, AGORA)).toEqual([{ matador: '76561198000000001', morto: '76561198000000002', vezes: 5 }]);
});

test('banimentos da ilha mostra os que valem e os kicks recentes com o apelido', async () => {
  await bd.insert(lemnosPunicoes).values([
    { usuarioId: ana.id, motivo: 'afk', criadoEm: new Date(AGORA.getTime() - 2 * HORA) },
    { usuarioId: ana.id, motivo: 'acampar', criadoEm: new Date(AGORA.getTime() - HORA), banidoAte: new Date(AGORA.getTime() + 72 * HORA) },
  ]);
  const { valendo, kicks } = await banimentosDaIlha(bd, AGORA);
  expect(valendo.map((linha) => [linha.apelido, linha.motivo, linha.paraSempre])).toEqual([[ana.apelido, 'acampar', false]]);
  expect(kicks.map((linha) => linha.motivo)).toEqual(['acampar', 'afk']);
});
