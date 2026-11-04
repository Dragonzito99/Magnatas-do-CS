import { expect, test } from 'vitest';
import { enderecoDoDiscord } from './discord';

test('sem endereço não há link', () => {
  expect(enderecoDoDiscord(undefined)).toBeNull();
  expect(enderecoDoDiscord('  ')).toBeNull();
});

test('só aceita endereço https', () => {
  expect(enderecoDoDiscord('https://discord.gg/abc')).toBe('https://discord.gg/abc');
  expect(enderecoDoDiscord('http://discord.gg/abc')).toBeNull();
  expect(enderecoDoDiscord('javascript:alert(1)')).toBeNull();
});

test('texto que não é endereço não vira link', () => {
  expect(enderecoDoDiscord('discord')).toBeNull();
});
