import { NextResponse, type NextRequest } from 'next/server';
import { obterBd } from '@/bd/conexao';
import { enderecoDoSite, guardarSessao } from '@/auth/sessao-atual';
import { criarSessao } from '@/auth/sessoes';
import { validarRetornoSteam } from '@/auth/steam';
import { buscarPorSteam } from '@/dominio/usuarios';

export async function GET(pedido: NextRequest) {
  const site = enderecoDoSite();
  const steamid64 = await validarRetornoSteam(pedido.nextUrl.searchParams, `${site}/api/auth/steam/retorno`);
  if (!steamid64) return NextResponse.redirect(`${site}/?erro=steam`);

  const bd = obterBd();
  const conta = await buscarPorSteam(bd, steamid64);
  if (!conta) return NextResponse.redirect(`${site}/?erro=conta`);

  await guardarSessao(await criarSessao(bd, conta.id));
  return NextResponse.redirect(`${site}/salas`);
}
