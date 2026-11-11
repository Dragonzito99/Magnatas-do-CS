'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { exigirAcesso } from '@/auth/guarda';
import { obterBd } from '@/bd/conexao';
import { AmizadeInvalida, aceitarConviteDeSala, ConviteInvalido, convidarParaSala, desfazerAmizade, NaoSaoAmigos, pedirAmizade, recusarConviteDeSala, responderAmizade } from '@/dominio/amigos';
import { Bloqueado, ContaSemAcesso, JaOcupado } from '@/dominio/disponibilidade';
import { criarGrupo, MensagemInvalida, sairDoGrupo, SemAcessoAConversa } from '@/dominio/mensagens';
import { SalaCheia, SalaEmPartida, SalaInexistente } from '@/dominio/salas';

const id = (dados: FormData, campo: string) => {
  const valor = String(dados.get(campo) ?? '');
  return z.uuid().safeParse(valor).success ? valor : null;
};

/** Volta para onde a pessoa estava (o perfil, a sala, a comunidade), sem aceitar endereço de fora do site. */
const voltar = (dados: FormData, padrao: string) => {
  const destino = String(dados.get('voltar') ?? '');
  return destino.startsWith('/') && !destino.startsWith('//') ? destino : padrao;
};

export async function pedir(dados: FormData): Promise<void> {
  const eu = await exigirAcesso('/comunidade');
  const outro = id(dados, 'usuarioId');
  if (!outro) redirect('/comunidade');
  try {
    await pedirAmizade(obterBd(), eu, outro);
  } catch (erro) {
    if (erro instanceof AmizadeInvalida || erro instanceof ContaSemAcesso) redirect(`${voltar(dados, '/comunidade')}?erro=amizade`);
    throw erro;
  }
  revalidatePath('/', 'layout');
  redirect(voltar(dados, '/comunidade'));
}

export async function responder(dados: FormData): Promise<void> {
  const eu = await exigirAcesso('/comunidade');
  const outro = id(dados, 'usuarioId');
  if (outro) await responderAmizade(obterBd(), eu, outro, dados.get('resposta') === 'aceitar');
  revalidatePath('/', 'layout');
  redirect(voltar(dados, '/comunidade'));
}

export async function desfazer(dados: FormData): Promise<void> {
  const eu = await exigirAcesso('/comunidade');
  const outro = id(dados, 'usuarioId');
  if (outro) await desfazerAmizade(obterBd(), eu, outro);
  revalidatePath('/', 'layout');
  redirect(voltar(dados, '/comunidade'));
}

/** Chama um amigo para a sala; volta para a tela Jogar com o aviso de quem foi chamado. */
export async function convidar(dados: FormData): Promise<void> {
  const eu = await exigirAcesso('/jogar');
  const amigo = id(dados, 'usuarioId');
  if (!amigo) redirect('/jogar');
  try {
    await convidarParaSala(obterBd(), eu, amigo);
  } catch (erro) {
    if (erro instanceof NaoSaoAmigos) redirect('/jogar?erro=nao-amigo');
    if (erro instanceof ConviteInvalido) redirect(`/jogar?erro=${erro.motivo === 'cheia' ? 'cheia' : erro.motivo === 'em-partida' ? 'em-partida' : 'inexistente'}`);
    throw erro;
  }
  redirect('/jogar?aviso=chamado');
}

export async function aceitarConvite(dados: FormData): Promise<void> {
  const eu = await exigirAcesso('/jogar');
  const convite = id(dados, 'conviteId');
  if (!convite) redirect('/jogar');
  try {
    await aceitarConviteDeSala(obterBd(), eu, convite);
  } catch (erro) {
    if (erro instanceof ConviteInvalido) redirect('/jogar?erro=convite');
    if (erro instanceof SalaCheia) redirect('/jogar?erro=cheia');
    if (erro instanceof SalaEmPartida) redirect('/jogar?erro=em-partida');
    if (erro instanceof SalaInexistente) redirect('/jogar?erro=inexistente');
    if (erro instanceof JaOcupado) redirect('/jogar?erro=ocupado');
    if (erro instanceof Bloqueado) redirect('/jogar?erro=bloqueado');
    if (erro instanceof ContaSemAcesso) redirect('/jogar?erro=sem-acesso');
    throw erro;
  }
  revalidatePath('/', 'layout');
  redirect('/jogar');
}

export async function recusarConvite(dados: FormData): Promise<void> {
  const eu = await exigirAcesso('/comunidade');
  const convite = id(dados, 'conviteId');
  if (convite) await recusarConviteDeSala(obterBd(), eu, convite);
  revalidatePath('/', 'layout');
  redirect(voltar(dados, '/comunidade'));
}

/** Cria um grupo com os amigos marcados e abre a Comunidade com o grupo novo. */
export async function novoGrupo(dados: FormData): Promise<void> {
  const eu = await exigirAcesso('/comunidade');
  const amigos = dados.getAll('amigos').map(String).filter((valor) => z.uuid().safeParse(valor).success);
  try {
    await criarGrupo(obterBd(), eu, String(dados.get('nome') ?? ''), amigos);
  } catch (erro) {
    if (erro instanceof MensagemInvalida) redirect('/comunidade?erro=grupo#grupos');
    if (erro instanceof SemAcessoAConversa) redirect('/comunidade?erro=grupo-amigos#grupos');
    throw erro;
  }
  revalidatePath('/', 'layout');
  redirect('/comunidade?aviso=grupo#grupos');
}

export async function sairGrupo(dados: FormData): Promise<void> {
  const eu = await exigirAcesso('/comunidade');
  const grupo = id(dados, 'conversaId');
  if (grupo) await sairDoGrupo(obterBd(), eu, grupo);
  revalidatePath('/', 'layout');
  redirect('/comunidade#grupos');
}
