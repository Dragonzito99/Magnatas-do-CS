'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { exigirAcesso } from '@/auth/guarda';
import { obterBd } from '@/bd/conexao';
import { Bloqueado, ContaSemAcesso, JaOcupado } from '@/dominio/disponibilidade';
import { EmManutencao } from '@/dominio/manutencao';
import { entrarNoMix, sairDoMix } from '@/dominio/mix';
import { alocarEmSegundoPlano } from '@/servidor-jogo/alocar';

export async function entrar() {
  const ator = await exigirAcesso('/jogar');
  const bd = obterBd();
  let partidaId: string | undefined;
  try {
    ({ partidaId } = await entrarNoMix(bd, ator));
  } catch (erro) {
    if (erro instanceof Bloqueado) redirect('/jogar?modo=mix&erro=bloqueado');
    if (erro instanceof JaOcupado) redirect('/jogar?modo=mix&erro=ocupado');
    if (erro instanceof ContaSemAcesso) redirect('/jogar?modo=mix&erro=sem-acesso');
    if (erro instanceof EmManutencao) redirect('/jogar?modo=mix&erro=manutencao');
    throw erro;
  }
  if (partidaId) {
    alocarEmSegundoPlano(bd);
    redirect(`/partidas/${partidaId}`);
  }
  revalidatePath('/jogar');
}

export async function sair() {
  const ator = await exigirAcesso('/jogar');
  await sairDoMix(obterBd(), ator);
  revalidatePath('/jogar');
}
