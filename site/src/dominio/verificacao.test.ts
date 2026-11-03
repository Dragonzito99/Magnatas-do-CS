import { beforeEach, expect, test } from 'vitest';
import type { Bd } from '@/bd/conexao';
import { auditoria, convites, cpfsBanidos, sessoes, usuarios, verificacoes, type Papel } from '@/bd/esquema';
import { criarBancoDeTeste, criarUsuario, recarregar, STEAM_A, STEAM_B } from '@/bd/teste';
import {
  aplicarResultadoVerificacao,
  codigoDoCpf,
  cpfValido,
  iniciarVerificacao,
  maiorDeIdade,
  type ResultadoVerificacao,
} from './verificacao';

const CHAVE = 'chave-de-teste-com-mais-de-32-caracteres';
const OUTRA_CHAVE = 'outra-chave-de-teste-com-mais-de-32-caracteres';
const CPF = '52998224725';
const ADULTO = '1990-01-01';
const MENOR = '2015-01-01';
const HOJE = new Date('2026-11-03T12:00:00Z');

let bd: Bd;

beforeEach(async () => {
  bd = await criarBancoDeTeste();
});

async function pendente(steamid64 = STEAM_A, valores: { papel?: Papel } = {}) {
  const usuario = await criarUsuario(bd, { steamid64, ...valores });
  const referencia = `ref-${steamid64}`;
  await iniciarVerificacao(bd, usuario, 'simulador', referencia);
  return { usuario, referencia };
}

function aplicar(resultado: ResultadoVerificacao) {
  return aplicarResultadoVerificacao(bd, resultado, CHAVE, HOJE);
}

async function tudoNoBanco() {
  return Promise.all(
    [usuarios, convites, sessoes, cpfsBanidos, verificacoes, auditoria].map((tabela) => bd.select().from(tabela)),
  );
}

test.each(['52998224725', '529.982.247-25', '111.444.777-35'])('aceita CPF válido %s', (cpf) => {
  expect(cpfValido(cpf)).toBe(true);
});

test.each(['52998224724', '11111111111', '123', '', 'abc', '529982247250'])('recusa CPF inválido %s', (cpf) => {
  expect(cpfValido(cpf)).toBe(false);
});

test.each([
  ['2008-11-03', true], // faz 18 hoje
  ['2008-11-04', false], // faz 18 amanhã
  ['1990-01-01', true],
  ['2008-02-30', false], // data impossível
  ['2030-01-01', false],
  ['ontem', false],
  ['', false],
])('maiorDeIdade(%s) em 03/11/2026 é %s', (nascimento, esperado) => {
  expect(maiorDeIdade(nascimento, HOJE)).toBe(esperado);
});

test('código do CPF depende da chave e ignora a pontuação', () => {
  expect(codigoDoCpf(CPF, CHAVE)).toBe(codigoDoCpf('529.982.247-25', CHAVE));
  expect(codigoDoCpf(CPF, CHAVE)).not.toBe(codigoDoCpf(CPF, OUTRA_CHAVE));
  expect(codigoDoCpf(CPF, CHAVE)).not.toContain(CPF);
});

test('chave curta é recusada', () => {
  expect(() => codigoDoCpf(CPF, 'curta')).toThrow(/32/);
});

test('aprovação ativa a conta, dá 2 convites e não guarda o CPF', async () => {
  const { usuario, referencia } = await pendente();
  expect(await aplicar({ referencia, aprovado: true, cpf: CPF, nascimento: ADULTO })).toBe('aprovada');
  const atual = await recarregar(bd, usuario);
  expect(atual.estado).toBe('ativo');
  expect(atual.convitesRestantes).toBe(2);
  expect(atual.cpfHmac).toBe(codigoDoCpf(CPF, CHAVE));
  const conteudo = JSON.stringify(await tudoNoBanco());
  expect(conteudo).not.toContain(CPF);
  expect(conteudo).not.toContain(ADULTO);
});

