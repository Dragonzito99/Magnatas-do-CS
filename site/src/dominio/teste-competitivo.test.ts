import { eq } from 'drizzle-orm';
import { beforeEach, describe, expect, test } from 'vitest';
import type { Bd } from '@/bd/conexao';
import { filaMix, partidaJogadores, partidas, servidores, xpPartidas, type Partida, type Usuario } from '@/bd/esquema';
import { criarBancoDeTeste, criarUsuario } from '@/bd/teste';
import { controladorFalso } from '@/servidor-jogo/controlador';
import { aceitarPartida } from './aceites';
import { JaOcupado } from './disponibilidade';
import { SemPermissao } from './equipe';
import { kdDosJogadores } from './ficha';
import { mvpsDoPeriodo } from './mvps';
import { configDaPartida, finalizarPartida, MAPAS } from './partidas';
import { chamarBotsDosTestes, criarTesteDoCompetitivo } from './teste-competitivo';
import { resolverVetosVencidos, vetarMapa, vetosDaPartida } from './vetos';

let bd: Bd;
let adm: Usuario;
const AGORA = new Date('2026-11-08T15:00:00Z');

beforeEach(async () => {
  bd = await criarBancoDeTeste();
  adm = await criarUsuario(bd, { estado: 'ativo', papel: 'adm' });
});

async function recarregar(id: string): Promise<Partida> {
  const [linha] = await bd.select().from(partidas).where(eq(partidas.id, id));
  return linha;
}

async function vetados(partidaId: string) {
  return (await vetosDaPartida(bd, partidaId))!.vetados;
}

/** Aceita e veta até sobrar um mapa, sempre o primeiro que ainda está livre. */
async function ateOMapa(partida: Partida): Promise<Partida> {
  if ((await recarregar(partida.id)).estado === 'aguardando_aceite') await aceitarPartida(bd, adm, partida.id, AGORA);
  for (let volta = 0; volta < MAPAS.length; volta += 1) {
    const atual = await recarregar(partida.id);
    if (atual.estado !== 'vetando') return atual;
    const feitos = await vetados(partida.id);
    const livre = MAPAS.find((mapa) => !feitos.some((veto) => veto.mapa === mapa))!;
    await vetarMapa(bd, adm, partida.id, livre, AGORA);
  }
  return recarregar(partida.id);
}

describe('criarTesteDoCompetitivo', () => {
  test('o Adm cria uma partida só com ele, contra os bots, que começa no aceite', async () => {
    const partida = await criarTesteDoCompetitivo(bd, adm, AGORA);
    expect(partida).toMatchObject({ tipo: 'teste', estado: 'aguardando_aceite', mapasDaPartida: 1, nomeTime1: 'Seu time', nomeTime2: 'Bots' });
    const jogadores = await bd.select().from(partidaJogadores).where(eq(partidaJogadores.partidaId, partida.id));
    expect(jogadores.map((linha) => [linha.usuarioId, linha.time])).toEqual([[adm.id, 1]]);
  });

  test('quem não é Adm não pode', async () => {
    const gm = await criarUsuario(bd, { estado: 'ativo', papel: 'gm' });
    await expect(criarTesteDoCompetitivo(bd, gm, AGORA)).rejects.toBeInstanceOf(SemPermissao);
  });

  test('quem está na fila ou em outra partida não pode', async () => {
    await bd.insert(filaMix).values({ usuarioId: adm.id });
    await expect(criarTesteDoCompetitivo(bd, adm, AGORA)).rejects.toBeInstanceOf(JaOcupado);
  });
});

