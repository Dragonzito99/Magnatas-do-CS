'use server';

import { revalidatePath } from 'next/cache';
import { exigirAcesso } from '@/auth/guarda';
import { obterBd } from '@/bd/conexao';
import { desligarManutencao, ligarManutencao } from '@/dominio/manutencao';

/** O Adm liga ou desliga na mão o aviso de servidores em manutenção. */
export async function mudarManutencao(dados: FormData) {
  const ator = await exigirAcesso('/painel');
  if (dados.get('ligar') === 'sim') await ligarManutencao(obterBd(), ator);
  else await desligarManutencao(obterBd(), ator);
  revalidatePath('/', 'layout');
}
