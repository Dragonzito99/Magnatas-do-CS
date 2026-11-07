import { eq } from 'drizzle-orm';
import { beforeEach, expect, test } from 'vitest';
import type { Bd } from '@/bd/conexao';
import { elogios, partidaJogadores, partidas, type Partida, type Usuario } from '@/bd/esquema';
import { criarBancoDeTeste, criarUsuario } from '@/bd/teste';
import { elogiar, ElogioIndisponivel, ElogioRepetido, elogiosDoJogador, elogiosFeitos, TIPOS_DE_ELOGIO } from './elogios';

let bd: Bd;
let a: Usuario;
let b: Usuario;
let c: Usuario;

beforeEach(async () => {
  bd = await criarBancoDeTeste();
  [a, b, c] = [await criarUsuario(bd, { estado: 'ativo' }), await criarUsuario(bd, { estado: 'ativo' }), await criarUsuario(bd, { estado: 'ativo' })];
});

async function partidaCom(jogadores: Usuario[], estado: Partida['estado'] = 'encerrada'): Promise<Partida> {
  const [partida] = await bd.insert(partidas).values({ tipo: 'mix', estado, mapa: 'de_mirage' }).returning();
  await bd.insert(partidaJogadores).values(jogadores.map((conta, i) => ({ partidaId: partida.id, usuarioId: conta.id, time: i % 2 === 0 ? 1 : 2 })));
  return partida;
}

test('os tipos apontam uma coisa boa do Magnata', () => {
  expect(TIPOS_DE_ELOGIO.map((tipo) => tipo.valor)).toEqual(['bom_de_mira', 'gente_boa', 'lider', 'bom_de_equipe']);
  expect(TIPOS_DE_ELOGIO.map((tipo) => tipo.nome)).toEqual(['Bom de mira', 'Gente boa', 'Líder', 'Bom de equipe']);
});

test('elogiar grava o elogio', async () => {
  const partida = await partidaCom([a, b]);
  await elogiar(bd, a, { partidaId: partida.id, elogiadoId: b.id, tipo: 'bom_de_mira' });
  expect(await bd.select().from(elogios)).toMatchObject([{ partidaId: partida.id, autorId: a.id, elogiadoId: b.id, tipo: 'bom_de_mira' }]);
});

test('segundo elogio à mesma pessoa na mesma partida é recusado, mesmo com outro tipo', async () => {
  const partida = await partidaCom([a, b]);
  await elogiar(bd, a, { partidaId: partida.id, elogiadoId: b.id, tipo: 'bom_de_mira' });
  await expect(elogiar(bd, a, { partidaId: partida.id, elogiadoId: b.id, tipo: 'lider' })).rejects.toThrow(ElogioRepetido);
});

test('a si mesmo, sem ter jogado, a quem não jogou, ou tipo inválido: recusado', async () => {
  const partida = await partidaCom([a, b]);
  await expect(elogiar(bd, a, { partidaId: partida.id, elogiadoId: a.id, tipo: 'lider' })).rejects.toThrow(ElogioIndisponivel);
  await expect(elogiar(bd, c, { partidaId: partida.id, elogiadoId: b.id, tipo: 'lider' })).rejects.toThrow(ElogioIndisponivel);
  await expect(elogiar(bd, a, { partidaId: partida.id, elogiadoId: c.id, tipo: 'lider' })).rejects.toThrow(ElogioIndisponivel);
  await expect(elogiar(bd, a, { partidaId: partida.id, elogiadoId: b.id, tipo: 'cheater' })).rejects.toThrow(ElogioIndisponivel);
});

test.each(['aguardando_aceite', 'vetando', 'ao_vivo', 'cancelada'] as const)('partida %s não recebe elogio', async (estado) => {
  const partida = await partidaCom([a, b], estado);
  await expect(elogiar(bd, a, { partidaId: partida.id, elogiadoId: b.id, tipo: 'lider' })).rejects.toThrow(ElogioIndisponivel);
});

test('elogiosFeitos lista quem o autor já elogiou na partida', async () => {
  const partida = await partidaCom([a, b, c]);
  await elogiar(bd, a, { partidaId: partida.id, elogiadoId: b.id, tipo: 'gente_boa' });
  expect(await elogiosFeitos(bd, partida.id, a.id)).toEqual(new Set([b.id]));
  expect(await elogiosFeitos(bd, partida.id, b.id)).toEqual(new Set());
});

test('elogiosDoJogador soma por tipo entre partidas, maior primeiro, e esconde tipo sem elogio', async () => {
  const [p1, p2] = [await partidaCom([a, b, c]), await partidaCom([a, b, c])];
  await elogiar(bd, a, { partidaId: p1.id, elogiadoId: b.id, tipo: 'gente_boa' });
  await elogiar(bd, c, { partidaId: p1.id, elogiadoId: b.id, tipo: 'gente_boa' });
  await elogiar(bd, a, { partidaId: p2.id, elogiadoId: b.id, tipo: 'lider' });
  expect(await elogiosDoJogador(bd, b.id)).toEqual([
    { tipo: 'gente_boa', nome: 'Gente boa', total: 2 },
    { tipo: 'lider', nome: 'Líder', total: 1 },
  ]);
  expect(await elogiosDoJogador(bd, a.id)).toEqual([]);
  expect(await bd.select().from(elogios).where(eq(elogios.elogiadoId, b.id))).toHaveLength(3);
});
