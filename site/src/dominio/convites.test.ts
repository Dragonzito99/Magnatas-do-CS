import { inArray } from 'drizzle-orm';
import { beforeEach, expect, test } from 'vitest';
import type { Bd } from '@/bd/conexao';
import { usuarios } from '@/bd/esquema';
import { criarBancoDeTeste, criarUsuario, recarregar, STEAM_B, STEAM_C } from '@/bd/teste';
import {
  consumirConvite,
  ConviteInvalido,
  conviteValido,
  gerarConvite,
  listarConvites,
  revogarConvite,
  SemConvites,
} from './convites';

let bd: Bd;

beforeEach(async () => {
  bd = await criarBancoDeTeste();
});

async function codigoDeTeste(): Promise<string> {
  const adm = await criarUsuario(bd, { estado: 'ativo', papel: 'adm' });
  return gerarConvite(bd, adm);
}

test('membro ativo gasta um dos seus convites', async () => {
  const membro = await criarUsuario(bd, { estado: 'ativo', convitesRestantes: 2 });
  await gerarConvite(bd, membro);
  expect((await recarregar(bd, membro)).convitesRestantes).toBe(1);
});

test('membro sem convites não gera', async () => {
  const membro = await criarUsuario(bd, { estado: 'ativo', convitesRestantes: 0 });
  await expect(gerarConvite(bd, membro)).rejects.toThrow(SemConvites);
});

