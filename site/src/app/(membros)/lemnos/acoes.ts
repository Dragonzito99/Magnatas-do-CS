'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { exigirAcesso } from '@/auth/guarda';
import { obterBd } from '@/bd/conexao';
import { ContaSemAcesso } from '@/dominio/disponibilidade';
import { SaldoInsuficiente } from '@/dominio/grana';
import { ilhaAberta } from '@/dominio/lemnos/estatisticas';
import { EmCampo, escolherKit } from '@/dominio/lemnos/kit';
import { comprarArmaComMagcoin, comprarComGrana, comprarMochila, venderSaque } from '@/dominio/lemnos/mercado';
import { DIAS_A_VENDA, ItemInvalido, JaEhSeu, type DiasAVenda } from '@/dominio/loja';

const texto = (dados: FormData, campo: string) => String(dados.get(campo) ?? '');
const ouNulo = (valor: string) => (valor === '' ? null : valor);
const dias = (valor: string): DiasAVenda | null => (valor === 'sempre' ? null : (DIAS_A_VENDA.find((opcao) => String(opcao) === valor) ?? 1));

async function naIlha(destino: string) {
  const usuario = await exigirAcesso(destino);
  if (!(await ilhaAberta(obterBd(), usuario))) redirect('/inicio');
  return usuario;
}

/** Traduz o erro do domínio para o aviso da tela e volta para ela. */
async function tentar(destino: string, fazer: () => Promise<unknown>, ok: string): Promise<never> {
  try {
    await fazer();
  } catch (erro) {
    if (erro instanceof SaldoInsuficiente) redirect(`${destino}?erro=${erro.moeda === 'grana' ? 'grana' : 'magcoin'}`);
    if (erro instanceof EmCampo) redirect(`${destino}?erro=em-campo`);
    if (erro instanceof JaEhSeu) redirect(`${destino}?erro=ja-seu`);
    if (erro instanceof ItemInvalido) redirect(`${destino}?erro=item`);
    if (erro instanceof ContaSemAcesso) redirect(`${destino}?erro=conta`);
    throw erro;
  }
  revalidatePath('/', 'layout');
  redirect(`${destino}?ok=${ok}`);
}

export async function escolher(dados: FormData): Promise<void> {
  const usuario = await naIlha('/lemnos');
  const granadas = ['granada1', 'granada2', 'granada3', 'granada4'].map((campo) => texto(dados, campo)).filter((valor) => valor !== '');
  await tentar(
    '/lemnos',
    () => escolherKit(obterBd(), usuario, { principal: ouNulo(texto(dados, 'principal')), secundaria: ouNulo(texto(dados, 'secundaria')), granadas, mochila: ouNulo(texto(dados, 'mochila')) }),
    'kit',
  );
}

export async function comprarGrana(dados: FormData): Promise<void> {
  const usuario = await naIlha('/lemnos/mercado');
  await tentar(
    '/lemnos/mercado',
    () => comprarComGrana(obterBd(), usuario, { itemId: texto(dados, 'itemId'), quantidade: Number(texto(dados, 'quantidade')), codigo: texto(dados, 'codigo') }),
    'compra',
  );
}

export async function comprarMagcoin(dados: FormData): Promise<void> {
  const usuario = await naIlha('/lemnos/mercado');
  await tentar('/lemnos/mercado', () => comprarArmaComMagcoin(obterBd(), usuario, { itemId: texto(dados, 'itemId'), dias: dias(texto(dados, 'dias')), codigo: texto(dados, 'codigo') }), 'compra');
}

export async function comprarUmaMochila(dados: FormData): Promise<void> {
  const usuario = await naIlha('/lemnos/mercado');
  await tentar('/lemnos/mercado', () => comprarMochila(obterBd(), usuario, { itemId: texto(dados, 'itemId'), dias: dias(texto(dados, 'dias')), codigo: texto(dados, 'codigo') }), 'compra');
}

export async function vender(dados: FormData): Promise<void> {
  const usuario = await naIlha('/lemnos/mercado');
  await tentar('/lemnos/mercado', () => venderSaque(obterBd(), usuario, { linhas: dados.getAll('linha').map(String), codigo: texto(dados, 'codigo') }), 'venda');
}
