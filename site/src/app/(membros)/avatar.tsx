import type { Usuario } from '@/bd/esquema';

export function Avatar({ usuario }: { usuario: Pick<Usuario, 'apelido' | 'avatarUrl'> }) {
  if (usuario.avatarUrl) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img className="avatar" src={usuario.avatarUrl} alt="" />;
  }
  return (
    <span className="avatar" aria-hidden="true">
      {usuario.apelido.slice(0, 2)}
    </span>
  );
}
