import Link from 'next/link';
import { redirect } from 'next/navigation';
import { exigirAcesso } from '@/auth/guarda';
import { pode } from '@/auth/permissoes';
import { obterBd } from '@/bd/conexao';
import { servidoresDiversao } from '@/bd/esquema';
import { armaLemnos, GRANADAS, granadaLemnos, mochilaLemnos, nomeLemnos, PISTOLA_DE_GRACA, raridadeLemnos, saqueLemnos } from '@/dominio/lemnos/catalogo';
import { ilhaAberta, sessoesRecentes } from '@/dominio/lemnos/estatisticas';
import { kitDe, sessaoAbertaDe } from '@/dominio/lemnos/kit';
import { bauDaLemnos, type ItemDoBauLemnos } from '@/dominio/lemnos/mercado';
import { eq } from 'drizzle-orm';
import { CarteiraDaShop } from '../loja/carteira-da-shop';
import { FecharComEsc } from '../loja/fechar-com-esc';
import { trocarPeca } from './acoes';
import { AvisoDaIlha } from './avisos';
import { AbasDaIlha, ImagemDoItem, TipoDoItem, TopoDaIlha } from './componentes';

const DIA_MS = 24 * 60 * 60 * 1000;
const LIMITE_DE_GRANADAS: Record<string, number> = { hegrenade: 1, flashbang: 2, smokegrenade: 1, molotov: 1 };
type Lugar = 'principal' | 'secundaria' | 'granada' | 'mochila';
const NOME_DO_LUGAR: Record<Lugar, string> = { principal: 'Arma principal', secundaria: 'Pistola', granada: 'Granadas', mochila: 'Mochila' };
const NOME_DO_FIM = { saiu: 'Extraiu', morreu_saindo: 'Morreu', kick_afk: 'Kick por AFK', kick_acampar: 'Kick por acampar', queda: 'Servidor caiu' } as const;
type Filtro = 'todos' | 'arma' | 'granada' | 'mochila' | 'saque';
const FILTROS: { valor: Filtro; nome: string }[] = [
  { valor: 'todos', nome: 'Tudo' },
  { valor: 'arma', nome: 'Armas' },
  { valor: 'granada', nome: 'Granadas' },
  { valor: 'mochila', nome: 'Mochilas' },
  { valor: 'saque', nome: 'Saque' },
];

/** Os itens iguais viram um cartão só, com "×3": dez AKs de grana não são dez cartões. */
type Grupo = { chave: string; itemId: string; tipo: ItemDoBauLemnos['tipo']; quantos: number; validade: string; classe: string };

function validade(item: ItemDoBauLemnos, agora: number): { texto: string; classe: string } {
  if (item.emCampo) return { texto: 'na ilha agora', classe: 'acaba' };
  if (item.tipo === 'saque') return { texto: `vale ${saqueLemnos(item.itemId)?.valor ?? 0}`, classe: '' };
  if (item.vencido) return { texto: 'venceu', classe: '' };
  if (item.expiraEm === null) return item.origem === 'magcoin' ? { texto: 'para sempre', classe: 'sempre' } : { texto: 'uso único', classe: '' };
  const dias = Math.ceil((item.expiraEm.getTime() - agora) / DIA_MS);
  return dias <= 1 ? { texto: 'último dia', classe: 'acaba' } : { texto: `${dias} dias`, classe: '' };
}

function agrupar(bau: ItemDoBauLemnos[], agora: number): Grupo[] {
  const grupos = new Map<string, Grupo>();
  for (const item of bau) {
    const { texto, classe } = validade(item, agora);
    const chave = `${item.itemId}|${texto}`;
    const grupo = grupos.get(chave);
    if (grupo) grupo.quantos += 1;
    else grupos.set(chave, { chave, itemId: item.itemId, tipo: item.tipo, quantos: 1, validade: texto, classe });
  }
  return [...grupos.values()];
}

/**
 * A Ilha Lemnos no site: o kit (os espaços com a arma na mão, como o Baú da Shop), o baú da extração e as últimas idas.
 * O baú só se mexe por aqui; para trocar de arma, o jogador sai do servidor (dono, 15/11/2026).
 */
