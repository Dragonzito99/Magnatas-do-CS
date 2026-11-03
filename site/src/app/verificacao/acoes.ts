'use server';

import { redirect } from 'next/navigation';
import { obterBd } from '@/bd/conexao';
import { usuarioAtual } from '@/auth/sessao-atual';
import { aplicarResultadoVerificacao, iniciarVerificacao, verificacaoPertenceA } from '@/dominio/verificacao';
import { criarVerificador } from '@/verificacao/verificador';

export async function comecar() {
  const usuario = await usuarioAtual();
  if (!usuario) redirect('/');
  const verificador = criarVerificador(process.env);
  const { referencia, url } = await verificador.iniciar(usuario);
  await iniciarVerificacao(obterBd(), usuario, verificador.nome, referencia);
  redirect(url);
}

function cpfDeTeste(): string {
  const base = Array.from({ length: 9 }, () => Math.floor(Math.random() * 10));
  const digito = (numeros: number[]) => {
    const soma = numeros.reduce((total, numero, indice) => total + numero * (numeros.length + 1 - indice), 0);
    const resto = (soma * 10) % 11;
    return resto === 10 ? 0 : resto;
  };
  const primeiro = digito(base);
  return [...base, primeiro, digito([...base, primeiro])].join('');
}

// Só existe para o simulador. Um provedor de verdade envia o resultado por conta própria, com assinatura.
export async function responderSimulador(dados: FormData) {
  const verificador = criarVerificador(process.env);
  if (verificador.nome !== 'simulador') redirect('/verificacao');

  const usuario = await usuarioAtual();
  if (!usuario) redirect('/');
  const referencia = String(dados.get('referencia') ?? '');
  const bd = obterBd();
  if (!(await verificacaoPertenceA(bd, referencia, usuario.id))) redirect('/verificacao');

  const escolha = String(dados.get('escolha') ?? '');
  const cpfDigitado = String(dados.get('cpf') ?? '').trim();
  const desfecho = await aplicarResultadoVerificacao(
    bd,
    {
      referencia,
      aprovado: escolha !== 'reprovar',
      cpf: cpfDigitado || cpfDeTeste(),
      nascimento: escolha === 'menor' ? '2015-01-01' : '1990-01-01',
    },
    process.env.CPF_HMAC_CHAVE ?? '',
  );
  redirect(desfecho === 'aprovada' ? '/salas' : `/verificacao?resultado=${desfecho}`);
}
