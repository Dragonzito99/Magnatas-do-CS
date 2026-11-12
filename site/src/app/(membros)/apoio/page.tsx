import Link from 'next/link';
import { exigirAcesso } from '@/auth/guarda';
import { obterBd } from '@/bd/conexao';
import { enderecoDe, enviosDe } from '@/dominio/envios';
import { metaDoMes } from '@/dominio/meta-do-mes';
import { NIVEIS, ORDEM_DOS_NIVEIS, nivelAtivo, type NivelDeMembro } from '@/dominio/membros';
import { bonusDoPacote, minhaAssinatura, PACOTES, pacotesPara, type Pacote } from '@/dominio/pagamentos';
import { BotaoConfirmar } from '../botao-confirmar';
import { AbasDaLoja } from '../loja/abas-da-loja';
import { CarteiraDaShop } from '../loja/carteira-da-shop';
import { FecharComEsc } from '../loja/fechar-com-esc';
import { assinarNivel, cancelar, comprarPacote, salvarMeuEndereco } from './acoes';

const ERROS: Record<string, string> = {
  desligado: 'Os pagamentos ainda não estão ligados. Volte em breve.',
  mercadopago: 'O Mercado Pago não respondeu. Tente de novo em alguns minutos.',
  email: 'Escreva o e-mail da sua conta do Mercado Pago.',
  membro: 'Você já tem uma assinatura ativa. Cancele a atual para trocar de nível.',
  conta: 'Sua conta não pode fazer isso agora.',
  endereco: 'Confira o endereço: CEP com 8 números, UF com 2 letras e telefone com DDD.',
  premium: 'O endereço é só para quem assina o Magnata Premium.',
  pacote: 'Esse pacote não existe.',
  nivel: 'Esse nível não existe.',
};
const AVISOS: Record<string, string> = {
  cancelada: 'Assinatura cancelada. As vantagens continuam até o fim do que você já pagou.',
  endereco: 'Endereço salvo.',
};

const reais = (centavos: number) => (centavos / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const reaisCurtos = (centavos: number) => `R$ ${(centavos / 100).toLocaleString('pt-BR', { maximumFractionDigits: 2 })}`;
const data = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeZone: 'America/Sao_Paulo' });
const nomeDoMes = new Intl.DateTimeFormat('pt-BR', { month: 'long', timeZone: 'America/Sao_Paulo' });

/** Onde cada moeda fica na pilha de cada pacote (deslocamento do centro e altura, em px). */
const PILHAS: Record<Pacote, [number, number][]> = {
  pequeno: [[0, 60]],
  teste: [[0, 60]],
  medio: [
    [-30, 70],
    [30, 70],
    [0, 42],
  ],
  grande: [
    [-62, 86],
    [0, 90],
    [62, 86],
    [-30, 58],
    [32, 58],
    [0, 28],
  ],
};

type Linha = { nome: string; valor: (nivel: NivelDeMembro) => string | boolean };
/** A tabela de comparação sai das regras de cada nível, para nunca prometer o que o nível não dá. */
const LINHAS: Linha[] = [
  { nome: 'Site sem anúncios', valor: () => true },
  { nome: 'Selo do nível no perfil', valor: () => true },
  { nome: 'Etiqueta [APOIADOR] no chat', valor: (nivel) => NIVEIS[nivel].itens.includes('etiqueta-apoiador') },
  { nome: 'Grana a mais por partida', valor: (nivel) => (NIVEIS[nivel].bonusGrana ? `+${Math.round(NIVEIS[nivel].bonusGrana * 100)}%` : false) },
  { nome: 'MagCoins todo mês', valor: (nivel) => (NIVEIS[nivel].magcoinsPorMes ? String(NIVEIS[nivel].magcoinsPorMes) : false) },
  { nome: 'Nome dourado no chat', valor: (nivel) => NIVEIS[nivel].itens.includes('cor-dourada') },
  { nome: 'Moldura exclusiva Ouro', valor: (nivel) => NIVEIS[nivel].itens.includes('moldura-ouro') },
  { nome: 'Presente: 1 mutante seu para sempre', valor: (nivel) => Boolean(NIVEIS[nivel].premium) },
  { nome: 'Produtos do clube em casa', valor: (nivel) => Boolean(NIVEIS[nivel].premium) },
];

