import { eq } from 'drizzle-orm';
import { beforeEach, expect, test } from 'vitest';
import type { Bd } from '@/bd/conexao';
import { partidaJogadores, partidas, servidoresDiversao, usuarios, xpPartidas, type Usuario } from '@/bd/esquema';
import { criarBancoDeTeste, criarUsuario } from '@/bd/teste';
import { avaliacoesPendentes, denunciarNaDiversao, denunciasFeitasNaDiversao, destinoAoSair, marcarVistas, elogiarNaDiversao, elogiosFeitosNaDiversao, partidaDaDiversao, referenciaDaDiversao, resultadoDaConta, sessaoDaDiversao, slugDaDiversao } from './avaliar';
import { AcusadoInvalido, DenunciaRepetida, MotivoInvalido, NaoJogou } from './denuncias';
import { ElogioIndisponivel, ElogioRepetido, elogiosDoJogador } from './elogios';
import { aplicarEvento } from './eventos';
import { lancarGrana } from './grana';
import { notificacoesDe } from './notificacoes';
import { criarPartida } from './partidas';
import { controladorFalso } from '@/servidor-jogo/controlador';

let bd: Bd;
let eu: Usuario;
let ele: Usuario;
const AGORA = new Date('2026-11-11T23:00:00Z');
const MIN = 60 * 1000;

beforeEach(async () => {
  bd = await criarBancoDeTeste();
  eu = await criarUsuario(bd, { estado: 'ativo', apelido: 'Eu' });
  ele = await criarUsuario(bd, { estado: 'ativo', apelido: 'Ele' });
});

async function portaDaMutacao(): Promise<number> {
  const servidores = await bd.select().from(servidoresDiversao);
  const servidor = servidores.find((item) => item.modo === 'mutacao');
  if (servidor) return servidor.porta;
  await bd.insert(servidoresDiversao).values({ modo: 'mutacao', armas: 'x', mapa: 'x', foto: '/x.webp', porta: 28020, ativo: true, ordem: 99 });
  return 28020;
}

/** Uma partida da Diversão já gravada: a linha de XP e a Grana de cada um, como o resultado do servidor grava. */
async function partidaDiversao(referencia: string, quando: Date, linhas: { conta: Usuario; abates: number; mortes: number | null; resultado: 'vitoria' | 'derrota'; xp: number }[]) {
  for (const linha of linhas) {
    await bd.insert(xpPartidas).values({ usuarioId: linha.conta.id, origem: 'diversao', referencia, abates: linha.abates, mortes: linha.mortes, resultado: linha.resultado, xp: linha.xp, mapa: 'zm_silent_village', criadoEm: quando });
    await bd.transaction((tx) => lancarGrana(tx, { usuarioId: linha.conta.id, tipo: 'partida', quantidade: linha.xp / 10, referencia }));
  }
}

test('o resultado da conta no mix: XP, Grana, abates, mortes e K/D', async () => {
  const partida = await bd.transaction((tx) => criarPartida(tx, { tipo: 'mix', time1: [eu.id], time2: [ele.id] }));
  await bd.update(partidas).set({ estado: 'ao_vivo', placar1: 13, placar2: 7 }).where(eq(partidas.id, partida.id));
  await bd.update(partidaJogadores).set({ kills: 12, deaths: 3, rodadas: 20 }).where(eq(partidaJogadores.partidaId, partida.id));
  await aplicarEvento(bd, { event: 'series_end', matchid: partida.numero, winner: { team: 'team1' } });

  const meu = await resultadoDaConta(bd, eu.id, partida.id);
  expect(meu).toMatchObject({ resultado: 'vitoria', abates: 12, mortes: 3, kd: 4, insignias: [] });
  expect(meu!.xp).toBeGreaterThan(0);
  expect(meu!.grana).toBe(Math.floor(meu!.xp / 10));
  const outro = await criarUsuario(bd, { estado: 'ativo' });
  expect(await resultadoDaConta(bd, outro.id, partida.id)).toBeNull();
});

test('o endereço da partida da Diversão vai e volta, e endereço estranho é recusado', () => {
  expect(slugDaDiversao('diversao:27020:abc-1')).toBe('27020-abc-1');
  expect(referenciaDaDiversao('27020-abc-1')).toBe('diversao:27020:abc-1');
  expect(referenciaDaDiversao('abc')).toBeNull();
  expect(referenciaDaDiversao('27020-a;b')).toBeNull();
  expect(referenciaDaDiversao('27020-')).toBeNull();
});

