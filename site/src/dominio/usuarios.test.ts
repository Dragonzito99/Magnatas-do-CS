import { beforeEach, expect, test } from 'vitest';
import type { Bd } from '@/bd/conexao';
import { criarBancoDeTeste, criarUsuario, recarregar, STEAM_A } from '@/bd/teste';
import { atualizarPerfil, buscarPorSteam } from './usuarios';

let bd: Bd;

beforeEach(async () => {
  bd = await criarBancoDeTeste();
});

test('encontra a conta pela Steam', async () => {
  const conta = await criarUsuario(bd, { steamid64: STEAM_A });
  expect((await buscarPorSteam(bd, STEAM_A))?.id).toBe(conta.id);
  expect(await buscarPorSteam(bd, '76561198999999999')).toBeNull();
});

test('o login traz o apelido e o avatar atuais da Steam', async () => {
  const conta = await criarUsuario(bd, { steamid64: STEAM_A, apelido: STEAM_A });
  await atualizarPerfil(bd, conta, { apelido: 'Bia', avatarUrl: 'https://avatars.steamstatic.com/a.jpg' });
  expect(await recarregar(bd, conta)).toMatchObject({ apelido: 'Bia', avatarUrl: 'https://avatars.steamstatic.com/a.jpg' });
});

test('se a Steam falhar, o apelido conhecido não vira o SteamID', async () => {
  const conta = await criarUsuario(bd, { steamid64: STEAM_A, apelido: 'Bia', avatarUrl: 'https://avatars.steamstatic.com/a.jpg' });
  await atualizarPerfil(bd, conta, { apelido: STEAM_A });
  expect(await recarregar(bd, conta)).toMatchObject({ apelido: 'Bia', avatarUrl: 'https://avatars.steamstatic.com/a.jpg' });
});
