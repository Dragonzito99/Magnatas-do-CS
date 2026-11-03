import { beforeEach, expect, test } from 'vitest';
import type { Bd } from '@/bd/conexao';
import { auditoria, type Usuario } from '@/bd/esquema';
import { criarBancoDeTeste, criarUsuario, recarregar, STEAM_A } from '@/bd/teste';
import { criarOuPromoverAdm, darConvites, listarMembros, mudarPapel, SemPermissao, UltimoAdm } from './equipe';

let bd: Bd;
let adm: Usuario;
let gm: Usuario;
let jogador: Usuario;

beforeEach(async () => {
  bd = await criarBancoDeTeste();
  adm = await criarUsuario(bd, { papel: 'adm', estado: 'ativo' });
  gm = await criarUsuario(bd, { papel: 'gm', estado: 'ativo' });
  jogador = await criarUsuario(bd, { estado: 'ativo' });
});

test('adm promove jogador a gm e fica registrado', async () => {
  await mudarPapel(bd, adm, jogador.id, 'gm');
  expect((await recarregar(bd, jogador)).papel).toBe('gm');
  const [registro] = await bd.select().from(auditoria);
  expect(registro).toMatchObject({ atorId: adm.id, acao: 'mudar_papel', alvoId: jogador.id });
  expect(registro.detalhes).toEqual({ de: 'jogador', para: 'gm' });
});

test('gm não muda papel', async () => {
  await expect(mudarPapel(bd, gm, jogador.id, 'gm')).rejects.toThrow(SemPermissao);
  expect((await recarregar(bd, jogador)).papel).toBe('jogador');
});

test('permissão é conferida com o estado atual do banco, não o da sessão', async () => {
  const antigo = { ...adm };
  await bd.update((await import('@/bd/esquema')).usuarios).set({ estado: 'banido' });
  await expect(mudarPapel(bd, antigo, jogador.id, 'gm')).rejects.toThrow(SemPermissao);
});

test('o último adm não pode deixar de ser adm', async () => {
  await expect(mudarPapel(bd, adm, adm.id, 'jogador')).rejects.toThrow(UltimoAdm);
  expect((await recarregar(bd, adm)).papel).toBe('adm');
});

test('com dois adms, um pode deixar de ser', async () => {
  const outro = await criarUsuario(bd, { papel: 'adm', estado: 'ativo' });
  await mudarPapel(bd, adm, outro.id, 'jogador');
  expect((await recarregar(bd, outro)).papel).toBe('jogador');
});

test('adm suspenso não conta como adm disponível', async () => {
  await criarUsuario(bd, { papel: 'adm', estado: 'suspenso' });
  await expect(mudarPapel(bd, adm, adm.id, 'jogador')).rejects.toThrow(UltimoAdm);
});

test('mudar para o mesmo papel não registra nada', async () => {
  await mudarPapel(bd, adm, jogador.id, 'jogador');
  expect(await bd.select().from(auditoria)).toEqual([]);
});

test('alvo inexistente dá erro', async () => {
  await expect(mudarPapel(bd, adm, '00000000-0000-0000-0000-000000000000', 'gm')).rejects.toThrow();
});

test('adm dá convites e fica registrado', async () => {
  await darConvites(bd, adm, jogador.id, 3);
  expect((await recarregar(bd, jogador)).convitesRestantes).toBe(3);
  const [registro] = await bd.select().from(auditoria);
  expect(registro).toMatchObject({ acao: 'dar_convites', alvoId: jogador.id });
});

test.each([0, -1, 1.5, 1000])('quantidade %s é recusada', async (quantidade) => {
  await expect(darConvites(bd, adm, jogador.id, quantidade)).rejects.toThrow();
  expect((await recarregar(bd, jogador)).convitesRestantes).toBe(0);
});

test('gm não dá convites', async () => {
  await expect(darConvites(bd, gm, jogador.id, 1)).rejects.toThrow(SemPermissao);
});

test('listagem traz quem convidou', async () => {
  const convidado = await criarUsuario(bd, { estado: 'ativo', convidadoPor: gm.id });
  const lista = await listarMembros(bd);
  const linha = lista.find((membro) => membro.id === convidado.id);
  expect(linha?.convidadoPorApelido).toBe(gm.apelido);
  expect(lista.find((membro) => membro.id === adm.id)?.convidadoPorApelido).toBeNull();
});

test('primeiro adm: cria a conta aguardando verificação, e rodar de novo não duplica', async () => {
  const conta = await criarOuPromoverAdm(bd, STEAM_A);
  expect(conta).toMatchObject({ papel: 'adm', estado: 'aguardando_verificacao', apelido: STEAM_A });
  const repetida = await criarOuPromoverAdm(bd, STEAM_A);
  expect(repetida.id).toBe(conta.id);
});

test('primeiro adm: conta existente é promovida sem mudar o estado', async () => {
  const atualizada = await criarOuPromoverAdm(bd, jogador.steamid64);
  expect(atualizada).toMatchObject({ id: jogador.id, papel: 'adm', estado: 'ativo' });
});

test('primeiro adm: SteamID inválido é recusado', async () => {
  await expect(criarOuPromoverAdm(bd, '123')).rejects.toThrow(/SteamID/);
});
