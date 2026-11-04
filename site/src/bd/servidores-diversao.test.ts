import { asc } from 'drizzle-orm';
import { expect, test } from 'vitest';
import { servidoresDiversao } from './esquema';
import { criarBancoDeTeste } from './teste';

const NOVO = { modo: 'cada_um', armas: 'Teste', mapa: 'Teste', foto: '/mapas/teste.webp', ordem: 7 } as const;

test('os seis servidores já vêm cadastrados, em ordem', async () => {
  const bd = await criarBancoDeTeste();
  const linhas = await bd.select().from(servidoresDiversao).orderBy(asc(servidoresDiversao.ordem));
  expect(linhas.map(({ ordem, modo, armas, mapa, foto, porta, ativo }) => ({ ordem, modo, armas, mapa, foto, porta, ativo }))).toEqual([
    { ordem: 1, modo: 'cada_um', armas: 'AK e Desert', mapa: 'Dust 2', foto: '/mapas/dust2.webp', porta: 27016, ativo: true },
    { ordem: 2, modo: 'cada_um', armas: 'Só pistola, à sua escolha', mapa: 'Mirage', foto: '/mapas/mirage.webp', porta: 27017, ativo: true },
    { ordem: 3, modo: 'cada_um', armas: 'Só AWP', mapa: 'Mirage', foto: '/mapas/mirage.webp', porta: 27018, ativo: true },
    { ordem: 4, modo: 'equipe', armas: 'Renasce na base', mapa: 'Transport Ship', foto: '/mapas/transport-ship.webp', porta: 27019, ativo: true },
    { ordem: 5, modo: 'mutacao', armas: 'Quem é pego vira mutante', mapa: 'Biochemical Hotel', foto: '/mapas/biochemical-hotel.webp', porta: 27020, ativo: false },
    { ordem: 6, modo: 'fantasma', armas: 'Invisíveis contra armados', mapa: 'Laboratory', foto: '/mapas/laboratory.webp', porta: 27021, ativo: false },
  ]);
  expect(linhas.every((linha) => linha.vagas === 16 && linha.host === null)).toBe(true);
});

test('dois servidores não dividem o mesmo endereço', async () => {
  const bd = await criarBancoDeTeste();
  await expect(bd.insert(servidoresDiversao).values({ ...NOVO, porta: 27016 })).rejects.toThrow();
  await expect(bd.insert(servidoresDiversao).values({ ...NOVO, porta: 27016, host: '10.0.0.1' })).resolves.toBeDefined();
});
