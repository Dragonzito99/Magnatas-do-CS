import Link from 'next/link';
import { redirect } from 'next/navigation';
import { exigirAcesso } from '@/auth/guarda';
import { obterBd } from '@/bd/conexao';
import { armaLemnos, GRANADAS, mochilaLemnos } from '@/dominio/lemnos/catalogo';
import { ilhaAberta, sessoesRecentes } from '@/dominio/lemnos/estatisticas';
import { kitDe, sessaoAbertaDe } from '@/dominio/lemnos/kit';
import { bauDaLemnos, type ItemDoBauLemnos } from '@/dominio/lemnos/mercado';
import { CarteiraDaShop } from '../loja/carteira-da-shop';
import { escolher } from './acoes';
import { AvisoDaIlha } from './avisos';

const DIA_MS = 24 * 60 * 60 * 1000;

/** Como a linha do baú vale: uso único, para sempre, quantos dias faltam, ou vencida. */
function validade(item: ItemDoBauLemnos, agora: number): string {
  if (item.tipo === 'saque') return 'para vender';
  if (item.vencido) return 'venceu';
  if (item.expiraEm === null) return item.origem === 'magcoin' ? 'para sempre' : 'uso único';
  const dias = Math.ceil((item.expiraEm.getTime() - agora) / DIA_MS);
  return dias <= 1 ? 'último dia' : `${dias} dias`;
}

const NOME_DO_TIPO = { arma: 'Arma', granada: 'Granada', mochila: 'Mochila', saque: 'Saque' } as const;
const NOME_DO_FIM = { saiu: 'Saiu', morreu_saindo: 'Morreu saindo', kick_afk: 'Kick por AFK', kick_acampar: 'Kick por acampar', queda: 'Servidor caiu' } as const;

/**
 * A Ilha Lemnos no site: o kit que o jogador leva, o baú da extração e as últimas idas à ilha. O baú só se mexe por aqui;
 * para trocar de arma, sai do servidor (dono, 15/11/2026).
 */
