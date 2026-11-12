import { randomUUID } from 'node:crypto';
import type { Usuario } from '@/bd/esquema';
import { criarSessaoNaDidit } from './didit';

export interface Verificador {
  nome: string;
  iniciar(usuario: Pick<Usuario, 'id'>): Promise<{ referencia: string; url: string }>;
}

const simulador: Verificador = {
  nome: 'simulador',
  async iniciar() {
    const referencia = `simulador-${randomUUID()}`;
    return { referencia, url: `/verificacao/simulador?ref=${encodeURIComponent(referencia)}` };
  },
};

/** Falha ao iniciar o site se não houver um verificador seguro para o ambiente. */
export function criarVerificador(ambiente: Record<string, string | undefined>): Verificador {
  const nome = ambiente.VERIFICADOR;
  if (nome === 'simulador') {
    // Só na fase de teste com convidados, e com liberação escrita por extenso. Sai antes de abrir o clube.
    if (ambiente.NODE_ENV === 'production' && ambiente.VERIFICADOR_SIMULADOR_EM_PRODUCAO !== 'sim') {
      throw new Error('O simulador de verificação não pode rodar em produção, porque aprovaria qualquer pessoa.');
    }
    return simulador;
  }
  if (nome === 'didit') {
    const { DIDIT_API_KEY: chave, DIDIT_WORKFLOW_ID: fluxo, DIDIT_WEBHOOK_SECRET: segredo } = ambiente;
    if (!chave || !fluxo || !segredo) throw new Error('Didit sem chave, fluxo ou segredo do aviso: rode scripts/guardar-chaves-didit.sh.');
    const site = ambiente.SITE_URL ?? 'http://localhost:3000';
    return {
      nome: 'didit',
      // Na volta, a página confere a decisão na hora; o aviso assinado da Didit fecha o que faltar.
      iniciar: (usuario) => criarSessaoNaDidit(chave, fluxo, usuario.id, `${site}/verificacao/retorno`),
    };
  }
  throw new Error(`Verificador de identidade não configurado: defina VERIFICADOR (valor atual: ${nome ?? 'vazio'}).`);
}
