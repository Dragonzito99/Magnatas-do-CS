'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { exigirAcesso } from '@/auth/guarda';
import { obterBd } from '@/bd/conexao';
import { marcarEnviado } from '@/dominio/envios';
import { SemPermissao } from '@/dominio/equipe';

export async function marcar(dados: FormData): Promise<void> {
  const ator = await exigirAcesso('/painel/envios');
  const envio = String(dados.get('envio') ?? '');
  if (!z.uuid().safeParse(envio).success) redirect('/painel/envios');
  try {
    await marcarEnviado(obterBd(), ator, envio, String(dados.get('rastreio') ?? ''));
  } catch (erro) {
    if (erro instanceof SemPermissao) redirect('/painel');
    throw erro;
  }
  revalidatePath('/painel/envios');
  redirect('/painel/envios');
}
