import { eq } from 'drizzle-orm';
import { beforeEach, expect, test } from 'vitest';
import type { Bd } from '@/bd/conexao';
import { itensDoJogador, presentes, type Usuario } from '@/bd/esquema';
import { criarBancoDeTeste, criarUsuario } from '@/bd/teste';
import { bauDe } from './loja';
import { abrirPresente, EscolhaInvalida, MUTANTES_DO_PRESENTE, PresenteIndisponivel, presenteFechado } from './presentes';

let bd: Bd;
let conta: Usuario;
const DIA = 24 * 60 * 60 * 1000;
const AGORA = new Date('2026-11-12T20:00:00Z');

beforeEach(async () => {
  bd = await criarBancoDeTeste();
  conta = await criarUsuario(bd, { estado: 'ativo' });
});

const prazoDe = async (itemId: string) => (await bd.select().from(itensDoJogador).where(eq(itensDoJogador.itemId, itemId)))[0]?.expiraEm;

test('os mutantes do presente são todos os mutantes da loja', () => {
  expect(MUTANTES_DO_PRESENTE.map((item) => item.id)).toEqual(['mutante-blindado', 'mutante-fumaca', 'mutante-healix']);
});

test('abrir o presente: o mutante escolhido para sempre, os outros por 10 dias e 3 itens da loja por 25 dias', async () => {
  expect(await presenteFechado(bd, conta.id)).toBeNull();
  await bd.insert(presentes).values({ usuarioId: conta.id, criadoEm: AGORA });
  expect(await presenteFechado(bd, conta.id)).not.toBeNull();

  const aberto = await abrirPresente(bd, conta, 'mutante-fumaca', AGORA);
  expect(aberto.mutante.id).toBe('mutante-fumaca');
  expect(await prazoDe('mutante-fumaca')).toBeNull();
  expect(await prazoDe('mutante-blindado')).toEqual(new Date(AGORA.getTime() + 10 * DIA));
  expect(await prazoDe('mutante-healix')).toEqual(new Date(AGORA.getTime() + 10 * DIA));
  for (const item of ['aviso-entrada', 'moldura-fogo', 'etiqueta-magnata']) expect(await prazoDe(item)).toEqual(new Date(AGORA.getTime() + 25 * DIA));
  expect(await presenteFechado(bd, conta.id)).toBeNull();
  expect((await bd.select().from(presentes))[0]).toMatchObject({ abertoEm: AGORA, mutanteId: 'mutante-fumaca' });
  expect((await bauDe(bd, conta.id, AGORA)).length).toBe(6);

  await expect(abrirPresente(bd, conta, 'mutante-blindado', AGORA)).rejects.toBeInstanceOf(PresenteIndisponivel);
});

test('o que a pessoa já tinha para sempre continua para sempre, e escolha fora da lista é recusada', async () => {
  await bd.insert(presentes).values({ usuarioId: conta.id, criadoEm: AGORA });
  await bd.insert(itensDoJogador).values({ usuarioId: conta.id, itemId: 'mutante-healix', expiraEm: null });
  await expect(abrirPresente(bd, conta, 'cor-vermelha', AGORA)).rejects.toBeInstanceOf(EscolhaInvalida);
  await abrirPresente(bd, conta, 'mutante-blindado', AGORA);
  expect(await prazoDe('mutante-healix')).toBeNull();
});

test('sem presente não abre nada', async () => {
  await expect(abrirPresente(bd, conta, 'mutante-blindado', AGORA)).rejects.toBeInstanceOf(PresenteIndisponivel);
});
