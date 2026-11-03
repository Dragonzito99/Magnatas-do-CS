'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { exigirAcesso } from '@/auth/guarda';
import { obterBd } from '@/bd/conexao';
import type { Usuario } from '@/bd/esquema';
import { aceitarDesafio, cancelarDesafio, DesafioIndisponivel, desafiar, recusarDesafio, SalaIncompleta } from '@/dominio/desafios';
import { ContaSemAcesso, JaOcupado } from '@/dominio/disponibilidade';
import {
  criarSala,
  entrarNaSala,
  expulsarDaSala,
  NomeDeSalaInvalido,
  SalaCheia,
  SalaEmPartida,
  SalaInexistente,
  SemPermissaoNaSala,
  sairDaSala,
} from '@/dominio/salas';
import { alocarEmSegundoPlano } from '@/servidor-jogo/alocar';

function codigoDoErro(erro: unknown): string | null {
  if (erro instanceof NomeDeSalaInvalido) return 'nome';
  if (erro instanceof SalaCheia) return 'cheia';
  if (erro instanceof SalaEmPartida) return 'em-partida';
  if (erro instanceof SalaInexistente) return 'inexistente';
  if (erro instanceof SemPermissaoNaSala) return 'so-lider';
  if (erro instanceof JaOcupado) return 'ocupado';
  if (erro instanceof ContaSemAcesso) return 'sem-acesso';
  if (erro instanceof SalaIncompleta) return 'incompleta';
  if (erro instanceof DesafioIndisponivel) return 'desafio';
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

export async function criar(dados: FormData) {
  await executar((ator) => criarSala(obterBd(), ator, String(dados.get('nome') ?? '')));
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
