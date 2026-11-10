import Link from 'next/link';
import { redirect } from 'next/navigation';
import { exigirAcesso } from '@/auth/guarda';
import { obterBd } from '@/bd/conexao';
import { extrato } from '@/dominio/grana';
import { lojaAberta } from '@/dominio/loja';
import { motivoDaLinha } from '@/dominio/textos-da-grana';
import { AbasDaLoja } from '../loja/abas-da-loja';

const quando = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short', timeZone: 'America/Sao_Paulo' });

/** Minhas compras: cada compra e cada ganho de Grana, com o saldo depois de cada um. */
export default async function MinhasCompras() {
  const usuario = await exigirAcesso('/compras');
  if (!lojaAberta(usuario)) redirect('/inicio');
  const linhas = await extrato(obterBd(), usuario.id);

  return (
    <div className="tela-jogar">
      <AbasDaLoja atual="compras" />
      <div className="topo-jogar">
        <h1>Minhas compras</h1>
        <p className="apoio">
          Saldo: <b className="grana-destaque">{usuario.grana.toLocaleString('pt-BR')} Grana</b>. Para usar o que comprou, abra o{' '}
          <Link href="/bau">Baú</Link>.
        </p>
      </div>

      <section className="secao-loja">
        <div className="cabeca-secao-loja">
          <h2>Extrato da Grana</h2>
          <p className="apoio">Cada compra e cada ganho, do mais novo para o mais antigo.</p>
        </div>
        {linhas.length === 0 ? (
          <p className="apoio">Nenhum movimento ainda. Jogue uma partida para ganhar Grana.</p>
        ) : (
          <div className="tabela-rolavel">
            <table className="tabela-extrato">
              <thead>
                <tr>
                  <th>Quando</th>
                  <th>Motivo</th>
                  <th>Grana</th>
                  <th>Saldo</th>
                </tr>
              </thead>
              <tbody>
                {linhas.map((linha) => (
                  <tr key={linha.id}>
                    <td>{quando.format(linha.criadoEm)}</td>
                    <td>{motivoDaLinha(linha)}</td>
                    <td className={linha.quantidade > 0 ? 'ganho' : 'gasto'}>
                      {linha.quantidade > 0 ? '+' : ''}
                      {linha.quantidade.toLocaleString('pt-BR')}
                    </td>
                    <td>{linha.saldo.toLocaleString('pt-BR')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
