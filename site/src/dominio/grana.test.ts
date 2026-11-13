import { eq } from 'drizzle-orm';
import { beforeEach, expect, test } from 'vitest';
import type { Bd } from '@/bd/conexao';
import { auditoria, lancamentosDeGrana, usuarios, xpPartidas } from '@/bd/esquema';
import { criarBancoDeTeste, criarUsuario, recarregar } from '@/bd/teste';
import { SemPermissao } from './equipe';
import { abrirGrana, ajustarGrana, ajustarMagcoin, buscarContasDaGrana, divergencias, extrato, granaDoXp, lancarGrana, lancarMoeda, SaldoInsuficiente } from './grana';
import { lancarXp, type GanhoDePartida } from './xp';

let bd: Bd;

beforeEach(async () => {
  bd = await criarBancoDeTeste();
});

function ganho(usuarioId: string, dados: Partial<GanhoDePartida> = {}): GanhoDePartida {
  return { usuarioId, origem: 'partida', referencia: 'partida-1', abates: 10, resultado: 'vitoria', jogouAteOFim: true, ...dados };
}

const linhasDe = (usuarioId: string) => bd.select().from(lancamentosDeGrana).where(eq(lancamentosDeGrana.usuarioId, usuarioId));

test('1 Grana a cada 10 XP, arredondando para baixo', () => {
  expect(granaDoXp(1100)).toBe(110);
  expect(granaDoXp(19)).toBe(1);
  expect(granaDoXp(9)).toBe(0);
  expect(granaDoXp(0)).toBe(0);
});

test('a partida paga Grana junto do XP, e a mesma partida não paga duas vezes', async () => {
  const conta = await criarUsuario(bd);
  await bd.transaction((tx) => lancarXp(tx, [ganho(conta.id)]));
  await bd.transaction((tx) => lancarXp(tx, [ganho(conta.id)]));
  const linhas = await linhasDe(conta.id);
  expect(linhas).toHaveLength(1);
  expect(linhas[0]).toMatchObject({ tipo: 'partida', referencia: 'partida-1', quantidade: 80 });
  expect((await recarregar(bd, conta)).grana).toBe(80);
});

test('partida sem XP não cria linha de Grana', async () => {
  const conta = await criarUsuario(bd);
  await bd.transaction((tx) => lancarXp(tx, [ganho(conta.id, { jogouAteOFim: false })]));
  expect(await linhasDe(conta.id)).toHaveLength(0);
  expect((await recarregar(bd, conta)).grana).toBe(0);
});

test('gasto maior que o saldo é recusado e não grava nada', async () => {
  const conta = await criarUsuario(bd);
  await bd.transaction((tx) => lancarGrana(tx, { usuarioId: conta.id, tipo: 'ajuste', quantidade: 50, referencia: 'a1' }));
  await expect(bd.transaction((tx) => lancarGrana(tx, { usuarioId: conta.id, tipo: 'compra', quantidade: -80, referencia: 'c1' }))).rejects.toBeInstanceOf(
    SaldoInsuficiente,
  );
  expect(await linhasDe(conta.id)).toHaveLength(1);
  expect((await recarregar(bd, conta)).grana).toBe(50);
});

test('quantidade 0 não grava linha', async () => {
  const conta = await criarUsuario(bd);
  const resultado = await bd.transaction((tx) => lancarGrana(tx, { usuarioId: conta.id, tipo: 'ajuste', quantidade: 0, referencia: 'z' }));
  expect(resultado).toEqual({ lancado: false, saldo: 0 });
  expect(await linhasDe(conta.id)).toHaveLength(0);
});

test('a abertura paga o XP antigo uma vez só', async () => {
  const conta = await criarUsuario(bd);
  await bd.insert(xpPartidas).values([
    { usuarioId: conta.id, origem: 'partida', referencia: 'antiga-1', abates: 0, resultado: 'vitoria', xp: 1000 },
    { usuarioId: conta.id, origem: 'diversao', referencia: 'antiga-2', abates: 0, resultado: 'derrota', xp: 345 },
  ]);
  expect(await abrirGrana(bd)).toBe(1);
  expect(await abrirGrana(bd)).toBe(0);
  const linhas = await linhasDe(conta.id);
  expect(linhas).toHaveLength(1);
  expect(linhas[0]).toMatchObject({ tipo: 'abertura', referencia: 'abertura', quantidade: 134 });
  expect((await recarregar(bd, conta)).grana).toBe(134);
});

