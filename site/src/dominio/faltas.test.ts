import { eq } from 'drizzle-orm';
import { beforeEach, expect, test } from 'vitest';
import { criarSessao } from '@/auth/sessoes';
import type { Bd } from '@/bd/conexao';
import { banimentos, cpfsBanidos, faltas, partidas, sessoes, usuarios, type Usuario } from '@/bd/esquema';
import { criarBancoDeTeste, criarUsuario, recarregar } from '@/bd/teste';
import { reverterBanimento } from './banimentos';
import { Bloqueado } from './disponibilidade';
import { JANELA_DAS_FALTAS_MS, PUNICOES_EM_MINUTOS, registrarFalta, situacaoDasFaltas } from './faltas';
import { entrarNoMix } from './mix';
import { criarSala, entrarNaSala } from './salas';

let bd: Bd;
let conta: Usuario;
const AGORA = new Date('2026-11-06T22:00:00Z');

beforeEach(async () => {
  bd = await criarBancoDeTeste();
  conta = await criarUsuario(bd, { estado: 'ativo', cpfHmac: 'cpf-da-conta' });
});

async function partidaCancelada(): Promise<string> {
  const [partida] = await bd.insert(partidas).values({ tipo: 'desafio', estado: 'cancelada', mapa: null }).returning();
  return partida.id;
}

async function faltar(quando: Date): Promise<void> {
  const partidaId = await partidaCancelada();
  await bd.transaction((tx) => registrarFalta(tx, conta.id, partidaId, quando));
}

async function ultimaFalta() {
  const [falta] = await bd.select().from(faltas).where(eq(faltas.usuarioId, conta.id)).orderBy(faltas.criadoEm);
  const todas = await bd.select().from(faltas).where(eq(faltas.usuarioId, conta.id));
  return todas.at(-1) ?? falta;
}

test('a escada de punições é 3, 15, 30 minutos e 1 dia', () => {
  expect(PUNICOES_EM_MINUTOS).toEqual([3, 15, 30, 1440]);
  expect(JANELA_DAS_FALTAS_MS).toBe(30 * 24 * 60 * 60_000);
});

test.each([
  [1, 3],
  [2, 15],
  [3, 30],
  [4, 1440],
])('a falta %i bloqueia %i minutos', async (vez, minutos) => {
  for (let i = 1; i < vez; i += 1) await faltar(new Date(AGORA.getTime() - i * 60_000));
  await faltar(AGORA);
  const falta = await ultimaFalta();
  expect(falta.bloqueadoAte!.getTime() - AGORA.getTime()).toBe(minutos * 60_000);
  expect((await recarregar(bd, conta)).estado).toBe('ativo');
});

test('a 5ª falta em 30 dias bane direto, com CPF bloqueado, sessões apagadas e motivo', async () => {
  await criarSessao(bd, conta.id);
  for (let i = 1; i <= 4; i += 1) await faltar(new Date(AGORA.getTime() - i * 60_000));
  await faltar(AGORA);
  expect((await recarregar(bd, conta)).estado).toBe('banido');
  const [banimento] = await bd.select().from(banimentos).where(eq(banimentos.usuarioId, conta.id));
  expect(banimento).toMatchObject({
    estado: 'confirmado',
    propostoPor: null,
    cpfHmac: 'cpf-da-conta',
    motivo: 'Não aceitou a partida 5 vezes em 30 dias.',
    decididoEm: AGORA,
  });
  expect(await bd.select().from(cpfsBanidos).where(eq(cpfsBanidos.cpfHmac, 'cpf-da-conta'))).toHaveLength(1);
  expect(await bd.select().from(sessoes).where(eq(sessoes.usuarioId, conta.id))).toHaveLength(0);
});

test('falta com mais de 30 dias não conta', async () => {
  for (let i = 1; i <= 4; i += 1) await faltar(new Date(AGORA.getTime() - JANELA_DAS_FALTAS_MS - i * 60_000));
  await faltar(AGORA);
  const falta = await ultimaFalta();
  expect(falta.bloqueadoAte!.getTime() - AGORA.getTime()).toBe(3 * 60_000);
});

test('bloqueado não cria sala, não entra em sala nem no mix, e volta a poder depois do prazo', async () => {
  await faltar(AGORA);
  const depois = new Date(AGORA.getTime() + 3 * 60_000);
  const outra = await criarUsuario(bd, { estado: 'ativo' });
  const { id: salaId } = await criarSala(bd, outra);
  await expect(criarSala(bd, conta, AGORA)).rejects.toThrow(Bloqueado);
  await expect(entrarNaSala(bd, conta, salaId, AGORA)).rejects.toThrow(Bloqueado);
  await expect(entrarNoMix(bd, conta, { agora: AGORA })).rejects.toThrow(Bloqueado);
  await expect(criarSala(bd, conta, AGORA)).rejects.toMatchObject({ ate: depois });
  await expect(entrarNaSala(bd, conta, salaId, depois)).resolves.toBeUndefined();
});

test('reverter o banimento anula as faltas, e a próxima recomeça em 3 minutos', async () => {
  for (let i = 1; i <= 5; i += 1) await faltar(new Date(AGORA.getTime() - i * 60_000));
  const adm = await criarUsuario(bd, { estado: 'ativo', papel: 'adm' });
  const [banimento] = await bd.select().from(banimentos).where(eq(banimentos.usuarioId, conta.id));
  await reverterBanimento(bd, adm, banimento.id, 'Foi engano.');
  const anuladas = await bd.select().from(faltas).where(eq(faltas.usuarioId, conta.id));
  expect(anuladas.every((falta) => falta.anuladaEm !== null)).toBe(true);
  await faltar(AGORA);
  const falta = await ultimaFalta();
  expect(falta.bloqueadoAte!.getTime() - AGORA.getTime()).toBe(3 * 60_000);
  expect((await recarregar(bd, conta)).estado).toBe('ativo');
});

test('situacaoDasFaltas conta as faltas, mostra o bloqueio e avisa a última chance na 4ª', async () => {
  expect(await situacaoDasFaltas(bd, conta.id, AGORA)).toEqual({ faltas: 0, bloqueadoAte: null, ultimaChance: false });
  for (let i = 1; i <= 3; i += 1) await faltar(new Date(AGORA.getTime() - i * 60_000));
  await faltar(AGORA);
  const situacao = await situacaoDasFaltas(bd, conta.id, AGORA);
  expect(situacao.faltas).toBe(4);
  expect(situacao.ultimaChance).toBe(true);
  expect(situacao.bloqueadoAte).toEqual(new Date(AGORA.getTime() + 1440 * 60_000));
  const passado = new Date(AGORA.getTime() + 2 * 1440 * 60_000);
  expect((await situacaoDasFaltas(bd, conta.id, passado)).bloqueadoAte).toBeNull();
});

test('bloqueio da falta antiga já vencido não barra, mesmo com a falta ainda na janela', async () => {
  await faltar(new Date(AGORA.getTime() - 60 * 60_000));
  const outra = await criarUsuario(bd, { estado: 'ativo' });
  const { id: salaId } = await criarSala(bd, outra);
  await expect(entrarNaSala(bd, conta, salaId, AGORA)).resolves.toBeUndefined();
  expect((await bd.select().from(usuarios).where(eq(usuarios.id, conta.id)))[0].estado).toBe('ativo');
});
