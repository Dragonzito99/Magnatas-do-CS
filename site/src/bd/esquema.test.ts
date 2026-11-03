import { expect, test } from 'vitest';
import { usuarios } from './esquema';
import { criarBancoDeTeste, STEAM_A, STEAM_B } from './teste';

test('banco de teste aplica as migrações', async () => {
  const bd = await criarBancoDeTeste();
  const linhas = await bd.select().from(usuarios);
  expect(linhas).toEqual([]);
});

test('conta nova começa aguardando verificação, como jogador e sem convites', async () => {
  const bd = await criarBancoDeTeste();
  const [conta] = await bd.insert(usuarios).values({ steamid64: STEAM_A, apelido: 'A' }).returning();
  expect(conta).toMatchObject({ estado: 'aguardando_verificacao', papel: 'jogador', convitesRestantes: 0 });
});

test('steamid64 é único', async () => {
  const bd = await criarBancoDeTeste();
  await bd.insert(usuarios).values({ steamid64: STEAM_A, apelido: 'A' });
  await expect(bd.insert(usuarios).values({ steamid64: STEAM_A, apelido: 'B' })).rejects.toThrow();
});

test('o mesmo código de CPF não pode estar em duas contas', async () => {
  const bd = await criarBancoDeTeste();
  await bd.insert(usuarios).values({ steamid64: STEAM_A, apelido: 'A', cpfHmac: 'x' });
  await expect(
    bd.insert(usuarios).values({ steamid64: STEAM_B, apelido: 'B', cpfHmac: 'x' }),
  ).rejects.toThrow();
});
