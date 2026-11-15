import { beforeEach, expect, test } from 'vitest';
import type { Bd } from '@/bd/conexao';
import { lemnosItens, lemnosSessoes, servidoresDiversao, type Usuario } from '@/bd/esquema';
import { criarBancoDeTeste, criarUsuario } from '@/bd/teste';
import { notificacoesDe } from '@/dominio/notificacoes';
import { eq } from 'drizzle-orm';
import { estatisticasDaSessao, ilhaAberta, marcarSessaoVista, sessaoNaoVista } from './estatisticas';
import { garantirServidorDaLemnos } from './servidor';

let bd: Bd;
let ana: Usuario;
const AGORA = new Date('2026-11-15T12:00:00Z');

beforeEach(async () => {
  bd = await criarBancoDeTeste();
  ana = await criarUsuario(bd, { estado: 'ativo' });
});

async function sessaoEncerrada(conta: Usuario, valores: Partial<typeof lemnosSessoes.$inferInsert> = {}) {
  const [sessao] = await bd
    .insert(lemnosSessoes)
    .values({ usuarioId: conta.id, porta: 27024, iniciadaEm: AGORA, encerradaEm: new Date(AGORA.getTime() + 42 * 60_000), fim: 'saiu', ...valores })
    .returning();
  return sessao;
}

test('as estatísticas contam o tempo, os números, o que guardou e o que perdeu', async () => {
  const sessao = await sessaoEncerrada(ana, { abates: 4, mortes: 2, extracoes: 3, granaGanha: 24 });
  await bd.insert(lemnosItens).values([
    { usuarioId: ana.id, tipo: 'saque', itemId: 'joias', origem: 'achado', sessaoId: sessao.id },
    { usuarioId: ana.id, tipo: 'saque', itemId: 'barra_de_ouro', origem: 'achado', situacao: 'vendido', sessaoId: sessao.id },
    { usuarioId: ana.id, tipo: 'arma', itemId: 'ak47', origem: 'grana', situacao: 'perdido', sessaoId: sessao.id },
  ]);
  const estatisticas = await estatisticasDaSessao(bd, ana.id, sessao.id);
  expect(estatisticas).toMatchObject({ minutos: 42, abates: 4, mortes: 2, extracoes: 3, granaGanha: 24, fim: 'saiu', valorDoSaque: 120 });
  expect(estatisticas?.guardados.map((item) => item.nome).sort()).toEqual(['Barra de ouro', 'Joias']);
  expect(estatisticas?.perdidos.map((item) => item.nome)).toEqual(['AK-47']);
});

test('estatísticas de outra conta dá null', async () => {
  const outra = await criarUsuario(bd, { estado: 'ativo' });
  const sessao = await sessaoEncerrada(outra);
  expect(await estatisticasDaSessao(bd, ana.id, sessao.id)).toBeNull();
  expect(await estatisticasDaSessao(bd, ana.id, 'nao-e-uuid')).toBeNull();
});

test('a notificação aparece para sessão encerrada não vista e some ao abrir', async () => {
  const sessao = await sessaoEncerrada(ana);
  expect(await sessaoNaoVista(bd, ana.id)).toEqual({ id: sessao.id });
  const notificacao = (await notificacoesDe(bd, ana)).find((item) => item.tipo === 'lemnos');
  expect(notificacao).toEqual({ tipo: 'lemnos', texto: 'Você saiu da Ilha Lemnos: veja como foi', href: `/lemnos/sessoes/${sessao.id}`, quantidade: 1 });
  await marcarSessaoVista(bd, ana.id, sessao.id);
  expect(await sessaoNaoVista(bd, ana.id)).toBeNull();
  expect((await notificacoesDe(bd, ana)).some((item) => item.tipo === 'lemnos')).toBe(false);
});

test('a ilha abre para o Adm sempre e para os outros só com o servidor ativo', async () => {
  const adm = await criarUsuario(bd, { estado: 'ativo', papel: 'adm' });
  await garantirServidorDaLemnos(bd);
  expect(await ilhaAberta(bd, adm)).toBe(true);
  expect(await ilhaAberta(bd, ana)).toBe(false);
  await bd.update(servidoresDiversao).set({ ativo: true }).where(eq(servidoresDiversao.modo, 'lemnos'));
  expect(await ilhaAberta(bd, ana)).toBe(true);
});
