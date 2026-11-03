import { redirect } from 'next/navigation';
import { obterBd } from '@/bd/conexao';
import type { Usuario } from '@/bd/esquema';
import { marcarVisto } from '@/dominio/denuncias';
import { destinoPara } from './destino';
import { usuarioAtual } from './sessao-atual';

/** Toda página protegida chama isto, para uma conta banida perder o acesso na hora. */
export async function exigirAcesso(caminho: string): Promise<Usuario> {
  const usuario = await usuarioAtual();
  const destino = destinoPara(usuario, caminho);
  if (destino) redirect(destino);
  if (!usuario) redirect('/');
  await marcarVisto(obterBd(), usuario.id);
  return usuario;
}
