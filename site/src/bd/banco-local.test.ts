import { expect, test } from 'vitest';
import { ehBancoLocal } from '../../scripts/ambiente';

test.each(['postgres://u:s@127.0.0.1:5432/magnatas', 'postgres://u:s@localhost/magnatas', 'postgresql://u@[::1]:5432/x'])('%s é local', (url) => {
  expect(ehBancoLocal(url)).toBe(true);
});

test.each(['postgres://u:s@207.180.3.209:5432/magnatas', 'postgres://u:s@banco.magnatas.com/x', '', 'nao-e-url'])('%j não é local', (url) => {
  expect(ehBancoLocal(url)).toBe(false);
});
