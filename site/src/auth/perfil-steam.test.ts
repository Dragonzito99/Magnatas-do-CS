import { expect, test } from 'vitest';
import { STEAM_A } from '@/bd/teste';
import { perfilPublicoSteam } from './perfil-steam';

const XML = `<?xml version="1.0"?><profile><steamID64>${STEAM_A}</steamID64>
<steamID><![CDATA[João | Mira]]></steamID><avatarFull><![CDATA[https://avatars.steamstatic.com/abc_full.jpg]]></avatarFull></profile>`;

test('lê apelido e avatar do perfil público', async () => {
  const buscar = async () => new Response(XML);
  expect(await perfilPublicoSteam(STEAM_A, buscar)).toEqual({
    apelido: 'João | Mira',
    avatarUrl: 'https://avatars.steamstatic.com/abc_full.jpg',
  });
});

test('usa o SteamID como apelido se a Steam falhar', async () => {
  const falha = async () => {
    throw new Error('rede');
  };
  expect(await perfilPublicoSteam(STEAM_A, falha)).toEqual({ apelido: STEAM_A });
});

test('usa o SteamID como apelido se o perfil for privado ou vier erro', async () => {
  const semDados = async () => new Response('<response><error>not found</error></response>');
  expect(await perfilPublicoSteam(STEAM_A, semDados)).toEqual({ apelido: STEAM_A });
  const erro = async () => new Response('falha', { status: 500 });
  expect(await perfilPublicoSteam(STEAM_A, erro)).toEqual({ apelido: STEAM_A });
});

test('ignora avatar que não vem da Steam', async () => {
  const buscar = async () =>
    new Response('<profile><steamID><![CDATA[Bia]]></steamID><avatarFull><![CDATA[https://falso.net/a.jpg]]></avatarFull></profile>');
  expect(await perfilPublicoSteam(STEAM_A, buscar)).toEqual({ apelido: 'Bia' });
});
