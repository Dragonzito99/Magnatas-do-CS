import Link from 'next/link';
import { redirect } from 'next/navigation';
import { exigirAcesso } from '@/auth/guarda';
import { obterBd } from '@/bd/conexao';
import {
  bauDe,
  CATALOGO,
  descontoDeHoje,
  fimDasOfertas,
  itemDoCatalogo,
  ITENS_A_VENDA,
  lojaAberta,
  maisComprados,
  NOME_DA_RARIDADE,
  NOME_DO_TIPO,
  ofertasDoDia,
  PRECOS,
  PRECOS_MAGCOIN,
  precoDeHoje,
  RARIDADE,
  type ItemDaLoja,
  type Raridade,
  type TipoDeItem,
} from '@/dominio/loja';
import { AbasDaLoja } from './abas-da-loja';
import { CarteiraDaShop } from './carteira-da-shop';
import { JanelaDoItem } from './janela-do-item';
import { Preco } from './preco-da-shop';
import { PreviaDoItem } from './previa-do-item';
import { RelogioDasOfertas } from './relogio-das-ofertas';

const ABAS: { valor: TipoDeItem | 'todos'; nome: string }[] = [
  { valor: 'todos', nome: 'Todos' },
  { valor: 'mutante', nome: 'Mutantes' },
  { valor: 'moldura', nome: 'Molduras' },
  { valor: 'etiqueta', nome: 'Etiquetas' },
  { valor: 'aviso', nome: 'Aviso' },
  { valor: 'cor', nome: 'Cor do nome' },
];

const ORDEM_DA_RARIDADE: Raridade[] = ['lendario', 'epico', 'raro', 'comum'];
/** Ao lado do destaque, quando ainda não há compras para dizer o que sai mais. */
const LATERAIS_DE_SEMPRE = ['moldura-fogo', 'etiqueta-chefao'];

type Usuario = Awaited<ReturnType<typeof exigirAcesso>>;

/**
 * A Magnata Shop no jeito das lojas de jogo: carteira no topo, o lançamento em destaque, as ofertas do dia e o catálogo
 * numa grade só, com a cor da raridade em cada cartão. Clicar num item abre a janela com a prévia e os preços.
 */
