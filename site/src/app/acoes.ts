'use server';

import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { obterBd } from '@/bd/conexao';
import { criarLimitador } from '@/auth/limite';
import { COOKIE_CONVITE, opcoesDoCookie } from '@/auth/sessao-atual';
import { conviteValido } from '@/dominio/convites';

const QUINZE_MINUTOS_S = 15 * 60;
const permitirTentativa = criarLimitador(10, 60_000);

export async function entrarComConvite(dados: FormData) {
  const codigo = String(dados.get('codigo') ?? '').trim();
  const ip = (await headers()).get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'local';
  if (!permitirTentativa(ip)) redirect('/?erro=limite');
  if (!codigo || !(await conviteValido(obterBd(), codigo))) redirect('/?erro=convite');

  (await cookies()).set(COOKIE_CONVITE, codigo, opcoesDoCookie(QUINZE_MINUTOS_S));
  redirect('/api/auth/steam');
}
