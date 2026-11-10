import { randomUUID } from 'node:crypto';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { exigirAcesso } from '@/auth/guarda';
import { obterBd } from '@/bd/conexao';
import { bauDe, CATALOGO, DIAS_A_VENDA, itemDoCatalogo, lojaAberta, NOME_DO_TIPO, PRECOS, type TipoDeItem } from '@/dominio/loja';
import { BotaoConfirmar } from '../botao-confirmar';
import { AbasDaLoja } from './abas-da-loja';
import { comprar } from './acoes';
import { PreviaDoItem, PreviaGrande } from './previa-do-item';

const ERROS: Record<string, string> = {
  saldo: 'Grana insuficiente para essa compra.',
  item: 'Esse item não está à venda desse jeito.',
  conta: 'Sua conta não pode comprar agora.',
};

const EXPLICACAO: Record<TipoDeItem, string> = {
  cor: 'Seu nome sai nessa cor no chat de todos os servidores.',
  etiqueta: 'Aparece antes do seu nome no chat de todos os servidores.',
  aviso: 'Quando você entra no servidor, todo mundo vê.',
  moldura: 'Uma borda especial na sua foto, no perfil e no ranking.',
};

const ABAS: { valor: TipoDeItem | 'todos'; nome: string }[] = [
  { valor: 'todos', nome: 'Todos' },
  { valor: 'cor', nome: 'Cor do nome' },
  { valor: 'etiqueta', nome: 'Etiqueta' },
  { valor: 'aviso', nome: 'Aviso' },
  { valor: 'moldura', nome: 'Moldura' },
];

const dias = (quantidade: number) => (quantidade === 1 ? '1 dia' : `${quantidade} dias`);

/**
 * A Magnata Shop como vitrine: a conta e a prévia do item escolhido à esquerda, as abas e os itens à direita. Clicar
 * num item mostra como ele fica e os preços; os mutantes com poder entram aqui depois, com o boneco na prévia.
 */
export default async function Loja({ searchParams }: { searchParams: Promise<{ aba?: string; item?: string; erro?: string; comprado?: string }> }) {
  const usuario = await exigirAcesso('/loja');
  if (!lojaAberta(usuario)) redirect('/inicio');
  const { aba: pedida, item: pedido, erro, comprado } = await searchParams;
  const aba = ABAS.find((opcao) => opcao.valor === pedida)?.valor ?? 'todos';
  const bau = await bauDe(obterBd(), usuario.id);
  const tenho = new Map(bau.filter((posse) => !posse.vencido).map((posse) => [posse.item.id, posse]));
  const itens = CATALOGO.filter((item) => aba === 'todos' || item.tipo === aba);
  const escolhido = (pedido ? itemDoCatalogo(pedido) : undefined) ?? itens[0];
  const posse = tenho.get(escolhido.id);
  const endereco = (item: string) => `/loja?${new URLSearchParams({ ...(aba !== 'todos' ? { aba } : {}), item }).toString()}`;

  return (
    <div className="tela-jogar">
      <AbasDaLoja atual="loja" />

      <div className="vitrine">
        <aside className="lado-da-loja">
          <section className="caixa-da-loja">
            <h2>Sua conta</h2>
            <div className="saldo-da-loja">
              <span>Grana</span>
              <b>{usuario.grana.toLocaleString('pt-BR')}</b>
            </div>
            <div className="saldo-da-loja apagado">
              <span>MagCoin</span>
              <small>em breve</small>
            </div>
            <p className="apoio">Ganhe jogando: 1 Grana a cada 10 XP.</p>
          </section>

          <section className="caixa-da-loja previa-da-loja" aria-live="polite">
            <h2>Prévia</h2>
            <div className="palco-da-previa">
              <PreviaGrande item={escolhido} usuario={usuario} />
            </div>
            <div className="nome-loja">
              <b>
                {NOME_DO_TIPO[escolhido.tipo]}: {escolhido.nome}
              </b>
              <small>{EXPLICACAO[escolhido.tipo]}</small>
              {posse && <small className="tenho">{posse.diasRestantes === null ? 'Seu para sempre' : `Você tem: ${dias(posse.diasRestantes)}. Comprar soma.`}</small>}
            </div>
            {erro && ERROS[erro] && (
              <p role="alert" className="aviso">
                {ERROS[erro]}
              </p>
            )}
            {comprado && (
              <p className="aviso">
                Comprado. <Link href="/bau">Abra o baú</Link> para usar.
              </p>
            )}
            <form action={comprar} className="precos-loja">
              <input type="hidden" name="itemId" value={escolhido.id} />
              <input type="hidden" name="codigo" value={randomUUID()} />
              {DIAS_A_VENDA.map((quantidade) => {
                const preco = PRECOS[escolhido.tipo][quantidade];
                if (preco > usuario.grana)
                  return (
                    <span key={quantidade} className="preco-loja sem-saldo" title={`Faltam ${preco - usuario.grana} Grana`}>
                      <span>{dias(quantidade)}</span>
                      <b>{preco}</b>
                    </span>
                  );
                return (
                  <BotaoConfirmar
                    key={quantidade}
                    className="preco-loja"
                    name="dias"
                    value={String(quantidade)}
                    mensagem={`Comprar ${NOME_DO_TIPO[escolhido.tipo]} ${escolhido.nome} por ${dias(quantidade)}, por ${preco} Grana?`}
                  >
                    <span>{dias(quantidade)}</span>
                    <b>{preco}</b>
                  </BotaoConfirmar>
                );
              })}
            </form>
          </section>
        </aside>

        <section className="caixa-da-loja prateleira">
          <nav className="filtros-da-loja" aria-label="Tipos de item">
            {ABAS.map((opcao) => (
              <Link key={opcao.valor} href={opcao.valor === 'todos' ? '/loja' : `/loja?aba=${opcao.valor}`} className="filtro-da-loja" aria-current={aba === opcao.valor ? 'page' : undefined}>
                {opcao.nome}
              </Link>
            ))}
            <span className="filtro-da-loja apagado" title="Mutantes com poder: em breve">
              Mutantes <em>em breve</em>
            </span>
          </nav>
          <div className="itens-da-prateleira">
            {itens.map((item) => (
              <Link
                key={item.id}
                href={endereco(item.id)}
                scroll={false}
                className={item.id === escolhido.id ? 'item-da-prateleira escolhido' : 'item-da-prateleira'}
                aria-current={item.id === escolhido.id ? 'true' : undefined}
              >
                <span className="tipo-do-item">{NOME_DO_TIPO[item.tipo]}</span>
                <span className="miniatura-do-item">
                  <PreviaDoItem item={item} usuario={usuario} />
                </span>
                <span className="rodape-do-item">
                  <b>{item.nome}</b>
                  <small>
                    {PRECOS[item.tipo][1]} Grana: 1 dia
                    {tenho.has(item.id) && <em className="tenho"> · você tem</em>}
                  </small>
                </span>
              </Link>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
