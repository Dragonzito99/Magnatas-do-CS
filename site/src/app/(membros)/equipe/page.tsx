import { redirect } from 'next/navigation';

/** "Membros e cargos" virou Usuários no Painel ADM (13/11/2026): cargo e convites ficam na ficha de cada conta. */
export default function Equipe() {
  redirect('/painel/usuarios?estado=equipe');
}
