'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { exigirAcesso } from '@/auth/guarda';
import { obterBd } from '@/bd/conexao';
import type { Usuario } from '@/bd/esquema';
import {
  ClaInvalido,
  chamarParaCla,
  criarCla,
  desfazerCla,
  editarCla,
  entrarNoCla,
  expulsarDoCla,
  mudarCargo,
  passarDono,
  pedirParaEntrar,
  responderPedido,
  sairDoCla,
} from '@/dominio/clas';
import { ContaSemAcesso } from '@/dominio/disponibilidade';
import { SemPermissao } from '@/dominio/equipe';

const CAMINHO = '/clas';

/** Os erros conhecidos voltam para a tela com um código; o resto é erro de verdade. */
async function executar(voltarPara: string, acao: (ator: Usuario) => Promise<unknown>): Promise<void> {
  const ator = await exigirAcesso(CAMINHO);
  try {
    await acao(ator);
  } catch (erro) {
    const separador = voltarPara.includes('?') ? '&' : '?';
    if (erro instanceof ClaInvalido) redirect(`${voltarPara}${separador}erro=${erro.motivo}`);
    if (erro instanceof ContaSemAcesso || erro instanceof SemPermissao) redirect(`${voltarPara}${separador}erro=cargo`);
    throw erro;
  }
  revalidatePath(CAMINHO);
}

function idDe(dados: FormData, campo: string): string {
  const lido = z.uuid().safeParse(dados.get(campo));
  if (!lido.success) redirect(`${CAMINHO}?erro=sem-cla`);
  return lido.data;
}

const texto = (dados: FormData, campo: string) => String(dados.get(campo) ?? '');

function dadosDoFormulario(dados: FormData) {
  return { nome: texto(dados, 'nome'), sigla: texto(dados, 'sigla'), cor: texto(dados, 'cor'), entrada: texto(dados, 'entrada'), descricao: texto(dados, 'descricao') };
}

export async function criar(dados: FormData) {
  await executar(`${CAMINHO}?aba=criar`, (ator) => criarCla(obterBd(), ator, dadosDoFormulario(dados)));
  redirect(CAMINHO);
}

export async function editar(dados: FormData) {
  await executar(CAMINHO, (ator) => editarCla(obterBd(), ator, dadosDoFormulario(dados)));
  redirect(`${CAMINHO}?aviso=editado`);
}

export async function entrar(dados: FormData) {
  const claId = idDe(dados, 'claId');
  await executar(`${CAMINHO}?aba=procurar`, (ator) => entrarNoCla(obterBd(), ator, claId));
  redirect(CAMINHO);
}

export async function pedir(dados: FormData) {
  const claId = idDe(dados, 'claId');
  await executar(`${CAMINHO}?aba=procurar`, (ator) => pedirParaEntrar(obterBd(), ator, claId));
  redirect(`${CAMINHO}?aba=procurar&aviso=pedido`);
}

export async function responder(dados: FormData) {
  const pedidoId = idDe(dados, 'pedidoId');
  const aceitar = dados.get('resposta') === 'aceitar';
  await executar(CAMINHO, (ator) => responderPedido(obterBd(), ator, pedidoId, aceitar));
}

export async function chamar(dados: FormData) {
  const claId = idDe(dados, 'claId');
  const usuarioId = idDe(dados, 'usuarioId');
  // O chamado sai do perfil da pessoa, e a resposta volta para lá.
  await executar(`/jogadores/${usuarioId}`, (ator) => chamarParaCla(obterBd(), ator, claId, usuarioId));
  redirect(`/jogadores/${usuarioId}?aviso=chamado`);
}

export async function sair() {
  await executar(CAMINHO, (ator) => sairDoCla(obterBd(), ator));
  redirect(`${CAMINHO}?aba=procurar`);
}

export async function expulsar(dados: FormData) {
  const usuarioId = idDe(dados, 'usuarioId');
  await executar(CAMINHO, (ator) => expulsarDoCla(obterBd(), ator, usuarioId));
}

export async function trocarCargo(dados: FormData) {
  const usuarioId = idDe(dados, 'usuarioId');
  const cargo = dados.get('cargo') === 'capitao' ? 'capitao' : 'membro';
  await executar(CAMINHO, (ator) => mudarCargo(obterBd(), ator, usuarioId, cargo));
}

export async function passarCargoDeDono(dados: FormData) {
  const usuarioId = idDe(dados, 'usuarioId');
  await executar(CAMINHO, (ator) => passarDono(obterBd(), ator, usuarioId));
}

export async function desfazer(dados: FormData) {
  const claId = idDe(dados, 'claId');
  await executar(`${CAMINHO}/${claId}`, (ator) => desfazerCla(obterBd(), ator, claId));
  redirect(`${CAMINHO}?aba=ranking`);
}
