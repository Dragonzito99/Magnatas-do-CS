import { redirect } from 'next/navigation';
import { lerModo } from '@/dominio/diversao';

/** A Diversão virou um filtro da tela Jogar, e o endereço antigo continua levando para lá. */
export default async function Diversao({ searchParams }: { searchParams: Promise<{ modo?: string }> }) {
  const modo = lerModo((await searchParams).modo);
  redirect(modo ? `/jogar?modo=${modo}` : '/jogar');
}
