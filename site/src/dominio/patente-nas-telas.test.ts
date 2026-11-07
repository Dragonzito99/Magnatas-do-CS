import { eq } from 'drizzle-orm';
import { beforeEach, expect, test } from 'vitest';
import type { Bd } from '@/bd/conexao';
import { partidas, usuarios, type Usuario } from '@/bd/esquema';
import { criarBancoDeTeste, criarUsuario } from '@/bd/teste';
import { fichaDoJogador } from './ficha';
import { casosDe, notificacoesDe } from './notificacoes';
import { criarPartida, detalheDaPartida, finalizarPartida } from './partidas';
import { lancarXp, marcarPatenteVista, type GanhoDePartida } from './xp';

let bd: Bd;
let conta: Usuario;

beforeEach(async () => {
  bd = await criarBancoDeTeste();
  conta = await criarUsuario(bd, { estado: 'ativo' });
});

const comXp = (xpTotal: number, patenteVista = 1) => bd.update(usuarios).set({ xpTotal, patenteVista }).where(eq(usuarios.id, conta.id));

const atual = async () => (await bd.select().from(usuarios).where(eq(usuarios.id, conta.id)))[0];

const ganho = (referencia: string, dados: Partial<GanhoDePartida> = {}): GanhoDePartida => ({
  usuarioId: conta.id,
  origem: 'diversao',
  referencia,
  abates: 5,
  resultado: 'derrota',
  jogouAteOFim: true,
  ...dados,
});

test('a ficha traz o XP total e o progresso da patente', async () => {
  await comXp(9000);
  const ficha = await fichaDoJogador(bd, conta, conta.id);
  expect(ficha?.xpTotal).toBe(9000);
  expect(ficha?.progresso).toMatchObject({ patente: { nome: 'Soldado 1' }, proxima: { nome: 'Soldado 2' }, faltam: 300, porcentagem: 68 });
});

test('a ficha traz as últimas 10 partidas com XP, da mais recente para a mais antiga', async () => {
  for (let i = 1; i <= 12; i += 1) {
    await bd.transaction((tx) => lancarXp(tx, [ganho(`p${i}`, { abates: i })]));
  }
  const ficha = await fichaDoJogador(bd, conta, conta.id);
  expect(ficha?.ultimosXp).toHaveLength(10);
  expect(ficha?.ultimosXp[0]).toMatchObject({ abates: 12, xp: 540, resultado: 'derrota', origem: 'diversao' });
});

test('outro membro também vê a patente', async () => {
  await comXp(9000);
  const outro = await criarUsuario(bd, { estado: 'ativo' });
  const ficha = await fichaDoJogador(bd, outro, conta.id);
  expect(ficha?.progresso.patente.nome).toBe('Soldado 1');
});

test('o sino avisa da patente nova', async () => {
  await comXp(5000);
  const avisos = await notificacoesDe(bd, await atual());
  expect(avisos).toContainEqual(expect.objectContaining({ tipo: 'patente', texto: 'Você subiu para Associado 1', href: `/jogadores/${conta.id}` }));
});

test('o sino não avisa de patente que a pessoa já viu', async () => {
  await comXp(5000, 8);
  expect((await notificacoesDe(bd, await atual())).map((aviso) => aviso.tipo)).not.toContain('patente');
});

test('o sino não avisa sem patente nova', async () => {
  await comXp(100);
  expect((await notificacoesDe(bd, await atual())).map((aviso) => aviso.tipo)).not.toContain('patente');
});

test('o aviso de patente não conta como caso da equipe', async () => {
  await comXp(5000);
  expect(casosDe(await notificacoesDe(bd, await atual()))).toBe(0);
});

test('abrir o próprio perfil marca a patente como vista, só nessa conta', async () => {
  const outra = await criarUsuario(bd, { estado: 'ativo' });
  await bd.update(usuarios).set({ xpTotal: 5000 }).where(eq(usuarios.id, outra.id));
  await comXp(5000);
  await marcarPatenteVista(bd, conta.id);
  expect((await atual()).patenteVista).toBe(8);
  const [segunda] = await bd.select().from(usuarios).where(eq(usuarios.id, outra.id));
  expect(segunda.patenteVista).toBe(1);
});

test('a partida mostra o XP de cada jogador depois de encerrada', async () => {
  const outro = await criarUsuario(bd, { estado: 'ativo' });
  const partida = await bd.transaction((tx) => criarPartida(tx, { tipo: 'mix', time1: [conta.id], time2: [outro.id] }));
  await bd.update(partidas).set({ estado: 'ao_vivo', placar1: 1, placar2: 0 }).where(eq(partidas.id, partida.id));
  const antes = await detalheDaPartida(bd, partida.id);
  expect(antes?.jogadores.every((jogador) => jogador.xp === null)).toBe(true);
  await bd.transaction((tx) => lancarXp(tx, [{ usuarioId: conta.id, origem: 'partida', referencia: partida.id, abates: 12, resultado: 'vitoria', jogouAteOFim: true }]));
  await bd.transaction((tx) => finalizarPartida(tx, partida.id, { estado: 'cancelada', vencedor: null }));
  const depois = await detalheDaPartida(bd, partida.id);
  expect(depois?.jogadores.find((jogador) => jogador.id === conta.id)?.xp).toBe(840);
  expect(depois?.jogadores.find((jogador) => jogador.id === outro.id)?.xp).toBeNull();
});
