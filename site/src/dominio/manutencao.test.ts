import { eq } from 'drizzle-orm';
import { beforeEach, expect, test } from 'vitest';
import type { Bd } from '@/bd/conexao';
import { auditoria, servidoresDiversao, type Usuario } from '@/bd/esquema';
import { criarBancoDeTeste, criarUsuario } from '@/bd/teste';
import { SemPermissao } from './equipe';
import { desligarManutencao, EmManutencao, ligarManutencao, manutencaoAtual } from './manutencao';
import { entrarNoMix } from './mix';
import { criarSala } from './salas';
import { pedirParaLigar } from './sob-demanda';

let bd: Bd;
let adm: Usuario;
let membro: Usuario;
const AGORA = new Date('2026-11-11T22:00:00Z');

beforeEach(async () => {
  bd = await criarBancoDeTeste();
  adm = await criarUsuario(bd, { estado: 'ativo', papel: 'adm' });
  membro = await criarUsuario(bd, { estado: 'ativo' });
});

test('o Adm liga e desliga o aviso na mão, com auditoria; jogador comum não mexe', async () => {
  expect(await manutencaoAtual(bd)).toBeNull();
  await expect(ligarManutencao(bd, membro)).rejects.toBeInstanceOf(SemPermissao);

  await ligarManutencao(bd, adm, AGORA);
  expect(await manutencaoAtual(bd)).toEqual({ automatica: false, motivo: null, desde: AGORA });
  await expect(desligarManutencao(bd, membro)).rejects.toBeInstanceOf(SemPermissao);

  await desligarManutencao(bd, adm);
  expect(await manutencaoAtual(bd)).toBeNull();
  const registros = await bd.select().from(auditoria).where(eq(auditoria.atorId, adm.id));
  expect(registros.map((registro) => registro.acao).sort()).toEqual(['desligar_manutencao', 'ligar_manutencao']);
});

test('com o aviso ligado ninguém entra na fila, cria sala nem liga servidor da Diversão', async () => {
  await ligarManutencao(bd, adm, AGORA);
  await expect(entrarNoMix(bd, membro, { agora: AGORA })).rejects.toBeInstanceOf(EmManutencao);
  await expect(criarSala(bd, membro, AGORA)).rejects.toBeInstanceOf(EmManutencao);
  await bd.update(servidoresDiversao).set({ ativo: true });
  const [servidor] = await bd.select().from(servidoresDiversao);
  const controle = { ligar: async () => {}, desligar: async () => {} };
  await expect(pedirParaLigar(bd, controle, servidor.id, membro, 3, AGORA)).rejects.toBeInstanceOf(EmManutencao);

  await desligarManutencao(bd, adm);
  await expect(criarSala(bd, membro, AGORA)).resolves.toBeTruthy();
});
