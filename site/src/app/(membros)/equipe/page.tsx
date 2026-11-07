import Link from 'next/link';
import { redirect } from 'next/navigation';
import { obterBd } from '@/bd/conexao';
import { pode } from '@/auth/permissoes';
import { exigirAcesso } from '@/auth/guarda';
import { listarMembros } from '@/dominio/equipe';
import { NOME_DO_ESTADO, NOME_DO_PAPEL } from '@/dominio/textos-da-conta';
import { concederConvites, trocarPapel } from './acoes';

const ERROS: Record<string, string> = {
  'ultimo-adm': 'A plataforma precisa ter pelo menos um Adm ativo.',
  quantidade: 'A quantidade de convites precisa ser de 1 a 100.',
  papel: 'Papel desconhecido.',
};

export default async function Equipe({ searchParams }: { searchParams: Promise<{ erro?: string }> }) {
  const usuario = await exigirAcesso('/equipe');
  if (!pode(usuario, 'ver_equipe')) redirect('/salas');
  const { erro } = await searchParams;
  const membros = await listarMembros(obterBd());
  const podeMudarPapel = pode(usuario, 'mudar_papel');
  const podeDarConvites = pode(usuario, 'dar_convites');

  return (
    <>
      <div className="topo-pagina">
        <h1>Equipe</h1>
        <span className="apoio">{membros.length} contas</span>
        {pode(usuario, 'publicar_noticia') && (
          <Link href="/equipe/noticias" className="botao ouro pequeno">
            Notícias do clube
          </Link>
        )}
      </div>
      {erro && ERROS[erro] && (
        <p role="alert" className="aviso">
          {ERROS[erro]}
        </p>
      )}
      <section className="painel">
        {membros.map((membro) => (
          <div className="linha linha-membro" key={membro.id}>
            <div>
              <b>
                <Link href={`/jogadores/${membro.id}`}>{membro.apelido}</Link>
              </b>
              <small>{membro.convidadoPorApelido ? `Convidado por ${membro.convidadoPorApelido}` : 'Sem convite registrado'}</small>
            </div>
            <span className={membro.estado === 'ativo' ? 'etiqueta ok' : 'etiqueta'}>{NOME_DO_ESTADO[membro.estado]}</span>
            <span className="etiqueta">{membro.convitesRestantes} convites</span>
            <div className="acoes">
              {podeMudarPapel ? (
                <form action={trocarPapel} className="acoes">
                  <input type="hidden" name="alvo" value={membro.id} />
                  <select name="papel" defaultValue={membro.papel} aria-label={`Papel de ${membro.apelido}`}>
                    {Object.entries(NOME_DO_PAPEL).map(([valor, nome]) => (
                      <option key={valor} value={valor}>
                        {nome}
                      </option>
                    ))}
                  </select>
                  <button type="submit" className="botao cinza pequeno">
                    Salvar
                  </button>
                </form>
              ) : (
                <span className="etiqueta">{NOME_DO_PAPEL[membro.papel]}</span>
              )}
              {podeDarConvites && (
                <form action={concederConvites} className="acoes">
                  <input type="hidden" name="alvo" value={membro.id} />
                  <input
                    name="quantidade"
                    type="number"
                    min={1}
                    max={100}
                    defaultValue={1}
                    className="campo-curto"
                    aria-label={`Convites para ${membro.apelido}`}
                  />
                  <button type="submit" className="botao cinza pequeno">
                    Dar convites
                  </button>
                </form>
              )}
            </div>
          </div>
        ))}
      </section>
    </>
  );
}
