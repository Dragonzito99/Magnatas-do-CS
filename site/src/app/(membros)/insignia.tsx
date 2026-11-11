import { useId } from 'react';
import { nomeDaInsignia, type Familia } from '@/dominio/insignias';

/** As cores de cada nível: Bronze, Prata, Ouro, Platina e Lendária (rascunho aprovado pelo dono, 11/11/2026). */
const CORES = [
  { claro: '#f0b27a', escuro: '#7a3f12' },
  { claro: '#f1f5f9', escuro: '#64748b' },
  { claro: '#ffe27a', escuro: '#a16207' },
  { claro: '#b5f6ff', escuro: '#0e7490' },
  { claro: '#f0abfc', escuro: '#7e22ce' },
];

/** O ícone de cada família, num quadro de 100 × 100 com o centro em 50, 50. */
function Icone({ familia }: { familia: Familia }) {
  switch (familia) {
    case 'mira':
      return (
        <>
          <circle cx="50" cy="50" r="15" fill="none" strokeWidth="5" />
          <path d="M50 27v12M50 61v12M27 50h12M61 50h12" strokeWidth="5" strokeLinecap="round" />
          <circle cx="50" cy="50" r="3.5" stroke="none" />
        </>
      );
    case 'ace':
      return <path d="M33 35h34v8H43l-1 6c3-2 6-3 10-3 9 0 15 6 15 13s-7 13-17 13c-8 0-14-3-17-8l7-5c2 3 6 5 10 5 5 0 8-2 8-5s-3-5-8-5c-4 0-7 1-10 3l-6-2z" stroke="none" />;
    case 'estrela':
      return <path d="M50 27l6.6 14.2 15.4 1.8-11.4 10.6 3 15.4L50 61.3 36.4 69l3-15.4L28 43l15.4-1.8z" stroke="none" />;
    case 'vencedor':
      return (
        <>
          <path d="M37 30h26v12c0 9-6 15-13 15s-13-6-13-15zM37 34h-7c0 8 4 12 9 12M63 34h7c0 8-4 12-9 12" fill="none" strokeWidth="4.5" strokeLinejoin="round" />
          <path d="M46 57h8v8h6v6H40v-6h6z" stroke="none" />
        </>
      );
    case 'mutacao':
      return (
        <>
          <circle cx="50" cy="50" r="6" stroke="none" />
          <path d="M50 44c-2-8 0-15 6-19-3 6-2 11 1 15M55.5 53c7 3 11 9 10 17-3-6-7-9-12-9M44.5 53c-7 3-11 9-10 17 3-6 7-9 12-9" fill="none" strokeWidth="4.5" strokeLinecap="round" />
        </>
      );
    case 'veterano':
      return <path d="M33 37l17 9 17-9M33 49l17 9 17-9M33 61l17 9 17-9" fill="none" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />;
  }
}

/**
 * A insígnia em SVG: o escudo na cor do nível, o ícone da família, um pontinho por nível, raios a partir da Platina e
 * asas na Lendária. Apagada = ainda não conquistada.
 */
export function Insignia({ familia, nivel, tamanho, apagada = false }: { familia: Familia; nivel: number; tamanho: number; apagada?: boolean }) {
  const gradiente = useId();
  const cor = CORES[Math.min(Math.max(nivel, 0), CORES.length - 1)];
  const nome = nomeDaInsignia(familia, nivel);
  return (
    <svg className={apagada ? 'insignia insignia-apagada' : 'insignia'} viewBox="0 0 100 100" width={tamanho} height={tamanho} role="img" aria-label={apagada ? `${nome} (ainda não conquistada)` : nome}>
      <defs>
        <linearGradient id={gradiente} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={cor.claro} />
          <stop offset="1" stopColor={cor.escuro} />
        </linearGradient>
      </defs>
      {nivel >= 3 && (
        <g stroke={cor.claro} strokeWidth="1.5" opacity=".45">
          {Array.from({ length: 12 }, (_, indice) => {
            const angulo = (indice * Math.PI) / 6;
            return <path key={indice} d={`M${50 + Math.cos(angulo) * 40} ${50 + Math.sin(angulo) * 40}L${50 + Math.cos(angulo) * 46} ${50 + Math.sin(angulo) * 46}`} />;
          })}
        </g>
      )}
      {nivel >= 4 && <path d="M14 40c-6 10-4 24 6 32l8-6c-6-6-8-14-6-22zM86 40c6 10 4 24-6 32l-8-6c6-6 8-14 6-22z" fill={`url(#${gradiente})`} />}
      <path d="M50 8l32 15v27c0 19-14 33-32 40-18-7-32-21-32-40V23z" fill={`url(#${gradiente})`} />
      <path d="M50 15l26 12v23c0 15-11 27-26 33-15-6-26-18-26-33V27z" fill="#120a1f" />
      <g fill={cor.claro} stroke={cor.claro}>
        <Icone familia={familia} />
      </g>
      {Array.from({ length: nivel + 1 }, (_, indice) => (
        <circle key={indice} cx={50 + (indice - nivel / 2) * 8} cy="92" r="2.6" fill={cor.claro} />
      ))}
    </svg>
  );
}
