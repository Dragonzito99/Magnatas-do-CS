'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { exigirAcesso } from '@/auth/guarda';
import { obterBd } from '@/bd/conexao';
import { ItemInvalido, lojaAberta, tirarItem, usarItem } from '@/dominio/loja';
import { abrirPresente as abrirPresenteDaConta, abrirPresenteDoConvite, EscolhaInvalida, PresenteIndisponivel } from '@/dominio/presentes';

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

/** Abre o presente que veio no convite. */
export async function abrirPresenteConvite(dados: FormData): Promise<void> {
  const usuario = await exigirAcesso('/bau');
  try {
    await abrirPresenteDoConvite(obterBd(), usuario, String(dados.get('presenteId') ?? ''));
  } catch (erro) {
    if (erro instanceof PresenteIndisponivel) redirect('/bau');
    throw erro;
  }
  revalidatePath('/', 'layout');
  redirect('/bau?presente=convite');
}

/** Abre o presente do Premium com o mutante escolhido; o mutante já entra em uso. */
export async function abrirPresente(dados: FormData): Promise<void> {
  const usuario = await exigirAcesso('/bau');
  const mutanteId = String(dados.get('mutanteId') ?? '');
  try {
    await abrirPresenteDaConta(obterBd(), usuario, mutanteId);
  } catch (erro) {
    if (erro instanceof PresenteIndisponivel || erro instanceof EscolhaInvalida) redirect('/bau');
    throw erro;
  }
  await usarItem(obterBd(), usuario, mutanteId).catch(() => undefined);
  revalidatePath('/', 'layout');
  redirect(`/bau?presente=${encodeURIComponent(mutanteId)}`);
}
