import { eq } from 'drizzle-orm';
import { beforeEach, describe, expect, test } from 'vitest';
import type { Bd } from '@/bd/conexao';
import { gravacoes, partidaJogadores, partidas, salas, servidores, usuarios, type Partida, type Usuario } from '@/bd/esquema';
import { criarBancoDeTeste, criarUsuario } from '@/bd/teste';
import { controladorFalso } from '@/servidor-jogo/controlador';
import {
  alocarServidores,
  configDaPartida,
  criarPartida,
  criarServidor,
  dadosDeConexao,
  detalheDaPartida,
  devolverPartida,
  MAPAS,
  partidaAtualDe,
  partidasEmAndamento,
  respostaDaConfig,
} from './partidas';

type TimeDaConfig = { name: string; players: Record<string, string> };
type Config = { team1: TimeDaConfig; team2: TimeDaConfig; spectators: { players: Record<string, string> } };

let bd: Bd;

beforeEach(async () => {
  bd = await criarBancoDeTeste();
});

async function contas(total: number): Promise<Usuario[]> {
  const lista: Usuario[] = [];
  for (let i = 0; i < total; i += 1) lista.push(await criarUsuario(bd, { estado: 'ativo' }));
  return lista;
}

// Com mapa a partida nasce pronta para o servidor: o aceite e os vetos têm testes próprios.
async function novaPartida(mapa: string = 'de_mirage'): Promise<{ partida: Partida; time1: Usuario[]; time2: Usuario[] }> {
  const [time1, time2] = [await contas(5), await contas(5)];
  const partida = await bd.transaction((tx) =>
    criarPartida(tx, { tipo: 'mix', time1: time1.map((c) => c.id), time2: time2.map((c) => c.id), mapa }),
  );
  return { partida, time1, time2 };
}

async function recarregarPartida(id: string): Promise<Partida> {
  const [linha] = await bd.select().from(partidas).where(eq(partidas.id, id));
  return linha;
}

async function recarregarServidor(id: string) {
  const [linha] = await bd.select().from(servidores).where(eq(servidores.id, id));
  return linha;
}

test('partida com mapa nasce aguardando servidor, com 5 jogadores em cada time', async () => {
  const { partida } = await novaPartida();
  expect(partida.estado).toBe('aguardando_servidor');
  expect(MAPAS).toContain(partida.mapa);
  const jogadores = await bd.select().from(partidaJogadores).where(eq(partidaJogadores.partidaId, partida.id));
  expect(jogadores.filter((j) => j.time === 1)).toHaveLength(5);
  expect(jogadores.filter((j) => j.time === 2)).toHaveLength(5);
});

test('alocar usa um servidor livre, passa para carregando e pede o carregamento', async () => {
  const { partida } = await novaPartida();
  const servidor = await criarServidor(bd, { nome: 'SP 1', host: '10.0.0.1', porta: 27015 });
  const controlador = controladorFalso();
  await alocarServidores(bd, controlador);
  expect(await recarregarPartida(partida.id)).toMatchObject({ estado: 'carregando', servidorId: servidor.id });
  expect((await recarregarServidor(servidor.id)).partidaId).toBe(partida.id);
  expect(controlador.chamadas).toEqual([{ acao: 'carregarPartida', host: '10.0.0.1', numero: partida.numero }]);
});

test('sem servidor livre, a partida espera, e ninguém perde o lugar', async () => {
  const { partida } = await novaPartida();
  const controlador = controladorFalso();
  await alocarServidores(bd, controlador);
  expect(await recarregarPartida(partida.id)).toMatchObject({ estado: 'aguardando_servidor', servidorId: null });
  expect(controlador.chamadas).toEqual([]);
  expect(await bd.select().from(partidaJogadores).where(eq(partidaJogadores.partidaId, partida.id))).toHaveLength(10);
});

test('servidor inativo não é usado', async () => {
  const { partida } = await novaPartida();
  const servidor = await criarServidor(bd, { nome: 'SP 1', host: '10.0.0.1', porta: 27015 });
  await bd.update(servidores).set({ ativo: false }).where(eq(servidores.id, servidor.id));
  await alocarServidores(bd, controladorFalso());
  expect((await recarregarPartida(partida.id)).estado).toBe('aguardando_servidor');
});

