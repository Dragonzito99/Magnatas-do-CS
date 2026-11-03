import { NextResponse } from 'next/server';
import { enderecoDoSite } from '@/auth/sessao-atual';
import { urlDeLoginSteam } from '@/auth/steam';

export function GET() {
  return NextResponse.redirect(urlDeLoginSteam(`${enderecoDoSite()}/api/auth/steam/retorno`));
}
