import Link from 'next/link';
import type { Amigo, ConviteDeSala } from '@/dominio/amigos';
import { Avatar } from './avatar';
import { aceitarConvite, recusarConvite } from './comunidade/acoes';
import { BotaoDeConversa } from './janela-de-conversa';
import { MedirCabecalho } from './medir-cabecalho';

/** Duas ou três letras para o quadradinho do grupo: a sigla do clã, ou as iniciais do nome. */
function siglaDoGrupo(nome: string): string {
  const sigla = /^\[([^\]]+)\]/.exec(nome)?.[1];
  if (sigla) return sigla.slice(0, 4);
  return nome
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((parte) => parte[0]?.toUpperCase())
    .join('');
}

const NOME_DA_SITUACAO: Record<Amigo['situacao'], string> = { jogando: 'jogando agora', online: 'online', offline: 'offline' };

/**
 * A barra de amigos na direita, como na GC (dono, 11/11/2026): começa embaixo do cabeçalho, nunca por cima dele. No topo,
 * a Comunidade com o número de pedidos e convites; depois os amigos com a bolinha (verde online, amarela jogando).
 */
export function BarraDeAmigos({
  amigos,
  pendentes,
  naoLidas,
  grupos,
}: {
  amigos: Amigo[];
  pendentes: number;
  naoLidas: number;
  grupos: { id: string; nome: string; tipo: 'grupo' | 'cla'; naoLidas: number }[];
}) {
  return (
    <aside className="barra-de-amigos" aria-label="Amigos">
      <MedirCabecalho />
      <BotaoDeConversa alvo={{ lista: true }} className="atalho-da-comunidade" title="Mensagens">
        <span aria-hidden="true">💬</span>
        {naoLidas > 0 && <b>{naoLidas}</b>}
        <span className="so-leitor">Mensagens{naoLidas > 0 ? `, ${naoLidas} não lidas` : ''}</span>
      </BotaoDeConversa>
      <Link href="/comunidade" className="atalho-da-comunidade" title="Comunidade: amigos e pedidos">
        <span aria-hidden="true">👥</span>
        {pendentes > 0 && <b>{pendentes}</b>}
        <span className="so-leitor">Comunidade{pendentes > 0 ? `, ${pendentes} pendentes` : ''}</span>
      </Link>
      {grupos.length > 0 && <hr />}
      {grupos.map((grupo) => (
        <span key={grupo.id} className="amigo-na-barra">
          <BotaoDeConversa alvo={{ conversaId: grupo.id }} className={grupo.tipo === 'cla' ? 'grupo-na-barra cla' : 'grupo-na-barra'}>
            {siglaDoGrupo(grupo.nome)}
            {grupo.naoLidas > 0 && <b>{grupo.naoLidas}</b>}
          </BotaoDeConversa>
          <span className="dica-do-amigo" aria-hidden="true">
            {grupo.tipo === 'cla' ? `${grupo.nome} · grupo do clã` : `Grupo: ${grupo.nome}`}
          </span>
        </span>
      ))}
      <hr />
      <ul>
        {amigos.map((amigo) => (
          <li key={amigo.id} className={`amigo-na-barra ${amigo.situacao}`}>
            <BotaoDeConversa alvo={{ amigoId: amigo.id }} className="foto-na-barra" title={`Conversar com ${amigo.apelido}`}>
              <Avatar usuario={amigo} />
              <i aria-hidden="true" />
            </BotaoDeConversa>
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
