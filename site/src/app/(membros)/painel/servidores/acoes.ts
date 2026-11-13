'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { exigirAcesso } from '@/auth/guarda';
import { obterBd } from '@/bd/conexao';
import type { Usuario } from '@/bd/esquema';
import { SemPermissao } from '@/dominio/equipe';
import { desligarPelaEquipe, ligarPelaEquipe, reiniciarPelaEquipe } from '@/dominio/servidores-pela-equipe';
import { LimiteDeServidores, maximoDeLigados, ServidorIndisponivel } from '@/dominio/sob-demanda';
import { controladorDoAmbiente } from '@/servidor-jogo/controlador';
import { diversaoDoAmbiente } from '@/servidor-jogo/diversao-do-ambiente';

const PAGINA = '/painel/servidores';

async function noServidor(dados: FormData, acao: (ator: Usuario, servidorId: string) => Promise<void>, aviso: string): Promise<void> {
  const servidor = z.uuid().safeParse(dados.get('servidor'));
  if (!servidor.success) redirect(PAGINA);
  const ator = await exigirAcesso(PAGINA);
  try {
    await acao(ator, servidor.data);
  } catch (erro) {
    if (erro instanceof SemPermissao) redirect(`${PAGINA}?erro=permissao`);
    if (erro instanceof LimiteDeServidores) redirect(`${PAGINA}?erro=limite`);
    if (erro instanceof ServidorIndisponivel) redirect(`${PAGINA}?erro=indisponivel`);
    console.warn('O Painel ADM não conseguiu mexer no servidor:', erro);
    redirect(`${PAGINA}?erro=falhou`);
  }
  revalidatePath(PAGINA);
  redirect(`${PAGINA}?aviso=${aviso}`);
}

const controle = () => diversaoDoAmbiente(controladorDoAmbiente()).controle;
const maximo = () => maximoDeLigados(process.env.DIVERSAO_MAXIMO_LIGADOS);

export async function ligarServidor(dados: FormData) {
  await noServidor(dados, (ator, id) => ligarPelaEquipe(obterBd(), controle(), ator, id, new Date(), maximo()), 'ligando');
}

export async function desligarServidor(dados: FormData) {
  await noServidor(dados, (ator, id) => desligarPelaEquipe(obterBd(), controle(), ator, id), 'desligado');
}

export async function reiniciarServidor(dados: FormData) {
  await noServidor(dados, (ator, id) => reiniciarPelaEquipe(obterBd(), controle(), ator, id, new Date(), maximo()), 'reiniciando');
}
