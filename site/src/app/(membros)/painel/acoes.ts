'use server';

import { redirect } from 'next/navigation';
import { exigirAcesso } from '@/auth/guarda';
import { obterBd } from '@/bd/conexao';
import { Bloqueado, JaOcupado } from '@/dominio/disponibilidade';
import { criarTesteDoCompetitivo } from '@/dominio/teste-competitivo';

/** O Adm entra numa partida sozinho contra bots e cai direto na tela dela. */
export async function testarCompetitivo(): Promise<void> {
  const adm = await exigirAcesso('/painel');
  let partidaId: string;
  try {
    partidaId = (await criarTesteDoCompetitivo(obterBd(), adm)).id;
  } catch (erro) {
    if (erro instanceof JaOcupado || erro instanceof Bloqueado) redirect('/painel?erro=ocupado');
    throw erro;
  }
  redirect(`/partidas/${partidaId}`);
}
