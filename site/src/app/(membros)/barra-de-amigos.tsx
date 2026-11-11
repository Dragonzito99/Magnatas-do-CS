import Link from 'next/link';
import type { Amigo, ConviteDeSala } from '@/dominio/amigos';
import { Avatar } from './avatar';
import { aceitarConvite, recusarConvite } from './comunidade/acoes';
import { MedirCabecalho } from './medir-cabecalho';

const NOME_DA_SITUACAO: Record<Amigo['situacao'], string> = { jogando: 'jogando agora', online: 'online', offline: 'offline' };

/**
 * A barra de amigos na direita, como na GC (dono, 11/11/2026): começa embaixo do cabeçalho, nunca por cima dele. No topo,
 * a Comunidade com o número de pedidos e convites; depois os amigos com a bolinha (verde online, amarela jogando).
 */
export function BarraDeAmigos({ amigos, pendentes }: { amigos: Amigo[]; pendentes: number }) {
  return (
    <aside className="barra-de-amigos" aria-label="Amigos">
      <MedirCabecalho />
      <Link href="/comunidade" className="atalho-da-comunidade" title="Comunidade: amigos e pedidos">
        <span aria-hidden="true">👥</span>
        {pendentes > 0 && <b>{pendentes}</b>}
        <span className="so-leitor">Comunidade{pendentes > 0 ? `, ${pendentes} pendentes` : ''}</span>
      </Link>
      <hr />
      <ul>
        {amigos.map((amigo) => (
          <li key={amigo.id} className={`amigo-na-barra ${amigo.situacao}`}>
            <Link href={`/jogadores/${amigo.id}`} aria-label={`${amigo.apelido}, ${NOME_DA_SITUACAO[amigo.situacao]}`}>
              <Avatar usuario={amigo} />
              <i aria-hidden="true" />
            </Link>
            <span className="dica-do-amigo" aria-hidden="true">
              {amigo.apelido} · {NOME_DA_SITUACAO[amigo.situacao]}
            </span>
          </li>
        ))}
      </ul>
      <Link href="/comunidade#procurar" className="adicionar-amigo" title="Adicionar amigo">
        +<span className="so-leitor">Adicionar amigo</span>
      </Link>
    </aside>
  );
}

/** O convite para a sala que chegou: aparece no canto, em qualquer tela, com Entrar e Recusar. */
export function AvisoDeConvite({ convite }: { convite: ConviteDeSala | null }) {
  if (!convite) return null;
  return (
    <div className="aviso-de-convite" role="status">
      <b>Convite para a sala</b>
      <span>
        <strong>{convite.deApelido}</strong> chamou você para a sala de {convite.salaNome} ({convite.membros}/5).
      </span>
      <div>
        <form action={aceitarConvite}>
          <input type="hidden" name="conviteId" value={convite.id} />
          <button type="submit" className="botao-da-shop">
            Entrar na sala
          </button>
        </form>
        <form action={recusarConvite}>
          <input type="hidden" name="conviteId" value={convite.id} />
          <input type="hidden" name="voltar" value="/jogar" />
          <button type="submit" className="botao-da-shop vazado">
            Agora não
          </button>
        </form>
      </div>
    </div>
  );
}
