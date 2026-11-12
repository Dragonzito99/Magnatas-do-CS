import { eq } from 'drizzle-orm';
import { beforeEach, expect, test } from 'vitest';
import type { Bd } from '@/bd/conexao';
import { itensDoJogador, lancamentosDeGrana, presentes, xpPartidas, type Usuario } from '@/bd/esquema';
import { criarBancoDeTeste, criarUsuario, recarregar, STEAM_B, STEAM_C } from '@/bd/teste';
import { consumirConvite, ConviteInvalido, conviteValido, gerarConvite, gerarConviteComPresente, listarConvitesComDetalhes, PresenteDoConviteInvalido } from './convites';
import { SemPermissao } from './equipe';
import { abrirPresenteDoConvite, PresenteIndisponivel, presentesFechados } from './presentes';

let bd: Bd;
let adm: Usuario;
const DIA = 24 * 60 * 60 * 1000;
const AGORA = new Date('2026-11-12T20:00:00Z');
const PRESENTE = { itens: [{ itemId: 'mutante-fumaca', dias: 7 }, { itemId: 'moldura-neon', dias: 15 }], grana: 500, magcoin: 50, recado: 'Valeu por vir da live!' };

beforeEach(async () => {
  bd = await criarBancoDeTeste();
  adm = await criarUsuario(bd, { estado: 'ativo', papel: 'adm', apelido: 'O_Adm' });
});

const entrar = (codigo: string, steamid64 = STEAM_B, apelido = 'Novato') => consumirConvite(bd, codigo, { steamid64, apelido }, AGORA);

test('só o Adm cria convite com presente, e o presente precisa fazer sentido', async () => {
  const gm = await criarUsuario(bd, { estado: 'ativo', papel: 'gm' });
  await expect(gerarConviteComPresente(bd, gm, PRESENTE)).rejects.toBeInstanceOf(SemPermissao);
  await expect(gerarConviteComPresente(bd, adm, { itens: [], grana: 0, magcoin: 0 })).rejects.toBeInstanceOf(PresenteDoConviteInvalido);
  await expect(gerarConviteComPresente(bd, adm, { itens: [{ itemId: 'nao-existe', dias: 3 }] })).rejects.toBeInstanceOf(PresenteDoConviteInvalido);
  await expect(gerarConviteComPresente(bd, adm, { itens: [{ itemId: 'moldura-neon', dias: 91 }] })).rejects.toBeInstanceOf(PresenteDoConviteInvalido);
  await expect(gerarConviteComPresente(bd, adm, { magcoin: 301 })).rejects.toBeInstanceOf(PresenteDoConviteInvalido);
  await expect(gerarConviteComPresente(bd, adm, { grana: 5001 })).rejects.toBeInstanceOf(PresenteDoConviteInvalido);
  await expect(gerarConviteComPresente(bd, adm, { grana: 10, recado: 'x'.repeat(201) })).rejects.toBeInstanceOf(PresenteDoConviteInvalido);
  expect(await gerarConviteComPresente(bd, adm, PRESENTE)).toMatch(/^[0-9A-Z]{10}$/);
});

test('quem entra pelo convite com presente encontra a caixa fechada no baú; abrir dá tudo uma vez só', async () => {
  const codigo = await gerarConviteComPresente(bd, adm, PRESENTE);
  const novo = await entrar(codigo);
  const fechados = await presentesFechados(bd, novo.id);
  expect(fechados).toHaveLength(1);
  expect(fechados[0]).toMatchObject({ origem: 'convite', recado: 'Valeu por vir da live!' });

  const depois = new Date(AGORA.getTime() + DIA);
  await abrirPresenteDoConvite(bd, novo, fechados[0].id, depois);
  const itens = await bd.select().from(itensDoJogador).where(eq(itensDoJogador.usuarioId, novo.id));
  expect(itens.find((item) => item.itemId === 'mutante-fumaca')?.expiraEm).toEqual(new Date(depois.getTime() + 7 * DIA));
  expect(itens.find((item) => item.itemId === 'moldura-neon')?.expiraEm).toEqual(new Date(depois.getTime() + 15 * DIA));
  const conta = await recarregar(bd, novo);
  expect(conta.grana).toBe(500);
  expect(conta.magcoin).toBe(50);
  const linhas = await bd.select().from(lancamentosDeGrana).where(eq(lancamentosDeGrana.usuarioId, novo.id));
  expect(linhas.map((linha) => linha.tipo)).toEqual(['presente', 'presente']);
  expect(await presentesFechados(bd, novo.id)).toEqual([]);
  await expect(abrirPresenteDoConvite(bd, novo, fechados[0].id, depois)).rejects.toBeInstanceOf(PresenteIndisponivel);
});

test('ninguém abre o presente de outra conta', async () => {
  const novo = await entrar(await gerarConviteComPresente(bd, adm, PRESENTE));
  const [presente] = await presentesFechados(bd, novo.id);
  await expect(abrirPresenteDoConvite(bd, adm, presente.id, AGORA)).rejects.toBeInstanceOf(PresenteIndisponivel);
});

test('convite comum continua sem presente', async () => {
  const novo = await entrar(await gerarConvite(bd, adm));
  expect(await bd.select().from(presentes).where(eq(presentes.usuarioId, novo.id))).toEqual([]);
});

test('convite vencido não vale', async () => {
  const codigo = await gerarConviteComPresente(bd, adm, { ...PRESENTE, venceEm: new Date(AGORA.getTime() - 1000) });
  expect(await conviteValido(bd, codigo, AGORA)).toBe(false);
  await expect(entrar(codigo)).rejects.toBeInstanceOf(ConviteInvalido);
});

test('a lista mostra quem criou, quem usou, se abriu o presente, quantas partidas jogou; o Adm vê todos e o membro só os seus', async () => {
  const membro = await criarUsuario(bd, { estado: 'ativo', convitesRestantes: 2, apelido: 'Membro' });
  const doMembro = await gerarConvite(bd, membro);
  const comPresente = await gerarConviteComPresente(bd, adm, PRESENTE);
  const novo = await entrar(comPresente, STEAM_B, 'Novato');
  await entrar(doMembro, STEAM_C, 'Amigo');
  await bd.insert(xpPartidas).values({ usuarioId: novo.id, origem: 'diversao', referencia: 'diversao:1:a', abates: 1, mortes: 1, resultado: 'vitoria', xp: 100 });

  const doAdm = await listarConvitesComDetalhes(bd, adm, AGORA);
  expect(doAdm).toHaveLength(2);
  const linha = doAdm.find((convite) => convite.codigo === comPresente)!;
  expect(linha).toMatchObject({ situacao: 'usado', criadorApelido: 'O_Adm', usadoPor: { id: novo.id, apelido: 'Novato' }, partidas: 1, presenteAberto: false, presente: PRESENTE });

  const doMembroLista = await listarConvitesComDetalhes(bd, membro, AGORA);
  expect(doMembroLista.map((convite) => convite.codigo)).toEqual([doMembro]);
  expect(doMembroLista[0]).toMatchObject({ situacao: 'usado', usadoPor: { apelido: 'Amigo' }, partidas: 0 });
});
