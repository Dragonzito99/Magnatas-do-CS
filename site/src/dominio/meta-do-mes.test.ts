import { beforeEach, expect, test } from 'vitest';
import type { Bd } from '@/bd/conexao';
import { assinaturas, mensalidades, pedidos, type Usuario } from '@/bd/esquema';
import { criarBancoDeTeste, criarUsuario } from '@/bd/teste';
import { SemPermissao } from './equipe';
import { definirCustoDoMes, metaDoMes } from './meta-do-mes';

let bd: Bd;
let adm: Usuario;
let jogador: Usuario;
// 15/11/2026 às 12:00 em Brasília.
const AGORA = new Date('2026-11-15T15:00:00Z');

beforeEach(async () => {
  bd = await criarBancoDeTeste();
  adm = await criarUsuario(bd, { papel: 'adm', estado: 'ativo' });
  jogador = await criarUsuario(bd, { estado: 'ativo' });
});

async function pedidoPago(valorCentavos: number, pagoEm: Date, extra: Partial<typeof pedidos.$inferInsert> = {}) {
  await bd.insert(pedidos).values({ usuarioId: jogador.id, pacote: 'pequeno', valorCentavos, magcoins: 100, estado: 'pago', pagoEm, mpPagamentoId: `p-${Math.random()}`, ...extra });
}

test('sem custo definido não há meta', async () => {
  expect(await metaDoMes(bd, AGORA)).toBeNull();
});

test('a meta soma pacotes pagos (o teste do Adm também) e mensalidades do mês de Brasília, sem estornos', async () => {
  await definirCustoDoMes(bd, adm, 20000, AGORA);
  await pedidoPago(5000, new Date('2026-11-01T03:00:00Z')); // 00:00 de 01/11 em Brasília: conta
  await pedidoPago(1000, new Date('2026-11-01T02:59:00Z')); // ainda outubro em Brasília: não conta
  await pedidoPago(100, AGORA, { pacote: 'teste' });
  await pedidoPago(2500, AGORA, { estado: 'estornado' });
  await bd.insert(pedidos).values({ usuarioId: jogador.id, pacote: 'medio', valorCentavos: 2500, magcoins: 260, estado: 'aberto' });
  const [assinatura] = await bd.insert(assinaturas).values({ usuarioId: jogador.id, nivel: 'ouro', email: 'a@b.c', estado: 'ativa' }).returning();
  await bd.insert(mensalidades).values({ assinaturaId: assinatura.id, mpPagamentoId: 'm-1', valorCentavos: 1500, pagoEm: AGORA });

  expect(await metaDoMes(bd, AGORA)).toEqual({ custoCentavos: 20000, arrecadadoCentavos: 6600, porcento: 33 });
});

test('o custo vale nos meses seguintes até o Adm mudar, e a meta para em 100%', async () => {
  await definirCustoDoMes(bd, adm, 1000, new Date('2026-10-10T15:00:00Z'));
  await pedidoPago(5000, AGORA);
  expect(await metaDoMes(bd, AGORA)).toEqual({ custoCentavos: 1000, arrecadadoCentavos: 5000, porcento: 100 });
  await definirCustoDoMes(bd, adm, 10000, AGORA);
  expect((await metaDoMes(bd, AGORA))?.porcento).toBe(50);
  expect((await metaDoMes(bd, new Date('2026-10-10T15:00:00Z')))?.custoCentavos).toBe(1000);
});

test('só o Adm define o custo, e o valor precisa ser inteiro e positivo', async () => {
  await expect(definirCustoDoMes(bd, jogador, 1000, AGORA)).rejects.toBeInstanceOf(SemPermissao);
  await expect(definirCustoDoMes(bd, adm, 0, AGORA)).rejects.toThrow();
  await expect(definirCustoDoMes(bd, adm, 10.5, AGORA)).rejects.toThrow();
});
