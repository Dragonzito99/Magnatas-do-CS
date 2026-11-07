'use server';

import { usuarioAtual } from '@/auth/sessao-atual';
import { obterBd } from '@/bd/conexao';
import { marcarVisto } from '@/dominio/denuncias';

/** Chamado pela aba escondida: quem foi para o jogo continua no site, e não perde a sala. */
export async function manterPresenca(): Promise<void> {
  const usuario = await usuarioAtual();
  if (usuario?.estado === 'ativo') await marcarVisto(obterBd(), usuario.id);
}
