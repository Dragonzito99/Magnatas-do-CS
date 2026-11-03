import { eq } from 'drizzle-orm';
import { beforeEach, expect, test } from 'vitest';
import type { Bd } from '@/bd/conexao';
import { partidaJogadores, partidas, salas, servidores, usuarios, type Partida, type Usuario } from '@/bd/esquema';
import { criarBancoDeTeste, criarUsuario } from '@/bd/teste';
import { controladorFalso } from '@/servidor-jogo/controlador';
import { alocarServidores, configDaPartida, criarPartida, criarServidor, MAPAS, respostaDaConfig } from './partidas';

let bd: Bd;

beforeEach(async () => {
  bd = await criarBancoDeTeste();
});

async function contas(total: number): Promise<Usuario[]> {
  const lista: Usuario[] = [];
  for (let i = 0; i < total; i += 1) lista.push(await criarUsuario(bd, { estado: 'ativo' }));
  return lista;
}

async function novaPartida(mapa?: string): Promise<{ partida: Partida; time1: Usuario[]; time2: Usuario[] }> {
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

test('partida nasce aguardando servidor, com 5 jogadores em cada time e mapa do conjunto', async () => {
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

test('config traz matchid, mapa, times com apelidos, players_per_team 5 e skip_veto', async () => {
  const { partida, time1, time2 } = await novaPartida('de_nuke');
  const config = (await configDaPartida(bd, partida.numero)) as Record<string, any>;
  expect(config).toMatchObject({ matchid: partida.numero, maplist: ['de_nuke'], num_maps: 1, players_per_team: 5, skip_veto: true });
  expect(config.team1.players).toEqual(Object.fromEntries(time1.map((c) => [c.steamid64, c.apelido])));
  expect(config.team2.players).toEqual(Object.fromEntries(time2.map((c) => [c.steamid64, c.apelido])));
  expect(config.team1.name).toBe('Time 1');
});

test('em desafio, o time leva o nome da sala', async () => {
  const { partida, time1 } = await novaPartida();
  const [sala] = await bd.insert(salas).values({ nome: 'Os sem mira', liderId: time1[0].id, partidaId: partida.id }).returning();
  const config = (await configDaPartida(bd, partida.numero)) as Record<string, any>;
  expect(config.team1.name).toBe(sala.nome);
  expect(config.team2.name).toBe('Time 2');
});

test('config coloca GMs e Adms ativos em spectators, menos quem está jogando', async () => {
  const { partida, time1 } = await novaPartida();
  await bd.update(usuarios).set({ papel: 'adm' }).where(eq(usuarios.id, time1[0].id));
  const gm = await criarUsuario(bd, { estado: 'ativo', papel: 'gm' });
  const adm = await criarUsuario(bd, { estado: 'ativo', papel: 'adm' });
  const suspenso = await criarUsuario(bd, { estado: 'suspenso', papel: 'gm' });
  const config = (await configDaPartida(bd, partida.numero)) as Record<string, any>;
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
