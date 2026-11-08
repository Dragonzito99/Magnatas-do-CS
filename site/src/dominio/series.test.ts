import { and, eq } from 'drizzle-orm';
import { beforeEach, describe, expect, test } from 'vitest';
import type { Bd } from '@/bd/conexao';
import { clas, gravacoes, partidaJogadores, partidas, salas, series, servidores, xpPartidas, type Partida, type Usuario } from '@/bd/esquema';
import { criarBancoDeTeste, criarUsuario } from '@/bd/teste';
import { controladorFalso } from '@/servidor-jogo/controlador';
import { alocarServidores, configDaPartida, criarPartida, criarServidor, finalizarPartida } from './partidas';
import { serieDaPartida } from './series';

let bd: Bd;
const MINUTO = 60_000;

beforeEach(async () => {
  bd = await criarBancoDeTeste();
});

async function contas(total: number): Promise<Usuario[]> {
  const lista: Usuario[] = [];
  for (let i = 0; i < total; i += 1) lista.push(await criarUsuario(bd, { estado: 'ativo' }));
  return lista;
}

/** Uma MD3 de clã já depois dos vetos: série com 3 mapas, mapa 1 esperando servidor, e as duas salas presas a ela. */
async function md3(tipo: 'cla' | 'treino' = 'cla') {
  const [alfa] = await bd.insert(clas).values({ nome: 'Magnatas', sigla: 'MGN', cor: 'ouro', entrada: 'aberto' }).returning();
  const [bravo] = await bd.insert(clas).values({ nome: 'Forja', sigla: 'FRG', cor: 'roxo', entrada: 'aberto' }).returning();
  const [time1, time2] = [await contas(5), await contas(5)];
  const [serie] = await bd.insert(series).values({ mapas: ['de_mirage', 'de_nuke', 'de_dust2'] }).returning();
  const partida = await bd.transaction((tx) =>
    criarPartida(tx, {
      tipo,
      time1: time1.map((conta) => conta.id),
      time2: time2.map((conta) => conta.id),
      mapa: 'de_mirage',
      nomes: { 1: '[MGN] Magnatas', 2: '[FRG] Forja' },
      clas: { 1: alfa.id, 2: tipo === 'cla' ? bravo.id : alfa.id },
      mapas: 3,
      serie: { id: serie.id, mapa: 1, servidorPreferidoId: null },
    }),
  );
  await bd.insert(salas).values([
    { nome: 'Sala A', liderId: time1[0].id, partidaId: partida.id },
    { nome: 'Sala B', liderId: time2[0].id, partidaId: partida.id },
  ]);
  const servidor = await criarServidor(bd, { nome: 'SP 1', host: '10.0.0.1', porta: 27015 });
  await alocarServidores(bd, controladorFalso());
  return { serie, partida: await recarregar(partida.id), servidor, time1, time2 };
}

async function recarregar(id: string): Promise<Partida> {
  const [linha] = await bd.select().from(partidas).where(eq(partidas.id, id));
  return linha;
}

/** Fecha um mapa como o servidor faria: placar, todos jogaram até o fim, e o fim da série do MatchZy. */
async function fecharMapa(partida: Partida, vencedor: 1 | 2 | null, estado: 'encerrada' | 'cancelada' = 'encerrada') {
  await bd.update(partidas).set({ estado: 'ao_vivo', placar1: vencedor === 2 ? 9 : 13, placar2: vencedor === 1 ? 9 : 13 }).where(eq(partidas.id, partida.id));
  await bd.update(partidaJogadores).set({ rodadas: 22, kills: 10 }).where(eq(partidaJogadores.partidaId, partida.id));
  await bd.transaction((tx) => finalizarPartida(tx, partida.id, { estado, vencedor }));
}

async function partidasDaSerie(serieId: string): Promise<Partida[]> {
  return (await bd.select().from(partidas).where(eq(partidas.serieId, serieId))).sort((a, b) => a.mapaDaSerie! - b.mapaDaSerie!);
}

async function serieAtual(id: string) {
  const [linha] = await bd.select().from(series).where(eq(series.id, id));
  return linha;
}

