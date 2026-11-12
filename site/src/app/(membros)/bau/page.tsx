import Link from 'next/link';
import { redirect } from 'next/navigation';
import { exigirAcesso } from '@/auth/guarda';
import { obterBd } from '@/bd/conexao';
import { bauDe, itemDoCatalogo, lojaAberta, NOME_DA_RARIDADE, NOME_DO_TIPO, RARIDADE, type ItemDoBau, type TipoDeItem } from '@/dominio/loja';
import { DIAS_DOS_ITENS, DIAS_DOS_OUTROS_MUTANTES, ITENS_DO_PRESENTE, MUTANTES_DO_PRESENTE, presenteFechado } from '@/dominio/presentes';
import { Avatar } from '../avatar';
import { CaixaDePresente } from './caixa-de-presente';
import { CarteiraDaShop } from '../loja/carteira-da-shop';
import { PreviaDoItem } from '../loja/previa-do-item';
import { tirar, usar } from './acoes';

const TIPOS: TipoDeItem[] = ['cor', 'etiqueta', 'aviso', 'moldura', 'mutante'];
const NOME_NO_FILTRO: Record<TipoDeItem, string> = { mutante: 'Mutantes', moldura: 'Molduras', etiqueta: 'Etiquetas', aviso: 'Aviso', cor: 'Cor do nome' };
const VAZIO: Record<TipoDeItem, string> = {
  cor: 'Seu nome sai na cor normal',
  etiqueta: 'Nada antes do seu nome',
  aviso: 'Entra sem aviso',
  moldura: 'Foto sem borda',
  mutante: 'Na Mutação, vira o mutante comum',
};

type Filtro = 'todos' | 'uso' | 'vencidos' | TipoDeItem;

const dias = (quantidade: number) => (quantidade === 1 ? '1 dia' : `${quantidade} dias`);
const juntar = (nomes: string[]) => (nomes.length < 2 ? nomes.join('') : `${nomes.slice(0, -1).join(', ')} e ${nomes[nomes.length - 1]}`);

/** Quanto falta, do jeito curto do cartão: "último dia" fica em laranja. */
function tempo(posse: ItemDoBau): { texto: string; classe: string } {
  if (posse.vencido) return { texto: 'venceu', classe: '' };
  if (posse.item.venda === false) return { texto: 'membro', classe: 'sempre' };
  if (posse.diasRestantes === null) return { texto: 'para sempre', classe: 'sempre' };
  if (posse.diasRestantes <= 1) return { texto: 'último dia', classe: 'acaba' };
  return { texto: dias(posse.diasRestantes), classe: '' };
}

/**
 * O Baú como inventário de jogo: em cima, como você aparece e os cinco espaços equipados (um por tipo); embaixo, os itens
 * na grade da Shop, com o que está em uso, quanto falta e os botões de usar, tirar e renovar.
 */
