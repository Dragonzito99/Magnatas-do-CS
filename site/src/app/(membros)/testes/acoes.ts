'use server';

import { redirect } from 'next/navigation';
import { exigirAcesso } from '@/auth/guarda';
import { obterBd } from '@/bd/conexao';
import { Bloqueado, JaOcupado } from '@/dominio/disponibilidade';
import { LimiteDeServidores, maximoDeLigados, ServidorIndisponivel } from '@/dominio/sob-demanda';
import { criarTesteDoCompetitivo } from '@/dominio/teste-competitivo';
import { MutacaoOcupada, pedirTesteDaMutacao } from '@/dominio/teste-mutacao';
import { controladorDoAmbiente } from '@/servidor-jogo/controlador';
import { diversaoDoAmbiente } from '@/servidor-jogo/diversao-do-ambiente';

/** O Adm entra numa partida sozinho contra bots e cai direto na tela dela. */
export async function testarCompetitivo(): Promise<void> {
  const adm = await exigirAcesso('/testes');
  let partidaId: string;
  try {
    partidaId = (await criarTesteDoCompetitivo(obterBd(), adm)).id;
  } catch (erro) {
    if (erro instanceof JaOcupado || erro instanceof Bloqueado) redirect('/testes?erro=ocupado');
    throw erro;
  }
  redirect(`/partidas/${partidaId}`);
}

/** Liga a Mutação na Dust 2 com bots. A tela acompanha até o servidor ficar pronto para entrar. */
export async function testarMutacao(): Promise<void> {
  const adm = await exigirAcesso('/testes');
  const diversao = diversaoDoAmbiente(controladorDoAmbiente());
  let erro: string | undefined;
  try {
    await pedirTesteDaMutacao(obterBd(), diversao.controle, diversao.perguntar, adm, maximoDeLigados(process.env.DIVERSAO_MAXIMO_LIGADOS));
  } catch (falha) {
    if (falha instanceof MutacaoOcupada) erro = 'mutacao_ocupada';
    else if (falha instanceof LimiteDeServidores) erro = 'limite';
    else if (falha instanceof ServidorIndisponivel) erro = 'indisponivel';
    else throw falha;
  }
  redirect(erro ? `/testes?erro=${erro}` : '/testes');
}
