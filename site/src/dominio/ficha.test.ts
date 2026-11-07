import { beforeEach, expect, test } from 'vitest';
import type { Bd } from '@/bd/conexao';
import { gravacoes, partidaJogadores, partidas, type Partida, type Usuario } from '@/bd/esquema';
import { criarBancoDeTeste, criarUsuario } from '@/bd/teste';
import { denunciar } from './denuncias';
import { fichaDoJogador, kdDosJogadores, situacaoDaGravacao } from './ficha';

let bd: Bd;
let jogador: Usuario;
let outro: Usuario;
const AGORA = new Date('2026-11-03T12:00:00Z');

beforeEach(async () => {
  bd = await criarBancoDeTeste();
  jogador = await criarUsuario(bd, { estado: 'ativo' });
  outro = await criarUsuario(bd, { estado: 'ativo' });
});

async function jogada(
  conta: Usuario,
  valores: { kills: number; deaths: number; assists?: number; headshotKills: number; damage: number; rodadas: number },
  partidaValores: Partial<typeof partidas.$inferInsert> = {},
  time = 1,
): Promise<Partida> {
  const [partida] = await bd
    .insert(partidas)
    .values({ tipo: 'mix', estado: 'encerrada', mapa: 'de_mirage', vencedor: 1, encerradaEm: AGORA, ...partidaValores })
    .returning();
  await bd.insert(partidaJogadores).values({ partidaId: partida.id, usuarioId: conta.id, time, ...valores });
  return partida;
}

const numeros = (kills: number, deaths: number) => ({ kills, deaths, headshotKills: 0, damage: 100, rodadas: 10 });

test('ficha soma as partidas competitivas', async () => {
  await jogada(jogador, { kills: 20, deaths: 10, assists: 3, headshotKills: 5, damage: 400, rodadas: 20 });
  await jogada(jogador, { kills: 10, deaths: 10, assists: 2, headshotKills: 5, damage: 300, rodadas: 15 }, {}, 2);
  const ficha = await fichaDoJogador(bd, outro, jogador.id);
  expect(ficha?.estatisticas).toEqual({
    partidas: 2,
    vitorias: 1,
    vitoriasPct: 50,
    abates: 30,
    mortes: 20,
    assistencias: 5,
    abatesPorPartida: 15,
    kd: 1.5,
    hsPct: 33.3,
    adr: 20,
  });
});

test('ficha de quem nunca jogou mostra zeros, sem dividir por zero', async () => {
  const ficha = await fichaDoJogador(bd, outro, jogador.id);
  expect(ficha?.estatisticas).toEqual({
    partidas: 0,
    vitorias: 0,
    vitoriasPct: 0,
    abates: 0,
    mortes: 0,
    assistencias: 0,
    abatesPorPartida: 0,
    kd: 0,
    hsPct: 0,
    adr: 0,
  });
  expect(ficha?.historico).toEqual([]);
});

test('quem nunca jogou tem por mapa vazio e nenhuma melhor partida', async () => {
  const ficha = await fichaDoJogador(bd, outro, jogador.id);
  expect(ficha?.porMapa).toEqual([]);
  expect(ficha?.melhorPartida).toBeNull();
});

test('por mapa ordena do mais jogado para o menos jogado', async () => {
  await jogada(jogador, numeros(20, 10), { mapa: 'de_mirage', vencedor: 1 });
  await jogada(jogador, numeros(10, 10), { mapa: 'de_mirage', vencedor: 2 });
  await jogada(jogador, numeros(5, 5), { mapa: 'de_inferno', vencedor: 1 });
  expect((await fichaDoJogador(bd, outro, jogador.id))?.porMapa).toEqual([
    { mapa: 'de_mirage', partidas: 2, vitoriasPct: 50, kd: 1.5 },
    { mapa: 'de_inferno', partidas: 1, vitoriasPct: 100, kd: 1 },
  ]);
});

test('no empate de partidas, os mapas ficam em ordem de nome', async () => {
  await jogada(jogador, numeros(5, 5), { mapa: 'de_nuke' });
  await jogada(jogador, numeros(5, 5), { mapa: 'de_anubis' });
  const porMapa = (await fichaDoJogador(bd, outro, jogador.id))?.porMapa;
  expect(porMapa?.map((linha) => linha.mapa)).toEqual(['de_anubis', 'de_nuke']);
});

