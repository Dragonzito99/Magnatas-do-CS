import Link from 'next/link';
import { redirect } from 'next/navigation';
import { exigirAcesso } from '@/auth/guarda';
import { obterBd } from '@/bd/conexao';
import type { Usuario } from '@/bd/esquema';
import { extrato, type LinhaDoExtrato } from '@/dominio/grana';
import { itemDoCatalogo, lojaAberta, RARIDADE } from '@/dominio/loja';
import { descreverLinha } from '@/dominio/textos-da-grana';
import { Avatar } from '../avatar';
import { AbasDaLoja } from '../loja/abas-da-loja';
import { CarteiraDaShop } from '../loja/carteira-da-shop';

const FUSO = 'America/Sao_Paulo';
const diaDe = new Intl.DateTimeFormat('en-CA', { timeZone: FUSO, year: 'numeric', month: '2-digit', day: '2-digit' });
const diaPorExtenso = new Intl.DateTimeFormat('pt-BR', { timeZone: FUSO, weekday: 'long', day: 'numeric', month: 'long' });
const hora = new Intl.DateTimeFormat('pt-BR', { timeZone: FUSO, hour: '2-digit', minute: '2-digit' });

const SIMBOLO: Partial<Record<LinhaDoExtrato['tipo'], string>> = { partida: 'XP', abertura: 'XP', ajuste: 'ADM', pagamento: 'M', mensalidade: 'M', estorno: '↩', insignia: '★', presente: '🎁' };

/** O extrato agrupado por dia, do mais novo para o mais antigo, com "Hoje" e "Ontem" no lugar da data. */
function porDia(linhas: LinhaDoExtrato[], agora: Date) {
  const hoje = diaDe.format(agora);
  const ontem = diaDe.format(new Date(agora.getTime() - 24 * 60 * 60 * 1000));
  const grupos = new Map<string, { titulo: string; linhas: LinhaDoExtrato[] }>();
  for (const linha of linhas) {
    const chave = diaDe.format(linha.criadoEm);
    const extenso = diaPorExtenso.format(linha.criadoEm);
    const titulo = chave === hoje ? `Hoje · ${extenso}` : chave === ontem ? `Ontem · ${extenso}` : extenso;
    const grupo = grupos.get(chave) ?? { titulo, linhas: [] };
    grupo.linhas.push(linha);
    grupos.set(chave, grupo);
  }
  return [...grupos.entries()];
}

function SeloDaLinha({ linha, usuario }: { linha: LinhaDoExtrato; usuario: Pick<Usuario, 'apelido' | 'avatarUrl'> }) {
  const { itemId } = descreverLinha(linha);
  const item = itemId ? itemDoCatalogo(itemId) : undefined;
  if (!item) return <span className={`selo-da-linha ${linha.tipo}`}>{SIMBOLO[linha.tipo] ?? '$'}</span>;
  return (
    <span className={`selo-da-linha raridade-${RARIDADE[item.tipo]}`}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {item.tipo === 'mutante' && <img src={item.imagem} alt="" />}
      {item.tipo === 'moldura' && <Avatar usuario={usuario} moldura={item.valor} />}
      {item.tipo === 'cor' && <b style={{ color: item.corCss }}>Aa</b>}
      {item.tipo === 'etiqueta' && <b className="etiqueta-do-chat">[ ]</b>}
      {item.tipo === 'aviso' && <b className="etiqueta-do-chat">★</b>}
    </span>
  );
}

/** Minhas compras: cada compra e cada ganho, de Grana ou de MagCoin, agrupados por dia, com o saldo depois de cada um. */
export default async function MinhasCompras({ searchParams }: { searchParams: Promise<{ moeda?: string }> }) {
  const usuario = await exigirAcesso('/compras');
  if (!lojaAberta(usuario)) redirect('/inicio');
  const moeda = (await searchParams).moeda === 'magcoin' ? 'magcoin' : 'grana';
  const agora = new Date();
  const linhas = await extrato(obterBd(), usuario.id, { moeda });
  const dias = porDia(linhas, agora);

  return (
    <div className="tela-jogar">
      <AbasDaLoja atual="compras" />
      <CarteiraDaShop titulo="Minhas compras" usuario={usuario} />

      <nav className="filtros-da-shop" aria-label="Moeda">
        <Link href="/compras" aria-current={moeda === 'grana' ? 'page' : undefined}>
          Grana
        </Link>
        <Link href="/compras?moeda=magcoin" aria-current={moeda === 'magcoin' ? 'page' : undefined}>
          MagCoin
        </Link>
      </nav>

      {dias.length === 0 ? (
        <div className="extrato-vazio">
          <b>{moeda === 'grana' ? 'Nenhum movimento de Grana ainda' : 'Nenhuma MagCoin ainda'}</b>
          <p>{moeda === 'grana' ? 'Cada partida jogada até o fim dá Grana: 1 a cada 10 XP.' : 'MagCoin compra itens para sempre na Magnata Shop.'}</p>
          <Link className="botao-da-shop" href={moeda === 'grana' ? '/jogar' : '/apoio'}>
            {moeda === 'grana' ? 'Jogar' : 'Comprar MagCoin'}
          </Link>
        </div>
      ) : (
        dias.map(([chave, grupo]) => (
          <section key={chave} className="dia-do-extrato">
            <h2>{grupo.titulo}</h2>
            <ul>
              {grupo.linhas.map((linha) => {
                const { titulo, detalhe, itemId } = descreverLinha(linha);
                const ganho = linha.quantidade > 0;
                return (
                  <li key={linha.id} className="linha-do-extrato">
                    <SeloDaLinha linha={linha} usuario={usuario} />
                    <span className="texto-da-linha">
                      {itemId ? (
                        <Link href={`/loja?item=${itemId}`} className="titulo-da-linha">
                          {titulo}
                        </Link>
                      ) : (
                        <b className="titulo-da-linha">{titulo}</b>
                      )}
                      <small>
                        {hora.format(linha.criadoEm)}
                        {detalhe && ` · ${detalhe}`}
                      </small>
                    </span>
                    <span className={ganho ? 'valor-da-linha ganho' : 'valor-da-linha gasto'}>
                      {ganho ? '+' : '−'}
                      {Math.abs(linha.quantidade).toLocaleString('pt-BR')}
                      <small>{moeda === 'grana' ? ' Grana' : ' MagCoin'}</small>
                    </span>
                    <span className="saldo-da-linha">
                      <small>Saldo</small>
                      {linha.saldo.toLocaleString('pt-BR')}
                    </span>
                  </li>
                );
              })}
            </ul>
          </section>
        ))
      )}
      {linhas.length === 100 && <p className="apoio">Mostrando os 100 movimentos mais recentes.</p>}
    </div>
  );
}
