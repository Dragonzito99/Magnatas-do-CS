'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { exigirAcesso } from '@/auth/guarda';
import { obterBd } from '@/bd/conexao';
import { ContaSemAcesso } from '@/dominio/disponibilidade';
import { SaldoInsuficiente } from '@/dominio/grana';
import { comprarItem, comprarParaSempre, ItemInvalido, JaEhSeu, lojaAberta } from '@/dominio/loja';

/** Compra com o código que a tela gerou: o mesmo envio duas vezes é a mesma compra e não cobra de novo. */
export async function comprar(dados: FormData): Promise<void> {
  const usuario = await exigirAcesso('/loja');
  if (!lojaAberta(usuario)) redirect('/inicio');
  const itemId = String(dados.get('itemId') ?? '');
  try {
    await comprarItem(obterBd(), usuario, { itemId, dias: Number(dados.get('dias')), codigo: String(dados.get('codigo') ?? '') });
  } catch (erro) {
    const voltar = `/loja?item=${encodeURIComponent(itemId)}`;
    if (erro instanceof SaldoInsuficiente) redirect(`${voltar}&erro=saldo`);
    if (erro instanceof ItemInvalido) redirect('/loja?erro=item');
    if (erro instanceof ContaSemAcesso) redirect(`${voltar}&erro=conta`);
    throw erro;
  }
  revalidatePath('/', 'layout');
  redirect(`/loja?item=${encodeURIComponent(itemId)}&comprado=1`);
}

/** Compra com MagCoin: o item fica para sempre. */
export async function comprarComMagcoin(dados: FormData): Promise<void> {
  const usuario = await exigirAcesso('/loja');
  if (!lojaAberta(usuario)) redirect('/inicio');
  const itemId = String(dados.get('itemId') ?? '');
  const voltar = `/loja?item=${encodeURIComponent(itemId)}`;
  try {
    await comprarParaSempre(obterBd(), usuario, { itemId, codigo: String(dados.get('codigo') ?? '') });
  } catch (erro) {
    if (erro instanceof SaldoInsuficiente) redirect(`${voltar}&erro=magcoin`);
    if (erro instanceof JaEhSeu) redirect(`${voltar}&erro=ja-seu`);
    if (erro instanceof ItemInvalido) redirect('/loja?erro=item');
    if (erro instanceof ContaSemAcesso) redirect(`${voltar}&erro=conta`);
    throw erro;
  }
  revalidatePath('/', 'layout');
  redirect(`${voltar}&comprado=1`);
}
