import { randomUUID } from 'node:crypto';
import type { Usuario } from '@/bd/esquema';

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
  throw new Error(`Verificador de identidade não configurado: defina VERIFICADOR (valor atual: ${nome ?? 'vazio'}).`);
}
