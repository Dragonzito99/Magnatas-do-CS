import { redirect } from 'next/navigation';

/** O mix virou um filtro da tela Jogar, e o endereço antigo continua levando para lá. */
export default function Mix() {
  redirect('/jogar?modo=mix');
}
