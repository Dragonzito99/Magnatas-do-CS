import Link from 'next/link';
import { pode } from '@/auth/permissoes';
import { exigirAcesso } from '@/auth/guarda';
import { obterBd } from '@/bd/conexao';
import type { ConteudoDoPresente } from '@/bd/esquema';
import { LIMITES_DO_PRESENTE, listarConvitesComDetalhes, type ConviteDetalhado, type SituacaoDoConvite } from '@/dominio/convites';
import { CATALOGO, itemDoCatalogo, NOME_DO_TIPO, RARIDADE } from '@/dominio/loja';
import { Avatar } from '../avatar';
import { BotaoCopiar } from '../botao-copiar';
import { gerar, gerarComPresente, revogar } from './acoes';

const ERROS: Record<string, string> = {
  'sem-convites': 'Você não tem convites disponíveis.',
  revogar: 'Este convite não pode mais ser revogado.',
  presente: 'Confira o presente: precisa ter algo dentro, até 90 dias por item, até 5.000 de Grana e 300 MagCoins, sem item repetido.',
};

const NOME_DA_SITUACAO: Record<SituacaoDoConvite, string> = { livre: 'Livre', usado: 'Usado', revogado: 'Revogado', vencido: 'Vencido' };
const FILTROS: { valor: string; nome: string; passa: (convite: ConviteDetalhado) => boolean }[] = [
  { valor: 'todos', nome: 'Todos', passa: () => true },
  { valor: 'livre', nome: 'Livres', passa: (convite) => convite.situacao === 'livre' },
  { valor: 'usado', nome: 'Usados', passa: (convite) => convite.situacao === 'usado' },
  { valor: 'presente', nome: 'Com presente', passa: (convite) => convite.presente !== null },
  { valor: 'fora', nome: 'Revogados e vencidos', passa: (convite) => convite.situacao === 'revogado' || convite.situacao === 'vencido' },
];
const LINHAS_DE_ITENS = 3;
const numero = new Intl.NumberFormat('pt-BR');
const data = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeZone: 'America/Sao_Paulo' });

/** "há 5 min", "há 3 h", "há 2 dias", para caber no cartão. */
function haQuanto(quando: Date, agora: number): string {
  const minutos = Math.max(0, Math.round((agora - quando.getTime()) / 60_000));
  if (minutos < 1) return 'agora';
  if (minutos < 60) return `há ${minutos} min`;
  const horas = Math.round(minutos / 60);
  if (horas < 24) return `há ${horas} h`;
  const dias = Math.round(horas / 24);
  return dias === 1 ? 'há 1 dia' : `há ${dias} dias`;
}

/** Os itens, a Grana e as MagCoins do presente como fichas, com a foto do mutante quando tem. */
function FichasDoPresente({ presente }: { presente: ConteudoDoPresente }) {
  return (
    <ul className="fichas-do-presente">
      {(presente.itens ?? []).map((linha) => {
        const item = itemDoCatalogo(linha.itemId);
        if (!item) return null;
        return (
          <li key={linha.itemId} className={`ficha raridade-${RARIDADE[item.tipo]}`}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {item.imagem ? <img src={item.imagem} alt="" /> : <i aria-hidden="true">{item.tipo === 'cor' ? 'Aa' : item.tipo === 'moldura' ? '◎' : item.tipo === 'etiqueta' ? '[ ]' : '★'}</i>}
            <span>
              <b>{item.nome}</b>
              <small>
                {NOME_DO_TIPO[item.tipo]} · {linha.dias === 1 ? '1 dia' : `${linha.dias} dias`}
              </small>
            </span>
          </li>
        );
      })}
      {!!presente.grana && (
        <li className="ficha ficha-moeda ficha-grana">
          <i aria-hidden="true">$</i>
          <span>
            <b>{numero.format(presente.grana)}</b>
            <small>Grana</small>
          </span>
        </li>
      )}
      {!!presente.magcoin && (
        <li className="ficha ficha-moeda ficha-magcoin">
          <i aria-hidden="true">M</i>
          <span>
            <b>{numero.format(presente.magcoin)}</b>
            <small>MagCoins</small>
          </span>
        </li>
      )}
    </ul>
  );
}

/**
 * Os convites no jeito da Magnata Shop (dono, 12/11/2026): números no topo, o convite com presente para o Adm montar, e
 * cada convite como um ingresso, com quem entrou por ele, se joga e se abriu o presente.
 */
