import { eq } from 'drizzle-orm';
import { beforeEach, expect, test } from 'vitest';
import type { Bd } from '@/bd/conexao';
import { assinaturas, auditoria, enderecos, envios, mensalidades, type Usuario } from '@/bd/esquema';
import { criarBancoDeTeste, criarUsuario } from '@/bd/teste';
import { apagarEnderecosVencidos, EnderecoInvalido, enderecoDe, enviosDe, enviosPendentes, marcarEnviado, salvarEndereco, vendasDoMes } from './envios';
import { SemPermissao } from './equipe';

let bd: Bd;
const DIA = 24 * 60 * 60 * 1000;
const ENDERECO = { nome: 'Fulano de Tal', cep: '59000-000', rua: 'Rua das Dunas', numero: '10', complemento: '', bairro: 'Ponta Negra', cidade: 'Natal', uf: 'rn', telefone: '(84) 99999-9999' };

beforeEach(async () => {
  bd = await criarBancoDeTeste();
});

async function premiumComEnvio(): Promise<{ conta: Usuario; envioId: string }> {
  const conta = await criarUsuario(bd, { estado: 'ativo' });
  const [assinatura] = await bd.insert(assinaturas).values({ usuarioId: conta.id, nivel: 'premium', email: 'a@b.c', estado: 'ativa', pagoAte: new Date(Date.now() + 30 * DIA) }).returning();
  const [mensalidade] = await bd.insert(mensalidades).values({ assinaturaId: assinatura.id, mpPagamentoId: `p-${conta.id}`, valorCentavos: 3000, pagoEm: new Date() }).returning();
  const [envio] = await bd.insert(envios).values({ usuarioId: conta.id, mensalidadeId: mensalidade.id }).returning();
  return { conta, envioId: envio.id };
}

test('o endereço é limpo e conferido, e cada conta tem um só', async () => {
  const { conta } = await premiumComEnvio();
  await salvarEndereco(bd, conta, ENDERECO);
  await salvarEndereco(bd, conta, { ...ENDERECO, numero: '20' });
  expect(await enderecoDe(bd, conta.id)).toMatchObject({ cep: '59000000', uf: 'RN', numero: '20', telefone: '84999999999', complemento: null });
  await expect(salvarEndereco(bd, conta, { ...ENDERECO, cep: '123' })).rejects.toBeInstanceOf(EnderecoInvalido);
  await expect(salvarEndereco(bd, conta, { ...ENDERECO, uf: 'XX' })).rejects.toBeInstanceOf(EnderecoInvalido);
  await expect(salvarEndereco(bd, conta, { ...ENDERECO, rua: '' })).rejects.toBeInstanceOf(EnderecoInvalido);
});

test('só quem é ou foi Premium cadastra endereço', async () => {
  const comum = await criarUsuario(bd, { estado: 'ativo' });
  await expect(salvarEndereco(bd, comum, ENDERECO)).rejects.toBeInstanceOf(SemPermissao);
});

test('só o Adm vê os envios pendentes com endereço e marca como enviado, com rastreio', async () => {
  const { conta, envioId } = await premiumComEnvio();
  await salvarEndereco(bd, conta, ENDERECO);
  const adm = await criarUsuario(bd, { papel: 'adm', estado: 'ativo' });
  const gm = await criarUsuario(bd, { papel: 'gm', estado: 'ativo' });
  await expect(enviosPendentes(bd, gm)).rejects.toBeInstanceOf(SemPermissao);
  const pendentes = await enviosPendentes(bd, adm);
  expect(pendentes).toHaveLength(1);
  expect(pendentes[0]).toMatchObject({ envioId, apelido: conta.apelido, endereco: { cidade: 'Natal' } });
  await expect(marcarEnviado(bd, gm, envioId, 'BR123')).rejects.toBeInstanceOf(SemPermissao);
  await marcarEnviado(bd, adm, envioId, ' BR123456789BR ');
  expect(await enviosPendentes(bd, adm)).toEqual([]);
  expect((await enviosDe(bd, conta.id))[0]).toMatchObject({ estado: 'enviado', rastreio: 'BR123456789BR' });
  expect(await bd.select().from(auditoria).where(eq(auditoria.acao, 'envio_marcado'))).toHaveLength(1);
});

test('o endereço é apagado 90 dias depois do fim do Premium, e não antes', async () => {
  const { conta } = await premiumComEnvio();
  await salvarEndereco(bd, conta, ENDERECO);
  await bd.update(assinaturas).set({ pagoAte: new Date(Date.now() - 89 * DIA) }).where(eq(assinaturas.usuarioId, conta.id));
  expect(await apagarEnderecosVencidos(bd)).toBe(0);
  await bd.update(assinaturas).set({ pagoAte: new Date(Date.now() - 91 * DIA) }).where(eq(assinaturas.usuarioId, conta.id));
  expect(await apagarEnderecosVencidos(bd)).toBe(1);
  expect(await bd.select().from(enderecos)).toEqual([]);
});

test('as vendas do mês somam pacotes e mensalidades pagos', async () => {
  await premiumComEnvio();
  const adm = await criarUsuario(bd, { papel: 'adm', estado: 'ativo' });
  const vendas = await vendasDoMes(bd, adm, new Date());
  expect(vendas.totalCentavos).toBe(3000);
  expect(vendas.linhas).toHaveLength(1);
});
