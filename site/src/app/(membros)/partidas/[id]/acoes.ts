'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { exigirAcesso } from '@/auth/guarda';
import { obterBd } from '@/bd/conexao';
import { AceiteIndisponivel, aceitarPartida } from '@/dominio/aceites';
import { AcusadoInvalido, ChamadoIndisponivel, chamarEquipe, denunciar, DenunciaRepetida, MotivoInvalido, NaoJogou } from '@/dominio/denuncias';
import { ContaSemAcesso } from '@/dominio/disponibilidade';
import { elogiar, ElogioIndisponivel, ElogioRepetido } from '@/dominio/elogios';
import { SemPermissao } from '@/dominio/equipe';
import { SemPermissaoNaSala } from '@/dominio/salas';
import { vetarMapa, VetoIndisponivel } from '@/dominio/vetos';
import { alocarEmSegundoPlano } from '@/servidor-jogo/alocar';
import { cancelarPartidaPelaEquipe, PartidaIndisponivel } from '@/dominio/varredura';
import { controladorDoAmbiente } from '@/servidor-jogo/controlador';

function codigoDoErro(erro: unknown): string | null {
  if (erro instanceof MotivoInvalido) return 'motivo';
  if (erro instanceof AcusadoInvalido) return 'acusado';
  if (erro instanceof DenunciaRepetida) return 'repetida';
  if (erro instanceof NaoJogou) return 'nao-jogou';
  if (erro instanceof ChamadoIndisponivel) return 'chamado';
  if (erro instanceof ContaSemAcesso) return 'sem-acesso';
  if (erro instanceof AceiteIndisponivel) return 'aceite';
  if (erro instanceof VetoIndisponivel) return 'veto';
  if (erro instanceof SemPermissaoNaSala) return 'so-lider';
  if (erro instanceof ElogioIndisponivel) return 'elogio';
  if (erro instanceof ElogioRepetido) return 'elogio-repetido';
  return null;
}

/** Roda a ação e manda o erro para a própria página da partida, como as outras ações daqui. */
async function naPartida(partidaId: string, acao: (ator: Awaited<ReturnType<typeof exigirAcesso>>) => Promise<void>): Promise<void> {
  const ator = await exigirAcesso(`/partidas/${partidaId}`);
  try {
    await acao(ator);
  } catch (erro) {
    const codigo = codigoDoErro(erro);
    if (codigo) redirect(`/partidas/${partidaId}?erro=${codigo}`);
    throw erro;
  }
}

export async function aceitar(dados: FormData) {
  const partidaId = idDe(dados, 'partidaId');
  const bd = obterBd();
  await naPartida(partidaId, (ator) => aceitarPartida(bd, ator, partidaId));
  // No mix, o último aceite já deixa a partida esperando servidor.
  alocarEmSegundoPlano(bd);
  revalidatePath(`/partidas/${partidaId}`);
}

export async function vetar(dados: FormData) {
  const partidaId = idDe(dados, 'partidaId');
  const mapa = String(dados.get('mapa') ?? '');
  const bd = obterBd();
  await naPartida(partidaId, (ator) => vetarMapa(bd, ator, partidaId, mapa));
  // O último veto deixa a partida esperando servidor.
  alocarEmSegundoPlano(bd);
  revalidatePath(`/partidas/${partidaId}`);
}

export async function elogiarJogador(dados: FormData) {
  const partidaId = idDe(dados, 'partidaId');
  const elogiado = z.uuid().safeParse(dados.get('elogiadoId'));
  if (!elogiado.success) redirect(`/partidas/${partidaId}?erro=elogio`);
  await naPartida(partidaId, (ator) => elogiar(obterBd(), ator, { partidaId, elogiadoId: elogiado.data, tipo: String(dados.get('tipo') ?? '') }));
  revalidatePath(`/partidas/${partidaId}`);
  redirect(`/partidas/${partidaId}?aviso=elogiado`);
}

function idDe(dados: FormData, campo: string): string {
  const lido = z.uuid().safeParse(dados.get(campo));
  if (!lido.success) redirect('/jogar');
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
