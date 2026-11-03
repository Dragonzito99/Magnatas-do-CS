'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { obterBd } from '@/bd/conexao';
import type { Papel } from '@/bd/esquema';
import { usuarioAtual } from '@/auth/sessao-atual';
import { darConvites, mudarPapel, UltimoAdm } from '@/dominio/equipe';

const PAPEIS: Papel[] = ['jogador', 'gm', 'adm'];

export async function trocarPapel(dados: FormData) {
  const ator = await usuarioAtual();
  if (!ator) redirect('/');
  const papel = String(dados.get('papel')) as Papel;
  if (!PAPEIS.includes(papel)) redirect('/equipe?erro=papel');
  try {
    await mudarPapel(obterBd(), ator, String(dados.get('alvo')), papel);
  } catch (erro) {
    if (erro instanceof UltimoAdm) redirect('/equipe?erro=ultimo-adm');
    throw erro;
  }
  revalidatePath('/equipe');
}

export async function concederConvites(dados: FormData) {
  const ator = await usuarioAtual();
  if (!ator) redirect('/');
  const quantidade = Number(dados.get('quantidade'));
  if (!Number.isInteger(quantidade) || quantidade < 1 || quantidade > 100) redirect('/equipe?erro=quantidade');
  await darConvites(obterBd(), ator, String(dados.get('alvo')), quantidade);
  revalidatePath('/equipe');
}