export default async function IlhaLemnos({ searchParams }: { searchParams: Promise<{ erro?: string; ok?: string; escolher?: string; ver?: string }> }) {
  const usuario = await exigirAcesso('/lemnos');
  const bd = obterBd();
  if (!(await ilhaAberta(bd, usuario))) redirect('/inicio');
  const { erro, ok, escolher, ver } = await searchParams;
  const [bau, kit, aberta, sessoes, [servidor]] = await Promise.all([
    bauDaLemnos(bd, usuario.id),
    kitDe(bd, usuario.id),
    sessaoAbertaDe(bd, usuario.id),
    sessoesRecentes(bd, usuario.id),
    bd.select({ ativo: servidoresDiversao.ativo }).from(servidoresDiversao).where(eq(servidoresDiversao.modo, 'lemnos')),
  ]);
  // eslint-disable-next-line react-hooks/purity -- a página é do servidor e mostra quanto falta a partir de agora.
  const agora = Date.now();
  const entrar = servidor?.ativo || !pode(usuario, 'cuidar_de_lemnos') ? '/jogar' : '/testes';

  const usaveis = bau.filter((item) => !item.vencido && !item.emCampo);
  const quantas = (itemId: string) => usaveis.filter((item) => item.itemId === itemId).length;
  const opcoes = (lugar: Lugar): string[] => {
    const ids = [...new Set(usaveis.map((item) => item.itemId))];
    if (lugar === 'principal') return ids.filter((id) => armaLemnos(id)?.lugar === 'principal');
    if (lugar === 'secundaria') return ids.filter((id) => armaLemnos(id)?.lugar === 'secundaria');
    if (lugar === 'mochila') return ids.filter((id) => mochilaLemnos(id));
    return GRANADAS.map((granada) => granada.id).filter((id) => quantas(id) > kit.granadas.filter((escolhida) => escolhida === id).length && kit.granadas.filter((escolhida) => escolhida === id).length < (LIMITE_DE_GRANADAS[id] ?? 0));
  };
  const escolhendo = (['principal', 'secundaria', 'granada', 'mochila'] as const).find((lugar) => lugar === escolher);
  const filtro = FILTROS.find((opcao) => opcao.valor === ver)?.valor ?? 'todos';
  const grupos = agrupar(
    bau.filter((item) => filtro === 'todos' || item.tipo === filtro),
    agora,
  );
  const extracoes = sessoes.reduce((soma, sessao) => soma + sessao.extracoes, 0);

  const espaco = (lugar: Exclude<Lugar, 'granada'>, id: string | null, vazio: string) => {
    const mostrado = id ?? (lugar === 'secundaria' ? 'glock' : lugar === 'mochila' ? 'basica' : null);
    const detalhe = id === null && lugar === 'secundaria' ? 'De graça · nunca se perde' : id === null && lugar === 'mochila' ? '8 espaços · todo mundo tem' : null;
    return (
      <Link href={aberta ? '/lemnos' : `/lemnos?escolher=${lugar}`} scroll={false} className={`espaco-do-kit raridade-${mostrado ? raridadeLemnos(mostrado) : 'comum'}${mostrado ? '' : ' vazio'}`}>
        <small>{NOME_DO_LUGAR[lugar]}</small>
        {mostrado ? <ImagemDoItem id={mostrado} /> : <span className="mais-do-kit">+</span>}
        <b>{mostrado ? (lugar === 'secundaria' && id === null ? PISTOLA_DE_GRACA.nome : nomeLemnos(mostrado)) : vazio}</b>
        <em>{detalhe ?? (id && lugar === 'mochila' ? `${mochilaLemnos(id)?.espacos} espaços` : id ? `${quantas(id)} no baú` : 'Toque para escolher')}</em>
      </Link>
    );
  };

  return (
    <div className="tela-jogar ilha-lemnos">
      <AbasDaIlha atual="kit" />
      <CarteiraDaShop titulo="Ilha Lemnos" usuario={usuario} />
      <TopoDaIlha
        entrar={entrar}
        numeros={
          sessoes.length > 0 && (
            <>
              <span>
                <b>{sessoes.length}</b> idas recentes
              </span>
              <span>
                <b>{extracoes}</b> extrações
              </span>
            </>
          )
        }
      />
      <AvisoDaIlha erro={erro} ok={ok} />
      {aberta && (
        <p role="status" className="aviso">
          Você está na ilha agora. O kit só muda depois que você sair do servidor.
        </p>
      )}

      <div className="secao-da-shop">
        <h2>Seu kit</h2>
        <span className="legenda-da-secao">É com isso que você entra. Toque num espaço para trocar.</span>
      </div>
      <div className="kit-equipado">
        {espaco('principal', kit.principal, 'Sem arma principal')}
        {espaco('secundaria', kit.secundaria, '')}
        <div className="espaco-do-kit granadas-do-kit">
          <small>Granadas · até 4</small>
          <div className="lista-de-granadas">
            {[0, 1, 2, 3].map((indice) => {
              const granada = kit.granadas[indice];
              if (!granada)
                return (
                  <Link key={indice} href={aberta ? '/lemnos' : '/lemnos?escolher=granada'} scroll={false} className="granada-do-kit vazio">
                    +
                  </Link>
                );
              return (
                <form key={indice} action={trocarPeca} className="granada-do-kit">
                  <input type="hidden" name="lugar" value="granada" />
                  <input type="hidden" name="acao" value="tirar" />
                  <input type="hidden" name="indice" value={indice} />
                  <ImagemDoItem id={granada} />
                  <button type="submit" disabled={!!aberta} aria-label={`Tirar ${granadaLemnos(granada)?.nome}`} title="Tirar do kit">
                    ×
                  </button>
                </form>
              );
            })}
          </div>
        </div>
        {espaco('mochila', kit.mochila, '')}
      </div>

      <div className="secao-da-shop">
        <h2>Baú da extração</h2>
        <Link href="/lemnos/mercado">Comprar armas e mochilas</Link>
      </div>
      {bau.length === 0 ? (
        <div className="extrato-vazio">
          <b>Seu baú da ilha está vazio</b>
          <p>Compre uma arma no mercado para entrar armado, ou entre só com a Glock e traga o primeiro saque.</p>
          <Link className="botao-da-shop" href="/lemnos/mercado">
            Ir ao mercado
          </Link>
        </div>
      ) : (
        <>
          <nav className="filtros-da-shop" aria-label="Filtrar o baú">
            {FILTROS.map((opcao) => (
              <Link key={opcao.valor} href={opcao.valor === 'todos' ? '/lemnos' : `/lemnos?ver=${opcao.valor}`} scroll={false} aria-current={filtro === opcao.valor ? 'page' : undefined}>
                {opcao.nome}
              </Link>
            ))}
          </nav>
          <div className="grade-da-shop">
            {grupos.map((grupo) => (
              <div key={grupo.chave} className={`cartao-da-shop raridade-${raridadeLemnos(grupo.itemId)}`}>
                <span className="palco-do-cartao">
                  <ImagemDoItem id={grupo.itemId} />
                  <span className={`tempo-do-cartao ${grupo.classe}`}>{grupo.validade}</span>
                  {grupo.quantos > 1 && <span className="tenho-do-cartao">×{grupo.quantos}</span>}
                </span>
                <span className="dados-do-cartao">
                  <TipoDoItem id={grupo.itemId} />
                  <b className="nome-do-cartao">{nomeLemnos(grupo.itemId)}</b>
                </span>
              </div>
            ))}
          </div>
        </>
      )}

      {sessoes.length > 0 && (
        <>
          <div className="secao-da-shop">
            <h2>Suas últimas idas</h2>
          </div>
          <div className="idas-da-ilha">
            {sessoes.map((sessao) => (
              <Link key={sessao.id} href={`/lemnos/sessoes/${sessao.id}`} className={sessao.fim === 'saiu' && sessao.extracoes > 0 ? 'ida-da-ilha extraiu' : 'ida-da-ilha'}>
                <small>{sessao.encerradaEm?.toLocaleDateString('pt-BR')}</small>
                <b>{sessao.fim ? NOME_DO_FIM[sessao.fim] : ''}</b>
                <span>
                  {sessao.abates} abates · {sessao.extracoes} extrações · +{sessao.granaGanha} Grana
                </span>
              </Link>
            ))}
          </div>
        </>
      )}

      {escolhendo && !aberta && (
        <div className="janela-da-shop" role="dialog" aria-modal="true" aria-labelledby="titulo-da-escolha">
          <Link href="/lemnos" scroll={false} className="fundo-da-janela" aria-label="Fechar" tabIndex={-1} />
          <FecharComEsc para="/lemnos" />
          <div className="caixa-da-janela escolha-do-kit">
            <Link href="/lemnos" scroll={false} className="fechar-janela" aria-label="Fechar">
              ×
            </Link>
            <h2 id="titulo-da-escolha">{escolhendo === 'granada' ? 'Pôr uma granada' : `Escolher: ${NOME_DO_LUGAR[escolhendo]}`}</h2>
            {opcoes(escolhendo).length === 0 ? (
              <div className="extrato-vazio">
                <b>Nada para escolher aqui</b>
                <p>Você ainda não tem {escolhendo === 'granada' ? 'granadas sobrando' : escolhendo === 'mochila' ? 'mochila maior' : 'arma para este espaço'} no baú.</p>
                <Link className="botao-da-shop" href={`/lemnos/mercado?aba=${escolhendo === 'granada' ? 'granadas' : escolhendo === 'mochila' ? 'mochilas' : 'armas'}`}>
                  Comprar no mercado
                </Link>
              </div>
            ) : (
              <div className="grade-da-shop">
                {opcoes(escolhendo).map((id) => (
                  <form key={id} action={trocarPeca}>
                    <input type="hidden" name="lugar" value={escolhendo} />
                    <input type="hidden" name="acao" value="por" />
                    <input type="hidden" name="valor" value={id} />
                    <button type="submit" className={`cartao-da-shop raridade-${raridadeLemnos(id)}`}>
                      <span className="palco-do-cartao">
                        <ImagemDoItem id={id} />
                        <span className="tenho-do-cartao">×{quantas(id)}</span>
                      </span>
                      <span className="dados-do-cartao">
                        <TipoDoItem id={id} />
                        <b className="nome-do-cartao">{nomeLemnos(id)}</b>
                      </span>
                    </button>
                  </form>
                ))}
              </div>
            )}
            {escolhendo !== 'granada' && (
              <form action={trocarPeca} className="tirar-do-kit">
                <input type="hidden" name="lugar" value={escolhendo} />
                <input type="hidden" name="valor" value="" />
                <button type="submit" className="botao-da-shop vazado">
                  {escolhendo === 'secundaria' ? 'Usar a Glock de graça' : escolhendo === 'mochila' ? 'Usar a mochila básica' : 'Entrar sem arma principal'}
                </button>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
