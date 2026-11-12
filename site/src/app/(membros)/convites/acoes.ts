'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { obterBd } from '@/bd/conexao';
import { usuarioAtual } from '@/auth/sessao-atual';
import { ConviteInvalido, gerarConvite, gerarConviteComPresente, PresenteDoConviteInvalido, revogarConvite, SemConvites } from '@/dominio/convites';
import { SemPermissao } from '@/dominio/equipe';

const DIA_MS = 24 * 60 * 60 * 1000;
// Arquivo de ações só exporta funções: a página repete este número.
const LINHAS_DE_ITENS = 3;

export async function gerar() {
  const ator = await usuarioAtual();
  if (!ator) redirect('/');
  try {
    await gerarConvite(obterBd(), ator);
  } catch (erro) {
    if (erro instanceof SemConvites) redirect('/convites?erro=sem-convites');
    throw erro;
  }
  revalidatePath('/convites');
}

const inteiro = (valor: FormDataEntryValue | null) => {
  const texto = String(valor ?? '').trim();
  return texto === '' ? 0 : Number(texto);
};

/** Convite com presente (só Adm): até 3 itens com os dias, Grana, MagCoins, recado e, se quiser, quantos dias vale. */
export async function gerarComPresente(dados: FormData) {
  const ator = await usuarioAtual();
  if (!ator) redirect('/');
  const itens = Array.from({ length: LINHAS_DE_ITENS }, (_, indice) => ({
    itemId: String(dados.get(`item_${indice}`) ?? ''),
    dias: inteiro(dados.get(`dias_${indice}`)),
  })).filter((linha) => linha.itemId !== '');
  const validade = inteiro(dados.get('validade'));
  let codigo: string;
  try {
    codigo = await gerarConviteComPresente(obterBd(), ator, {
      itens,
      grana: inteiro(dados.get('grana')),
      magcoin: inteiro(dados.get('magcoin')),
      recado: String(dados.get('recado') ?? ''),
      venceEm: Number.isInteger(validade) && validade > 0 ? new Date(Date.now() + validade * DIA_MS) : null,
    });
  } catch (erro) {
    if (erro instanceof PresenteDoConviteInvalido) redirect('/convites?erro=presente#criar');
    if (erro instanceof SemPermissao) redirect('/convites');
    throw erro;
  }
  revalidatePath('/convites');
  redirect(`/convites?novo=${codigo}`);
}

export async function revogar(dados: FormData) {
  const ator = await usuarioAtual();
  if (!ator) redirect('/');
  try {
    await revogarConvite(obterBd(), ator, String(dados.get('codigo') ?? ''));
  } catch (erro) {
    if (erro instanceof ConviteInvalido) redirect('/convites?erro=revogar');
    throw erro;
  }
  revalidatePath('/convites');
}
