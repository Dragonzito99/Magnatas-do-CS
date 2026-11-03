import type { Usuario } from '@/bd/esquema';

const SO_EQUIPE = ['/equipe'];

/** Devolve para onde a pessoa deve ir, ou null se ela pode ficar nesse caminho. */
export function destinoPara(usuario: Pick<Usuario, 'estado' | 'papel'> | null, caminho: string): string | null {
  const dentro = (base: string) => caminho === base || caminho.startsWith(`${base}/`);

  if (!usuario) return caminho === '/' ? null : '/';
  if (usuario.estado === 'banido') return dentro('/banido') ? null : '/banido';
  if (usuario.estado === 'suspenso') return dentro('/suspenso') ? null : '/suspenso';
  if (usuario.estado === 'aguardando_verificacao') return dentro('/verificacao') ? null : '/verificacao';

  if (caminho === '/' || dentro('/verificacao') || dentro('/banido') || dentro('/suspenso')) return '/salas';
  if (usuario.papel === 'jogador' && SO_EQUIPE.some(dentro)) return '/salas';
  return null;
}