describe('vetos do teste', () => {
  test('o Adm sempre começa e os bots vetam logo depois dele, até sobrar o mapa', async () => {
    const partida = await criarTesteDoCompetitivo(bd, adm, AGORA);
    await aceitarPartida(bd, adm, partida.id, AGORA);
    expect(await recarregar(partida.id)).toMatchObject({ estado: 'vetando', primeiroAVetar: 1 });
    await vetarMapa(bd, adm, partida.id, MAPAS[0], AGORA);
    expect((await vetados(partida.id)).map((veto) => [veto.time, veto.automatico])).toEqual([
      [1, false],
      [2, true],
    ]);
    const pronta = await ateOMapa(partida);
    expect(pronta.estado).toBe('aguardando_servidor');
    expect(MAPAS).toContain(pronta.mapa);
  });

  test('se o tempo do Adm acabar, o site veta por ele e os bots seguem', async () => {
    const partida = await criarTesteDoCompetitivo(bd, adm, AGORA);
    await aceitarPartida(bd, adm, partida.id, AGORA);
    await resolverVetosVencidos(bd, new Date(AGORA.getTime() + 21_000));
    expect((await vetados(partida.id)).map((veto) => veto.time)).toEqual([1, 2]);
  });
});

describe('servidor do teste', () => {
  async function noServidor(estado: Partida['estado']) {
    const partida = await ateOMapa(await criarTesteDoCompetitivo(bd, adm, AGORA));
    const [servidor] = await bd.insert(servidores).values({ nome: 'SP', host: '10.0.0.1', porta: 27015, partidaId: partida.id }).returning();
    await bd.update(partidas).set({ estado, servidorId: servidor.id }).where(eq(partidas.id, partida.id));
    return recarregar(partida.id);
  }

  test('a config deixa começar com uma pessoa, completa com bots e pula a faca', async () => {
    const partida = await noServidor('aguardando_jogadores');
    const config = (await configDaPartida(bd, partida.numero)) as Record<string, unknown>;
    expect(config).toMatchObject({ players_per_team: 5, min_players_to_ready: 1, map_sides: ['team1_ct'] });
    expect(config.team2).toEqual({ name: 'Bots', players: {} });
  });

  test('com o Adm no servidor, os bots entram e a partida começa; ao vivo, só os bots são repostos', async () => {
    const partida = await noServidor('aguardando_jogadores');
    const bots = (controlador: ReturnType<typeof controladorFalso>) => controlador.chamadas.filter((chamada) => chamada.acao === 'chamarBots');
    const fora = controladorFalso();
    await chamarBotsDosTestes(bd, fora);
    expect(bots(fora)).toEqual([]);

    const dentro = controladorFalso({ conectados: { '10.0.0.1': [adm.steamid64] } });
    await chamarBotsDosTestes(bd, dentro);
    expect(bots(dentro)).toEqual([{ acao: 'chamarBots', host: '10.0.0.1', comecar: true }]);

    await bd.update(partidas).set({ estado: 'ao_vivo' }).where(eq(partidas.id, partida.id));
    const aoVivo = controladorFalso({ conectados: { '10.0.0.1': [adm.steamid64] } });
    await chamarBotsDosTestes(bd, aoVivo);
    expect(bots(aoVivo)).toEqual([{ acao: 'chamarBots', host: '10.0.0.1', comecar: false }]);
  });

  test('o teste não dá XP e não entra no K/D nem nos MVPs', async () => {
    const partida = await noServidor('ao_vivo');
    await bd.update(partidaJogadores).set({ kills: 20, deaths: 2, mvps: 5, rodadas: 13 }).where(eq(partidaJogadores.partidaId, partida.id));
    await bd.transaction((tx) => finalizarPartida(tx, partida.id, { estado: 'encerrada', vencedor: 1 }));
    expect(await bd.select().from(xpPartidas).where(eq(xpPartidas.usuarioId, adm.id))).toEqual([]);
    expect((await kdDosJogadores(bd, [adm.id])).get(adm.id)).toBe(0);
    expect(await mvpsDoPeriodo(bd, { inicio: new Date('2000-01-01'), fim: new Date('2100-01-01') }, 10)).toEqual([]);
  });
});
