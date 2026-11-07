'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

/** Aviso em toda página enquanto a pessoa está em partida. Some na própria página da partida. */
export function VoltarParaAPartida({ partidaId }: { partidaId: string }) {
  const caminho = usePathname();
  const destino = `/partidas/${partidaId}`;
  if (caminho === destino) return null;
  return (
    <Link href={destino} className="voltar-para-a-partida">
      <span className="ao-vivo">Você está em uma partida</span>
      <b>Voltar para a partida</b>
    </Link>
  );
}
