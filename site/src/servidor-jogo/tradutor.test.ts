import Anthropic from '@anthropic-ai/sdk';
import { expect, test } from 'vitest';
import { MAXIMO_DE_TOKENS, tipoDaFalha } from './tradutor';

const erroDaApi = (status: number, mensagem = 'erro') => new Anthropic.APIError(status, undefined, mensagem, new Headers());

test.each([
  ['chave recusada', erroDaApi(401)],
  ['sem permissão', erroDaApi(403)],
  ['limite', erroDaApi(429)],
  ['sobrecarga', erroDaApi(529)],
  ['fora do ar', erroDaApi(500)],
  ['sem crédito', erroDaApi(400, 'Your credit balance is too low to access the Anthropic API.')],
  ['sem conexão', new Anthropic.APIConnectionError({ message: 'offline' })],
])('%s é passageira: tenta depois sem gastar tentativa', (_caso, erro) => {
  expect(tipoDaFalha(erro)).toBe('tentar_depois');
});

test.each([
  ['pedido inválido', erroDaApi(400, 'invalid request')],
  ['saída que não deu para ler', new Anthropic.AnthropicError('Failed to parse structured output')],
])('%s é da notícia: gasta uma tentativa', (_caso, erro) => {
  expect(tipoDaFalha(erro)).toBe('falhou');
});

test('há folga de tokens para o pensamento e a resposta', () => {
  expect(MAXIMO_DE_TOKENS).toBeGreaterThanOrEqual(4096);
});
