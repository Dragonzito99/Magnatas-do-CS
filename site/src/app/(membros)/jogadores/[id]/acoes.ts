'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { exigirAcesso } from '@/auth/guarda';
import { obterBd } from '@/bd/conexao';
import type { Usuario } from '@/bd/esquema';
import {
  AlvoIndisponivel,
  BanimentoIndisponivel,
  confirmarBanimento,
  liberarSuspensao,
  MotivoDaPunicaoInvalido,
  proporBanimento,
  PropostaJaAberta,
  QuemPropoeNaoConfirma,
  recusarBanimento,
  reverterBanimento,
  suspender,
} from '@/dominio/banimentos';
import { SemPermissao } from '@/dominio/equipe';
import { controladorDoAmbiente } from '@/servidor-jogo/controlador';

function codigoDoErro(erro: unknown): string | null {
  if (erro instanceof MotivoDaPunicaoInvalido) return 'motivo';
  if (erro instanceof AlvoIndisponivel) return 'alvo';
  if (erro instanceof PropostaJaAberta) return 'proposta';
  if (erro instanceof BanimentoIndisponivel) return 'decidido';
  if (erro instanceof QuemPropoeNaoConfirma) return 'quem-propos';
  if (erro instanceof SemPermissao) return 'permissao';
  return null;
}

function idDe(dados: FormData, campo: string): string {
  const lido = z.uuid().safeParse(dados.get(campo));
  if (!lido.success) redirect('/olho-de-aguia');
  return lido.data;
}

async function executar(dados: FormData, acao: (ator: Usuario, jogadorId: string, motivo: string) => Promise<unknown>) {
  const jogadorId = idDe(dados, 'jogadorId');
  const ator = await exigirAcesso(`/jogadores/${jogadorId}`);
  try {
    await acao(ator, jogadorId, String(dados.get('motivo') ?? ''));
  } catch (erro) {
    const codigo = codigoDoErro(erro);
    if (codigo) redirect(`/jogadores/${jogadorId}?erro=${codigo}`);
    throw erro;
  }
  revalidatePath(`/jogadores/${jogadorId}`);
}

export async function suspenderConta(dados: FormData) {
  await executar(dados, (ator, jogadorId, motivo) => suspender(obterBd(), controladorDoAmbiente(), ator, jogadorId, motivo));
}

export async function liberarConta(dados: FormData) {
  await executar(dados, (ator, jogadorId, motivo) => liberarSuspensao(obterBd(), ator, jogadorId, motivo));
}

export async function proporBan(dados: FormData) {
  await executar(dados, (ator, jogadorId, motivo) => proporBanimento(obterBd(), ator, jogadorId, motivo));
}

export async function confirmarBan(dados: FormData) {
  const banimentoId = idDe(dados, 'banimentoId');
  await executar(dados, (ator) => confirmarBanimento(obterBd(), controladorDoAmbiente(), ator, banimentoId));
}

export async function recusarBan(dados: FormData) {
  const banimentoId = idDe(dados, 'banimentoId');
  await executar(dados, (ator, _jogadorId, motivo) => recusarBanimento(obterBd(), ator, banimentoId, motivo));
}

export async function reverterBan(dados: FormData) {
  const banimentoId = idDe(dados, 'banimentoId');
  await executar(dados, (ator, _jogadorId, motivo) => reverterBanimento(obterBd(), ator, banimentoId, motivo));
}
