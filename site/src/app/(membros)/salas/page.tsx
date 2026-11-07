import { redirect } from 'next/navigation';

/** As salas viraram o filtro Competitivo da tela Jogar, e o endereço antigo continua levando para lá. */
export default function Salas() {
  redirect('/jogar?modo=competitivo');
}
