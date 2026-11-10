import type { Usuario } from '@/bd/esquema';
import type { ItemDaLoja } from '@/dominio/loja';
import { Avatar } from '../avatar';

/** Como o item fica no jogo ou no site, com o apelido de quem está olhando. */
export function PreviaDoItem({ item, usuario }: { item: ItemDaLoja; usuario: Pick<Usuario, 'apelido' | 'avatarUrl'> }) {
  if (item.tipo === 'moldura') return <Avatar usuario={usuario} moldura={item.valor} />;
  if (item.tipo === 'aviso') return <span className="previa-chat aviso-de-entrada">{item.valor.replace('{apelido}', usuario.apelido)}</span>;
  if (item.tipo === 'etiqueta')
    return (
      <span className="previa-chat">
        <b className="etiqueta-do-chat">{item.valor}</b> {usuario.apelido}: <span>boa!</span>
      </span>
    );
  return (
    <span className="previa-chat">
      <b style={{ color: item.corCss }}>{usuario.apelido}</b>: <span>boa!</span>
    </span>
  );
}
