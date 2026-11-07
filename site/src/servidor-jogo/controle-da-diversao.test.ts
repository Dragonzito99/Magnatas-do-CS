import { expect, test } from 'vitest';
import { controleReal, type Executar } from './controle-da-diversao';

function executarFalso(falha?: Error): Executar & { chamadas: { programa: string; argumentos: string[]; prazo: number }[] } {
  const chamadas: { programa: string; argumentos: string[]; prazo: number }[] = [];
  const executar = (async (programa: string, argumentos: string[], opcoes: { timeout: number }) => {
    chamadas.push({ programa, argumentos, prazo: opcoes.timeout });
    if (falha) throw falha;
  }) as Executar & { chamadas: typeof chamadas };
  executar.chamadas = chamadas;
  return executar;
}

test('ligar chama o script como cs2, sem senha e com prazo de 30 segundos', async () => {
  const executar = executarFalso();
  await controleReal(executar).ligar('fantasma');
  expect(executar.chamadas).toEqual([
    { programa: 'sudo', argumentos: ['-n', '-u', 'cs2', '/home/cs2/bin/ligar_diversao.sh', 'fantasma'], prazo: 30_000 },
  ]);
});

test('desligar chama o outro script', async () => {
  const executar = executarFalso();
  await controleReal(executar).desligar('ak-desert');
  expect(executar.chamadas[0].argumentos).toEqual(['-n', '-u', 'cs2', '/home/cs2/bin/desligar_diversao.sh', 'ak-desert']);
});

test.each(['fantasma; rm -rf /', '../equipe', 'Fantasma', '', 'x'.repeat(33)])('nome %j é recusado sem rodar nada', async (nome) => {
  const executar = executarFalso();
  await expect(controleReal(executar).ligar(nome)).rejects.toThrow('Nome de servidor inválido');
  await expect(controleReal(executar).desligar(nome)).rejects.toThrow('Nome de servidor inválido');
  expect(executar.chamadas).toEqual([]);
});

test('falha do script chega a quem chamou', async () => {
  await expect(controleReal(executarFalso(new Error('sudo: a password is required'))).ligar('awp')).rejects.toThrow('sudo: a password is required');
});
