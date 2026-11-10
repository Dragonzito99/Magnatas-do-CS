import type { Usuario } from '@/bd/esquema';

/** A foto da conta. A moldura vem da Magnata Shop (dourada, neon, fogo, gelo), quando a pessoa está usando uma. */
export function Avatar({ usuario, moldura }: { usuario: Pick<Usuario, 'apelido' | 'avatarUrl'>; moldura?: string | null }) {
  const classe = moldura ? `avatar moldura moldura-${moldura}` : 'avatar';
  if (usuario.avatarUrl) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img className={classe} src={usuario.avatarUrl} alt="" />;
  }
  return (
    <span className={classe} aria-hidden="true">
      {usuario.apelido.slice(0, 2)}
    </span>
  );
}