test('a abertura não conta de novo a partida que já pagou Grana', async () => {
  const conta = await criarUsuario(bd);
  await bd.insert(xpPartidas).values({ usuarioId: conta.id, origem: 'partida', referencia: 'antiga', abates: 0, resultado: 'vitoria', xp: 500 });
  await bd.transaction((tx) => lancarXp(tx, [ganho(conta.id, { referencia: 'nova' })]));
  await abrirGrana(bd);
  expect((await recarregar(bd, conta)).grana).toBe(80 + 50);
});

test('conta sem XP antigo não recebe abertura', async () => {
  await criarUsuario(bd);
  expect(await abrirGrana(bd)).toBe(0);
  expect(await bd.select().from(lancamentosDeGrana)).toHaveLength(0);
});

test('o extrato traz as linhas mais novas primeiro, com o saldo depois de cada uma', async () => {
  const conta = await criarUsuario(bd);
  await bd.transaction((tx) => lancarGrana(tx, { usuarioId: conta.id, tipo: 'ajuste', quantidade: 100, referencia: 'a' }));
  await bd.transaction((tx) => lancarGrana(tx, { usuarioId: conta.id, tipo: 'compra', quantidade: -30, referencia: 'b' }));
  const linhas = await extrato(bd, conta.id);
  expect(linhas.map((linha) => [linha.quantidade, linha.saldo])).toEqual([
    [-30, 70],
    [100, 100],
  ]);
});

test('a conferência acusa saldo diferente da soma das linhas', async () => {
  const conta = await criarUsuario(bd);
  await bd.transaction((tx) => lancarGrana(tx, { usuarioId: conta.id, tipo: 'ajuste', quantidade: 100, referencia: 'a' }));
  expect(await divergencias(bd)).toEqual([]);
  await bd.update(usuarios).set({ grana: 150 }).where(eq(usuarios.id, conta.id));
  expect(await divergencias(bd)).toEqual([{ usuarioId: conta.id, apelido: conta.apelido, moeda: 'grana', saldo: 150, soma: 100 }]);
});

test('só o Adm ajusta Grana, com motivo, e o ajuste vai para a auditoria', async () => {
  const adm = await criarUsuario(bd, { papel: 'adm', estado: 'ativo' });
  const gm = await criarUsuario(bd, { papel: 'gm', estado: 'ativo' });
  const alvo = await criarUsuario(bd, { estado: 'ativo' });
  await expect(ajustarGrana(bd, gm, alvo.id, 50, 'presente')).rejects.toBeInstanceOf(SemPermissao);
  await expect(ajustarGrana(bd, adm, alvo.id, 50, ' ')).rejects.toThrow();
  await ajustarGrana(bd, adm, alvo.id, 50, 'erro na partida 12');
  await ajustarGrana(bd, adm, alvo.id, -20, 'corrigindo');
  expect((await recarregar(bd, alvo)).grana).toBe(30);
  const linhas = await linhasDe(alvo.id);
  expect(linhas.every((linha) => linha.tipo === 'ajuste' && linha.atorId === adm.id)).toBe(true);
  const registros = await bd.select().from(auditoria).where(eq(auditoria.acao, 'ajustar_grana'));
  expect(registros).toHaveLength(2);
  expect(registros[0].detalhes).toMatchObject({ quantidade: 50, motivo: 'erro na partida 12' });
});

test('ajuste que deixaria o saldo negativo é recusado', async () => {
  const adm = await criarUsuario(bd, { papel: 'adm', estado: 'ativo' });
  const alvo = await criarUsuario(bd, { estado: 'ativo' });
  await expect(ajustarGrana(bd, adm, alvo.id, -1, 'tirar')).rejects.toBeInstanceOf(SaldoInsuficiente);
  expect(await bd.select().from(auditoria).where(eq(auditoria.acao, 'ajustar_grana'))).toHaveLength(0);
});