describe('a série MD3', () => {
  test('o mapa 1 termina e o mapa 2 nasce esperando o mesmo servidor, com as salas apontando para ele', async () => {
    const { serie, partida, servidor } = await md3();
    expect(partida.servidorId).toBe(servidor.id);
    await fecharMapa(partida, 1);
    const [, mapa2] = await partidasDaSerie(serie.id);
    expect(mapa2).toMatchObject({ mapa: 'de_nuke', mapaDaSerie: 2, estado: 'aguardando_servidor', servidorPreferidoId: servidor.id, tipo: 'cla', mapasDaPartida: 3 });
    expect(mapa2.nomeTime1).toBe('[MGN] Magnatas');
    expect((await bd.select().from(salas)).every((sala) => sala.partidaId === mapa2.id)).toBe(true);
    expect(await bd.select().from(partidaJogadores).where(eq(partidaJogadores.partidaId, mapa2.id))).toHaveLength(10);
    expect(await serieAtual(serie.id)).toMatchObject({ vitorias1: 1, vitorias2: 0, estado: 'em_andamento' });
  });

  test('2 x 0 encerra a série sem jogar o terceiro mapa e solta as salas', async () => {
    const { serie, partida } = await md3();
    await fecharMapa(partida, 1);
    const [, mapa2] = await partidasDaSerie(serie.id);
    await fecharMapa(mapa2, 1);
    expect(await partidasDaSerie(serie.id)).toHaveLength(2);
    expect(await serieAtual(serie.id)).toMatchObject({ estado: 'encerrada', vencedor: 1, vitorias1: 2, vitorias2: 0 });
    expect((await bd.select().from(salas)).every((sala) => sala.partidaId === null)).toBe(true);
  });

  test('1 x 1 vai para o terceiro mapa, que decide', async () => {
    const { serie, partida } = await md3();
    await fecharMapa(partida, 1);
    await fecharMapa((await partidasDaSerie(serie.id))[1], 2);
    const terceiro = (await partidasDaSerie(serie.id))[2];
    expect(terceiro).toMatchObject({ mapa: 'de_dust2', mapaDaSerie: 3 });
    await fecharMapa(terceiro, 2);
    expect(await serieAtual(serie.id)).toMatchObject({ estado: 'encerrada', vencedor: 2, vitorias1: 1, vitorias2: 2 });
  });

  test('mapa empatado não soma para ninguém e a série segue', async () => {
    const { serie, partida } = await md3();
    await fecharMapa(partida, null);
    expect(await serieAtual(serie.id)).toMatchObject({ vitorias1: 0, vitorias2: 0, estado: 'em_andamento' });
    expect(await partidasDaSerie(serie.id)).toHaveLength(2);
  });

  test('empate no fim do terceiro mapa encerra a série sem vencedor', async () => {
    const { serie, partida } = await md3();
    await fecharMapa(partida, 1);
    await fecharMapa((await partidasDaSerie(serie.id))[1], 2);
    await fecharMapa((await partidasDaSerie(serie.id))[2], null);
    expect(await serieAtual(serie.id)).toMatchObject({ estado: 'encerrada', vencedor: null, vitorias1: 1, vitorias2: 1 });
  });

  test('cancelar um mapa cancela a série, mas o XP dos mapas já encerrados fica', async () => {
    const { serie, partida, time1 } = await md3();
    await fecharMapa(partida, 1);
    await fecharMapa((await partidasDaSerie(serie.id))[1], null, 'cancelada');
    expect(await serieAtual(serie.id)).toMatchObject({ estado: 'cancelada', vencedor: null });
    expect(await partidasDaSerie(serie.id)).toHaveLength(2);
    expect(await bd.select().from(xpPartidas).where(and(eq(xpPartidas.usuarioId, time1[0].id), eq(xpPartidas.referencia, partida.id)))).toHaveLength(1);
    expect((await bd.select().from(salas)).every((sala) => sala.partidaId === null)).toBe(true);
  });

  test('o servidor da série espera o próximo mapa: outra partida na fila não pega, nem depois da gravação', async () => {
    const { serie, partida, servidor } = await md3();
    const [x, y] = [await contas(5), await contas(5)];
    const outra = await bd.transaction((tx) => criarPartida(tx, { tipo: 'desafio', time1: x.map((c) => c.id), time2: y.map((c) => c.id), mapa: 'de_inferno' }));
    await fecharMapa(partida, 1);
    const [, mapa2] = await partidasDaSerie(serie.id);
    await alocarServidores(bd, controladorFalso(), new Date(Date.now() + MINUTO));
    expect((await recarregar(outra.id)).estado).toBe('aguardando_servidor');
    expect((await recarregar(mapa2.id)).estado).toBe('aguardando_servidor');
    await alocarServidores(bd, controladorFalso(), new Date(Date.now() + 6 * MINUTO));
    expect(await recarregar(mapa2.id)).toMatchObject({ estado: 'carregando', servidorId: servidor.id });
    expect((await recarregar(outra.id)).estado).toBe('aguardando_servidor');
  });

  test('com a gravação do mapa 1 já chegada, o mapa 2 carrega na hora', async () => {
    const { serie, partida, servidor } = await md3();
    await fecharMapa(partida, 1);
    await bd.insert(gravacoes).values({ partidaId: partida.id, arquivo: '1.dem', bytes: 10 });
    const [, mapa2] = await partidasDaSerie(serie.id);
    await alocarServidores(bd, controladorFalso());
    expect(await recarregar(mapa2.id)).toMatchObject({ estado: 'carregando', servidorId: servidor.id });
    const [linha] = await bd.select().from(servidores).where(eq(servidores.id, servidor.id));
    expect(linha.partidaId).toBe(mapa2.id);
  });

  test('serieDaPartida devolve a série e os mapas dela', async () => {
    const { serie, partida } = await md3();
    await fecharMapa(partida, 1);
    const [, mapa2] = await partidasDaSerie(serie.id);
    const dados = await serieDaPartida(bd, mapa2.id);
    expect(dados?.serie).toMatchObject({ id: serie.id, vitorias1: 1 });
    expect(dados?.partidas.map((item) => [item.mapaDaSerie, item.mapa, item.estado])).toEqual([
      [1, 'de_mirage', 'encerrada'],
      [2, 'de_nuke', 'aguardando_servidor'],
    ]);
    expect(await serieDaPartida(bd, (await contas(1))[0].id)).toBeNull();
  });
});

describe('treino e nomes', () => {
  test('treino encerrado não dá XP, mas guarda as estatísticas', async () => {
    const { partida } = await md3('treino');
    await fecharMapa(partida, 1);
    expect(await bd.select().from(xpPartidas)).toEqual([]);
    const linhas = await bd.select().from(partidaJogadores).where(eq(partidaJogadores.partidaId, partida.id));
    expect(linhas.every((linha) => linha.kills === 10)).toBe(true);
  });

  test('o servidor recebe o nome do clã com a sigla', async () => {
    const { partida } = await md3();
    const config = (await configDaPartida(bd, partida.numero)) as { team1: { name: string }; team2: { name: string } };
    expect(config.team1.name).toBe('[MGN] Magnatas');
    expect(config.team2.name).toBe('[FRG] Forja');
  });
});
