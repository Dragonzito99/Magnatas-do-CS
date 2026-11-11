import { beforeEach, expect, test } from 'vitest';
import type { Bd } from '@/bd/conexao';
import { claMembros, clas, type Usuario } from '@/bd/esquema';
import { criarBancoDeTeste, criarUsuario } from '@/bd/teste';
import { desfazerAmizade, pedirAmizade, responderAmizade } from './amigos';
import {
  apagarMensagem,
  conversaDiretaCom,
  conversaDoCla,
  conversasDe,
  criarGrupo,
  enviarMensagem,
  mensagensDe,
  MensagemInvalida,
  naoLidasDe,
  SemAcessoAConversa,
} from './mensagens';

let bd: Bd;
let eu: Usuario;
let ele: Usuario;
let outro: Usuario;
const AGORA = new Date('2026-11-11T21:00:00Z');
const depois = (segundos: number) => new Date(AGORA.getTime() + segundos * 1000);

beforeEach(async () => {
  bd = await criarBancoDeTeste();
  eu = await criarUsuario(bd, { estado: 'ativo', apelido: 'Dragonzit0' });
  ele = await criarUsuario(bd, { estado: 'ativo', apelido: 'Marfioso' });
  outro = await criarUsuario(bd, { estado: 'ativo', apelido: 'Alfa' });
});

async function amigos(a: Usuario, b: Usuario) {
  await pedirAmizade(bd, a, b.id, AGORA);
  await responderAmizade(bd, b, a.id, true, AGORA);
}

test('conversa direta só entre amigos, uma por par, e a mensagem chega como não lida', async () => {
  await expect(conversaDiretaCom(bd, eu, ele.id)).rejects.toBeInstanceOf(SemAcessoAConversa);
  await amigos(eu, ele);
  const conversa = await conversaDiretaCom(bd, eu, ele.id);
  expect(await conversaDiretaCom(bd, ele, eu.id)).toBe(conversa);
  await enviarMensagem(bd, eu, conversa, 'bora um mix?', depois(1));
  expect(await naoLidasDe(bd, ele.id)).toBe(1);
  expect(await naoLidasDe(bd, eu.id)).toBe(0);
  const lidas = await mensagensDe(bd, ele, conversa, depois(2));
  expect(lidas.map((mensagem) => [mensagem.autorApelido, mensagem.texto])).toEqual([['Dragonzit0', 'bora um mix?']]);
  expect(await naoLidasDe(bd, ele.id)).toBe(0);
});

test('a lista de conversas mostra o nome do outro, a última mensagem e as não lidas, a mais recente primeiro', async () => {
  await amigos(eu, ele);
  await amigos(eu, outro);
  const comEle = await conversaDiretaCom(bd, eu, ele.id);
  const comOutro = await conversaDiretaCom(bd, eu, outro.id);
  await enviarMensagem(bd, ele, comEle, 'primeira', depois(1));
  await enviarMensagem(bd, outro, comOutro, 'segunda', depois(2));
  await enviarMensagem(bd, outro, comOutro, 'terceira', depois(3));
  const lista = await conversasDe(bd, eu.id);
  expect(lista.map((conversa) => [conversa.nome, conversa.ultima, conversa.naoLidas])).toEqual([
    ['Alfa', 'terceira', 2],
    ['Marfioso', 'primeira', 1],
  ]);
});

test('desfeita a amizade, a conversa direta fecha para os dois', async () => {
  await amigos(eu, ele);
  const conversa = await conversaDiretaCom(bd, eu, ele.id);
  await desfazerAmizade(bd, eu, ele.id);
  await expect(enviarMensagem(bd, ele, conversa, 'oi', depois(1))).rejects.toBeInstanceOf(SemAcessoAConversa);
});

test('grupo: o criador chama amigos, todos falam, e quem está fora não lê', async () => {
  await amigos(eu, ele);
  await expect(criarGrupo(bd, eu, 'Mix de sexta', [ele.id, outro.id], AGORA)).rejects.toBeInstanceOf(SemAcessoAConversa);
  const grupo = await criarGrupo(bd, eu, 'Mix de sexta', [ele.id], AGORA);
  await enviarMensagem(bd, ele, grupo, 'tô dentro', depois(1));
  expect(await naoLidasDe(bd, eu.id)).toBe(1);
  await expect(mensagensDe(bd, outro, grupo, depois(2))).rejects.toBeInstanceOf(SemAcessoAConversa);
  expect((await conversasDe(bd, ele.id)).map((conversa) => [conversa.tipo, conversa.nome])).toEqual([['grupo', 'Mix de sexta']]);
});

test('o clã tem um grupo só dele: quem está no clã fala, quem sai perde o acesso', async () => {
  const [cla] = await bd.insert(clas).values({ nome: 'Magnatas Originais', sigla: 'MGN', cor: 'ouro', entrada: 'aberto' }).returning();
  await bd.insert(claMembros).values([
    { claId: cla.id, usuarioId: eu.id, cargo: 'dono' },
    { claId: cla.id, usuarioId: ele.id, cargo: 'membro' },
  ]);
  const doCla = await conversaDoCla(bd, eu);
  expect(doCla).not.toBeNull();
  expect(await conversaDoCla(bd, ele)).toBe(doCla);
  await enviarMensagem(bd, eu, doCla!, 'treino às 21h', depois(1));
  expect(await naoLidasDe(bd, ele.id)).toBe(1);
  expect((await conversasDe(bd, ele.id))[0]).toMatchObject({ tipo: 'cla', nome: '[MGN] Magnatas Originais' });
  await expect(mensagensDe(bd, outro, doCla!, depois(2))).rejects.toBeInstanceOf(SemAcessoAConversa);
  expect(await conversaDoCla(bd, outro)).toBeNull();
});

test('mensagem vazia ou longa demais é recusada, e a mensagem apagada pela equipe some', async () => {
  await amigos(eu, ele);
  const conversa = await conversaDiretaCom(bd, eu, ele.id);
  await expect(enviarMensagem(bd, eu, conversa, '   ', AGORA)).rejects.toBeInstanceOf(MensagemInvalida);
  await expect(enviarMensagem(bd, eu, conversa, 'x'.repeat(1001), AGORA)).rejects.toBeInstanceOf(MensagemInvalida);
  const id = await enviarMensagem(bd, eu, conversa, 'palavrão', AGORA);
  await apagarMensagem(bd, id, depois(1));
  expect(await mensagensDe(bd, ele, conversa, depois(2))).toEqual([]);
});
