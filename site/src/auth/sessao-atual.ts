import { cookies } from 'next/headers';
import { obterBd } from '@/bd/conexao';
import type { Usuario } from '@/bd/esquema';
import { encerrarSessao, lerSessao } from './sessoes';

export const COOKIE_SESSAO = 'magnatas_sessao';
export const COOKIE_CONVITE = 'magnatas_convite';
const TRINTA_DIAS_S = 30 * 24 * 60 * 60;

export function enderecoDoSite(): string {
  return process.env.SITE_URL ?? 'http://localhost:3000';
}

export function opcoesDoCookie(duracaoSegundos: number) {
  return {
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: enderecoDoSite().startsWith('https://'),
    path: '/',
    maxAge: duracaoSegundos,
  };
}

export async function usuarioAtual(): Promise<Usuario | null> {
  const token = (await cookies()).get(COOKIE_SESSAO)?.value;
  return token ? lerSessao(obterBd(), token) : null;
}

export async function guardarSessao(token: string): Promise<void> {
  (await cookies()).set(COOKIE_SESSAO, token, opcoesDoCookie(TRINTA_DIAS_S));
}

export async function apagarSessaoAtual(): Promise<void> {
  const lista = await cookies();
  const token = lista.get(COOKIE_SESSAO)?.value;
  if (token) await encerrarSessao(obterBd(), token);
  lista.delete(COOKIE_SESSAO);
}
