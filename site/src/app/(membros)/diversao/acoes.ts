'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { exigirAcesso } from '@/auth/guarda';
import { obterBd } from '@/bd/conexao';
import { lerModo } from '@/dominio/diversao';
import { LimiteDeServidores, maximoDeLigados, pedirParaLigar, ServidorIndisponivel } from '@/dominio/sob-demanda';
import { controladorDoAmbiente } from '@/servidor-jogo/controlador';
import { diversaoDoAmbiente } from '@/servidor-jogo/diversao-do-ambiente';

function voltar(modo: string | null, erro?: string): string {
  const parametros = new URLSearchParams();
  if (modo) parametros.set('modo', modo);
  if (erro) parametros.set('erro', erro);
  const texto = parametros.toString();
  return texto ? `/diversao?${texto}` : '/diversao';
}

export async function ligar(dados: FormData): Promise<void> {
  const ator = await exigirAcesso('/diversao');
  const modo = lerModo(String(dados.get('modo') ?? ''));
  const servidorId = z.uuid().safeParse(dados.get('servidor'));
  if (!servidorId.success) redirect(voltar(modo, 'indisponivel'));
  let erro: string | undefined;
  try {
    const { controle } = diversaoDoAmbiente(controladorDoAmbiente());
    await pedirParaLigar(obterBd(), controle, servidorId.data, ator, maximoDeLigados(process.env.DIVERSAO_MAXIMO_LIGADOS));
  } catch (falha) {
    if (falha instanceof LimiteDeServidores) erro = 'limite';
    else if (falha instanceof ServidorIndisponivel) erro = 'indisponivel';
    else throw falha;
  }
  revalidatePath('/diversao');
  redirect(voltar(modo, erro));
}