export default async function Bau({ searchParams }: { searchParams: Promise<{ erro?: string; ver?: string; presente?: string }> }) {
  const usuario = await exigirAcesso('/bau');
  if (!lojaAberta(usuario)) redirect('/inicio');
  const { erro, ver, presente: aberto } = await searchParams;
  const [bau, presente] = await Promise.all([bauDe(obterBd(), usuario.id), presenteFechado(obterBd(), usuario.id)]);
  const mutanteDoPresente = aberto ? MUTANTES_DO_PRESENTE.find((item) => item.id === aberto) : undefined;
  const itensDoPresente = juntar(
    ITENS_DO_PRESENTE.map((id) => {
      const item = itemDoCatalogo(id);
      if (!item) return id;
      if (item.tipo === 'aviso') return 'o aviso de entrada';
      if (item.tipo === 'moldura') return `a moldura ${item.nome}`;
      if (item.tipo === 'etiqueta') return `a etiqueta ${item.nome}`;
      return item.nome;
    }),
  );
  const equipado = (tipo: TipoDeItem) => bau.find((posse) => posse.usando && posse.item.tipo === tipo);
  const cor = equipado('cor');
  const etiqueta = equipado('etiqueta');
  const aviso = equipado('aviso');
  const moldura = equipado('moldura');

  const filtros: { valor: Filtro; nome: string; conta: number }[] = [
    { valor: 'todos', nome: 'Todos', conta: bau.length },
    { valor: 'uso', nome: 'Em uso', conta: bau.filter((posse) => posse.usando).length },
    ...TIPOS.slice()
      .reverse()
      .map((tipo) => ({ valor: tipo, nome: NOME_NO_FILTRO[tipo], conta: bau.filter((posse) => posse.item.tipo === tipo).length })),
    { valor: 'vencidos', nome: 'Vencidos', conta: bau.filter((posse) => posse.vencido).length },
  ];
  const filtro = filtros.find((opcao) => opcao.valor === ver)?.valor ?? 'todos';
  const visiveis = bau.filter((posse) =>
    filtro === 'todos' ? true : filtro === 'uso' ? posse.usando : filtro === 'vencidos' ? posse.vencido : posse.item.tipo === filtro,
  );

  return (
    <div className="tela-jogar">
      <CarteiraDaShop titulo="Baú" usuario={usuario} bau={false} />
      {erro && (
        <p role="alert" className="aviso">
          Esse item não está valendo. Compre de novo na Shop para usar.
        </p>
      )}
      {presente && (
        <CaixaDePresente
          opcoes={MUTANTES_DO_PRESENTE.map((item) => ({ id: item.id, nome: item.nome, imagem: item.imagem, descricao: item.evolucoes?.map((nivel) => nivel.poder).join(' · ') }))}
          diasDosOutros={DIAS_DOS_OUTROS_MUTANTES}
          itens={`${itensDoPresente} por ${DIAS_DOS_ITENS} dias`}
        />
      )}
      {mutanteDoPresente && !presente && (
        <p className="aviso presente-aberto" role="status">
          🎁 <b>{mutanteDoPresente.nome}</b> é seu para sempre e já está em uso. Os outros mutantes ficam {DIAS_DOS_OUTROS_MUTANTES} dias, e {itensDoPresente} ficam{' '}
          {DIAS_DOS_ITENS} dias. Tudo está aqui embaixo.
        </p>
      )}

      <div className="equipado-no-bau">
        <section className="vitrine-do-bau" aria-label="Assim você aparece">
          <span className="rotulo-da-janela">Assim você aparece</span>
          <Avatar usuario={usuario} moldura={moldura?.item.valor} />
          <b className="nome-no-bau">{usuario.apelido}</b>
          <div className="chat-de-mentira">
            <span>
              <b className="nome-comum">mais_um</b>: rush B?
            </span>
            <span>
              {etiqueta && <b className="etiqueta-do-chat">{etiqueta.item.valor} </b>}
              <b style={cor ? { color: cor.item.corCss } : undefined} className={cor ? undefined : 'nome-comum'}>
                {usuario.apelido}
              </b>
              : bora, eu entro primeiro
            </span>
            {aviso && <span className="aviso-de-entrada">{aviso.item.valor.replace('{apelido}', usuario.apelido)}</span>}
          </div>
        </section>

        <div className="espacos-do-bau">
          {TIPOS.map((tipo) => {
            const posse = equipado(tipo);
            const outros = bau.some((candidato) => candidato.item.tipo === tipo && !candidato.vencido && !candidato.usando);
            if (!posse)
              return (
                <div key={tipo} className="espaco-do-bau vazio">
                  <span className="selo-da-linha">+</span>
                  <span>
                    <small>{NOME_DO_TIPO[tipo]}</small>
                    <b>Vazio</b>
                    <em>{VAZIO[tipo]}</em>
                  </span>
                  <Link className="link-do-espaco" href={outros ? `/bau?ver=${tipo}` : `/loja?aba=${tipo}`}>
                    {outros ? 'Escolher' : 'Ver na Shop'}
                  </Link>
                </div>
              );
            const quanto = tempo(posse);
            const renovar = quanto.classe === 'acaba' && posse.item.venda !== false;
            return (
              <div key={tipo} className={`espaco-do-bau raridade-${RARIDADE[tipo]}`}>
                <span className={`selo-da-linha raridade-${RARIDADE[tipo]}`}>
                  <PreviaPequena posse={posse} usuario={usuario} />
                </span>
                <span>
                  <small>{NOME_DO_TIPO[tipo]}</small>
                  <b>{posse.item.nome}</b>
                  <em className={quanto.classe}>{quanto.classe === '' && !posse.vencido ? `faltam ${quanto.texto}` : quanto.texto}</em>
                </span>
                <Link className="link-do-espaco" href={renovar ? `/loja?item=${posse.item.id}` : `/bau?ver=${tipo}`}>
                  {renovar ? 'Renovar' : 'Trocar'}
                </Link>
              </div>
            );
          })}
        </div>
      </div>

      <div className="secao-da-shop">
        <h2>Seus itens</h2>
        <span className="legenda-da-secao">A troca vale nos servidores a partir da próxima rodada</span>
      </div>

      {bau.length === 0 ? (
        <div className="extrato-vazio">
          <b>Seu baú está vazio</b>
          <p>O que você comprar na Magnata Shop aparece aqui para usar.</p>
          <Link className="botao-da-shop" href="/loja">
            Ir à Shop
          </Link>
        </div>
      ) : (
        <>
          <nav className="filtros-da-shop" aria-label="Filtrar itens">
            {filtros
              .filter((opcao) => opcao.valor === 'todos' || opcao.conta > 0)
              .map((opcao) => (
                <Link key={opcao.valor} href={opcao.valor === 'todos' ? '/bau' : `/bau?ver=${opcao.valor}`} scroll={false} aria-current={filtro === opcao.valor ? 'page' : undefined}>
                  {opcao.nome} · {opcao.conta}
                </Link>
              ))}
          </nav>
          <div className="grade-da-shop">
            {visiveis.map((posse) => {
              const quanto = tempo(posse);
              const podeComprar = posse.item.venda !== false;
              const classes = ['cartao-da-shop', 'no-bau', `raridade-${RARIDADE[posse.item.tipo]}`, posse.usando ? 'usando' : '', posse.vencido ? 'vencido' : ''];
              return (
                <div key={posse.item.id} className={classes.filter(Boolean).join(' ')}>
                  <span className="palco-do-cartao">
                    <PreviaDoItem item={posse.item} usuario={usuario} />
                    <span className={`tempo-do-cartao ${quanto.classe}`}>{quanto.texto}</span>
                    {posse.usando && <span className="tenho-do-cartao">Em uso</span>}
                  </span>
                  <span className="dados-do-cartao">
                    <span className="tipo-do-cartao">
                      {NOME_DO_TIPO[posse.item.tipo]} · {NOME_DA_RARIDADE[RARIDADE[posse.item.tipo]]}
                    </span>
                    <b className="nome-do-cartao">{posse.item.nome}</b>
                  </span>
                  <span className="acoes-do-cartao">
                    {posse.vencido ? (
                      podeComprar && (
                        <Link className="botao-da-shop" href={`/loja?item=${posse.item.id}`}>
                          Comprar de novo
                        </Link>
                      )
                    ) : (
                      <form action={posse.usando ? tirar : usar}>
                        <input type="hidden" name="itemId" value={posse.item.id} />
                        <button type="submit" className={posse.usando ? 'botao-da-shop vazado' : 'botao-da-shop'}>
                          {posse.usando ? 'Tirar' : 'Usar'}
                        </button>
                      </form>
                    )}
                    {quanto.classe === 'acaba' && podeComprar && (
                      <Link className="botao-da-shop" href={`/loja?item=${posse.item.id}`}>
                        Renovar
                      </Link>
                    )}
                  </span>
                </div>
              );
            })}
          </div>
        </>
      )}

      <p className="apoio">
        O que você comprou e cada ganho de Grana ficam em <Link href="/compras">Minhas compras</Link>.
      </p>
    </div>
  );
}

/** O item em tamanho de ícone, para os espaços equipados. */
function PreviaPequena({ posse, usuario }: { posse: ItemDoBau; usuario: { apelido: string; avatarUrl: string | null } }) {
  const item = posse.item;
  // eslint-disable-next-line @next/next/no-img-element
  if (item.tipo === 'mutante') return <img src={item.imagem} alt="" />;
  if (item.tipo === 'moldura') return <Avatar usuario={usuario} moldura={item.valor} />;
  if (item.tipo === 'cor') return <b style={{ color: item.corCss }}>Aa</b>;
  if (item.tipo === 'etiqueta') return <b className="etiqueta-do-chat">[ ]</b>;
  return <b className="etiqueta-do-chat">★</b>;
}
