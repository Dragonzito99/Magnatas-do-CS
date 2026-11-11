'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { exigirAcesso } from '@/auth/guarda';
import { obterBd } from '@/bd/conexao';
import { marcarEnviado } from '@/dominio/envios';
import { SemPermissao } from '@/dominio/equipe';
import { definirCustoDoMes } from '@/dominio/meta-do-mes';

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

/** O custo mensal do clube, em reais, para a meta do Apoie o clube. */
export async function salvarCusto(dados: FormData): Promise<void> {
  const ator = await exigirAcesso('/painel/envios');
  const texto = String(dados.get('custo') ?? '').trim();
  // "1.250,00" (jeito brasileiro) ou "250.50": com vírgula, os pontos são de milhar.
  const reais = Number(texto.includes(',') ? texto.replace(/\./g, '').replace(',', '.') : texto);
  const centavos = Math.round(reais * 100);
  if (!Number.isFinite(reais) || centavos <= 0) redirect('/painel/envios?erro=custo');
  try {
    await definirCustoDoMes(obterBd(), ator, centavos);
  } catch (erro) {
    if (erro instanceof SemPermissao) redirect('/painel');
    throw erro;
  }
  revalidatePath('/painel/envios');
  revalidatePath('/apoio');
  redirect('/painel/envios?aviso=custo');
}
