'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { exigirAcesso } from '@/auth/guarda';
import { obterBd } from '@/bd/conexao';
import { SemPermissao } from '@/dominio/equipe';
import { AjusteInvalido, ajustarGrana, SaldoInsuficiente } from '@/dominio/grana';

/** O Adm dá (número positivo) ou tira (negativo) Grana de uma conta, sempre com motivo. */
export async function ajustar(dados: FormData): Promise<void> {
  const ator = await exigirAcesso('/painel/grana');
  const alvo = String(dados.get('alvo') ?? '');
  if (!z.uuid().safeParse(alvo).success) redirect('/painel/grana?erro=ajuste');
  const voltar = `/painel/grana?conta=${alvo}`;
  try {
    await ajustarGrana(obterBd(), ator, alvo, Number(dados.get('quantidade')), String(dados.get('motivo') ?? ''));
  } catch (erro) {
    if (erro instanceof AjusteInvalido) redirect(`${voltar}&erro=ajuste`);
    if (erro instanceof SaldoInsuficiente) redirect(`${voltar}&erro=saldo`);
    if (erro instanceof SemPermissao) redirect('/painel');
    throw erro;
  }
  revalidatePath('/', 'layout');
  redirect(`${voltar}&aviso=ajustado`);
}