const PERGUNTAS = [
  ['Como pago a MagCoin?', 'Pelo Mercado Pago, com PIX ou cartão. A MagCoin cai na sua conta assim que o pagamento é aprovado (no PIX, em segundos).'],
  ['E as assinaturas?', 'São mensais, no cartão, cobradas pelo Mercado Pago todo mês. Você cancela aqui mesmo quando quiser, e as vantagens valem até o fim do que já pagou.'],
  ['Por que pede o e-mail para assinar?', 'O Mercado Pago confere se o e-mail é o mesmo da conta que vai pagar. Na MagCoin não precisa.'],
  [
    'Como é o presente do Premium?',
    'Na primeira mensalidade chega um presente no seu baú. Ao abrir, você escolhe um mutante que fica seu para sempre. Os outros mutantes ficam 10 dias, e o aviso de entrada, a moldura de fogo e a etiqueta [MAGNATA] ficam 25 dias. É um presente por conta.',
  ],
  ['MagCoin vira dinheiro de volta?', 'Não. Ela é para usar na Shop: deixa os itens seus para sempre.'],
];

/** O Apoie o clube no jeito de loja de jogo: capa com a meta do mês, pacotes de MagCoin, membros numa comparação. */
export default async function Apoio({ searchParams }: { searchParams: Promise<{ erro?: string; aviso?: string; assinar?: string }> }) {
  const usuario = await exigirAcesso('/apoio');
  const { erro, aviso, assinar } = await searchParams;
  const bd = obterBd();
  const agora = new Date();
  const [assinatura, nivel, endereco, envios, meta] = await Promise.all([
    minhaAssinatura(bd, usuario.id),
    nivelAtivo(bd, usuario.id),
    enderecoDe(bd, usuario.id),
    enviosDe(bd, usuario.id),
    metaDoMes(bd, agora),
  ]);
  const ligado = Boolean(process.env.MP_ACCESS_TOKEN);
  const foiPremium = assinatura?.nivel === 'premium';
  const assinando = ORDEM_DOS_NIVEIS.find((codigo) => codigo === assinar);
  const pacotes = pacotesPara(usuario);
  const melhor = pacotes.reduce<Pacote | null>((atual, pacote) => (bonusDoPacote(pacote) > (atual ? bonusDoPacote(atual) : 0) ? pacote : atual), null);
  const podeAssinar = ligado && assinatura?.estado !== 'ativa';

  return (
    <div className="tela-jogar">
      <AbasDaLoja atual="apoio" />
      <CarteiraDaShop titulo="Apoie o clube" usuario={usuario} comprar={false} />

      {!ligado && <p className="aviso">Os pagamentos ainda estão em teste e abrem em breve.</p>}
      {erro && ERROS[erro] && !assinando && (
        <p role="alert" className="aviso">
          {ERROS[erro]}
        </p>
      )}
      {aviso && AVISOS[aviso] && <p className="aviso">{AVISOS[aviso]}</p>}

      <section className="capa-do-apoio">
        <div className="texto-da-capa-do-apoio">
          <h2>
            Os servidores
            <br />
            ficam ligados <em>com você</em>
          </h2>
          <p>Cada MagCoin e cada membro ajuda a pagar a máquina, os servidores e as novidades do clube.</p>
          {nivel && (
            <p className="membro-na-capa">
              Você é <b>{NIVEIS[nivel].nome}</b>. Valeu demais!
            </p>
          )}
          {meta && (
            <div className="meta-do-apoio">
              <div>
                <span>Meta de {nomeDoMes.format(agora)}</span>
                <b>{meta.porcento}% pago</b>
              </div>
              <span className="barra-da-meta" role="progressbar" aria-valuenow={meta.porcento} aria-valuemin={0} aria-valuemax={100} aria-label="Meta do mês">
                <i style={{ width: `${meta.porcento}%` }} />
              </span>
            </div>
          )}
        </div>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/marca/personagem.webp" alt="" />
      </section>

      <div className="secao-da-shop">
        <h2>MagCoin</h2>
        <span className="legenda-da-secao">Deixa os itens da Shop seus para sempre · PIX ou cartão</span>
      </div>
      <div className="pacotes-do-apoio">
        {pacotes.map((pacote) => {
          const bonus = bonusDoPacote(pacote);
          return (
            <form key={pacote} action={comprarPacote} className={pacote === melhor ? 'pacote-do-apoio melhor' : 'pacote-do-apoio'}>
              <input type="hidden" name="pacote" value={pacote} />
              {pacote === melhor && <span className="selo-do-pacote">Melhor valor</span>}
              {bonus > 0 && <span className="selo-do-pacote bonus">+{bonus}% de bônus</span>}
              <span className="pilha-de-moedas" aria-hidden="true">
                {PILHAS[pacote].map(([x, y], indice) => (
                  <i key={indice} style={{ left: `calc(50% - 32px + ${x}px)`, top: `${y}px` }}>
                    M
                  </i>
                ))}
              </span>
              <span className="dados-do-pacote">
                <small>{PACOTES[pacote].nome}</small>
                <b>
                  {PACOTES[pacote].magcoins} <span>MagCoins</span>
                </b>
                <button type="submit" className="botao-da-shop" disabled={!ligado}>
                  Comprar <em>{reais(PACOTES[pacote].precoCentavos)}</em>
                </button>
              </span>
            </form>
          );
        })}
      </div>

      <div className="secao-da-shop" id="membros">
        <h2>Seja membro</h2>
        <span className="legenda-da-secao">Mensal no cartão pelo Mercado Pago · cancele quando quiser</span>
      </div>
      {assinatura && assinatura.estado !== 'pendente' && assinatura.pagoAte && (
        <div className={`minha-assinatura-do-apoio nivel-${assinatura.nivel}`}>
          <span className="medalha-do-nivel" aria-hidden="true" />
          <span>
            <b>
              {NIVEIS[assinatura.nivel].nome}: {assinatura.estado === 'cancelada' ? 'cancelada' : 'ativa'}
            </b>
            <small>{assinatura.pagoAte > agora ? `Vantagens até ${data.format(assinatura.pagoAte)}.` : `Terminou em ${data.format(assinatura.pagoAte)}.`}</small>
          </span>
          {assinatura.estado === 'ativa' && (
            <form action={cancelar}>
              <BotaoConfirmar className="botao-da-shop vazado" mensagem="Cancelar a assinatura? As vantagens continuam até o fim do que você já pagou.">
                Cancelar assinatura
              </BotaoConfirmar>
            </form>
          )}
        </div>
      )}
      <div className="rolagem-da-comparacao">
        <div className="comparacao-de-niveis" role="table" aria-label="Comparação dos níveis de membro">
          <div role="row" className="linha-da-comparacao">
            <span role="columnheader" />
            {ORDEM_DOS_NIVEIS.map((codigo) => (
              <span key={codigo} role="columnheader" className={`cabeca-do-nivel nivel-${codigo}`}>
                {codigo === 'premium' && <span className="tag-do-nivel">O mais completo</span>}
                <span className="medalha-do-nivel" aria-hidden="true" />
                <b>{NIVEIS[codigo].nome}</b>
                <span>
                  {reaisCurtos(NIVEIS[codigo].precoCentavos)} <small>/ mês</small>
                </span>
              </span>
            ))}
          </div>
          {LINHAS.map((linha) => (
            <div key={linha.nome} role="row" className="linha-da-comparacao">
              <span role="rowheader">{linha.nome}</span>
              {ORDEM_DOS_NIVEIS.map((codigo) => {
                const valor = linha.valor(codigo);
                return (
                  <span key={codigo} role="cell" className={codigo === 'premium' ? 'premium' : undefined}>
                    {valor === true ? <b className="tem">✓</b> : valor === false ? <span className="nao-tem" aria-label="não">—</span> : <b>{valor}</b>}
                  </span>
                );
              })}
            </div>
          ))}
          <div role="row" className="linha-da-comparacao acoes">
            <span role="cell" />
            {ORDEM_DOS_NIVEIS.map((codigo) => (
              <span key={codigo} role="cell" className={codigo === 'premium' ? 'premium' : undefined}>
                {podeAssinar ? (
                  <Link href={`/apoio?assinar=${codigo}#membros`} scroll={false} className={codigo === 'premium' ? 'botao-da-shop' : 'botao-da-shop vazado'}>
                    Assinar
                  </Link>
                ) : (
                  <span className="botao-da-shop vazado apagado">{assinatura?.estado === 'ativa' ? 'Já é membro' : 'Em breve'}</span>
                )}
              </span>
            ))}
          </div>
        </div>
      </div>

      {foiPremium && (
        <>
          <div className="secao-da-shop" id="premium">
            <h2>Produtos em casa</h2>
            <span className="legenda-da-secao">Só você e a equipe veem este endereço. Ele é apagado 90 dias depois do fim do Premium.</span>
          </div>
          <form action={salvarMeuEndereco} className="endereco-premium">
            <input name="nome" required maxLength={120} defaultValue={endereco?.nome} placeholder="Nome de quem recebe" aria-label="Nome de quem recebe" />
            <input name="cep" required defaultValue={endereco?.cep} placeholder="CEP" aria-label="CEP" inputMode="numeric" />
            <input name="rua" required maxLength={120} defaultValue={endereco?.rua} placeholder="Rua" aria-label="Rua" />
            <input name="numero" required maxLength={20} defaultValue={endereco?.numero} placeholder="Número" aria-label="Número" />
            <input name="complemento" maxLength={80} defaultValue={endereco?.complemento ?? ''} placeholder="Complemento" aria-label="Complemento" />
            <input name="bairro" required maxLength={120} defaultValue={endereco?.bairro} placeholder="Bairro" aria-label="Bairro" />
            <input name="cidade" required maxLength={120} defaultValue={endereco?.cidade} placeholder="Cidade" aria-label="Cidade" />
            <input name="uf" required maxLength={2} defaultValue={endereco?.uf} placeholder="UF" aria-label="UF" />
            <input name="telefone" required defaultValue={endereco?.telefone} placeholder="Telefone com DDD" aria-label="Telefone com DDD" inputMode="tel" />
            <button type="submit" className="botao-da-shop">
              Salvar endereço
            </button>
          </form>
          {envios.length > 0 && (
            <ul className="lista-de-envios">
              {envios.map((envio) => (
                <li key={envio.id}>
                  {data.format(envio.criadoEm)}: {envio.estado === 'enviado' ? `enviado${envio.rastreio ? `, rastreio ${envio.rastreio}` : ''}` : 'preparando'}
                </li>
              ))}
            </ul>
          )}
        </>
      )}

      <div className="secao-da-shop">
        <h2>Perguntas</h2>
      </div>
      <div className="perguntas-do-apoio">
        {PERGUNTAS.map(([pergunta, resposta]) => (
          <details key={pergunta}>
            <summary>{pergunta}</summary>
            <p>{resposta}</p>
          </details>
        ))}
      </div>

      {assinando && podeAssinar && (
        <div className="janela-da-shop" role="dialog" aria-modal="true" aria-labelledby="nivel-na-janela">
          <Link href="/apoio#membros" scroll={false} className="fundo-da-janela" aria-label="Fechar" tabIndex={-1} />
          <FecharComEsc para="/apoio#membros" />
          <form action={assinarNivel} className={`assinar-no-apoio nivel-${assinando}`}>
            <Link href="/apoio#membros" scroll={false} className="fechar-janela" aria-label="Fechar">
              ×
            </Link>
            <input type="hidden" name="nivel" value={assinando} />
            <h2 id="nivel-na-janela">{NIVEIS[assinando].nome}</h2>
            <p>
              {reais(NIVEIS[assinando].precoCentavos)} por mês no cartão, pelo Mercado Pago. Escreva o e-mail da sua conta de lá: ele confere se é a mesma conta que vai
              pagar.
            </p>
            {erro && ERROS[erro] && (
              <p role="alert" className="aviso">
                {ERROS[erro]}
              </p>
            )}
            <input name="email" type="email" required autoFocus defaultValue={assinatura?.email ?? ''} placeholder="E-mail da sua conta do Mercado Pago" aria-label="E-mail da sua conta do Mercado Pago" />
            <button type="submit" className="botao-da-shop">
              Ir para o Mercado Pago
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
