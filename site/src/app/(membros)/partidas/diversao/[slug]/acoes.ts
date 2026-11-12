'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { exigirAcesso } from '@/auth/guarda';
import { obterBd } from '@/bd/conexao';
import { denunciarNaDiversao, elogiarNaDiversao, referenciaDaDiversao, slugDaDiversao } from '@/dominio/avaliar';
import { AcusadoInvalido, DenunciaRepetida, MotivoInvalido, NaoJogou } from '@/dominio/denuncias';
import { ElogioIndisponivel, ElogioRepetido } from '@/dominio/elogios';

function codigoDoErro(erro: unknown): string | null {
  if (erro instanceof ElogioRepetido) return 'elogio-repetido';
  if (erro instanceof ElogioIndisponivel) return 'elogio';
  if (erro instanceof MotivoInvalido) return 'motivo';
  if (erro instanceof NaoJogou) return 'nao-jogou';
  if (erro instanceof AcusadoInvalido) return 'acusado';
  if (erro instanceof DenunciaRepetida) return 'repetida';
  return null;
}

/** A referência da partida que veio do formulário, já conferida, e o endereço da página para voltar. */
function partidaDe(dados: FormData): { referencia: string; pagina: string } {
  const referencia = referenciaDaDiversao(String(dados.get('slug') ?? ''));
  if (!referencia) redirect('/jogar');
  return { referencia, pagina: `/partidas/diversao/${slugDaDiversao(referencia)}` };
}

async function executar(pagina: string, acao: () => Promise<void>, aviso: string): Promise<void> {
  try {
    await acao();
  } catch (erro) {
    const codigo = codigoDoErro(erro);
    if (codigo) redirect(`${pagina}?erro=${codigo}#avaliar`);
    throw erro;
  }
  revalidatePath(pagina);
  redirect(`${pagina}?aviso=${aviso}#avaliar`);
}

export async function elogiarNaPartidaDaDiversao(dados: FormData) {
  const { referencia, pagina } = partidaDe(dados);
  const ator = await exigirAcesso(pagina);
  const elogiado = z.uuid().safeParse(dados.get('elogiadoId'));
  if (!elogiado.success) redirect(`${pagina}?erro=elogio#avaliar`);
  await executar(pagina, () => elogiarNaDiversao(obterBd(), ator, { referencia, elogiadoId: elogiado.data, tipo: String(dados.get('tipo') ?? '') }), 'elogiado');
}

export async function denunciarNaPartidaDaDiversao(dados: FormData) {
  const { referencia, pagina } = partidaDe(dados);
  const ator = await exigirAcesso(pagina);
  const acusado = z.uuid().safeParse(dados.get('acusadoId'));
  if (!acusado.success) redirect(`${pagina}?erro=acusado#avaliar`);
  await executar(pagina, () => denunciarNaDiversao(obterBd(), ator, { referencia, acusadoId: acusado.data, motivo: String(dados.get('motivo') ?? '') }), 'denunciado');
}