export default async function Convites({ searchParams }: { searchParams: Promise<{ erro?: string; novo?: string; ver?: string }> }) {
  const usuario = await exigirAcesso('/convites');
  const { erro, novo, ver } = await searchParams;
  const lista = await listarConvitesComDetalhes(obterBd(), usuario);
  // eslint-disable-next-line react-hooks/purity -- página do servidor: a hora é lida uma vez por pedido.
  const agora = Date.now();
  const ilimitado = usuario.papel !== 'jogador';
  const adm = pode(usuario, 'convite_com_presente');
  const filtro = FILTROS.find((opcao) => opcao.valor === ver) ?? FILTROS[0];
  const visiveis = lista.filter(filtro.passa);
  const opcoes = CATALOGO.filter((item) => item.venda !== false || item.tipo === 'mutante');
  const usados = lista.filter((convite) => convite.usadoPor);
  const numeros = [
    { valor: lista.filter((convite) => convite.situacao === 'livre').length, rotulo: 'Livres' },
    { valor: usados.length, rotulo: 'Entraram' },
    { valor: usados.filter((convite) => convite.partidas > 0).length, rotulo: 'Já jogaram' },
    ...(adm ? [{ valor: usados.filter((convite) => convite.presente && convite.presenteAberto).length, rotulo: 'Abriram o presente' }] : []),
  ];

  return (
    <div className="tela-jogar tela-convites">
      <div className="carteira-da-shop">
        <h1>Convites</h1>
        <span className="moeda-da-shop">
          <b>{ilimitado ? '∞' : usuario.convitesRestantes}</b>
          <small>{ilimitado ? 'sem limite' : usuario.convitesRestantes === 1 ? 'disponível' : 'disponíveis'}</small>
        </span>
        {adm && (
          <a className="moeda-da-shop" href="#criar">
            🎁 Com presente
          </a>
        )}
        <form action={gerar}>
          <button type="submit" className="moeda-da-shop comprar">
            + Gerar convite
          </button>
        </form>
      </div>

      {erro && ERROS[erro] && (
        <p role="alert" className="aviso">
          {ERROS[erro]}
        </p>
      )}
      {novo && (
        <div className="convite-criado" role="status">
          <span className="rotulo-da-janela">Convite com presente criado</span>
          <code className="mono">{novo}</code>
          <BotaoCopiar texto={novo} />
        </div>
      )}

      <div className="numeros-dos-convites">
        {numeros.map((item) => (
          <div key={item.rotulo}>
            <b>{item.valor}</b>
            <small>{item.rotulo}</small>
          </div>
        ))}
      </div>

      {adm && (
        <details className="montar-presente" id="criar" open={erro === 'presente'}>
          <summary>
            <span className="caixa-do-presente pequena" aria-hidden="true">
              <span className="tampa-do-presente" />
              <span className="corpo-do-presente" />
            </span>
            <span>
              <span className="selo-da-raridade">Só Adm</span>
              <b>Convite com presente</b>
              <small>Quem entrar por ele encontra a caixa fechada no baú, com o seu recado.</small>
            </span>
          </summary>
          <form action={gerarComPresente} className="formulario-do-convite">
            <div className="coluna-do-convite">
              <span className="rotulo-da-janela">Itens da Shop</span>
              {Array.from({ length: LINHAS_DE_ITENS }, (_, indice) => (
                <div className="linha-do-item" key={indice}>
                  <select name={`item_${indice}`} aria-label={`Item ${indice + 1}`} defaultValue="">
                    <option value="">Nenhum item</option>
                    {opcoes.map((item) => (
                      <option key={item.id} value={item.id}>
                        {NOME_DO_TIPO[item.tipo]}: {item.nome}
                      </option>
                    ))}
                  </select>
                  <label className="dias-do-item">
                    <input type="number" name={`dias_${indice}`} min={1} max={LIMITES_DO_PRESENTE.diasPorItem} defaultValue={7} aria-label={`Dias do item ${indice + 1}`} />
                    <span>dias</span>
                  </label>
                </div>
              ))}
            </div>
            <div className="coluna-do-convite">
              <span className="rotulo-da-janela">Moedas e validade</span>
              <div className="numeros-do-convite">
                <label className="campo-moeda grana">
                  <i aria-hidden="true">$</i>
                  <input type="number" name="grana" min={0} max={LIMITES_DO_PRESENTE.grana} defaultValue={0} aria-label="Grana" />
                  <small>Grana</small>
                </label>
                <label className="campo-moeda magcoin">
                  <i aria-hidden="true">M</i>
                  <input type="number" name="magcoin" min={0} max={LIMITES_DO_PRESENTE.magcoin} defaultValue={0} aria-label="MagCoins" />
                  <small>MagCoins</small>
                </label>
                <label className="campo-moeda">
                  <i aria-hidden="true">⏳</i>
                  <input type="number" name="validade" min={1} max={365} placeholder="∞" aria-label="Vale por quantos dias" />
                  <small>dias para usar</small>
                </label>
              </div>
              <label className="recado-do-convite">
                <span className="rotulo-da-janela">Recado (opcional)</span>
                <textarea name="recado" maxLength={LIMITES_DO_PRESENTE.recado} rows={2} placeholder="Bem-vindo! Valeu por vir da live." />
              </label>
              <button type="submit" className="botao-da-shop">
                Criar convite com presente
              </button>
            </div>
          </form>
        </details>
      )}

      <nav className="filtros-da-shop" aria-label="Filtrar convites">
        {FILTROS.map((opcao) => (
          <Link key={opcao.valor} href={opcao.valor === 'todos' ? '/convites' : `/convites?ver=${opcao.valor}`} scroll={false} aria-current={filtro.valor === opcao.valor ? 'page' : undefined}>
            {opcao.nome} · {lista.filter(opcao.passa).length}
          </Link>
        ))}
      </nav>

      {visiveis.length === 0 ? (
        <div className="extrato-vazio">
          <b>{lista.length === 0 ? 'Nenhum convite ainda' : 'Nada neste filtro'}</b>
          <p>{lista.length === 0 ? 'Gere um convite e mande o código para quem você quer trazer.' : 'Troque o filtro para ver os outros convites.'}</p>
        </div>
      ) : (
        <div className="grade-de-convites">
          {visiveis.map((convite) => (
            <article className={`ingresso ${convite.situacao}${convite.presente ? ' com-presente' : ''}`} key={convite.id}>
              <header className="topo-do-ingresso">
                <span className={`situacao-do-ingresso ${convite.situacao}`}>{NOME_DA_SITUACAO[convite.situacao]}</span>
                {convite.presente && <span className="selo-presente">🎁 Presente</span>}
                <small>
                  {adm && convite.criadorApelido ? `${convite.criadorApelido} · ` : ''}
                  {haQuanto(convite.criadoEm, agora)}
                </small>
              </header>

              <div className="codigo-do-ingresso">
                <code className="mono">{convite.codigo}</code>
                {convite.situacao === 'livre' && <BotaoCopiar texto={convite.codigo} />}
              </div>

              {convite.presente && (
                <>
                  <FichasDoPresente presente={convite.presente} />
                  {convite.presente.recado && <blockquote className="recado-do-presente">“{convite.presente.recado}”</blockquote>}
                </>
              )}

              <footer className="rodape-do-ingresso">
                {convite.usadoPor ? (
                  <div className="quem-entrou">
                    <Avatar usuario={convite.usadoPor} />
                    <span>
                      <Link href={`/jogadores/${convite.usadoPor.id}`} className="nome-de-quem-entrou">
                        {convite.usadoPor.apelido}
                      </Link>
                      <small>entrou {convite.usadoEm ? haQuanto(convite.usadoEm, agora) : ''}</small>
                    </span>
                    <ul className="sinais-de-quem-entrou">
                      <li className={convite.partidas > 0 ? 'bom' : ''}>🎮 {convite.partidas === 0 ? 'Não jogou' : convite.partidas === 1 ? '1 partida' : `${convite.partidas} partidas`}</li>
                      <li>👁 {convite.usadoPor.vistoEm ? haQuanto(convite.usadoPor.vistoEm, agora) : 'não voltou'}</li>
                      {convite.presente && <li className={convite.presenteAberto ? 'bom' : ''}>🎁 {convite.presenteAberto ? 'Abriu' : 'Fechado'}</li>}
                    </ul>
                  </div>
                ) : (
                  <span className="espera-do-ingresso">
                    {convite.situacao === 'livre'
                      ? convite.venceEm
                        ? `Vale até ${data.format(convite.venceEm)}`
                        : 'Esperando alguém entrar'
                      : convite.situacao === 'vencido'
                        ? 'Ninguém usou a tempo'
                        : 'Cancelado'}
                  </span>
                )}
                {convite.situacao === 'livre' && convite.meu && (
                  <form action={revogar}>
                    <input type="hidden" name="codigo" value={convite.codigo} />
                    <button type="submit" className="botao-da-shop vazado">
                      Revogar
                    </button>
                  </form>
                )}
              </footer>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
