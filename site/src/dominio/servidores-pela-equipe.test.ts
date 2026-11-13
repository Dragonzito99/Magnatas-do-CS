import { eq } from 'drizzle-orm';
import { beforeEach, expect, test } from 'vitest';
import type { Bd } from '@/bd/conexao';
import { auditoria, estadosDaDiversao, servidoresDiversao, type ServidorDiversao, type Usuario } from '@/bd/esquema';
import { criarBancoDeTeste, criarUsuario } from '@/bd/teste';
import { SemPermissao } from './equipe';
import { desligarPelaEquipe, ligarPelaEquipe, reiniciarPelaEquipe } from './servidores-pela-equipe';
import type { ControleDaDiversao } from './sob-demanda';

let bd: Bd;
let adm: Usuario;
let mutacao: ServidorDiversao;
let chamadas: string[];
let controle: ControleDaDiversao;
const AGORA = new Date('2026-11-13T15:00:00Z');

async function estado() {
  const [linha] = await bd.select().from(estadosDaDiversao).where(eq(estadosDaDiversao.servidorId, mutacao.id));
  return linha;
}

beforeEach(async () => {
  bd = await criarBancoDeTeste();
  await bd.update(servidoresDiversao).set({ ativo: true });
  [mutacao] = await bd.select().from(servidoresDiversao).where(eq(servidoresDiversao.modo, 'mutacao'));
  adm = await criarUsuario(bd, { estado: 'ativo', papel: 'adm' });
  chamadas = [];
  controle = {
    ligar: async (nome) => void chamadas.push(`ligar ${nome}`),
    desligar: async (nome) => void chamadas.push(`desligar ${nome}`),
  };
});

test('o Adm liga um modo da Diversão pelo painel, e fica no registro da equipe', async () => {
  await ligarPelaEquipe(bd, controle, adm, mutacao.id, AGORA);
  expect(chamadas).toEqual([`ligar ${mutacao.nomeNoServidor}`]);
  expect((await estado()).estado).toBe('ligando');
  const [registro] = await bd.select().from(auditoria).where(eq(auditoria.acao, 'ligar_servidor'));
  expect(registro.detalhes).toMatchObject({ servidor: mutacao.nomeNoServidor });
});

test('desligar fecha o servidor e marca desligado na hora', async () => {
  await bd.insert(estadosDaDiversao).values({ servidorId: mutacao.id, estado: 'ligado', desde: AGORA });
  await desligarPelaEquipe(bd, controle, adm, mutacao.id, AGORA);
  expect(chamadas).toEqual([`desligar ${mutacao.nomeNoServidor}`]);
  expect((await estado()).estado).toBe('desligado');
  expect(await bd.select().from(auditoria).where(eq(auditoria.acao, 'desligar_servidor'))).toHaveLength(1);
});

test('reiniciar desliga e liga de novo', async () => {
  await bd.insert(estadosDaDiversao).values({ servidorId: mutacao.id, estado: 'ligado', desde: AGORA });
  await reiniciarPelaEquipe(bd, controle, adm, mutacao.id, AGORA);
  expect(chamadas).toEqual([`desligar ${mutacao.nomeNoServidor}`, `ligar ${mutacao.nomeNoServidor}`]);
  expect((await estado()).estado).toBe('ligando');
});

test('GM e jogador não mexem nos servidores', async () => {
  const gm = await criarUsuario(bd, { estado: 'ativo', papel: 'gm' });
  await expect(ligarPelaEquipe(bd, controle, gm, mutacao.id, AGORA)).rejects.toBeInstanceOf(SemPermissao);
  await expect(desligarPelaEquipe(bd, controle, gm, mutacao.id, AGORA)).rejects.toBeInstanceOf(SemPermissao);
  expect(chamadas).toEqual([]);
});