test('dois servidores e três partidas: a mais antiga é atendida primeiro, e a terceira espera', async () => {
  const [a, b, c] = [await novaPartida(), await novaPartida(), await novaPartida()];
  await criarServidor(bd, { nome: 'SP 1', host: '10.0.0.1', porta: 27015 });
  await criarServidor(bd, { nome: 'SP 2', host: '10.0.0.2', porta: 27015 });
  await alocarServidores(bd, controladorFalso());
  expect((await recarregarPartida(a.partida.id)).estado).toBe('carregando');
  expect((await recarregarPartida(b.partida.id)).estado).toBe('carregando');
  expect((await recarregarPartida(c.partida.id)).estado).toBe('aguardando_servidor');
});

test('falha de RCON devolve a partida para aguardando servidor e libera o servidor', async () => {
  const { partida } = await novaPartida();
  const servidor = await criarServidor(bd, { nome: 'SP 1', host: '10.0.0.1', porta: 27015 });
  await alocarServidores(bd, controladorFalso({ hostsComFalha: ['10.0.0.1'] }));
  expect(await recarregarPartida(partida.id)).toMatchObject({ estado: 'aguardando_servidor', servidorId: null });
  expect((await recarregarServidor(servidor.id)).partidaId).toBeNull();
});

test('com um servidor fora do ar, a partida vai para o outro', async () => {
  const { partida } = await novaPartida();
  await criarServidor(bd, { nome: 'SP 1', host: '10.0.0.1', porta: 27015 });
  const bom = await criarServidor(bd, { nome: 'SP 2', host: '10.0.0.2', porta: 27015 });
  await alocarServidores(bd, controladorFalso({ hostsComFalha: ['10.0.0.1'] }));
  expect(await recarregarPartida(partida.id)).toMatchObject({ estado: 'carregando', servidorId: bom.id });
});

test('devolver partida que já saiu de carregando não libera o servidor dela', async () => {
  const { partida } = await novaPartida();
  const servidor = await criarServidor(bd, { nome: 'SP 1', host: '10.0.0.1', porta: 27015 });
  await bd.update(partidas).set({ estado: 'aguardando_jogadores', servidorId: servidor.id }).where(eq(partidas.id, partida.id));
  await bd.update(servidores).set({ partidaId: partida.id }).where(eq(servidores.id, servidor.id));
  await devolverPartida(bd, partida.id, servidor.id);
  expect((await recarregarPartida(partida.id)).estado).toBe('aguardando_jogadores');
  expect((await recarregarServidor(servidor.id)).partidaId).toBe(partida.id);
});

describe('espera pela gravação da partida anterior', () => {
  const AGORA = new Date('2026-11-03T12:00:00Z');
  const minutosAntes = (minutos: number) => new Date(AGORA.getTime() - minutos * 60_000);

  async function anteriorNoServidor(estado: 'encerrada' | 'cancelada', encerradaEm: Date) {
    const servidor = await criarServidor(bd, { nome: 'SP 1', host: '10.0.0.1', porta: 27015 });
    const [anterior] = await bd.insert(partidas).values({ tipo: 'mix', mapa: 'de_nuke', estado, encerradaEm, servidorId: servidor.id }).returning();
    return anterior;
  }

  test('servidor espera a gravação da partida que acabou de encerrar', async () => {
    await anteriorNoServidor('encerrada', minutosAntes(2));
    const { partida } = await novaPartida();
    await alocarServidores(bd, controladorFalso(), AGORA);
    expect((await recarregarPartida(partida.id)).estado).toBe('aguardando_servidor');
  });

  test('com a gravação recebida, o servidor já pode ser usado', async () => {
    const anterior = await anteriorNoServidor('encerrada', minutosAntes(2));
    await bd.insert(gravacoes).values({ partidaId: anterior.id, arquivo: '1.dem', bytes: 10 });
    const { partida } = await novaPartida();
    await alocarServidores(bd, controladorFalso(), AGORA);
    expect((await recarregarPartida(partida.id)).estado).toBe('carregando');
  });

  test('depois de 5 minutos sem gravação, o servidor não espera mais', async () => {
    await anteriorNoServidor('encerrada', minutosAntes(6));
    const { partida } = await novaPartida();
    await alocarServidores(bd, controladorFalso(), AGORA);
    expect((await recarregarPartida(partida.id)).estado).toBe('carregando');
  });

  test('partida cancelada não tem gravação para esperar', async () => {
    await anteriorNoServidor('cancelada', minutosAntes(1));
    const { partida } = await novaPartida();
    await alocarServidores(bd, controladorFalso(), AGORA);
    expect((await recarregarPartida(partida.id)).estado).toBe('carregando');
  });
});

