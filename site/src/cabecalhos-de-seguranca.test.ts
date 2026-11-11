import { expect, test } from 'vitest';
import configuracao from '../next.config';

// O site não mandava nenhum aviso de segurança ao navegador e anunciava o Next.js (revisão de 11/11/2026).
test('toda página manda os avisos de segurança ao navegador', async () => {
  expect(configuracao.poweredByHeader).toBe(false);
  const regras = await configuracao.headers!();
  const todas = regras.find((regra) => regra.source === '/:path*');
  const cabecalhos = Object.fromEntries((todas?.headers ?? []).map((item) => [item.key, item.value]));
  expect(cabecalhos).toEqual({
    'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
    'X-Frame-Options': 'SAMEORIGIN',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
  });
});