test('a partida da Diversão mostra o modo pela porta e os membros que jogaram', async () => {
  const porta = await portaDaMutacao();
  const referencia = `diversao:${porta}:p1`;
  await partidaDiversao(referencia, AGORA, [
    { conta: eu, abates: 12, mortes: 3, resultado: 'vitoria', xp: 410 },
    { conta: ele, abates: 4, mortes: 9, resultado: 'derrota', xp: 150 },
  ]);
  const partida = await partidaDaDiversao(bd, referencia);
  expect(partida).toMatchObject({ referencia, modo: 'Mutação', mapa: 'Silent Village', foto: '/mapas/silent-village.webp' });
  expect(partida!.jogadores.map((jogador) => [jogador.apelido, jogador.abates, jogador.mortes, jogador.resultado, jogador.xp])).toEqual([
    ['Eu', 12, 3, 'vitoria', 410],
    ['Ele', 4, 9, 'derrota', 150],
  ]);
  expect(await partidaDaDiversao(bd, `diversao:${porta}:nao-existe`)).toBeNull();
  const resultado = await resultadoDaConta(bd, eu.id, referencia);
  expect(resultado).toMatchObject({ resultado: 'vitoria', xp: 410, grana: 41, abates: 12, mortes: 3, kd: 4 });
});

test('a sessão da Diversão junta as partidas seguidas, com até 30 min entre elas, e para em 10', async () => {
  const porta = await portaDaMutacao();
  // Uma de ontem, longe: fica de fora.
  await partidaDiversao(`diversao:${porta}:velha`, new Date(AGORA.getTime() - 20 * 60 * MIN), [{ conta: eu, abates: 1, mortes: 1, resultado: 'derrota', xp: 50 }]);
  // Uma sessão antiga, separada por mais de 30 min da atual.
  await partidaDiversao(`diversao:${porta}:antes`, new Date(AGORA.getTime() - 120 * MIN), [{ conta: eu, abates: 1, mortes: 1, resultado: 'derrota', xp: 50 }]);
  for (let i = 0; i < 12; i += 1) {
    await partidaDiversao(`diversao:${porta}:s${i}`, new Date(AGORA.getTime() - (12 - i) * 5 * MIN), [{ conta: eu, abates: i, mortes: 1, resultado: 'vitoria', xp: 100 }]);
  }
  const sessao = await sessaoDaDiversao(bd, eu.id, AGORA);
  expect(sessao).toHaveLength(10);
  expect(sessao.map((partida) => partida.referencia)).toEqual(Array.from({ length: 10 }, (_, i) => `diversao:${porta}:s${i + 2}`));
  expect(sessao[0]).toMatchObject({ modo: 'Mutação', xp: 100, grana: 10, resultado: 'vitoria' });
});

test('na Diversão, quem jogou elogia e denuncia quem jogou junto, uma vez só', async () => {
  const porta = await portaDaMutacao();
  const referencia = `diversao:${porta}:p9`;
  const fora = await criarUsuario(bd, { estado: 'ativo' });
  await partidaDiversao(referencia, AGORA, [
    { conta: eu, abates: 12, mortes: 3, resultado: 'vitoria', xp: 410 },
    { conta: ele, abates: 4, mortes: 9, resultado: 'derrota', xp: 150 },
  ]);
  await elogiarNaDiversao(bd, eu, { referencia, elogiadoId: ele.id, tipo: 'gente_boa' });
  await expect(elogiarNaDiversao(bd, eu, { referencia, elogiadoId: ele.id, tipo: 'lider' })).rejects.toBeInstanceOf(ElogioRepetido);
  await expect(elogiarNaDiversao(bd, eu, { referencia, elogiadoId: eu.id, tipo: 'lider' })).rejects.toBeInstanceOf(ElogioIndisponivel);
  await expect(elogiarNaDiversao(bd, fora, { referencia, elogiadoId: ele.id, tipo: 'lider' })).rejects.toBeInstanceOf(ElogioIndisponivel);
  await expect(elogiarNaDiversao(bd, eu, { referencia, elogiadoId: ele.id, tipo: 'qualquer' })).rejects.toBeInstanceOf(ElogioIndisponivel);
  expect(await elogiosFeitosNaDiversao(bd, referencia, eu.id)).toEqual(new Set([ele.id]));
  expect(await elogiosDoJogador(bd, ele.id)).toEqual([{ tipo: 'gente_boa', nome: 'Gente boa', total: 1 }]);

  await denunciarNaDiversao(bd, ele, { referencia, acusadoId: eu.id, motivo: 'Atravessando parede' });
  await expect(denunciarNaDiversao(bd, ele, { referencia, acusadoId: eu.id, motivo: 'de novo' })).rejects.toBeInstanceOf(DenunciaRepetida);
  await expect(denunciarNaDiversao(bd, fora, { referencia, acusadoId: eu.id, motivo: 'x' })).rejects.toBeInstanceOf(NaoJogou);
  await expect(denunciarNaDiversao(bd, ele, { referencia, acusadoId: fora.id, motivo: 'x' })).rejects.toBeInstanceOf(AcusadoInvalido);
  await expect(denunciarNaDiversao(bd, eu, { referencia, acusadoId: ele.id, motivo: '   ' })).rejects.toBeInstanceOf(MotivoInvalido);
  expect(await denunciasFeitasNaDiversao(bd, referencia, ele.id)).toEqual(new Set([eu.id]));
});

