'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { exigirAcesso } from '@/auth/guarda';
import { obterBd } from '@/bd/conexao';
import { ContaSemAcesso } from '@/dominio/disponibilidade';
import { EnderecoInvalido, salvarEndereco } from '@/dominio/envios';
import { SemPermissao } from '@/dominio/equipe';
import { ORDEM_DOS_NIVEIS, type NivelDeMembro } from '@/dominio/membros';
import { abrirPedido, assinar, cancelarAssinatura, EmailInvalido, JaEhMembro, PACOTES, type Pacote } from '@/dominio/pagamentos';
import { mercadoPago } from '@/pagamento/mercadopago';

function conexao() {
  const token = process.env.MP_ACCESS_TOKEN;
  if (!token) redirect('/apoio?erro=desligado');
  return { mp: mercadoPago(token), enderecos: { site: (process.env.SITE_URL ?? 'http://localhost:3000').replace(/\/$/, '') } };
}

/** Leva para a página de pagamento do Mercado Pago (PIX ou cartão). */
export async function comprarPacote(dados: FormData): Promise<void> {
  const usuario = await exigirAcesso('/apoio');
  const pacote = String(dados.get('pacote') ?? '') as Pacote;
  if (!(pacote in PACOTES)) redirect('/apoio?erro=pacote');
  const { mp, enderecos } = conexao();
  let destino: string;
  try {
    destino = await abrirPedido(obterBd(), mp, usuario, pacote, enderecos);
  } catch (erro) {
    if (erro instanceof ContaSemAcesso) redirect('/apoio?erro=conta');
    console.error('[apoio] Falha ao abrir o pagamento:', erro instanceof Error ? erro.message : 'erro');
    redirect('/apoio?erro=mercadopago');
  }
  redirect(destino);
}

/** Leva para o Mercado Pago, onde a pessoa autoriza a cobrança mensal no cartão. */
export async function assinarNivel(dados: FormData): Promise<void> {
  const usuario = await exigirAcesso('/apoio');
  const nivel = String(dados.get('nivel') ?? '') as NivelDeMembro;
  if (!ORDEM_DOS_NIVEIS.includes(nivel)) redirect('/apoio?erro=nivel');
  const { mp, enderecos } = conexao();
  let destino: string;
  try {
    destino = await assinar(obterBd(), mp, usuario, nivel, String(dados.get('email') ?? ''), enderecos);
  } catch (erro) {
    if (erro instanceof EmailInvalido) redirect('/apoio?erro=email#membros');
    if (erro instanceof JaEhMembro) redirect('/apoio?erro=membro#membros');
    if (erro instanceof ContaSemAcesso) redirect('/apoio?erro=conta');
    console.error('[apoio] Falha ao criar a assinatura:', erro instanceof Error ? erro.message : 'erro');
    redirect('/apoio?erro=mercadopago');
  }
  redirect(destino);
}

export async function cancelar(): Promise<void> {
  const usuario = await exigirAcesso('/apoio');
  const { mp } = conexao();
  try {
    await cancelarAssinatura(obterBd(), mp, usuario);
  } catch (erro) {
    console.error('[apoio] Falha ao cancelar:', erro instanceof Error ? erro.message : 'erro');
    redirect('/apoio?erro=mercadopago#membros');
  }
  revalidatePath('/', 'layout');
  redirect('/apoio?aviso=cancelada#membros');
}

export async function salvarMeuEndereco(dados: FormData): Promise<void> {
  const usuario = await exigirAcesso('/apoio');
  const campo = (nome: string) => String(dados.get(nome) ?? '');
  try {
    await salvarEndereco(obterBd(), usuario, {
      nome: campo('nome'),
      cep: campo('cep'),
      rua: campo('rua'),
      numero: campo('numero'),
      complemento: campo('complemento'),
      bairro: campo('bairro'),
      cidade: campo('cidade'),
      uf: campo('uf'),
      telefone: campo('telefone'),
    });
  } catch (erro) {
    if (erro instanceof EnderecoInvalido) redirect(`/apoio?erro=endereco&campo=${erro.campo}#premium`);
    if (erro instanceof SemPermissao) redirect('/apoio?erro=premium#premium');
    throw erro;
  }
  redirect('/apoio?aviso=endereco#premium');
}
