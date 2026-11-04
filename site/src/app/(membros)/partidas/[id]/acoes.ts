'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { exigirAcesso } from '@/auth/guarda';
import { obterBd } from '@/bd/conexao';
import { AcusadoInvalido, ChamadoIndisponivel, chamarEquipe, denunciar, DenunciaRepetida, MotivoInvalido, NaoJogou } from '@/dominio/denuncias';
import { ContaSemAcesso } from '@/dominio/disponibilidade';
import { SemPermissao } from '@/dominio/equipe';
import { cancelarPartidaPelaEquipe, PartidaIndisponivel } from '@/dominio/varredura';
import { controladorDoAmbiente } from '@/servidor-jogo/controlador';

function codigoDoErro(erro: unknown): string | null {
  if (erro instanceof MotivoInvalido) return 'motivo';
  if (erro instanceof AcusadoInvalido) return 'acusado';
  if (erro instanceof DenunciaRepetida) return 'repetida';
  if (erro instanceof NaoJogou) return 'nao-jogou';
  if (erro instanceof ChamadoIndisponivel) return 'chamado';
  if (erro instanceof ContaSemAcesso) return 'sem-acesso';
  return null;
}

function idDe(dados: FormData, campo: string): string {
  const lido = z.uuid().safeParse(dados.get(campo));
  if (!lido.success) redirect('/salas');
  return lido.data;
}

export async function denunciarJogador(dados: FormData) {
  const partidaId = idDe(dados, 'partidaId');
  const ator = await exigirAcesso(`/partidas/${partidaId}`);
  const acusado = z.uuid().safeParse(dados.get('acusadoId'));
  if (!acusado.success) redirect(`/partidas/${partidaId}?erro=acusado`);
  try {
    await denunciar(obterBd(), ator, { partidaId, acusadoId: acusado.data, motivo: String(dados.get('motivo') ?? '') });
  } catch (erro) {
    const codigo = codigoDoErro(erro);
    if (codigo) redirect(`/partidas/${partidaId}?erro=${codigo}`);
    throw erro;
  }
  revalidatePath(`/partidas/${partidaId}`);
  redirect(`/partidas/${partidaId}?aviso=denunciado`);
}

export async function cancelar(dados: FormData) {
  const partidaId = idDe(dados, 'partidaId');
  const ator = await exigirAcesso(`/partidas/${partidaId}`);
  try {
    await cancelarPartidaPelaEquipe(obterBd(), controladorDoAmbiente(), ator, partidaId);
  } catch (erro) {
    if (erro instanceof SemPermissao) redirect(`/partidas/${partidaId}?erro=cancelar`);
    if (erro instanceof PartidaIndisponivel) redirect(`/partidas/${partidaId}?erro=terminada`);
    throw erro;
  }
  revalidatePath(`/partidas/${partidaId}`);
}

export async function chamar(dados: FormData) {
  const partidaId = idDe(dados, 'partidaId');
  const ator = await exigirAcesso(`/partidas/${partidaId}`);
  let virouDenuncia: boolean;
  try {
    ({ virouDenuncia } = await chamarEquipe(obterBd(), ator, partidaId));
  } catch (erro) {
    const codigo = codigoDoErro(erro);
    if (codigo) redirect(`/partidas/${partidaId}?erro=${codigo}`);
    throw erro;
  }
  revalidatePath(`/partidas/${partidaId}`);
  redirect(`/partidas/${partidaId}?aviso=${virouDenuncia ? 'sem-equipe' : 'chamado'}`);
}
