'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { exigirAcesso } from '@/auth/guarda';
import { obterBd } from '@/bd/conexao';
import type { Usuario } from '@/bd/esquema';
import { SemPermissao } from '@/dominio/equipe';
import { apagarNoticia, criarNoticia, editarNoticia, NoticiaInvalida, type DadosDaNoticia } from '@/dominio/noticias';

const PAGINA = '/equipe/noticias';

function dadosDe(formulario: FormData): DadosDaNoticia {
  return {
    titulo: String(formulario.get('titulo') ?? ''),
    texto: String(formulario.get('texto') ?? ''),
    imagem: String(formulario.get('imagem') ?? ''),
    fixada: formulario.get('fixada') === 'on',
  };
}

async function executar(acao: (ator: Usuario) => Promise<unknown>): Promise<void> {
  const ator = await exigirAcesso(PAGINA);
  try {
    await acao(ator);
  } catch (erro) {
    if (erro instanceof NoticiaInvalida) redirect(`${PAGINA}?erro=invalida`);
    if (erro instanceof SemPermissao) redirect('/inicio');
    throw erro;
  }
  revalidatePath(PAGINA);
  revalidatePath('/inicio');
}

function idDe(formulario: FormData): string {
  const lido = z.uuid().safeParse(formulario.get('id'));
  if (!lido.success) redirect(PAGINA);
  return lido.data;
}

export async function publicar(formulario: FormData) {
  await executar((ator) => criarNoticia(obterBd(), ator, dadosDe(formulario)));
  redirect(`${PAGINA}?aviso=publicada`);
}

export async function salvar(formulario: FormData) {
  const id = idDe(formulario);
  await executar((ator) => editarNoticia(obterBd(), ator, id, dadosDe(formulario)));
  redirect(`${PAGINA}?aviso=salva`);
}

export async function apagar(formulario: FormData) {
  const id = idDe(formulario);
  await executar((ator) => apagarNoticia(obterBd(), ator, id));
  redirect(`${PAGINA}?aviso=apagada`);
}
