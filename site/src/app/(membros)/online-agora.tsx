import Link from 'next/link';
import { obterBd } from '@/bd/conexao';
import { membrosOnline } from '@/dominio/denuncias';
import { Avatar } from './avatar';

export async function OnlineAgora() {
  const membros = await membrosOnline(obterBd());
  return (
    <section className="painel">
      <div className="cabeca-painel">
        <h2>Online agora</h2>
        <span>{membros.length}</span>
      </div>
      <div className="lista-online">
        {membros.map((membro) => (
          <Link className="perfil" href={`/jogadores/${membro.id}`} key={membro.id}>
            <Avatar usuario={membro} />
            <span className="nome">{membro.apelido}</span>
          </Link>
        ))}
      </div>
    </section>
  );
}
