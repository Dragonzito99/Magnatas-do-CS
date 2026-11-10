import Link from 'next/link';
import { exigirAcesso } from '@/auth/guarda';
import { obterBd } from '@/bd/conexao';
import { enderecoDe, enviosDe } from '@/dominio/envios';
import { NIVEIS, ORDEM_DOS_NIVEIS, nivelAtivo } from '@/dominio/membros';
import { minhaAssinatura, PACOTES, pacotesPara } from '@/dominio/pagamentos';
import { BotaoConfirmar } from '../botao-confirmar';
import { AbasDaLoja } from '../loja/abas-da-loja';
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
const data = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeZone: 'America/Sao_Paulo' });

const VANTAGENS: Record<string, string[]> = {
  bronze: ['Selo Bronze no perfil', 'Etiqueta [APOIADOR] no chat', '+10% de Grana por partida'],
  prata: ['Selo Prata no perfil', 'Etiqueta [APOIADOR] no chat', '+20% de Grana por partida', '50 MagCoins por mês', 'Nome Dourado no chat enquanto for membro'],
  ouro: ['Selo Ouro no perfil', 'Etiqueta [APOIADOR] no chat', '+30% de Grana por partida', '100 MagCoins por mês', 'Moldura exclusiva Ouro'],
  premium: [
    'Tudo do Ouro',
    '200 MagCoins por mês',
    'Itens de lançamento para sempre',
    'Produtos do clube em casa: no primeiro pagamento e depois a cada 2 meses',
  ],
};

const PERGUNTAS = [
  ['Como pago a MagCoin?', 'Pelo Mercado Pago, com PIX ou cartão. A MagCoin cai na sua conta assim que o pagamento é aprovado (no PIX, em segundos).'],
  ['E as assinaturas?', 'São mensais, no cartão, cobradas pelo Mercado Pago todo mês. Você cancela aqui mesmo quando quiser, e as vantagens valem até o fim do que já pagou.'],
  ['O que é item de lançamento?', 'Os itens novos da loja, como o mutante Blindado. Quem assina o Premium ganha para sempre.'],
  ['MagCoin vira dinheiro de volta?', 'Não. Ela é para usar na loja: deixa os itens seus para sempre.'],
];

