import { redirect } from 'next/navigation';
import { obterBd } from '@/bd/conexao';
import type { Convite } from '@/bd/esquema';
import { usuarioAtual } from '@/auth/sessao-atual';
import { listarConvites } from '@/dominio/convites';
import { gerar, revogar } from './acoes';
import { BotaoCopiar } from './botao-copiar';

const ERROS: Record<string, string> = {
  'sem-convites': 'Você não tem convites disponíveis.',
  revogar: 'Este convite não pode mais ser revogado.',
};

function situacao(convite: Convite): string {
  if (convite.usadoEm) return 'Usado';
  if (convite.revogadoEm) return 'Revogado';
  return 'Disponível';
}

export default async function Convites({ searchParams }: { searchParams: Promise<{ erro?: string }> }) {
  const usuario = await usuarioAtual();
  if (!usuario) redirect('/');
  const { erro } = await searchParams;
  const lista = await listarConvites(obterBd(), usuario);
  const ilimitado = usuario.papel !== 'jogador';

  return (
    <>
      <div className="topo-pagina">
        <h1>Convites</h1>
        <form action={gerar}>
          <button type="submit" className="botao laranja pequeno">
            Gerar convite
          </button>
        </form>
      </div>
      <p className="apoio">{ilimitado ? 'Você gera convites sem limite.' : `Você tem ${usuario.convitesRestantes} convites disponíveis.`}</p>
      {erro && ERROS[erro] && (
        <p role="alert" className="aviso">
          {ERROS[erro]}
        </p>
      )}
      <section className="painel">
        {lista.length === 0 && <p className="vazio">Os códigos que você gerar aparecem aqui.</p>}
        {lista.map((convite) => {
          const estado = situacao(convite);
          return (
            <div className="linha" key={convite.id}>
              <code className="mono">{convite.codigo}</code>
              <span className={estado === 'Disponível' ? 'etiqueta ok' : 'etiqueta'}>{estado}</span>
              <div className="acoes">
                {estado === 'Disponível' && (
                  <>
                    <BotaoCopiar texto={convite.codigo} />
                    <form action={revogar}>
                      <input type="hidden" name="codigo" value={convite.codigo} />
                      <button type="submit" className="botao cinza pequeno">
                        Revogar
                      </button>
                    </form>
                  </>
                )}
              </div>
            </div>
          );
        })}
      </section>
    </>
  );
}
