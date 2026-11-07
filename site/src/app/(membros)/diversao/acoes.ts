'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { exigirAcesso } from '@/auth/guarda';
import { obterBd } from '@/bd/conexao';
import { lerModo } from '@/dominio/diversao';
import { adiarDesligamento, LimiteDeServidores, maximoDeLigados, pedirParaLigar, ServidorIndisponivel } from '@/dominio/sob-demanda';
import { controladorDoAmbiente } from '@/servidor-jogo/controlador';
import { diversaoDoAmbiente } from '@/servidor-jogo/diversao-do-ambiente';

function voltar(modo: string | null, erro?: string): string {
  const parametros = new URLSearchParams();
  if (modo) parametros.set('modo', modo);
  if (erro) parametros.set('erro', erro);
  const texto = parametros.toString();
  return texto ? `/jogar?${texto}` : '/jogar';
}

export async function ligar(dados: FormData): Promise<void> {
  const ator = await exigirAcesso('/jogar');
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
  revalidatePath('/jogar');
  redirect(voltar(modo, erro));
}

/** Chamado ao clicar em Entrar ou Copiar: a pessoa ainda vai conectar, então o servidor ganha mais 5 minutos. */
export async function avisarEntrada(servidorId: string): Promise<void> {
  await exigirAcesso('/jogar');
  const id = z.uuid().safeParse(servidorId);
  if (id.success) await adiarDesligamento(obterBd(), id.data);
}
