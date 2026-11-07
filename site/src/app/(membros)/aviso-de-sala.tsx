'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { DESTINO_DO_JOGAR, mostrarAvisoDeSala, type ResumoDaSala } from '@/dominio/navegacao';

/** Fora da tela das salas, lembra quem está numa sala de que ela continua esperando. */
export function AvisoDeSala({ sala }: { sala: ResumoDaSala | null }) {
  const caminho = usePathname();
  if (!sala || !mostrarAvisoDeSala(caminho, sala)) return null;
  return (
    <Link href={DESTINO_DO_JOGAR} className="aviso-sala">
      <span className="aviso-sala-ponto" aria-hidden="true" />
      <span>
        Você está na sala de <b>{sala.nome}</b> · {sala.membros}/5
      </span>
      <em>Voltar para a sala</em>
    </Link>
  );
}
