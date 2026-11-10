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

/**
 * A prévia grande da vitrine. Os itens de chat aparecem numa conversa de mentira, como no canto da tela do jogo; a
 * moldura aparece na foto grande. Os mutantes, quando chegarem, mostram o boneco aqui.
 */
export function PreviaGrande({ item, usuario }: { item: ItemDaLoja; usuario: Pick<Usuario, 'apelido' | 'avatarUrl'> }) {
  if (item.tipo === 'moldura')
    return (
      <div className="previa-moldura">
        <Avatar usuario={usuario} moldura={item.valor} />
        <b>{usuario.apelido}</b>
      </div>
    );
  return (
    <div className="chat-de-mentira" aria-label="Como fica no chat do jogo">
      <span>
        <b className="nome-comum">outro_jogador</b>: rush B?
      </span>
      <PreviaDoItem item={item} usuario={usuario} />
      <span>
        <b className="nome-comum">mais_um</b>: bora
      </span>
    </div>
  );
}
