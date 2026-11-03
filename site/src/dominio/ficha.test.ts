import { beforeEach, expect, test } from 'vitest';
import type { Bd } from '@/bd/conexao';
import { gravacoes, partidaJogadores, partidas, type Partida, type Usuario } from '@/bd/esquema';
import { criarBancoDeTeste, criarUsuario } from '@/bd/teste';
import { denunciar } from './denuncias';
import { fichaDoJogador, situacaoDaGravacao } from './ficha';

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
  valores: { kills: number; deaths: number; headshotKills: number; damage: number; rodadas: number },
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

test('ficha soma as partidas competitivas', async () => {
  await jogada(jogador, { kills: 20, deaths: 10, headshotKills: 5, damage: 400, rodadas: 20 });
  await jogada(jogador, { kills: 10, deaths: 10, headshotKills: 5, damage: 300, rodadas: 15 }, {}, 2);
  const ficha = await fichaDoJogador(bd, outro, jogador.id);
  expect(ficha?.estatisticas).toEqual({ partidas: 2, vitorias: 1, abates: 30, mortes: 20, kd: 1.5, hsPct: 33.3, adr: 20 });
});

test('ficha de quem nunca jogou mostra zeros, sem dividir por zero', async () => {
  const ficha = await fichaDoJogador(bd, outro, jogador.id);
  expect(ficha?.estatisticas).toEqual({ partidas: 0, vitorias: 0, abates: 0, mortes: 0, kd: 0, hsPct: 0, adr: 0 });
  expect(ficha?.historico).toEqual([]);
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
