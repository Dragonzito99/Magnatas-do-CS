'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { exigirAcesso } from '@/auth/guarda';
import { obterBd } from '@/bd/conexao';
import { ItemInvalido, lojaAberta, tirarItem, usarItem } from '@/dominio/loja';

async function noBau(acao: (usuarioId: string, itemId: string) => Promise<void>, dados: FormData): Promise<void> {
  const usuario = await exigirAcesso('/bau');
  if (!lojaAberta(usuario)) redirect('/inicio');
  try {
    await acao(usuario.id, String(dados.get('itemId') ?? ''));
  } catch (erro) {
    if (erro instanceof ItemInvalido) redirect('/bau?erro=item');
    throw erro;
  }
  revalidatePath('/', 'layout');
  redirect('/bau');
}

export async function usar(dados: FormData): Promise<void> {
  await noBau((usuarioId, itemId) => usarItem(obterBd(), { id: usuarioId }, itemId), dados);
}

export async function tirar(dados: FormData): Promise<void> {
  await noBau((usuarioId, itemId) => tirarItem(obterBd(), { id: usuarioId }, itemId), dados);
}
