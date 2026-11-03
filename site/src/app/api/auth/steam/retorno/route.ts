import { cookies } from 'next/headers';
import { NextResponse, type NextRequest } from 'next/server';
import { obterBd } from '@/bd/conexao';
import { perfilPublicoSteam } from '@/auth/perfil-steam';
import { COOKIE_CONVITE, enderecoDoSite, guardarSessao } from '@/auth/sessao-atual';
import { criarSessao } from '@/auth/sessoes';
import { validarRetornoSteam } from '@/auth/steam';
import { consumirConvite, ConviteInvalido } from '@/dominio/convites';
import { buscarPorSteam } from '@/dominio/usuarios';

export async function GET(pedido: NextRequest) {
  const site = enderecoDoSite();
  const steamid64 = await validarRetornoSteam(pedido.nextUrl.searchParams, `${site}/api/auth/steam/retorno`);
  if (!steamid64) return NextResponse.redirect(`${site}/?erro=steam`);

  const bd = obterBd();
  const lista = await cookies();
  let conta = await buscarPorSteam(bd, steamid64);
  if (!conta) {
    const codigo = lista.get(COOKIE_CONVITE)?.value;
    if (!codigo) return NextResponse.redirect(`${site}/?erro=conta`);
    try {
      conta = await consumirConvite(bd, codigo, { steamid64, ...(await perfilPublicoSteam(steamid64)) });
    } catch (erro) {
      if (erro instanceof ConviteInvalido) return NextResponse.redirect(`${site}/?erro=convite`);
      throw erro;
    }
  }
  lista.delete(COOKIE_CONVITE);

  await guardarSessao(await criarSessao(bd, conta.id));
  return NextResponse.redirect(`${site}/salas`);
}