test('a busca do Painel acha contas pelo apelido, com o saldo, e sem termo mostra as mais ricas', async () => {
  const rica = await criarUsuario(bd, { apelido: 'Patrao_Rico' });
  const pobre = await criarUsuario(bd, { apelido: 'patrao_pobre' });
  await criarUsuario(bd, { apelido: 'outro' });
  await bd.transaction((tx) => lancarGrana(tx, { usuarioId: rica.id, tipo: 'ajuste', quantidade: 900, referencia: 'r' }));
  await bd.transaction((tx) => lancarGrana(tx, { usuarioId: pobre.id, tipo: 'ajuste', quantidade: 5, referencia: 'p' }));
  expect((await buscarContasDaGrana(bd, 'patrao')).map((conta) => [conta.apelido, conta.grana])).toEqual([
    ['Patrao_Rico', 900],
    ['patrao_pobre', 5],
  ]);
  expect((await buscarContasDaGrana(bd, ''))[0]).toMatchObject({ id: rica.id, grana: 900 });
  expect(await buscarContasDaGrana(bd, '%')).toEqual([]);
});

test('MagCoin entra no mesmo livro-caixa, mas no saldo dela, sem mexer na Grana', async () => {
  const conta = await criarUsuario(bd);
  await bd.transaction((tx) => lancarMoeda(tx, { moeda: 'magcoin', usuarioId: conta.id, tipo: 'pagamento', quantidade: 100, referencia: 'mp-1' }));
  await bd.transaction((tx) => lancarMoeda(tx, { moeda: 'magcoin', usuarioId: conta.id, tipo: 'pagamento', quantidade: 100, referencia: 'mp-1' }));
  const atual = await recarregar(bd, conta);
  expect([atual.magcoin, atual.grana]).toEqual([100, 0]);
  await expect(
    bd.transaction((tx) => lancarMoeda(tx, { moeda: 'magcoin', usuarioId: conta.id, tipo: 'compra', quantidade: -101, referencia: 'c' })),
  ).rejects.toBeInstanceOf(SaldoInsuficiente);
});

test('extrato e conferência separam as moedas', async () => {
  const conta = await criarUsuario(bd);
  await bd.transaction((tx) => lancarGrana(tx, { usuarioId: conta.id, tipo: 'ajuste', quantidade: 30, referencia: 'g' }));
  await bd.transaction((tx) => lancarMoeda(tx, { moeda: 'magcoin', usuarioId: conta.id, tipo: 'pagamento', quantidade: 100, referencia: 'm' }));
  expect((await extrato(bd, conta.id)).map((linha) => linha.quantidade)).toEqual([30]);
  expect((await extrato(bd, conta.id, { moeda: 'magcoin' })).map((linha) => [linha.quantidade, linha.saldo])).toEqual([[100, 100]]);
  expect(await divergencias(bd)).toEqual([]);
  await bd.update(usuarios).set({ magcoin: 7 }).where(eq(usuarios.id, conta.id));
  expect(await divergencias(bd)).toEqual([{ usuarioId: conta.id, apelido: conta.apelido, moeda: 'magcoin', saldo: 7, soma: 100 }]);
});

test('MagCoins: só o Adm ajusta, com motivo, separado da Grana e com auditoria (Painel ADM, 13/11/2026)', async () => {
  const adm = await criarUsuario(bd, { papel: 'adm', estado: 'ativo' });
  const gm = await criarUsuario(bd, { papel: 'gm', estado: 'ativo' });
  const alvo = await criarUsuario(bd, { estado: 'ativo' });
  await expect(ajustarMagcoin(bd, gm, alvo.id, 50, 'presente')).rejects.toBeInstanceOf(SemPermissao);
  await expect(ajustarMagcoin(bd, adm, alvo.id, 50, ' ')).rejects.toThrow();
  await expect(ajustarMagcoin(bd, adm, alvo.id, -1, 'tirar')).rejects.toBeInstanceOf(SaldoInsuficiente);
  await ajustarMagcoin(bd, adm, alvo.id, 80, 'compra que não caiu');
  const conta = await recarregar(bd, alvo);
  expect(conta.magcoin).toBe(80);
  expect(conta.grana).toBe(0);
  const registros = await bd.select().from(auditoria).where(eq(auditoria.acao, 'ajustar_magcoin'));
  expect(registros).toHaveLength(1);
  expect(registros[0].detalhes).toMatchObject({ quantidade: 80, motivo: 'compra que não caiu' });
});
