'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { exigirAcesso } from '@/auth/guarda';
import { obterBd } from '@/bd/conexao';
import { ContaSemAcesso } from '@/dominio/disponibilidade';
import { SaldoInsuficiente } from '@/dominio/grana';
import { ilhaAberta } from '@/dominio/lemnos/estatisticas';
import { EmCampo, escolherKit, kitDe, type KitEscolhido } from '@/dominio/lemnos/kit';
import { comprarArmaComMagcoin, comprarComGrana, comprarMochila, venderSaque } from '@/dominio/lemnos/mercado';
import { DIAS_A_VENDA, ItemInvalido, JaEhSeu, type DiasAVenda } from '@/dominio/loja';

const texto = (dados: FormData, campo: string) => String(dados.get(campo) ?? '');
const dias = (valor: string): DiasAVenda | null => (valor === 'sempre' ? null : (DIAS_A_VENDA.find((opcao) => String(opcao) === valor) ?? 1));

async function naIlha(destino: string) {
  const usuario = await exigirAcesso(destino);
  if (!(await ilhaAberta(obterBd(), usuario))) redirect('/inicio');
  return usuario;
}

/** O endereço de volta, com o aviso: mantém a aba e o item que estavam abertos. */
function voltar(base: string, dados: FormData, aviso: Record<string, string>): string {
  const parametros = new URLSearchParams();
  for (const campo of ['aba', 'item']) {
    const valor = texto(dados, campo);
    if (/^[a-z0-9_]{1,30}$/.test(valor)) parametros.set(campo, valor);
  }
  for (const [chave, valor] of Object.entries(aviso)) parametros.set(chave, valor);
  return `${base}?${parametros.toString()}`;
}

/** Traduz o erro do domínio para o aviso da tela e volta para ela. */
async function tentar(base: string, dados: FormData, fazer: () => Promise<unknown>, ok: string): Promise<never> {
  try {
    await fazer();
  } catch (erro) {
    if (erro instanceof SaldoInsuficiente) redirect(voltar(base, dados, { erro: erro.moeda === 'grana' ? 'grana' : 'magcoin' }));
    if (erro instanceof EmCampo) redirect(voltar(base, dados, { erro: 'em-campo' }));
    if (erro instanceof JaEhSeu) redirect(voltar(base, dados, { erro: 'ja-seu' }));
    if (erro instanceof ItemInvalido) redirect(voltar(base, dados, { erro: 'item' }));
    if (erro instanceof ContaSemAcesso) redirect(voltar(base, dados, { erro: 'conta' }));
    throw erro;
  }
  revalidatePath('/', 'layout');
  redirect(voltar(base, dados, { ok }));
}

export type RespostaDoKit = { ok: true } | { ok: false; erro: 'em-campo' | 'item' | 'conta' };

/**
 * Troca uma peça do kit (arrastando, pela janela ou tirando uma granada). Não recarrega a página: responde se deu certo,
 * e a tela se atualiza no lugar, sem voltar para o topo (dono, 15/11/2026). lugar: principal, secundaria, mochila ou
 * granada; na granada, "por" acrescenta uma e "tirar" tira a da posição.
 */
export async function mexerNoKit(dados: FormData): Promise<RespostaDoKit> {
  const usuario = await naIlha('/lemnos');
  const atual = await kitDe(obterBd(), usuario.id);
  const valor = texto(dados, 'valor') || null;
  const lugar = texto(dados, 'lugar');
  const novo: KitEscolhido = { ...atual, granadas: [...atual.granadas] };
  if (lugar === 'principal') novo.principal = valor;
  if (lugar === 'secundaria') novo.secundaria = valor;
  if (lugar === 'mochila') novo.mochila = valor;
  if (lugar === 'granada' && texto(dados, 'acao') === 'por' && valor) novo.granadas.push(valor);
  if (lugar === 'granada' && texto(dados, 'acao') === 'tirar') novo.granadas.splice(Number(texto(dados, 'indice')), 1);
  try {
    await escolherKit(obterBd(), usuario, novo);
  } catch (erro) {
    if (erro instanceof EmCampo) return { ok: false, erro: 'em-campo' };
    if (erro instanceof ItemInvalido) return { ok: false, erro: 'item' };
    if (erro instanceof ContaSemAcesso) return { ok: false, erro: 'conta' };
    throw erro;
  }
  revalidatePath('/lemnos');
  return { ok: true };
}

export async function comprarGrana(dados: FormData): Promise<void> {
  const usuario = await naIlha('/lemnos/mercado');
  await tentar(
    '/lemnos/mercado',
    dados,
    () => comprarComGrana(obterBd(), usuario, { itemId: texto(dados, 'itemId'), quantidade: Number(texto(dados, 'quantidade')), codigo: texto(dados, 'codigo') }),
    'compra',
  );
}

export async function comprarMagcoin(dados: FormData): Promise<void> {
  const usuario = await naIlha('/lemnos/mercado');
  await tentar('/lemnos/mercado', dados, () => comprarArmaComMagcoin(obterBd(), usuario, { itemId: texto(dados, 'itemId'), dias: dias(texto(dados, 'dias')), codigo: texto(dados, 'codigo') }), 'compra');
}

export async function comprarUmaMochila(dados: FormData): Promise<void> {
  const usuario = await naIlha('/lemnos/mercado');
  await tentar('/lemnos/mercado', dados, () => comprarMochila(obterBd(), usuario, { itemId: texto(dados, 'itemId'), dias: dias(texto(dados, 'dias')), codigo: texto(dados, 'codigo') }), 'compra');
}

export async function vender(dados: FormData): Promise<void> {
  const usuario = await naIlha('/lemnos/mercado');
  await tentar('/lemnos/mercado', dados, () => venderSaque(obterBd(), usuario, { linhas: dados.getAll('linha').map(String), codigo: texto(dados, 'codigo') }), 'venda');
}