test('quem tem 0 mortes em um mapa tem KD igual aos abates', async () => {
  await jogada(jogador, numeros(9, 0), { mapa: 'de_nuke' });
  expect((await fichaDoJogador(bd, outro, jogador.id))?.porMapa[0].kd).toBe(9);
});

test('partida cancelada não entra nos números por mapa nem na melhor partida', async () => {
  await jogada(jogador, numeros(50, 1), { estado: 'cancelada', vencedor: null, mapa: 'de_nuke' });
  const ficha = await fichaDoJogador(bd, outro, jogador.id);
  expect(ficha?.porMapa).toEqual([]);
  expect(ficha?.melhorPartida).toBeNull();
});

test('melhor partida é a de mais abates', async () => {
  await jogada(jogador, numeros(10, 5));
  const melhor = await jogada(jogador, numeros(31, 11), { mapa: 'de_nuke', tipo: 'desafio' });
  await jogada(jogador, numeros(20, 5));
  expect((await fichaDoJogador(bd, outro, jogador.id))?.melhorPartida).toEqual({
    id: melhor.id,
    numero: melhor.numero,
    tipo: 'desafio',
    mapa: 'de_nuke',
    kills: 31,
    kd: 2.82,
  });
});

test('no empate de abates, a melhor partida é a mais recente', async () => {
  await jogada(jogador, numeros(20, 5), { encerradaEm: new Date('2026-10-01T00:00:00Z') });
  const recente = await jogada(jogador, numeros(20, 5));
  expect((await fichaDoJogador(bd, outro, jogador.id))?.melhorPartida?.id).toBe(recente.id);
});

test('o histórico traz o dano por rodada de cada partida', async () => {
  await jogada(jogador, { kills: 1, deaths: 1, headshotKills: 0, damage: 95, rodadas: 10 });
  await jogada(jogador, { kills: 1, deaths: 1, headshotKills: 0, damage: 0, rodadas: 0 }, { encerradaEm: new Date('2026-10-01T00:00:00Z') });
  const historico = (await fichaDoJogador(bd, outro, jogador.id))?.historico;
  expect(historico?.map((linha) => linha.adr)).toEqual([9.5, 0]);
});

test('SteamID vai para a própria pessoa e para a equipe, nunca para outro membro', async () => {
  const gm = await criarUsuario(bd, { estado: 'ativo', papel: 'gm' });
  expect(await fichaDoJogador(bd, outro, jogador.id)).not.toHaveProperty('steamid64');
  expect((await fichaDoJogador(bd, jogador, jogador.id))?.steamid64).toBe(jogador.steamid64);
  expect((await fichaDoJogador(bd, gm, jogador.id))?.steamid64).toBe(jogador.steamid64);
});

test('ficha de quem tem 0 mortes mostra KD igual aos abates', async () => {
  await jogada(jogador, { kills: 7, deaths: 0, headshotKills: 0, damage: 100, rodadas: 5 });
  expect((await fichaDoJogador(bd, outro, jogador.id))?.estatisticas.kd).toBe(7);
});

test('partida cancelada não entra nas estatísticas', async () => {
  await jogada(jogador, { kills: 20, deaths: 10, headshotKills: 5, damage: 400, rodadas: 20 }, { estado: 'cancelada', vencedor: null });
  await jogada(jogador, { kills: 5, deaths: 1, headshotKills: 1, damage: 50, rodadas: 2 }, { estado: 'ao_vivo', vencedor: null });
  const ficha = await fichaDoJogador(bd, outro, jogador.id);
  expect(ficha?.estatisticas.partidas).toBe(0);
  expect(ficha?.estatisticas.abates).toBe(0);
});

test('o histórico mostra as partidas encerradas, com a mais nova primeiro e o resultado', async () => {
  const antiga = await jogada(jogador, { kills: 1, deaths: 2, headshotKills: 0, damage: 10, rodadas: 3 }, { encerradaEm: new Date('2026-10-01T00:00:00Z') });
  const nova = await jogada(jogador, { kills: 3, deaths: 4, headshotKills: 0, damage: 30, rodadas: 3 }, {}, 2);
  const ficha = await fichaDoJogador(bd, outro, jogador.id);
  expect(ficha?.historico.map((h) => h.id)).toEqual([nova.id, antiga.id]);
  expect(ficha?.historico[0]).toMatchObject({ venceu: false, kills: 3, deaths: 4, mapa: 'de_mirage' });
  expect(ficha?.historico[1].venceu).toBe(true);
});

