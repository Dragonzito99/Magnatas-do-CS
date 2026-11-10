import Link from 'next/link';
import { redirect } from 'next/navigation';
import { exigirAcesso } from '@/auth/guarda';
import { obterBd } from '@/bd/conexao';
import { bauDe, lojaAberta, NOME_DO_TIPO } from '@/dominio/loja';
import { PreviaDoItem } from '../loja/previa-do-item';
import { tirar, usar } from './acoes';

const dias = (quantidade: number) => (quantidade === 1 ? '1 dia' : `${quantidade} dias`);

export default async function Bau({ searchParams }: { searchParams: Promise<{ erro?: string }> }) {
  const usuario = await exigirAcesso('/bau');
  if (!lojaAberta(usuario)) redirect('/inicio');
  const { erro } = await searchParams;
  const bd = obterBd();
  const bau = await bauDe(bd, usuario.id);

  return (
    <div className="tela-jogar">
      <div className="topo-jogar">
        <h1>Baú</h1>
        <p className="apoio">
          Escolha o que usar. Nos servidores, a troca vale a partir da próxima rodada. Saldo:{' '}
          <b className="grana-destaque">{usuario.grana.toLocaleString('pt-BR')} Grana</b>.
        </p>
      </div>
      {erro && (
        <p role="alert" className="aviso">
          Esse item não está valendo. Compre de novo na loja para usar.
        </p>
      )}

      <section className="secao-loja">
        <div className="cabeca-secao-loja">
          <h2>Seus itens</h2>
        </div>
        {bau.length === 0 ? (
          <p className="apoio">
            Seu baú está vazio. <Link href="/loja">Vá à Magnata Shop</Link>.
          </p>
        ) : (
          <div className="itens-loja">
            {bau.map((posse) => (
              <form key={posse.item.id} action={posse.usando ? tirar : usar} className={posse.vencido ? 'cartao-loja vencido' : 'cartao-loja'}>
                <input type="hidden" name="itemId" value={posse.item.id} />
                <div className="previa-loja">
                  <PreviaDoItem item={posse.item} usuario={usuario} />
                </div>
                <div className="nome-loja">
                  <b>{posse.item.nome}</b>
                  <small>
                    {NOME_DO_TIPO[posse.item.tipo]} ·{' '}
                    {posse.vencido ? 'venceu' : posse.diasRestantes === null ? 'para sempre' : `faltam ${dias(posse.diasRestantes)}`}
                  </small>
                </div>
                {posse.vencido ? (
                  <Link href="/loja" className="botao cinza pequeno">
                    Comprar de novo
                  </Link>
                ) : (
                  <button type="submit" className={posse.usando ? 'botao cinza pequeno' : 'botao ouro pequeno'}>
                    {posse.usando ? 'Tirar' : 'Usar'}
                  </button>
                )}
                {posse.usando && <span className="em-uso">Em uso</span>}
              </form>
            ))}
          </div>
        )}
      </section>

      <p className="apoio">
        O que você comprou e cada ganho de Grana ficam em <Link href="/compras">Minhas compras</Link>.
      </p>
    </div>
  );
}