test('dois pedidos com um único convite restante geram só um código', async () => {
  const membro = await criarUsuario(bd, { estado: 'ativo', convitesRestantes: 1 });
  const resultados = await Promise.allSettled([gerarConvite(bd, membro), gerarConvite(bd, membro)]);
  expect(resultados.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
  expect((await recarregar(bd, membro)).convitesRestantes).toBe(0);
});

test.each(['aguardando_verificacao', 'suspenso', 'banido'] as const)('conta %s não gera', async (estado) => {
  const membro = await criarUsuario(bd, { estado, convitesRestantes: 2 });
  await expect(gerarConvite(bd, membro)).rejects.toThrow(SemConvites);
});

test.each(['aguardando_verificacao', 'suspenso', 'banido'] as const)('equipe no estado %s não gera', async (estado) => {
  const adm = await criarUsuario(bd, { estado, papel: 'adm' });
  await expect(gerarConvite(bd, adm)).rejects.toThrow(SemConvites);
});

test.each(['gm', 'adm'] as const)('%s gera sem gastar', async (papel) => {
  const equipe = await criarUsuario(bd, { estado: 'ativo', papel, convitesRestantes: 0 });
  await gerarConvite(bd, equipe);
  expect((await recarregar(bd, equipe)).convitesRestantes).toBe(0);
});

test('consumir cria a conta aguardando verificação e registra quem convidou', async () => {
  const dono = await criarUsuario(bd, { estado: 'ativo', papel: 'adm' });
  const codigo = await gerarConvite(bd, dono);
  const novo = await consumirConvite(bd, codigo, { steamid64: STEAM_B, apelido: 'B' });
  expect(novo.estado).toBe('aguardando_verificacao');
  expect(novo.convidadoPor).toBe(dono.id);
  expect(novo.convitesRestantes).toBe(0);
});

test('o mesmo código não serve duas vezes', async () => {
  const codigo = await codigoDeTeste();
  await consumirConvite(bd, codigo, { steamid64: STEAM_B, apelido: 'B' });
  await expect(consumirConvite(bd, codigo, { steamid64: STEAM_C, apelido: 'C' })).rejects.toThrow(ConviteInvalido);
});

test('dois consumos ao mesmo tempo: só um vence e nenhuma conta sobra sem convite', async () => {
  const codigo = await codigoDeTeste();
  const resultados = await Promise.allSettled([
    consumirConvite(bd, codigo, { steamid64: STEAM_B, apelido: 'B' }),
    consumirConvite(bd, codigo, { steamid64: STEAM_C, apelido: 'C' }),
  ]);
  expect(resultados.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
  const contas = await bd.select().from(usuarios).where(inArray(usuarios.steamid64, [STEAM_B, STEAM_C]));
  expect(contas).toHaveLength(1);
});

test('uma Steam que já tem conta não gasta o convite', async () => {
  const codigo = await codigoDeTeste();
  await criarUsuario(bd, { steamid64: STEAM_B });
  await expect(consumirConvite(bd, codigo, { steamid64: STEAM_B, apelido: 'B' })).rejects.toThrow();
  expect(await conviteValido(bd, codigo)).toBe(true);
});

test('código digitado com minúsculas e espaços é aceito', async () => {
  const codigo = await codigoDeTeste();
  expect(await conviteValido(bd, ` ${codigo.toLowerCase()} `)).toBe(true);
  const novo = await consumirConvite(bd, ` ${codigo.toLowerCase()} `, { steamid64: STEAM_B, apelido: 'B' });
  expect(novo.steamid64).toBe(STEAM_B);
});

test('código desconhecido, usado ou revogado não é válido', async () => {
  expect(await conviteValido(bd, 'NAOEXISTE1')).toBe(false);
  const usado = await codigoDeTeste();
  await consumirConvite(bd, usado, { steamid64: STEAM_B, apelido: 'B' });
  expect(await conviteValido(bd, usado)).toBe(false);
});

test('código revogado não serve, e o convite volta para quem criou', async () => {
  const membro = await criarUsuario(bd, { estado: 'ativo', convitesRestantes: 1 });
  const codigo = await gerarConvite(bd, membro);
  await revogarConvite(bd, membro, codigo);
  expect((await recarregar(bd, membro)).convitesRestantes).toBe(1);
  expect(await conviteValido(bd, codigo)).toBe(false);
  await expect(consumirConvite(bd, codigo, { steamid64: STEAM_B, apelido: 'B' })).rejects.toThrow(ConviteInvalido);
});

test('revogar duas vezes não devolve dois convites', async () => {
  const membro = await criarUsuario(bd, { estado: 'ativo', convitesRestantes: 1 });
  const codigo = await gerarConvite(bd, membro);
  await revogarConvite(bd, membro, codigo);
  await expect(revogarConvite(bd, membro, codigo)).rejects.toThrow(ConviteInvalido);
  expect((await recarregar(bd, membro)).convitesRestantes).toBe(1);
});

test('adm revoga sem ganhar convites', async () => {
  const adm = await criarUsuario(bd, { estado: 'ativo', papel: 'adm', convitesRestantes: 0 });
  const codigo = await gerarConvite(bd, adm);
  await revogarConvite(bd, adm, codigo);
  expect((await recarregar(bd, adm)).convitesRestantes).toBe(0);
});

test('código já usado não pode ser revogado', async () => {
  const membro = await criarUsuario(bd, { estado: 'ativo', convitesRestantes: 1 });
  const codigo = await gerarConvite(bd, membro);
  await consumirConvite(bd, codigo, { steamid64: STEAM_B, apelido: 'B' });
  await expect(revogarConvite(bd, membro, codigo)).rejects.toThrow(ConviteInvalido);
});

test('ninguém revoga o convite de outra pessoa', async () => {
  const dono = await criarUsuario(bd, { estado: 'ativo', convitesRestantes: 1 });
  const outro = await criarUsuario(bd, { estado: 'ativo', convitesRestantes: 1 });
  const codigo = await gerarConvite(bd, dono);
  await expect(revogarConvite(bd, outro, codigo)).rejects.toThrow(ConviteInvalido);
  expect(await conviteValido(bd, codigo)).toBe(true);
});

test('código é aleatório e fácil de digitar', async () => {
  expect(await codigoDeTeste()).toMatch(/^[0-9A-HJKMNP-TV-Z]{10}$/);
});

test('cada pessoa lista só os próprios convites, do mais novo para o mais antigo', async () => {
  const membro = await criarUsuario(bd, { estado: 'ativo', convitesRestantes: 2 });
  const outro = await criarUsuario(bd, { estado: 'ativo', convitesRestantes: 1 });
  const primeiro = await gerarConvite(bd, membro);
  await gerarConvite(bd, outro);
  const segundo = await gerarConvite(bd, membro);
  const lista = await listarConvites(bd, membro);
  expect(lista.map((convite) => convite.codigo).sort()).toEqual([primeiro, segundo].sort());
});
