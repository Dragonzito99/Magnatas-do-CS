'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { obterBd } from '@/bd/conexao';
import { usuarioAtual } from '@/auth/sessao-atual';
import { ConviteInvalido, gerarConvite, revogarConvite, SemConvites } from '@/dominio/convites';

export async function gerar() {
  const ator = await usuarioAtual();
  if (!ator) redirect('/');
  try {
    await gerarConvite(obterBd(), ator);
  } catch (erro) {
    if (erro instanceof SemConvites) redirect('/convites?erro=sem-convites');
    throw erro;
  }
  revalidatePath('/convites');
}

export async function revogar(dados: FormData) {
  const ator = await usuarioAtual();
  if (!ator) redirect('/');
  try {
    await revogarConvite(obterBd(), ator, String(dados.get('codigo') ?? ''));
  } catch (erro) {
    if (erro instanceof ConviteInvalido) redirect('/convites?erro=revogar');
    throw erro;
  }
  revalidatePath('/convites');
}
