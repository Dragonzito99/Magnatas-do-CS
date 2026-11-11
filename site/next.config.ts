import type { NextConfig } from 'next';

// As páginas mostram dados de cada pessoa, então nada de cache de componentes nem de pré-carregamento parcial.
const nextConfig: NextConfig = {
  // Não anunciar o Next.js no cabeçalho X-Powered-By (revisão de segurança, 11/11/2026).
  poweredByHeader: false,
  // Avisos de segurança para o navegador: só HTTPS por um ano, ninguém abre o site dentro de outro (iframe), o navegador
  // não "adivinha" o tipo de arquivo, outros sites não recebem o endereço completo, e nada de câmera, microfone ou
  // localização.
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains' },
          { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
        ],
      },
    ];
  },
};

export default nextConfig;