test('membro vê estatísticas e histórico, mas não denúncias nem gravações', async () => {
  const partida = await jogada(jogador, { kills: 1, deaths: 1, headshotKills: 0, damage: 10, rodadas: 3 });
  await bd.insert(partidaJogadores).values({ partidaId: partida.id, usuarioId: outro.id, time: 2 });
  await denunciar(bd, outro, { partidaId: partida.id, acusadoId: jogador.id, motivo: 'x' });
  const ficha = await fichaDoJogador(bd, outro, jogador.id);
  expect(ficha?.estatisticas.partidas).toBe(1);
  expect(ficha?.equipe).toBeUndefined();
  expect(JSON.stringify(ficha)).not.toContain('steamid');
  expect(JSON.stringify(ficha)).not.toContain('cpf');
});

test('a própria pessoa também não vê as denúncias contra ela', async () => {
  expect((await fichaDoJogador(bd, jogador, jogador.id))?.equipe).toBeUndefined();
});

test('equipe vê denúncias, gravações, quem convidou e quem foi convidado', async () => {
  const gm = await criarUsuario(bd, { estado: 'ativo', papel: 'gm' });
  const padrinho = await criarUsuario(bd, { estado: 'ativo' });
  const convidado = await criarUsuario(bd, { estado: 'ativo', convidadoPor: jogador.id });
  const alvo = await criarUsuario(bd, { estado: 'ativo', convidadoPor: padrinho.id });
  const partida = await jogada(alvo, { kills: 1, deaths: 1, headshotKills: 0, damage: 10, rodadas: 3 });
  await bd.insert(partidaJogadores).values({ partidaId: partida.id, usuarioId: outro.id, time: 2 });
  await denunciar(bd, outro, { partidaId: partida.id, acusadoId: alvo.id, motivo: 'Mira grudada' });
  await bd.insert(gravacoes).values({ partidaId: partida.id, arquivo: `${partida.numero}.dem`, bytes: 100 });

  const ficha = await fichaDoJogador(bd, gm, alvo.id, AGORA);
  expect(ficha?.equipe?.denuncias).toHaveLength(1);
  expect(ficha?.equipe?.denuncias[0]).toMatchObject({ motivo: 'Mira grudada', denunciantePorApelido: outro.apelido, partidaNumero: partida.numero });
  expect(ficha?.equipe?.convidadoPor?.apelido).toBe(padrinho.apelido);
  expect(ficha?.equipe?.steamid64).toBe(alvo.steamid64);
  expect(ficha?.historico[0].gravacao).toBe('disponivel');

  const fichaDoPadrinho = await fichaDoJogador(bd, gm, jogador.id, AGORA);
  expect(fichaDoPadrinho?.equipe?.convidados.map((c) => c.id)).toEqual([convidado.id]);
});

test('ficha de conta inexistente é null', async () => {
  expect(await fichaDoJogador(bd, outro, '00000000-0000-0000-0000-000000000000')).toBeNull();
});

test('situação da gravação: aguardando até 10 minutos depois do fim, e depois sem gravação', () => {
  const encerradaEm = new Date(AGORA.getTime() - 9 * 60_000);
  expect(situacaoDaGravacao({ encerradaEm }, null, AGORA)).toBe('aguardando');
  expect(situacaoDaGravacao({ encerradaEm: new Date(AGORA.getTime() - 11 * 60_000) }, null, AGORA)).toBe('sem');
  expect(situacaoDaGravacao({ encerradaEm }, { apagadaEm: null }, AGORA)).toBe('disponivel');
  expect(situacaoDaGravacao({ encerradaEm }, { apagadaEm: AGORA }, AGORA)).toBe('apagada');
  expect(situacaoDaGravacao({ encerradaEm: null }, null, AGORA)).toBe('aguardando');
});

test('o K/D de cada pessoa da sala vem numa consulta só, e quem nunca jogou fica com zero', async () => {
  await jogada(jogador, numeros(20, 10));
  await jogada(jogador, numeros(10, 10));
  await jogada(outro, numeros(7, 0));
  await jogada(outro, numeros(50, 1), { estado: 'cancelada' });
  const novato = await criarUsuario(bd, { estado: 'ativo' });
  const kd = await kdDosJogadores(bd, [jogador.id, outro.id, novato.id]);
  expect(kd.get(jogador.id)).toBe(1.5);
  expect(kd.get(outro.id)).toBe(7);
  expect(kd.get(novato.id)).toBe(0);
  expect((await kdDosJogadores(bd, [])).size).toBe(0);
});
