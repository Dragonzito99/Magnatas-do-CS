'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { exigirAcesso } from '@/auth/guarda';
import { obterBd } from '@/bd/conexao';
import { SemPermissao } from '@/dominio/equipe';
import { desfazerBanimento } from '@/dominio/lemnos/punicoes';

const PAGINA = '/painel/lemnos';

/** Desfaz um kick ou banimento da ilha que foi injusto. */
export async function desfazer(dados: FormData): Promise<void> {
  const punicao = z.uuid().safeParse(dados.get('punicao'));
  if (!punicao.success) redirect(PAGINA);
  const ator = await exigirAcesso(PAGINA);
  try {
    await desfazerBanimento(obterBd(), ator, punicao.data);
  } catch (erro) {
    if (erro instanceof SemPermissao) redirect(`${PAGINA}?erro=permissao`);
    throw erro;
  }
  revalidatePath(PAGINA);
  redirect(`${PAGINA}?aviso=desfeito`);
}