test('a sessão da Diversão sem avaliar vai para o sino e, ao sair do servidor, manda para a última partida', async () => {
  const porta = await portaDaMutacao();
  await partidaDiversao(`diversao:${porta}:a`, new Date(AGORA.getTime() - 20 * MIN), [{ conta: eu, abates: 3, mortes: 2, resultado: 'vitoria', xp: 300 }]);
  await partidaDiversao(`diversao:${porta}:b`, new Date(AGORA.getTime() - 5 * MIN), [{ conta: eu, abates: 5, mortes: 1, resultado: 'derrota', xp: 200 }]);
  const pendentes = await avaliacoesPendentes(bd, eu.id, AGORA);
  expect(pendentes).toEqual({ mix: null, diversao: { referencias: [`diversao:${porta}:a`, `diversao:${porta}:b`], modo: 'Mutação' } });
  const [conta] = await bd.select().from(usuarios).where(eq(usuarios.id, eu.id));
  const avisos = (await notificacoesDe(bd, conta, AGORA)).filter((item) => item.tipo === 'avaliar');
  expect(avisos).toEqual([{ tipo: 'avaliar', texto: 'Avalie suas 2 partidas da Mutação', href: `/partidas/diversao/${porta}-b#avaliar`, quantidade: 1 }]);

  const alvo = { host: '10.0.0.1', porta };
  // Ainda no servidor: fica onde está.
  expect(await destinoAoSair(bd, controladorFalso({ conectados: { '10.0.0.1': [eu.steamid64] } }), eu, [alvo], AGORA)).toBeNull();
  // Servidor sem resposta: não dá para saber, então ninguém é mandado.
  expect(await destinoAoSair(bd, controladorFalso({ hostsComFalha: ['10.0.0.1'] }), eu, [alvo], AGORA)).toBeNull();
  // Saiu: vai para a última.
  expect(await destinoAoSair(bd, controladorFalso(), eu, [alvo], AGORA)).toBe(`/partidas/diversao/${porta}-b#avaliar`);

  await marcarVistas(bd, eu.id, pendentes.diversao!.referencias);
  expect(await avaliacoesPendentes(bd, eu.id, AGORA)).toEqual({ mix: null, diversao: null });
  expect(await destinoAoSair(bd, controladorFalso(), eu, [alvo], AGORA)).toBeNull();
});

test('a partida do mix que acabou vai para o sino e manda para a página dela nos primeiros 10 minutos', async () => {
  const partida = await bd.transaction((tx) => criarPartida(tx, { tipo: 'mix', time1: [eu.id], time2: [ele.id] }));
  await bd.update(partidas).set({ estado: 'ao_vivo', placar1: 13, placar2: 7 }).where(eq(partidas.id, partida.id));
  await bd.update(partidaJogadores).set({ kills: 12, deaths: 3, rodadas: 20 }).where(eq(partidaJogadores.partidaId, partida.id));
  await aplicarEvento(bd, { event: 'series_end', matchid: partida.numero, winner: { team: 'team1' } });
  const agora = new Date();
  expect((await avaliacoesPendentes(bd, eu.id, agora)).mix).toEqual({ id: partida.id, numero: partida.numero });
  expect(await destinoAoSair(bd, controladorFalso(), eu, [], agora)).toBe(`/partidas/${partida.id}#avaliar`);
  expect(await destinoAoSair(bd, controladorFalso(), eu, [], new Date(agora.getTime() + 11 * MIN))).toBeNull();
  await marcarVistas(bd, eu.id, [partida.id]);
  expect((await avaliacoesPendentes(bd, eu.id, agora)).mix).toBeNull();
});
