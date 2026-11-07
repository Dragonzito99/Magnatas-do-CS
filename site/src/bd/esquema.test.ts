import { expect, test } from 'vitest';
import { banimentos, elogios, faltas, juncoes, partidaJogadores, partidas, usuarios, vetos } from './esquema';
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

test('partida aguardando aceite, vetos, faltas, junções, elogios e banimento do sistema', async () => {
  const bd = await criarBancoDeTeste();
  const [a] = await bd.insert(usuarios).values({ steamid64: STEAM_A, apelido: 'A' }).returning();
  const [b] = await bd.insert(usuarios).values({ steamid64: STEAM_B, apelido: 'B' }).returning();
  const [partida] = await bd.insert(partidas).values({ tipo: 'desafio', estado: 'aguardando_aceite', mapa: null }).returning();
  expect(partida).toMatchObject({ estado: 'aguardando_aceite', mapa: null, aceiteAte: null, primeiroAVetar: null, vetoAte: null });
  await bd.insert(partidaJogadores).values({ partidaId: partida.id, usuarioId: a.id, time: 1 });
  const [linha] = await bd.select().from(partidaJogadores);
  expect(linha).toMatchObject({ aceitouEm: null, entrouNaFilaEm: null, mvps: 0, kast: 0, k1: 0, k2: 0, k3: 0, k4: 0, k5: 0 });
  await bd.insert(vetos).values({ partidaId: partida.id, ordem: 1, time: 2, mapa: 'de_nuke', automatico: false });
  await expect(bd.insert(vetos).values({ partidaId: partida.id, ordem: 2, time: 1, mapa: 'de_nuke', automatico: true })).rejects.toThrow();
  await bd.insert(faltas).values({ usuarioId: a.id, partidaId: partida.id, bloqueadoAte: new Date() });
  await bd.insert(juncoes).values({ salaOrigemId: partida.id, salaAlvoId: partida.id, expiraEm: new Date() });
  await bd.insert(elogios).values({ partidaId: partida.id, autorId: a.id, elogiadoId: b.id, tipo: 'bom_de_mira' });
  await expect(bd.insert(elogios).values({ partidaId: partida.id, autorId: a.id, elogiadoId: b.id, tipo: 'lider' })).rejects.toThrow();
  const [banimento] = await bd.insert(banimentos).values({ usuarioId: a.id, motivo: 'Faltas', estado: 'confirmado', propostoPor: null }).returning();
  expect(banimento.propostoPor).toBeNull();
});
