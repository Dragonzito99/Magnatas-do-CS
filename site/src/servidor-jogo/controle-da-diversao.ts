import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { NOME_NO_SERVIDOR_VALIDO, type ControleDaDiversao } from '@/dominio/sob-demanda';

export type Executar = (programa: string, argumentos: string[], opcoes: { timeout: number }) => Promise<unknown>;

const PRAZO_DO_SCRIPT_MS = 30_000;
const PASTA_DOS_SCRIPTS = '/home/cs2/bin';

/**
 * Liga e desliga pelos dois scripts que o sudoers deixa o usuário do site rodar como cs2.
 * Sem shell: o nome vai como argumento, e mesmo assim só passa se for letras minúsculas, números e hífen.
 */
export function controleReal(executar: Executar = promisify(execFile)): ControleDaDiversao {
  async function rodar(script: string, nome: string): Promise<void> {
    if (!NOME_NO_SERVIDOR_VALIDO.test(nome)) throw new Error('Nome de servidor inválido.');
    await executar('sudo', ['-n', '-u', 'cs2', `${PASTA_DOS_SCRIPTS}/${script}`, nome], { timeout: PRAZO_DO_SCRIPT_MS });
  }
  return {
    ligar: (nome) => rodar('ligar_diversao.sh', nome),
    desligar: (nome) => rodar('desligar_diversao.sh', nome),
  };
}