test('config traz matchid, mapa, times com apelidos, players_per_team 5 e skip_veto', async () => {
  const { partida, time1, time2 } = await novaPartida('de_nuke');
  const config = (await configDaPartida(bd, partida.numero)) as Config;
  expect(config).toMatchObject({ matchid: partida.numero, maplist: ['de_nuke'], num_maps: 1, players_per_team: 5, skip_veto: true });
  expect(config.team1.players).toEqual(Object.fromEntries(time1.map((c) => [c.steamid64, c.apelido])));
  expect(config.team2.players).toEqual(Object.fromEntries(time2.map((c) => [c.steamid64, c.apelido])));
  expect(config.team1.name).toBe('Time 1');
});

test('a config pede 5 prontos por time, e só um teste pode baixar esse número', async () => {
  const { partida } = await novaPartida();
  expect(await configDaPartida(bd, partida.numero)).toMatchObject({ min_players_to_ready: 5 });
  expect(await configDaPartida(bd, partida.numero, 1)).toMatchObject({ min_players_to_ready: 1 });
});

test('em desafio, o time leva o nome da sala', async () => {
  const { partida, time1 } = await novaPartida();
  const [sala] = await bd.insert(salas).values({ nome: 'Os sem mira', liderId: time1[0].id, partidaId: partida.id }).returning();
  const config = (await configDaPartida(bd, partida.numero)) as Config;
  expect(config.team1.name).toBe(sala.nome);
  expect(config.team2.name).toBe('Time 2');
});

test('config coloca GMs e Adms ativos em spectators, menos quem está jogando', async () => {
  const { partida, time1 } = await novaPartida();
  await bd.update(usuarios).set({ papel: 'adm' }).where(eq(usuarios.id, time1[0].id));
  const gm = await criarUsuario(bd, { estado: 'ativo', papel: 'gm' });
  const adm = await criarUsuario(bd, { estado: 'ativo', papel: 'adm' });
  const suspenso = await criarUsuario(bd, { estado: 'suspenso', papel: 'gm' });
  const config = (await configDaPartida(bd, partida.numero)) as Config;
  const espectadores = Object.keys(config.spectators.players);
  expect(espectadores.sort()).toEqual([gm.steamid64, adm.steamid64].sort());
  expect(espectadores).not.toContain(suspenso.steamid64);
  expect(espectadores).not.toContain(time1[0].steamid64);
});

test.each(['encerrada', 'cancelada'] as const)('config de partida %s é null', async (estado) => {
  const { partida } = await novaPartida();
  await bd.update(partidas).set({ estado }).where(eq(partidas.id, partida.id));
  expect(await configDaPartida(bd, partida.numero)).toBeNull();
});

test('config de partida desconhecida é null', async () => {
  expect(await configDaPartida(bd, 999)).toBeNull();
});

test('a rota de config recusa token errado', async () => {
  const { partida } = await novaPartida();
  const numero = String(partida.numero);
  expect((await respostaDaConfig(bd, numero, 'Bearer errado', 'certo')).status).toBe(401);
  expect((await respostaDaConfig(bd, numero, null, 'certo')).status).toBe(401);
  expect((await respostaDaConfig(bd, numero, 'Bearer certo', undefined)).status).toBe(401);
  const certa = await respostaDaConfig(bd, numero, 'Bearer certo', 'certo');
  expect(certa.status).toBe(200);
  expect((await certa.json()).matchid).toBe(partida.numero);
});

test.each(['abc', '-1', '1.5', '99999999999999', ''])('a rota de config responde 404 para o número %j', async (numero) => {
  expect((await respostaDaConfig(bd, numero, 'Bearer certo', 'certo')).status).toBe(404);
});

