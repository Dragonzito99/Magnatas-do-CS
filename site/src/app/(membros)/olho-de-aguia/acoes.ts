'use server';

import { eq } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { exigirAcesso } from '@/auth/guarda';
import { obterBd } from '@/bd/conexao';
import { partidas } from '@/bd/esquema';
import { AlvoIndisponivel, MotivoDaPunicaoInvalido, proporBanimento, PropostaJaAberta, suspender } from '@/dominio/banimentos';
import { atenderChamado, ChamadoIndisponivel, ConclusaoInvalida, DenunciaIndisponivel } from '@/dominio/denuncias';
import { SemPermissao } from '@/dominio/equipe';
import { encerrarCaso, motivoDaProposta } from '@/dominio/olho-de-aguia';
import { controladorDoAmbiente } from '@/servidor-jogo/controlador';

const CAMINHO = '/olho-de-aguia';

function idDe(dados: FormData, campo: string): string {
  const lido = z.uuid().safeParse(dados.get(campo));
  if (!lido.success) redirect(CAMINHO);
  return lido.data;
}

function codigoDoErro(erro: unknown): string | null {
  if (erro instanceof ConclusaoInvalida || erro instanceof MotivoDaPunicaoInvalido) return 'conclusao';
  if (erro instanceof DenunciaIndisponivel) return 'denuncia';
  if (erro instanceof AlvoIndisponivel) return 'alvo';
  if (erro instanceof PropostaJaAberta) return 'proposta';
  if (erro instanceof SemPermissao) return 'permissao';
  return null;
}

function voltarComErro(chave: string, erro: unknown): void {
  const codigo = codigoDoErro(erro);
  if (codigo) redirect(`${CAMINHO}?caso=${chave}&erro=${codigo}`);
  throw erro;
}

export async function atender(dados: FormData) {
  const chamadoId = idDe(dados, 'chamadoId');
  const ator = await exigirAcesso(CAMINHO);
  let partidaId: string;
  try {
    ({ partidaId } = await atenderChamado(obterBd(), ator, chamadoId));
  } catch (erro) {
    if (erro instanceof SemPermissao) redirect(`${CAMINHO}?erro=jogando`);
    if (erro instanceof ChamadoIndisponivel) redirect(`${CAMINHO}?erro=chamado`);
    throw erro;
  }
  revalidatePath(CAMINHO);
  redirect(`/partidas/${partidaId}`);
}

export async function encerrar(dados: FormData) {
  const partidaId = idDe(dados, 'partidaId');
  const texto = String(dados.get('acusadoId') ?? '');
  const acusadoId = texto ? idDe(dados, 'acusadoId') : null;
  const ator = await exigirAcesso(CAMINHO);
  try {
    await encerrarCaso(obterBd(), ator, { partidaId, acusadoId }, String(dados.get('conclusao') ?? ''));
  } catch (erro) {
    const chave = `${partidaId}:${acusadoId ?? 'a-definir'}`;
    if (erro instanceof SemPermissao) redirect(`${CAMINHO}?caso=${chave}&erro=propria`);
    voltarComErro(chave, erro);
  }
  revalidatePath(CAMINHO);
}

export async function suspenderDoCaso(dados: FormData) {
  const partidaId = idDe(dados, 'partidaId');
  const acusadoId = idDe(dados, 'acusadoId');
  const ator = await exigirAcesso(CAMINHO);
  try {
    await suspender(obterBd(), controladorDoAmbiente(), ator, acusadoId, String(dados.get('conclusao') ?? ''));
  } catch (erro) {
    voltarComErro(`${partidaId}:${acusadoId}`, erro);
  }
  revalidatePath(CAMINHO);
}

export async function proporDoCaso(dados: FormData) {
  const partidaId = idDe(dados, 'partidaId');
  const acusadoId = idDe(dados, 'acusadoId');
  const ator = await exigirAcesso(CAMINHO);
  const bd = obterBd();
  const [partida] = await bd.select({ tipo: partidas.tipo, numero: partidas.numero }).from(partidas).where(eq(partidas.id, partidaId));
  if (!partida) redirect(CAMINHO);
  try {
    await proporBanimento(bd, ator, acusadoId, motivoDaProposta(partida, String(dados.get('conclusao') ?? '')));
  } catch (erro) {
    voltarComErro(`${partidaId}:${acusadoId}`, erro);
  }
  revalidatePath(CAMINHO);
}
