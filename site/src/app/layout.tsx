import type { Metadata } from 'next';
import { Inter, JetBrains_Mono } from 'next/font/google';
import '@/estilos/global.css';

const inter = Inter({ subsets: ['latin'], variable: '--fonte-inter' });
const mono = JetBrains_Mono({ subsets: ['latin'], variable: '--fonte-mono' });

export const metadata: Metadata = {
  title: 'Magnatas do CS',
  description: 'Plataforma fechada de CS2. Só entra quem tem convite.',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pt-BR" className={`${inter.variable} ${mono.variable}`}>
      <body>{children}</body>
    </html>
  );
}
