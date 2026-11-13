'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { exigirAcesso } from '@/auth/guarda';
import { obterBd } from '@/bd/conexao';
import type { Papel, Usuario } from '@/bd/esquema';
import { AlvoIndisponivel, liberarSuspensao, MotivoDaPunicaoInvalido, suspender } from '@/dominio/banimentos';
import { darConvites, mudarPapel, SemPermissao, UltimoAdm } from '@/dominio/equipe';
import { ajustarGrana, ajustarMagcoin, AjusteInvalido, SaldoInsuficiente } from '@/dominio/grana';
import { controladorDoAmbiente } from '@/servidor-jogo/controlador';

const PAPEIS: Papel[] = ['jogador', 'gm', 'adm'];

/**
 * As ações da ficha do usuário no Painel ADM. Cada uma confere a permissão de novo no domínio e volta para a ficha com
 * um aviso (deu certo) ou um erro (o que corrigir).
 */
async function naFicha(dados: FormData, acao: (ator: Usuario, alvoId: string) => Promise<void>, aviso: string): Promise<void> {
  const alvo = z.uuid().safeParse(dados.get('alvo'));
  if (!alvo.success) redirect('/painel/usuarios');
  const ficha = `/painel/usuarios/${alvo.data}`;
  const ator = await exigirAcesso(ficha);
  try {
    await acao(ator, alvo.data);
  } catch (erro) {
    if (erro instanceof SemPermissao) redirect(`${ficha}?erro=permissao`);
    if (erro instanceof UltimoAdm) redirect(`${ficha}?erro=ultimo-adm`);
    if (erro instanceof SaldoInsuficiente) redirect(`${ficha}?erro=saldo`);
    if (erro instanceof AjusteInvalido) redirect(`${ficha}?erro=ajuste`);
    if (erro instanceof MotivoDaPunicaoInvalido) redirect(`${ficha}?erro=motivo`);
    if (erro instanceof AlvoIndisponivel) redirect(`${ficha}?erro=situacao`);
    throw erro;
  }
  revalidatePath(ficha);
  redirect(`${ficha}?aviso=${aviso}`);
}

const texto = (dados: FormData, campo: string) => String(dados.get(campo) ?? '').trim();
const inteiro = (dados: FormData, campo: string) => Number(dados.get(campo));

export async function trocarCargo(dados: FormData) {
  const papel = texto(dados, 'papel') as Papel;
  await naFicha(
    dados,
    async (ator, alvo) => {
      if (!PAPEIS.includes(papel)) throw new SemPermissao();
      await mudarPapel(obterBd(), ator, alvo, papel);
    },
    'cargo',
  );
}

export async function darConvitesNaFicha(dados: FormData) {
  const quantidade = inteiro(dados, 'quantidade');
  await naFicha(
    dados,
    async (ator, alvo) => {
      if (!Number.isInteger(quantidade) || quantidade < 1 || quantidade > 100) throw new AjusteInvalido();
      await darConvites(obterBd(), ator, alvo, quantidade);
    },
    'convites',
  );
}

export async function ajustarGranaNaFicha(dados: FormData) {
  await naFicha(dados, (ator, alvo) => ajustarGrana(obterBd(), ator, alvo, inteiro(dados, 'quantidade'), texto(dados, 'motivo')), 'grana');
}

export async function ajustarMagcoinNaFicha(dados: FormData) {
  await naFicha(dados, (ator, alvo) => ajustarMagcoin(obterBd(), ator, alvo, inteiro(dados, 'quantidade'), texto(dados, 'motivo')), 'magcoin');
}

export async function suspenderNaFicha(dados: FormData) {
  await naFicha(dados, (ator, alvo) => suspender(obterBd(), controladorDoAmbiente(), ator, alvo, texto(dados, 'motivo')), 'suspensa');
}

export async function liberarNaFicha(dados: FormData) {
  await naFicha(dados, (ator, alvo) => liberarSuspensao(obterBd(), ator, alvo, texto(dados, 'motivo')), 'liberada');
}
