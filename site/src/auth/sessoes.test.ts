import { beforeEach, expect, test } from 'vitest';
import type { Bd } from '@/bd/conexao';
import { sessoes, type Usuario } from '@/bd/esquema';
import { criarBancoDeTeste, criarUsuario } from '@/bd/teste';
import { criarSessao, encerrarSessao, lerSessao } from './sessoes';

let bd: Bd;
let usuario: Usuario;

beforeEach(async () => {
  bd = await criarBancoDeTeste();
  usuario = await criarUsuario(bd);
});

test('sessão guarda só o hash do token', async () => {
  const token = await criarSessao(bd, usuario.id);
  const [linha] = await bd.select().from(sessoes);
  expect(linha.tokenHash).not.toContain(token);
  expect((await lerSessao(bd, token))?.id).toBe(usuario.id);
});

test('cada sessão recebe um token diferente', async () => {
  expect(await criarSessao(bd, usuario.id)).not.toBe(await criarSessao(bd, usuario.id));
});

test('sessão expira depois de 30 dias', async () => {
  const inicio = new Date('2026-01-01T00:00:00Z');
  const token = await criarSessao(bd, usuario.id, inicio);
  expect(await lerSessao(bd, token, new Date('2026-01-30T23:00:00Z'))).not.toBeNull();
  expect(await lerSessao(bd, token, new Date('2026-01-31T01:00:00Z'))).toBeNull();
});

test('token encerrado ou desconhecido não abre sessão', async () => {
  const token = await criarSessao(bd, usuario.id);
  await encerrarSessao(bd, token);
  expect(await lerSessao(bd, token)).toBeNull();
  expect(await lerSessao(bd, 'qualquer')).toBeNull();
});
