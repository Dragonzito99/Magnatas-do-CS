'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { exigirAcesso } from '@/auth/guarda';
import { obterBd } from '@/bd/conexao';
import type { Usuario } from '@/bd/esquema';
import { aceitarDesafio, cancelarDesafio, DesafioIndisponivel, desafiar, recusarDesafio, SalaIncompleta } from '@/dominio/desafios';
import { Bloqueado, ContaSemAcesso, JaOcupado } from '@/dominio/disponibilidade';
import { aceitarJuncao, cancelarJuncao, JuncaoIndisponivel, pedirJuncao, recusarJuncao } from '@/dominio/juncoes';
import {
  criarSala,
  entrarNaSala,
  expulsarDaSala,
  SalaCheia,
  SalaEmPartida,
  SalaInexistente,
  SemPermissaoNaSala,
  sairDaSala,
} from '@/dominio/salas';
import { alocarEmSegundoPlano } from '@/servidor-jogo/alocar';

function codigoDoErro(erro: unknown): string | null {
  if (erro instanceof SalaCheia) return 'cheia';
  if (erro instanceof SalaEmPartida) return 'em-partida';
  if (erro instanceof SalaInexistente) return 'inexistente';
  if (erro instanceof SemPermissaoNaSala) return 'so-lider';
  if (erro instanceof Bloqueado) return 'bloqueado';
  if (erro instanceof JaOcupado) return 'ocupado';
  if (erro instanceof ContaSemAcesso) return 'sem-acesso';
  if (erro instanceof SalaIncompleta) return 'incompleta';
  if (erro instanceof DesafioIndisponivel) return 'desafio';
  if (erro instanceof JuncaoIndisponivel) return 'juncao';
  return null;
}

async function executar<T>(acao: (ator: Usuario) => Promise<T>): Promise<T> {
  const ator = await exigirAcesso('/salas');
  try {
    return await acao(ator);
  } catch (erro) {
    const codigo = codigoDoErro(erro);
    if (codigo) redirect(`/salas?erro=${codigo}`);
    throw erro;
  }
}

function idDe(dados: FormData, campo: string): string {
  const lido = z.uuid().safeParse(dados.get(campo));
  if (!lido.success) redirect('/salas?erro=inexistente');
  return lido.data;
}

export async function criar() {
  await executar((ator) => criarSala(obterBd(), ator));
  revalidatePath('/salas');
}

export async function entrar(dados: FormData) {
  const salaId = idDe(dados, 'salaId');
  await executar((ator) => entrarNaSala(obterBd(), ator, salaId));
  revalidatePath('/salas');
}

export async function sair() {
  await executar((ator) => sairDaSala(obterBd(), ator));
  revalidatePath('/salas');
}

export async function expulsar(dados: FormData) {
  const usuarioId = idDe(dados, 'usuarioId');
  await executar((ator) => expulsarDaSala(obterBd(), ator, usuarioId));
  revalidatePath('/salas');
}

export async function chamarParaDesafio(dados: FormData) {
  const salaId = idDe(dados, 'salaId');
  await executar((ator) => desafiar(obterBd(), ator, salaId));
  revalidatePath('/salas');
}

export async function aceitar(dados: FormData) {
  const desafioId = idDe(dados, 'desafioId');
  const bd = obterBd();
  const partida = await executar((ator) => aceitarDesafio(bd, ator, desafioId));
  alocarEmSegundoPlano(bd);
  redirect(`/partidas/${partida.id}`);
}

export async function juntar(dados: FormData) {
  const salaId = idDe(dados, 'salaId');
  await executar((ator) => pedirJuncao(obterBd(), ator, salaId));
  revalidatePath('/salas');
}

export async function aceitarJuntar(dados: FormData) {
  const juncaoId = idDe(dados, 'juncaoId');
  await executar((ator) => aceitarJuncao(obterBd(), ator, juncaoId));
  revalidatePath('/salas');
}

export async function recusarJuntar(dados: FormData) {
  const juncaoId = idDe(dados, 'juncaoId');
  await executar((ator) => recusarJuncao(obterBd(), ator, juncaoId));
  revalidatePath('/salas');
}

export async function cancelarJuntar(dados: FormData) {
  const juncaoId = idDe(dados, 'juncaoId');
  await executar((ator) => cancelarJuncao(obterBd(), ator, juncaoId));
  revalidatePath('/salas');
}

export async function recusar(dados: FormData) {
  const desafioId = idDe(dados, 'desafioId');
  await executar((ator) => recusarDesafio(obterBd(), ator, desafioId));
  revalidatePath('/salas');
}

export async function cancelar(dados: FormData) {
  const desafioId = idDe(dados, 'desafioId');
  await executar((ator) => cancelarDesafio(obterBd(), ator, desafioId));
  revalidatePath('/salas');
}
