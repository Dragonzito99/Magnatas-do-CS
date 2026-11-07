'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { exigirAcesso } from '@/auth/guarda';
import { obterBd } from '@/bd/conexao';
import { Bloqueado, ContaSemAcesso, JaOcupado } from '@/dominio/disponibilidade';
import { entrarNoMix, sairDoMix } from '@/dominio/mix';
import { alocarEmSegundoPlano } from '@/servidor-jogo/alocar';

export async function entrar() {
  const ator = await exigirAcesso('/mix');
  const bd = obterBd();
  let partidaId: string | undefined;
  try {
    ({ partidaId } = await entrarNoMix(bd, ator));
  } catch (erro) {
    if (erro instanceof Bloqueado) redirect('/mix?erro=bloqueado');
    if (erro instanceof JaOcupado) redirect('/mix?erro=ocupado');
    if (erro instanceof ContaSemAcesso) redirect('/mix?erro=sem-acesso');
    throw erro;
  }
  if (partidaId) {
    alocarEmSegundoPlano(bd);
    redirect(`/partidas/${partidaId}`);
  }
  revalidatePath('/mix');
}

export async function sair() {
  const ator = await exigirAcesso('/mix');
  await sairDoMix(obterBd(), ator);
  revalidatePath('/mix');
}