export default async function Loja({ searchParams }: { searchParams: Promise<{ aba?: string; item?: string; erro?: string; comprado?: string }> }) {
  const usuario = await exigirAcesso('/loja');
  if (!lojaAberta(usuario)) redirect('/inicio');
  const { aba: pedida, item: pedido, erro, comprado } = await searchParams;
  const agora = new Date();
  const bd = obterBd();
  const aba = ABAS.find((opcao) => opcao.valor === pedida)?.valor ?? 'todos';
  const [bau, vendidos] = await Promise.all([bauDe(bd, usuario.id, agora), maisComprados(bd, agora, 3)]);
  const tenho = new Map(bau.filter((posse) => !posse.vencido).map((posse) => [posse.item.id, posse]));

  const aVenda = ITENS_A_VENDA();
  const destaque = aVenda.find((item) => item.lancamento) ?? aVenda[0];
  const maisVendidos = vendidos.filter((id) => id !== destaque.id).slice(0, 2);
  const laterais = [
    ...maisVendidos.map((id) => ({ id, selo: 'Mais comprado' })),
    ...LATERAIS_DE_SEMPRE.filter((id) => !maisVendidos.includes(id)).map((id) => ({ id, selo: 'Destaque' })),
  ]
    .slice(0, 2)
    .flatMap(({ id, selo }) => {
      const item = itemDoCatalogo(id);
      return item && item.venda !== false ? [{ item, selo }] : [];
    });
  const ofertas = ofertasDoDia(agora).flatMap(({ itemId }) => itemDoCatalogo(itemId) ?? []);
  const catalogo = aVenda
    .filter((item) => aba === 'todos' || item.tipo === aba)
    .sort((a, b) => ORDEM_DA_RARIDADE.indexOf(RARIDADE[a.tipo]) - ORDEM_DA_RARIDADE.indexOf(RARIDADE[b.tipo]) || CATALOGO.indexOf(a) - CATALOGO.indexOf(b));

  const pedidoAVenda = pedido ? itemDoCatalogo(pedido) : undefined;
  const aberto = pedidoAVenda?.venda === false ? undefined : pedidoAVenda;
  const enderecoDe = (item?: ItemDaLoja) => {
    const parametros: Record<string, string> = {};
    if (aba !== 'todos') parametros.aba = aba;
    if (item) parametros.item = item.id;
    const busca = new URLSearchParams(parametros).toString();
    return busca ? `/loja?${busca}` : '/loja';
  };
  const cartao = (item: ItemDaLoja) => (
    <CartaoDoItem key={item.id} item={item} usuario={usuario} href={enderecoDe(item)} tenho={tenho.has(item.id)} agora={agora} />
  );

  return (
    <div className="tela-jogar">
      <AbasDaLoja atual="loja" />

      <CarteiraDaShop titulo="Magnata Shop" usuario={usuario} />

      <div className="topo-da-shop">
        <article className={`destaque-da-shop raridade-${RARIDADE[destaque.tipo]}`}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {destaque.imagem && <img src={destaque.imagem} alt="" />}
          <span className="selo-da-raridade">{NOME_DA_RARIDADE[RARIDADE[destaque.tipo]]} · Lançamento</span>
          <h2>{destaque.nome}</h2>
          <p>
            {destaque.descricao ?? NOME_DO_TIPO[destaque.tipo]}
          </p>
          <div className="acoes-do-destaque">
            <Link className="botao-da-shop" href={enderecoDe(destaque)} scroll={false}>
              Ver o {destaque.tipo === 'mutante' ? 'mutante' : 'item'}
            </Link>
            <span className="botao-da-shop vazado">
              <Preco valor={precoDeHoje(destaque, 1, agora)} /> <small>/ 1 dia · ou {PRECOS_MAGCOIN[destaque.tipo]} MagCoin para sempre</small>
            </span>
          </div>
        </article>
        <div className="laterais-da-shop">
          {laterais.map(({ item, selo }) => (
            <Link key={item.id} href={enderecoDe(item)} scroll={false} className={`cartao-da-shop deitado raridade-${RARIDADE[item.tipo]}`}>
              <span className="palco-do-cartao">
                <PreviaDoItem item={item} usuario={usuario} />
              </span>
              <span className="dados-do-cartao">
                <span className="selo-do-cartao">{selo}</span>
                <TipoERaridade item={item} />
                <b className="nome-do-cartao">{item.nome}</b>
                <PrecoDoCartao item={item} agora={agora} />
              </span>
            </Link>
          ))}
        </div>
      </div>

      <div className="secao-da-shop">
        <h2>Ofertas do dia</h2>
        <RelogioDasOfertas fim={fimDasOfertas(agora).toISOString()} />
      </div>
      <div className="grade-da-shop quatro">{ofertas.map(cartao)}</div>

      <div className="secao-da-shop">
        <h2>Todos os itens</h2>
        <Link href="/apoio">Como funcionam Grana e MagCoin?</Link>
      </div>
      <nav className="filtros-da-shop" aria-label="Tipos de item">
        {ABAS.map((opcao) => (
          <Link key={opcao.valor} href={opcao.valor === 'todos' ? '/loja' : `/loja?aba=${opcao.valor}`} scroll={false} aria-current={aba === opcao.valor ? 'page' : undefined}>
            {opcao.nome}
          </Link>
        ))}
      </nav>
      <div className="grade-da-shop">{catalogo.map(cartao)}</div>

      {aberto && (
        <JanelaDoItem item={aberto} usuario={usuario} posse={tenho.get(aberto.id)} fechar={enderecoDe()} erro={erro} comprado={Boolean(comprado)} agora={agora} />
      )}
    </div>
  );
}

function CartaoDoItem({ item, usuario, href, tenho, agora }: { item: ItemDaLoja; usuario: Usuario; href: string; tenho: boolean; agora: Date }) {
  const desconto = descontoDeHoje(item, agora);
  return (
    <Link href={href} scroll={false} className={`cartao-da-shop raridade-${RARIDADE[item.tipo]}`}>
      <span className="palco-do-cartao">
        <PreviaDoItem item={item} usuario={usuario} />
        {desconto > 0 && <span className="desconto-do-cartao">-{desconto}%</span>}
        {tenho && <span className="tenho-do-cartao">Você tem</span>}
      </span>
      <span className="dados-do-cartao">
        <TipoERaridade item={item} />
        <b className="nome-do-cartao">{item.nome}</b>
        <PrecoDoCartao item={item} agora={agora} />
      </span>
    </Link>
  );
}

function TipoERaridade({ item }: { item: ItemDaLoja }) {
  return (
    <span className="tipo-do-cartao">
      {NOME_DO_TIPO[item.tipo]} · {NOME_DA_RARIDADE[RARIDADE[item.tipo]]}
    </span>
  );
}

function PrecoDoCartao({ item, agora }: { item: ItemDaLoja; agora: Date }) {
  const preco = precoDeHoje(item, 1, agora);
  const cheio = PRECOS[item.tipo][1];
  return (
    <span className="preco-do-cartao">
      <Preco valor={preco} antes={preco < cheio ? cheio : undefined} /> <small>/ 1 dia</small>
    </span>
  );
}
