import { NextResponse } from 'next/server';
import { apagarSessaoAtual, enderecoDoSite } from '@/auth/sessao-atual';

export async function POST() {
  await apagarSessaoAtual();
  return NextResponse.redirect(`${enderecoDoSite()}/`, { status: 303 });
}