export default async function IlhaLemnos({ searchParams }: { searchParams: Promise<{ erro?: string; ok?: string }> }) {
  const usuario = await exigirAcesso('/lemnos');
  const bd = obterBd();
  if (!(await ilhaAberta(bd, usuario))) redirect('/inicio');
  const { erro, ok } = await searchParams;
  const [bau, kit, aberta, sessoes] = await Promise.all([bauDaLemnos(bd, usuario.id), kitDe(bd, usuario.id), sessaoAbertaDe(bd, usuario.id), sessoesRecentes(bd, usuario.id)]);
  // eslint-disable-next-line react-hooks/purity -- a página é do servidor e mostra quanto falta a partir de agora.
  const agora = Date.now();

  const usaveis = bau.filter((item) => !item.vencido && !item.emCampo);
  const distintos = (filtro: (item: ItemDoBauLemnos) => boolean) => [...new Map(usaveis.filter(filtro).map((item) => [item.itemId, item])).values()];
  const principais = distintos((item) => item.tipo === 'arma' && armaLemnos(item.itemId)?.lugar === 'principal');
  const secundarias = distintos((item) => item.tipo === 'arma' && armaLemnos(item.itemId)?.lugar === 'secundaria');
  const mochilas = distintos((item) => item.tipo === 'mochila');
  const granadasQueTem = GRANADAS.filter((granada) => usaveis.some((item) => item.itemId === granada.id));
  const quantas = (itemId: string) => usaveis.filter((item) => item.itemId === itemId).length;

  return (
    <div className="tela-jogar ilha-lemnos">
      <CarteiraDaShop titulo="Ilha Lemnos" usuario={usuario} />
      <p className="apoio lore-da-ilha">
        O surto da Mutação começou numa ilha. O governo cercou tudo e deixou para trás cofres, joias e armas. Os Magnatas pagam bem pelo que sai de lá. Você
        entra por um posto dos Magnatas, saqueia e corre para o barco antes que alguém, ou alguma coisa, te pegue.
      </p>
      <AvisoDaIlha erro={erro} ok={ok} />
      {aberta && (
        <p role="status" className="aviso">
          Você está na ilha agora. O kit só muda depois que você sair do servidor.
        </p>
      )}

      <div className="secao-da-shop">
        <h2>Seu kit</h2>
        <span className="legenda-da-secao">É com isso que você entra. Sem pistola, você ganha uma Glock que nunca se perde.</span>
      </div>
      <form action={escolher} className="kit-da-ilha">
        <label>
          <span>Arma principal</span>
          <select name="principal" defaultValue={kit.principal ?? ''} disabled={!!aberta}>
            <option value="">Nenhuma</option>
            {principais.map((item) => (
              <option key={item.itemId} value={item.itemId}>
                {item.nome} ({quantas(item.itemId)})
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>Pistola</span>
          <select name="secundaria" defaultValue={kit.secundaria ?? ''} disabled={!!aberta}>
            <option value="">Glock de graça</option>
            {secundarias.map((item) => (
              <option key={item.itemId} value={item.itemId}>
                {item.nome} ({quantas(item.itemId)})
              </option>
            ))}
          </select>
        </label>
        {[0, 1, 2, 3].map((indice) => (
          <label key={indice}>
            <span>Granada {indice + 1}</span>
            <select name={`granada${indice + 1}`} defaultValue={kit.granadas[indice] ?? ''} disabled={!!aberta}>
              <option value="">Nenhuma</option>
              {granadasQueTem.map((granada) => (
                <option key={granada.id} value={granada.id}>
                  {granada.nome} ({quantas(granada.id)})
                </option>
              ))}
            </select>
          </label>
        ))}
        <label>
          <span>Mochila</span>
          <select name="mochila" defaultValue={kit.mochila ?? ''} disabled={!!aberta}>
            <option value="">Básica · 8 espaços</option>
            {mochilas.map((item) => (
              <option key={item.itemId} value={item.itemId}>
                {item.nome} · {mochilaLemnos(item.itemId)?.espacos} espaços
              </option>
            ))}
          </select>
        </label>
        <button type="submit" className="botao-da-shop" disabled={!!aberta}>
          Salvar kit
        </button>
      </form>

      <div className="secao-da-shop">
        <h2>Baú da extração</h2>
        <span className="legenda-da-secao">
          <Link href="/lemnos/mercado">Ir ao mercado</Link> · <Link href="/jogar">Entrar na Ilha Lemnos</Link>
        </span>
      </div>
      {bau.length === 0 ? (
        <div className="extrato-vazio">
          <b>Seu baú da ilha está vazio</b>
          <p>Compre armas e mochilas no mercado, ou traga saque da ilha.</p>
          <Link className="botao-da-shop" href="/lemnos/mercado">
            Ir ao mercado
          </Link>
        </div>
      ) : (
        <ul className="bau-da-ilha">
          {bau.map((item) => (
            <li key={item.linha} className={item.vencido ? 'vencido' : undefined}>
              <small>{NOME_DO_TIPO[item.tipo]}</small>
              <b>{item.nome}</b>
              <em>{item.emCampo ? 'na ilha agora' : validade(item, agora)}</em>
            </li>
          ))}
        </ul>
      )}

      {sessoes.length > 0 && (
        <>
          <div className="secao-da-shop">
            <h2>Suas últimas idas</h2>
          </div>
          <ul className="bau-da-ilha">
            {sessoes.map((sessao) => (
              <li key={sessao.id}>
                <small>{sessao.encerradaEm?.toLocaleDateString('pt-BR')}</small>
                <b>
                  <Link href={`/lemnos/sessoes/${sessao.id}`}>
                    {sessao.abates} abates · {sessao.extracoes} extrações · {sessao.granaGanha} de Grana
                  </Link>
                </b>
                <em>{sessao.fim ? NOME_DO_FIM[sessao.fim] : ''}</em>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
