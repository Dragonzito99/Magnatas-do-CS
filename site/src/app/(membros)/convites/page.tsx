import Link from 'next/link';
import { pode } from '@/auth/permissoes';
import { exigirAcesso } from '@/auth/guarda';
import { obterBd } from '@/bd/conexao';
import { LIMITES_DO_PRESENTE, listarConvitesComDetalhes, type ConviteDetalhado, type SituacaoDoConvite } from '@/dominio/convites';
import { CATALOGO, NOME_DO_TIPO } from '@/dominio/loja';
import { descreverPresente } from '@/dominio/presentes';
import { Avatar } from '../avatar';
import { BotaoCopiar } from '../botao-copiar';
import { gerar, gerarComPresente, revogar } from './acoes';

const ERROS: Record<string, string> = {
  'sem-convites': 'Você não tem convites disponíveis.',
  revogar: 'Este convite não pode mais ser revogado.',
  presente: `Confira o presente: algo dentro, até ${LIMITES_DO_PRESENTE.diasPorItem} dias por item, até ${LIMITES_DO_PRESENTE.grana} de Grana e ${LIMITES_DO_PRESENTE.magcoin} MagCoins, sem item repetido.`,
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
const dataEHora = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short', timeZone: 'America/Sao_Paulo' });
const data = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeZone: 'America/Sao_Paulo' });

/**
 * Os convites com o que aconteceu com cada um: quem usou, quando, se abriu o presente e se já joga (dono, 12/11/2026).
 * O Adm vê todos e cria o convite com presente; o membro vê os seus.
 */
export default async function Convites({ searchParams }: { searchParams: Promise<{ erro?: string; novo?: string; ver?: string }> }) {
  const usuario = await exigirAcesso('/convites');
  const { erro, novo, ver } = await searchParams;
  const lista = await listarConvitesComDetalhes(obterBd(), usuario);
  const ilimitado = usuario.papel !== 'jogador';
  const adm = pode(usuario, 'convite_com_presente');
  const filtro = FILTROS.find((opcao) => opcao.valor === ver) ?? FILTROS[0];
  const visiveis = lista.filter(filtro.passa);
  const opcoes = CATALOGO.filter((item) => item.venda !== false || item.tipo === 'mutante');

  return (
    <>
      <div className="topo-pagina">
        <h1>Convites</h1>
        <form action={gerar}>
          <button type="submit" className="botao ouro pequeno">
            Gerar convite
          </button>
        </form>
      </div>
      <p className="apoio">{ilimitado ? 'Você gera convites sem limite.' : `Você tem ${usuario.convitesRestantes} convites disponíveis.`}</p>
      {erro && ERROS[erro] && (
        <p role="alert" className="aviso">
          {ERROS[erro]}
        </p>
      )}
      {novo && (
        <p className="aviso" role="status">
          Convite com presente criado: <code className="mono">{novo}</code> <BotaoCopiar texto={novo} />
        </p>
      )}

      {adm && (
        <details className="painel criar-convite" id="criar" open={erro === 'presente'}>
          <summary>
            <b>🎁 Criar convite com presente</b>
            <small>Quem entrar por ele encontra o presente fechado no baú.</small>
          </summary>
          <form action={gerarComPresente} className="formulario-do-convite">
            <fieldset>
              <legend>Itens da Shop (até {LIMITES_DO_PRESENTE.diasPorItem} dias cada)</legend>
              {Array.from({ length: LINHAS_DE_ITENS }, (_, indice) => (
                <div className="linha-do-item" key={indice}>
                  <select name={`item_${indice}`} aria-label={`Item ${indice + 1}`} defaultValue="">
                    <option value="">Nenhum</option>
                    {opcoes.map((item) => (
                      <option key={item.id} value={item.id}>
                        {NOME_DO_TIPO[item.tipo]}: {item.nome}
                      </option>
                    ))}
                  </select>
                  <label>
                    <input type="number" name={`dias_${indice}`} min={1} max={LIMITES_DO_PRESENTE.diasPorItem} defaultValue={7} aria-label={`Dias do item ${indice + 1}`} /> dias
                  </label>
                </div>
              ))}
            </fieldset>
            <div className="numeros-do-convite">
              <label>
                Grana
                <input type="number" name="grana" min={0} max={LIMITES_DO_PRESENTE.grana} defaultValue={0} />
              </label>
              <label>
                MagCoins
                <input type="number" name="magcoin" min={0} max={LIMITES_DO_PRESENTE.magcoin} defaultValue={0} />
              </label>
              <label>
                Vale por (dias, vazio = não vence)
                <input type="number" name="validade" min={1} max={365} placeholder="não vence" />
              </label>
            </div>
            <label className="recado-do-convite">
              Recado para quem entrar (opcional)
              <textarea name="recado" maxLength={LIMITES_DO_PRESENTE.recado} rows={2} placeholder="Bem-vindo! Valeu por vir da live." />
            </label>
            <button type="submit" className="botao ouro pequeno">
              Criar convite com presente
            </button>
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

      <section className="painel lista-de-convites">
        {visiveis.length === 0 && <p className="vazio">{lista.length === 0 ? 'Os códigos que você gerar aparecem aqui.' : 'Nenhum convite neste filtro.'}</p>}
        {visiveis.map((convite) => (
          <article className="convite-detalhado" key={convite.id}>
            <div className="topo-do-convite">
              <code className="mono">{convite.codigo}</code>
              <span className={convite.situacao === 'livre' ? 'etiqueta ok' : 'etiqueta'}>{NOME_DA_SITUACAO[convite.situacao]}</span>
              {convite.presente && <span className="etiqueta presente">🎁 Com presente</span>}
              <div className="acoes">
                {convite.situacao === 'livre' && (
                  <>
                    <BotaoCopiar texto={convite.codigo} />
                    <form action={revogar}>
                      <input type="hidden" name="codigo" value={convite.codigo} />
                      <button type="submit" className="botao cinza pequeno">
                        Revogar
                      </button>
                    </form>
                  </>
                )}
              </div>
            </div>
            <small className="apoio">
              Criado {adm && convite.criadorApelido ? `por ${convite.criadorApelido} ` : ''}em {dataEHora.format(convite.criadoEm)}
              {convite.venceEm && convite.situacao !== 'usado' ? `. Vale até ${data.format(convite.venceEm)}` : ''}.
            </small>
            {convite.presente && (
              <p className="presente-do-convite">
                {descreverPresente(convite.presente).join(' · ')}
                {convite.presente.recado && <em> “{convite.presente.recado}”</em>}
              </p>
            )}
            {convite.usadoPor && (
              <div className="quem-usou">
                <Avatar usuario={convite.usadoPor} />
                <span>
                  <Link href={`/jogadores/${convite.usadoPor.id}`}>{convite.usadoPor.apelido}</Link> entrou em {convite.usadoEm ? dataEHora.format(convite.usadoEm) : '—'}
                  <small>
                    {convite.partidas === 0 ? 'Ainda não jogou' : convite.partidas === 1 ? 'Jogou 1 partida' : `Jogou ${convite.partidas} partidas`}
                    {' · '}
                    {convite.usadoPor.vistoEm ? `Visto no site em ${dataEHora.format(convite.usadoPor.vistoEm)}` : 'Ainda não voltou ao site'}
                    {convite.presente && ` · ${convite.presenteAberto ? 'Abriu o presente' : 'Presente ainda fechado'}`}
                  </small>
                </span>
              </div>
            )}
          </article>
        ))}
      </section>
    </>
  );
}
