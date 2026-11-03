'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { exigirAcesso } from '@/auth/guarda';
import { obterBd } from '@/bd/conexao';
import { analisarDenuncia, atenderChamado, ChamadoIndisponivel, ConclusaoInvalida, DenunciaIndisponivel } from '@/dominio/denuncias';
import { SemPermissao } from '@/dominio/equipe';

function idDe(dados: FormData, campo: string): string {
  const lido = z.uuid().safeParse(dados.get(campo));
  if (!lido.success) redirect('/equipe/casos');
  return lido.data;
}

export async function atender(dados: FormData) {
  const chamadoId = idDe(dados, 'chamadoId');
  const ator = await exigirAcesso('/equipe/casos');
  let partidaId: string;
  try {
    ({ partidaId } = await atenderChamado(obterBd(), ator, chamadoId));
  } catch (erro) {
    if (erro instanceof SemPermissao) redirect('/equipe/casos?erro=jogando');
    if (erro instanceof ChamadoIndisponivel) redirect('/equipe/casos?erro=chamado');
    throw erro;
  }
  revalidatePath('/equipe/casos');
  redirect(`/partidas/${partidaId}`);
}

export async function analisar(dados: FormData) {
  const denunciaId = idDe(dados, 'denunciaId');
  const ator = await exigirAcesso('/equipe/casos');
  try {
    await analisarDenuncia(obterBd(), ator, denunciaId, String(dados.get('conclusao') ?? ''));
  } catch (erro) {
    if (erro instanceof SemPermissao) redirect('/equipe/casos?erro=propria');
    if (erro instanceof ConclusaoInvalida) redirect('/equipe/casos?erro=conclusao');
    if (erro instanceof DenunciaIndisponivel) redirect('/equipe/casos?erro=denuncia');
    throw erro;
  }
  revalidatePath('/equipe/casos');
}
