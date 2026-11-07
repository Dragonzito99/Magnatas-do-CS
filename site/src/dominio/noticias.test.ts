import { beforeEach, expect, test } from 'vitest';
import type { Bd } from '@/bd/conexao';
import type { Usuario } from '@/bd/esquema';
import { criarBancoDeTeste, criarUsuario } from '@/bd/teste';
import { SemPermissao } from './equipe';
import { apagarNoticia, criarNoticia, editarNoticia, LIMITES_DA_NOTICIA, noticiaPorId, NoticiaInvalida, ultimasNoticias } from './noticias';

let bd: Bd;
let adm: Usuario;
const AGORA = new Date('2026-11-07T12:00:00Z');
const depois = (minutos: number) => new Date(AGORA.getTime() + minutos * 60_000);

beforeEach(async () => {
  bd = await criarBancoDeTeste();
  adm = await criarUsuario(bd, { estado: 'ativo', papel: 'adm', apelido: 'DraGonZit0' });
});

test('os limites são 120 no título e 5.000 no texto', () => {
  expect(LIMITES_DA_NOTICIA).toEqual({ titulo: 120, texto: 5000 });
});

test('adm cria a notícia, sem espaços sobrando', async () => {
  const noticia = await criarNoticia(bd, adm, { titulo: '  Campeonato de Inverno  ', texto: '  Inscrições abertas.  ' }, AGORA);
  expect(noticia).toMatchObject({ titulo: 'Campeonato de Inverno', texto: 'Inscrições abertas.', autorId: adm.id, fixada: false });
});

test.each([
  ['título vazio', '   ', 'Texto'],
  ['título longo', 'x'.repeat(121), 'Texto'],
  ['texto vazio', 'Título', ' '],
  ['texto longo', 'Título', 'x'.repeat(5001)],
])('%s é recusado', async (_caso, titulo, texto) => {
  await expect(criarNoticia(bd, adm, { titulo, texto }, AGORA)).rejects.toThrow(NoticiaInvalida);
});

test.each(['gm', 'jogador'] as const)('%s não publica', async (papel) => {
  const conta = await criarUsuario(bd, { estado: 'ativo', papel });
  await expect(criarNoticia(bd, conta, { titulo: 'Oi', texto: 'Oi' }, AGORA)).rejects.toThrow(SemPermissao);
});

test('o script publica sem autor, e a notícia aparece como Equipe Magnatas', async () => {
  await criarNoticia(bd, null, { titulo: 'Patch 1', texto: 'O que mudou.' }, AGORA);
  const [noticia] = await ultimasNoticias(bd);
  expect(noticia).toMatchObject({ titulo: 'Patch 1', autorId: null, autorApelido: 'Equipe Magnatas' });
});

test('adm edita e apaga; editar marca a hora da edição', async () => {
  const noticia = await criarNoticia(bd, adm, { titulo: 'Oi', texto: 'Oi' }, AGORA);
  await editarNoticia(bd, adm, noticia.id, { titulo: 'Novo', texto: 'Novo texto', fixada: true }, depois(5));
  expect(await noticiaPorId(bd, noticia.id)).toMatchObject({ titulo: 'Novo', texto: 'Novo texto', fixada: true, atualizadaEm: depois(5) });
  await apagarNoticia(bd, adm, noticia.id);
  expect(await noticiaPorId(bd, noticia.id)).toBeNull();
});

test('gm não edita nem apaga', async () => {
  const noticia = await criarNoticia(bd, adm, { titulo: 'Oi', texto: 'Oi' }, AGORA);
  const gm = await criarUsuario(bd, { estado: 'ativo', papel: 'gm' });
  await expect(editarNoticia(bd, gm, noticia.id, { titulo: 'x', texto: 'x' }, AGORA)).rejects.toThrow(SemPermissao);
  await expect(apagarNoticia(bd, gm, noticia.id)).rejects.toThrow(SemPermissao);
});

test('ultimasNoticias traz as fixadas primeiro, depois as mais novas, até o limite', async () => {
  await criarNoticia(bd, adm, { titulo: 'Antiga fixada', texto: 't', fixada: true }, depois(0));
  for (let i = 1; i <= 6; i += 1) await criarNoticia(bd, adm, { titulo: `N${i}`, texto: 't' }, depois(i));
  const lista = await ultimasNoticias(bd, 5);
  expect(lista.map((noticia) => noticia.titulo)).toEqual(['Antiga fixada', 'N6', 'N5', 'N4', 'N3']);
  expect(lista[1].autorApelido).toBe('DraGonZit0');
});

test('texto com HTML é guardado como texto, sem mudar nada', async () => {
  const texto = 'Olá <script>alert(1)</script> & tchau';
  const noticia = await criarNoticia(bd, adm, { titulo: 'HTML', texto }, AGORA);
  expect((await noticiaPorId(bd, noticia.id))?.texto).toBe(texto);
});
