import type { Metadata } from 'next';
import { Barlow_Condensed, Inter, JetBrains_Mono } from 'next/font/google';
import '@/estilos/global.css';

const inter = Inter({ subsets: ['latin'], variable: '--fonte-inter' });
const mono = JetBrains_Mono({ subsets: ['latin'], variable: '--fonte-mono' });
// Títulos e menu no estilo do CrossFire: condensada e inclinada.
const titulo = Barlow_Condensed({ subsets: ['latin'], weight: ['600', '700'], style: ['italic'], variable: '--fonte-titulo' });

export const metadata: Metadata = {
  title: 'Magnatas do CS',
  description: 'Plataforma fechada de CS2. Só entra quem tem convite.',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pt-BR" className={`${inter.variable} ${mono.variable} ${titulo.variable}`}>
      <body>{children}</body>
    </html>
  );
}