/** A página de apoio: MagCoin, membros e Magnata Premium. */
export default async function Apoio({ searchParams }: { searchParams: Promise<{ erro?: string; aviso?: string }> }) {
  const usuario = await exigirAcesso('/apoio');
  const { erro, aviso } = await searchParams;
  const bd = obterBd();
  const [assinatura, nivel, endereco, envios] = await Promise.all([
    minhaAssinatura(bd, usuario.id),
    nivelAtivo(bd, usuario.id),
    enderecoDe(bd, usuario.id),
    enviosDe(bd, usuario.id),
  ]);
  const ligado = Boolean(process.env.MP_ACCESS_TOKEN);
  const foiPremium = assinatura?.nivel === 'premium';

  return (
    <div className="tela-jogar">
      <AbasDaLoja atual="apoio" />
      <div className="topo-jogar">
        <h1>Apoie o clube</h1>
        <p className="apoio">
          Você tem <b className="grana-destaque">{usuario.magcoin.toLocaleString('pt-BR')} MagCoins</b>
          {nivel && (
            <>
              {' '}
              e é <b className="grana-destaque">{NIVEIS[nivel].nome}</b>
            </>
          )}
          . Todo apoio ajuda a manter os servidores ligados.
        </p>
      </div>
      {!ligado && <p className="aviso">Os pagamentos ainda estão em teste e abrem em breve.</p>}
      {erro && ERROS[erro] && (
        <p role="alert" className="aviso">
          {ERROS[erro]}
        </p>
      )}
      {aviso && AVISOS[aviso] && <p className="aviso">{AVISOS[aviso]}</p>}

      <section className="secao-loja">
        <div className="cabeca-secao-loja">
          <h2>MagCoin</h2>
          <p className="apoio">
            Com MagCoin os itens da <Link href="/loja">loja</Link> ficam seus para sempre. PIX ou cartão.
          </p>
        </div>
        <div className="planos-de-apoio">
          {pacotesPara(usuario).map((pacote) => (
            <form key={pacote} action={comprarPacote} className="plano-de-apoio">
              <input type="hidden" name="pacote" value={pacote} />
              <span className="tipo-do-item">{PACOTES[pacote].nome}</span>
              <b className="valor-do-plano">{PACOTES[pacote].magcoins} MagCoins</b>
              <span className="preco-do-plano">{reais(PACOTES[pacote].precoCentavos)}</span>
              <button type="submit" className="botao ouro pequeno" disabled={!ligado}>
                Comprar
              </button>
            </form>
          ))}
        </div>
      </section>

      <section className="secao-loja" id="membros">
        <div className="cabeca-secao-loja">
          <h2>Seja membro</h2>
          <p className="apoio">Cobrança mensal no cartão, pelo Mercado Pago. Cancele quando quiser.</p>
        </div>
        {assinatura && assinatura.estado !== 'pendente' && assinatura.pagoAte && (
          <div className="caixa-da-loja minha-assinatura">
            <b>
              {NIVEIS[assinatura.nivel].nome}: {assinatura.estado === 'cancelada' ? 'cancelada' : 'ativa'}
            </b>
            <span className="apoio">
              {assinatura.pagoAte > new Date() ? `Vantagens até ${data.format(assinatura.pagoAte)}.` : `Terminou em ${data.format(assinatura.pagoAte)}.`}
            </span>
            {assinatura.estado === 'ativa' && (
              <form action={cancelar}>
                <BotaoConfirmar className="botao cinza pequeno" mensagem="Cancelar a assinatura? As vantagens continuam até o fim do que você já pagou.">
                  Cancelar assinatura
                </BotaoConfirmar>
              </form>
            )}
          </div>
        )}
        <div className="planos-de-apoio">
          {ORDEM_DOS_NIVEIS.map((codigo) => (
            <form key={codigo} action={assinarNivel} className={codigo === 'premium' ? 'plano-de-apoio premium' : 'plano-de-apoio'}>
              <input type="hidden" name="nivel" value={codigo} />
              <span className="tipo-do-item">{codigo === 'premium' ? 'O mais completo' : 'Membro'}</span>
              <b className="valor-do-plano">{NIVEIS[codigo].nome}</b>
              <span className="preco-do-plano">{reais(NIVEIS[codigo].precoCentavos)} por mês</span>
              <ul className="vantagens">
                {VANTAGENS[codigo].map((vantagem) => (
                  <li key={vantagem}>{vantagem}</li>
                ))}
              </ul>
              <input name="email" type="email" required placeholder="E-mail da sua conta do Mercado Pago" aria-label={`E-mail para assinar ${NIVEIS[codigo].nome}`} />
              <button type="submit" className={codigo === 'premium' ? 'botao ouro pequeno' : 'botao cinza pequeno'} disabled={!ligado || assinatura?.estado === 'ativa'}>
                Assinar
              </button>
            </form>
          ))}
        </div>
      </section>

      {foiPremium && (
        <section className="secao-loja" id="premium">
          <div className="cabeca-secao-loja">
            <h2>Produtos em casa</h2>
            <p className="apoio">Só você e a equipe veem este endereço. Ele é apagado 90 dias depois do fim do Premium.</p>
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
            <button type="submit" className="botao ouro pequeno">
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
        </section>
      )}

      <section className="secao-loja">
        <div className="cabeca-secao-loja">
          <h2>Perguntas</h2>
        </div>
        <div className="perguntas-de-apoio">
          {PERGUNTAS.map(([pergunta, resposta]) => (
            <details key={pergunta}>
              <summary>{pergunta}</summary>
              <p className="apoio">{resposta}</p>
            </details>
          ))}
        </div>
      </section>
    </div>
  );
}