test('criar servidor de novo no mesmo endereço atualiza, sem duplicar', async () => {
  const primeiro = await criarServidor(bd, { nome: 'Velho', host: '10.0.0.1', porta: 27015 });
  const segundo = await criarServidor(bd, { nome: 'Novo', host: '10.0.0.1', porta: 27015 });
  expect(segundo.id).toBe(primeiro.id);
  expect(segundo.nome).toBe('Novo');
  expect(await bd.select().from(servidores)).toHaveLength(1);
});

test('partidaAtualDe traz a partida ativa e ignora encerradas', async () => {
  const { partida, time1 } = await novaPartida();
  const fora = await criarUsuario(bd, { estado: 'ativo' });
  expect((await partidaAtualDe(bd, time1[0].id))?.id).toBe(partida.id);
  expect(await partidaAtualDe(bd, fora.id)).toBeNull();
  await bd.update(partidas).set({ estado: 'encerrada' }).where(eq(partidas.id, partida.id));
  expect(await partidaAtualDe(bd, time1[0].id)).toBeNull();
});

const SERVIDOR = { host: '10.0.0.1', porta: 27015 };
const pronta = { estado: 'ao_vivo' } as const;

test('dados de conexão aparecem para jogador da partida e para a equipe', () => {
  const url = 'steam://connect/10.0.0.1:27015/senha%20boa';
  expect(dadosDeConexao(pronta, SERVIDOR, { papel: 'jogador', jogaNaPartida: true }, 'senha boa')).toEqual({ url });
  expect(dadosDeConexao(pronta, SERVIDOR, { papel: 'gm', jogaNaPartida: false }, 'senha boa')).toEqual({ url });
  expect(dadosDeConexao(pronta, SERVIDOR, { papel: 'adm', jogaNaPartida: false }, 'senha boa')).toEqual({ url });
});

test('dados de conexão não aparecem para outro membro', () => {
  expect(dadosDeConexao(pronta, SERVIDOR, { papel: 'jogador', jogaNaPartida: false }, 'senha')).toBeNull();
});

test.each(['aguardando_servidor', 'carregando', 'encerrada', 'cancelada'] as const)(
  'dados de conexão não aparecem com a partida %s',
  (estado) => {
    expect(dadosDeConexao({ estado }, SERVIDOR, { papel: 'jogador', jogaNaPartida: true }, 'senha')).toBeNull();
  },
);

test('dados de conexão não aparecem antes de o servidor estar pronto', () => {
  expect(dadosDeConexao({ estado: 'carregando' }, SERVIDOR, { papel: 'adm', jogaNaPartida: false }, 'senha')).toBeNull();
  expect(dadosDeConexao(pronta, null, { papel: 'adm', jogaNaPartida: false }, 'senha')).toBeNull();
});

test('partidasEmAndamento traz só as ativas, com a mais nova primeiro', async () => {
  const [a, b, c] = [await novaPartida(), await novaPartida(), await novaPartida()];
  await bd.update(partidas).set({ estado: 'encerrada' }).where(eq(partidas.id, b.partida.id));
  expect((await partidasEmAndamento(bd)).map((p) => p.id)).toEqual([c.partida.id, a.partida.id]);
});

test('detalheDaPartida traz a partida, o servidor e os jogadores sem dados privados', async () => {
  const { partida, time1 } = await novaPartida();
  await criarServidor(bd, { nome: 'SP 1', host: '10.0.0.1', porta: 27015 });
  await alocarServidores(bd, controladorFalso());
  const detalhe = await detalheDaPartida(bd, partida.id);
  expect(detalhe?.servidor?.host).toBe('10.0.0.1');
  expect(detalhe?.jogadores).toHaveLength(10);
  const jogador = detalhe?.jogadores.find((j) => j.id === time1[0].id);
  expect(jogador).toMatchObject({ apelido: time1[0].apelido, time: 1, kills: 0 });
  expect(jogador).not.toHaveProperty('cpfHmac');
  expect(jogador).not.toHaveProperty('steamid64');
});

test('detalheDaPartida de partida inexistente é null', async () => {
  expect(await detalheDaPartida(bd, '00000000-0000-0000-0000-000000000000')).toBeNull();
});
