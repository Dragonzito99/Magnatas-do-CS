import { eq } from 'drizzle-orm';
import { beforeEach, expect, test } from 'vitest';
import type { Bd } from '@/bd/conexao';
import { auditoria, lemnosPunicoes, type Usuario } from '@/bd/esquema';
import { criarBancoDeTeste, criarUsuario } from '@/bd/teste';
import { SemPermissao } from '@/dominio/equipe';
import { banimentoAtivo, desfazerBanimento, DIAS_DO_PRIMEIRO_BANIMENTO, DIAS_SEM_KICK_PARA_ZERAR, registrarKick } from './punicoes';

let bd: Bd;
let conta: Usuario;
const DIA = 24 * 60 * 60 * 1000;
const AGORA = new Date('2026-11-15T12:00:00Z');
const dia = (n: number) => new Date(AGORA.getTime() + n * DIA);
const kick = (quando: Date, motivo: 'afk' | 'acampar' = 'afk') => bd.transaction((tx) => registrarKick(tx, conta.id, motivo, quando));

beforeEach(async () => {
  bd = await criarBancoDeTeste();
  conta = await criarUsuario(bd, { estado: 'ativo' });
});

test('as regras são 30 dias para zerar e 3 dias de banimento', () => {
  expect(DIAS_SEM_KICK_PARA_ZERAR).toBe(30);
  expect(DIAS_DO_PRIMEIRO_BANIMENTO).toBe(3);
});

test('1º e 2º kick só avisam', async () => {
  expect(await kick(dia(0))).toBe('aviso');
  expect(await kick(dia(1), 'acampar')).toBe('aviso');
  expect(await banimentoAtivo(bd, conta.id, dia(1))).toBeNull();
});

test('3º kick bane 3 dias', async () => {
  await kick(dia(0));
  await kick(dia(1));
  expect(await kick(dia(2))).toBe('banido_dias');
  expect(await banimentoAtivo(bd, conta.id, dia(3))).toEqual({ ate: dia(5) });
  expect(await banimentoAtivo(bd, conta.id, dia(5))).toBeNull();
});

test('kick depois do banimento por dias bane para sempre', async () => {
  await kick(dia(0));
  await kick(dia(1));
  await kick(dia(2));
  expect(await kick(dia(10))).toBe('banido_sempre');
  expect(await banimentoAtivo(bd, conta.id, dia(400))).toEqual({ ate: null });
});

test('31 dias sem kick zera a corrente', async () => {
  await kick(dia(0));
  await kick(dia(1));
  expect(await kick(dia(32))).toBe('aviso');
  expect(await kick(dia(33))).toBe('aviso');
  expect(await kick(dia(34))).toBe('banido_dias');
});

test('desfazer tira da corrente e registra na auditoria', async () => {
  const adm = await criarUsuario(bd, { estado: 'ativo', papel: 'adm' });
  await kick(dia(0));
  await kick(dia(1));
  await kick(dia(2));
  const [banimento] = await bd.select().from(lemnosPunicoes).where(eq(lemnosPunicoes.usuarioId, conta.id)).orderBy(lemnosPunicoes.criadoEm);
  const ultima = (await bd.select().from(lemnosPunicoes).where(eq(lemnosPunicoes.usuarioId, conta.id))).find((linha) => linha.banidoAte !== null);
  expect(banimento).toBeDefined();
  await desfazerBanimento(bd, adm, ultima!.id, dia(3));
  expect(await banimentoAtivo(bd, conta.id, dia(3))).toBeNull();
  // A corrente agora tem 2 kicks: o próximo é o 3º de novo, e bane por dias, não para sempre.
  expect(await kick(dia(4))).toBe('banido_dias');
  const registro = await bd.select().from(auditoria).where(eq(auditoria.acao, 'lemnos_desfazer_banimento'));
  expect(registro).toHaveLength(1);
});

test('jogador comum não desfaz', async () => {
  const outro = await criarUsuario(bd, { estado: 'ativo' });
  await kick(dia(0));
  const [linha] = await bd.select().from(lemnosPunicoes);
  await expect(desfazerBanimento(bd, outro, linha.id, dia(1))).rejects.toThrow(SemPermissao);
});
