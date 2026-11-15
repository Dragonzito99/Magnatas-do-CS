import { randomUUID } from 'node:crypto';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { exigirAcesso } from '@/auth/guarda';
import { obterBd } from '@/bd/conexao';
import { ARMAS, GRANADAS, MOCHILAS, saqueLemnos } from '@/dominio/lemnos/catalogo';
import { ilhaAberta } from '@/dominio/lemnos/estatisticas';
import { bauDaLemnos } from '@/dominio/lemnos/mercado';
import { DIAS_A_VENDA } from '@/dominio/loja';
import { CarteiraDaShop } from '../../loja/carteira-da-shop';
import { comprarGrana, comprarMagcoin, comprarUmaMochila, vender } from '../acoes';
import { AvisoDaIlha } from '../avisos';

const dias = (quantidade: number) => (quantidade === 1 ? '1 dia' : `${quantidade} dias`);

/**
 * O mercado dos Magnatas: armas e granadas de uso único com Grana, armas por dias ou para sempre com MagCoin (voltam ao
 * baú quando você morre), mochilas maiores, e a venda do saque por Grana.
 */
export default async function MercadoDaIlha({ searchParams }: { searchParams: Promise<{ erro?: string; ok?: string }> }) {
  const usuario = await exigirAcesso('/lemnos/mercado');
  const bd = obterBd();
  if (!(await ilhaAberta(bd, usuario))) redirect('/inicio');
  const { erro, ok } = await searchParams;
  const saque = (await bauDaLemnos(bd, usuario.id)).filter((item) => item.tipo === 'saque' && !item.emCampo);
  const totalDoSaque = saque.reduce((soma, item) => soma + (saqueLemnos(item.itemId)?.valor ?? 0), 0);

  return (
    <div className="tela-jogar ilha-lemnos">
      <CarteiraDaShop titulo="Mercado da ilha" usuario={usuario} />
      <p className="apoio">
        <Link href="/lemnos">Voltar ao kit e ao baú</Link>
      </p>
      <AvisoDaIlha erro={erro} ok={ok} />

      <div className="secao-da-shop">
        <h2>Vender o saque</h2>
        <span className="legenda-da-secao">{saque.length === 0 ? 'Nada para vender ainda' : `${saque.length} itens · ${totalDoSaque} de Grana`}</span>
      </div>
      {saque.length > 0 && (
        <form action={vender} className="kit-da-ilha">
          <input type="hidden" name="codigo" value={randomUUID()} />
          <ul className="bau-da-ilha">
            {saque.map((item) => (
              <li key={item.linha}>
                <label>
                  <input type="checkbox" name="linha" value={item.linha} defaultChecked /> <b>{item.nome}</b> <em>{saqueLemnos(item.itemId)?.valor} de Grana</em>
                </label>
              </li>
            ))}
          </ul>
          <button type="submit" className="botao-da-shop">
            Vender os marcados
          </button>
        </form>
      )}

      <div className="secao-da-shop">
        <h2>Armas</h2>
        <span className="legenda-da-secao">Com Grana: uso único, perde ao morrer · Com MagCoin: volta ao baú</span>
      </div>
      <ul className="mercado-da-ilha">
        {ARMAS.map((arma) => (
          <li key={arma.id}>
            <b>{arma.nome}</b>
            <small>{arma.lugar === 'principal' ? 'Principal' : 'Pistola'}</small>
            <form action={comprarGrana}>
              <input type="hidden" name="codigo" value={randomUUID()} />
              <input type="hidden" name="itemId" value={arma.id} />
              <select name="quantidade" defaultValue="1" aria-label="Quantas">
                {[1, 3, 5, 10].map((quantidade) => (
                  <option key={quantidade} value={quantidade}>
                    {quantidade}× · {arma.precoGrana * quantidade} de Grana
                  </option>
                ))}
              </select>
              <button type="submit" className="botao-da-shop">
                Comprar
              </button>
            </form>
            <form action={comprarMagcoin}>
              <input type="hidden" name="codigo" value={randomUUID()} />
              <input type="hidden" name="itemId" value={arma.id} />
              <select name="dias" defaultValue="1" aria-label="Por quanto tempo">
                {DIAS_A_VENDA.map((quantidade) => (
                  <option key={quantidade} value={quantidade}>
                    {dias(quantidade)} · {arma.precoMagcoinDias[quantidade]} MagCoin
                  </option>
                ))}
                <option value="sempre">Para sempre · {arma.precoMagcoinSempre} MagCoin</option>
              </select>
              <button type="submit" className="botao-da-shop vazado">
                Com MagCoin
              </button>
            </form>
          </li>
        ))}
      </ul>

      <div className="secao-da-shop">
        <h2>Granadas</h2>
        <span className="legenda-da-secao">Com Grana · lançou, gastou</span>
      </div>
      <ul className="mercado-da-ilha">
        {GRANADAS.map((granada) => (
          <li key={granada.id}>
            <b>{granada.nome}</b>
            <form action={comprarGrana}>
              <input type="hidden" name="codigo" value={randomUUID()} />
              <input type="hidden" name="itemId" value={granada.id} />
              <select name="quantidade" defaultValue="1" aria-label="Quantas">
                {[1, 3, 5, 10].map((quantidade) => (
                  <option key={quantidade} value={quantidade}>
                    {quantidade}× · {granada.precoGrana * quantidade} de Grana
                  </option>
                ))}
              </select>
              <button type="submit" className="botao-da-shop">
                Comprar
              </button>
            </form>
          </li>
        ))}
      </ul>

      <div className="secao-da-shop">
        <h2>Mochilas</h2>
        <span className="legenda-da-secao">Volta vazia ao baú quando você morre</span>
      </div>
      <ul className="mercado-da-ilha">
        {MOCHILAS.filter((mochila) => mochila.precoGranaDias !== null).map((mochila) => (
          <li key={mochila.id}>
            <b>{mochila.nome}</b>
            <small>{mochila.espacos} espaços</small>
            <form action={comprarUmaMochila}>
              <input type="hidden" name="codigo" value={randomUUID()} />
              <input type="hidden" name="itemId" value={mochila.id} />
              <select name="dias" defaultValue="1" aria-label="Por quanto tempo">
                {DIAS_A_VENDA.map((quantidade) => (
                  <option key={quantidade} value={quantidade}>
                    {dias(quantidade)} · {mochila.precoGranaDias?.[quantidade]} de Grana
                  </option>
                ))}
                {mochila.precoMagcoinSempre !== null && <option value="sempre">Para sempre · {mochila.precoMagcoinSempre} MagCoin</option>}
              </select>
              <button type="submit" className="botao-da-shop">
                Comprar
              </button>
            </form>
          </li>
        ))}
      </ul>
    </div>
  );
}