test('provedor reprovou: a conta continua sem acesso e pode tentar de novo', async () => {
  const { usuario, referencia } = await pendente();
  expect(await aplicar({ referencia, aprovado: false, motivo: 'documento ilegível' })).toBe('reprovada');
  expect((await recarregar(bd, usuario)).estado).toBe('aguardando_verificacao');
  await iniciarVerificacao(bd, usuario, 'simulador', 'ref-segunda');
  expect(await aplicar({ referencia: 'ref-segunda', aprovado: true, cpf: CPF, nascimento: ADULTO })).toBe('aprovada');
  expect((await recarregar(bd, usuario)).estado).toBe('ativo');
});

test('aprovado sem CPF válido é reprovado', async () => {
  const { usuario, referencia } = await pendente();
  expect(await aplicar({ referencia, aprovado: true, cpf: '123', nascimento: ADULTO })).toBe('reprovada');
  expect((await recarregar(bd, usuario)).estado).toBe('aguardando_verificacao');
});

test('menor de idade é reprovado e continua sem acesso', async () => {
  const { usuario, referencia } = await pendente();
  expect(await aplicar({ referencia, aprovado: true, cpf: CPF, nascimento: MENOR })).toBe('reprovada');
  expect((await recarregar(bd, usuario)).estado).toBe('aguardando_verificacao');
});

test('nascimento ausente é reprovado', async () => {
  const { referencia } = await pendente();
  expect(await aplicar({ referencia, aprovado: true, cpf: CPF })).toBe('reprovada');
});

test('CPF já usado em outra conta é reprovado', async () => {
  const primeira = await pendente(STEAM_A);
  await aplicar({ referencia: primeira.referencia, aprovado: true, cpf: CPF, nascimento: ADULTO });
  const segunda = await pendente(STEAM_B);
  expect(await aplicar({ referencia: segunda.referencia, aprovado: true, cpf: CPF, nascimento: ADULTO })).toBe('reprovada');
  expect((await recarregar(bd, segunda.usuario)).estado).toBe('aguardando_verificacao');
});

test('CPF banido com outra conta Steam bane a conta nova', async () => {
  await bd.insert(cpfsBanidos).values({ cpfHmac: codigoDoCpf(CPF, CHAVE) });
  const { usuario, referencia } = await pendente();
  expect(await aplicar({ referencia, aprovado: true, cpf: CPF, nascimento: ADULTO })).toBe('banido');
  const atual = await recarregar(bd, usuario);
  expect(atual.estado).toBe('banido');
  expect(atual.convitesRestantes).toBe(0);
});

test('o mesmo resultado aplicado duas vezes não dá convites de novo', async () => {
  const { usuario, referencia } = await pendente();
  const resultado = { referencia, aprovado: true, cpf: CPF, nascimento: ADULTO };
  expect(await aplicar(resultado)).toBe('aprovada');
  expect(await aplicar(resultado)).toBe('aprovada');
  expect((await recarregar(bd, usuario)).convitesRestantes).toBe(2);
});

test('um retorno repetido não reverte a conta que já foi usada', async () => {
  const { usuario, referencia } = await pendente();
  await aplicar({ referencia, aprovado: true, cpf: CPF, nascimento: ADULTO });
  await bd.update(usuarios).set({ estado: 'suspenso' });
  expect(await aplicar({ referencia, aprovado: true, cpf: CPF, nascimento: ADULTO })).toBe('aprovada');
  expect((await recarregar(bd, usuario)).estado).toBe('suspenso');
});

test('referência desconhecida é recusada', async () => {
  await expect(aplicar({ referencia: 'x', aprovado: true, cpf: CPF, nascimento: ADULTO })).rejects.toThrow();
});

test('quem já tem o papel de equipe mantém o papel ao ser aprovado', async () => {
  const { usuario, referencia } = await pendente(STEAM_A, { papel: 'adm' });
  await aplicar({ referencia, aprovado: true, cpf: CPF, nascimento: ADULTO });
  expect((await recarregar(bd, usuario)).papel).toBe('adm');
});
