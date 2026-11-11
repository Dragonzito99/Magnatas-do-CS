'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { after } from 'next/server';
import { z } from 'zod';
import { exigirAcesso } from '@/auth/guarda';
import { obterBd } from '@/bd/conexao';
import type { Usuario } from '@/bd/esquema';
import { avisarNoDiscord, mensagemDaNoticia } from '@/dominio/discord';
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

async function executar<T>(acao: (ator: Usuario) => Promise<T>): Promise<T> {
  const ator = await exigirAcesso(PAGINA);
  let resultado: T;
  try {
    resultado = await acao(ator);
  } catch (erro) {
    if (erro instanceof NoticiaInvalida) redirect(`${PAGINA}?erro=invalida`);
    if (erro instanceof SemPermissao) redirect('/inicio');
    throw erro;
  }
  revalidatePath(PAGINA);
  revalidatePath('/inicio');
  return resultado;
}

function idDe(formulario: FormData): string {
  const lido = z.uuid().safeParse(formulario.get('id'));
  if (!lido.success) redirect(PAGINA);
  return lido.data;
}

export async function publicar(formulario: FormData) {
  const noticia = await executar((ator) => criarNoticia(obterBd(), ator, dadosDe(formulario)));
  // Depois de responder: a tela não espera o Discord.
  after(() => avisarNoDiscord(process.env.DISCORD_WEBHOOK_NOTICIAS, mensagemDaNoticia(noticia, process.env.SITE_URL ?? 'http://localhost:3000')));
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
