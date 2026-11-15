import { randomUUID } from 'node:crypto';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { exigirAcesso } from '@/auth/guarda';
import { obterBd } from '@/bd/conexao';
import type { Usuario } from '@/bd/esquema';
import { ARMAS, armaLemnos, GRANADAS, granadaLemnos, MOCHILAS, mochilaLemnos, nomeLemnos, raridadeLemnos, saqueLemnos } from '@/dominio/lemnos/catalogo';
import { ilhaAberta } from '@/dominio/lemnos/estatisticas';
import { bauDaLemnos } from '@/dominio/lemnos/mercado';
import { DIAS_A_VENDA } from '@/dominio/loja';
import { BotaoDeDoisToques } from '../botao-de-dois-toques';
import { CarteiraDaShop } from '../../loja/carteira-da-shop';
import { FecharComEsc } from '../../loja/fechar-com-esc';
import { Preco } from '../../loja/preco-da-shop';
import { comprarGrana, comprarMagcoin, comprarUmaMochila, vender } from '../acoes';
import { AvisoDaIlha } from '../avisos';
import { AbasDaIlha, ImagemDoItem, TipoDoItem } from '../componentes';
import { CompraNaJanela, type GrupoDeCompra } from '../../compra-na-janela';

type Aba = 'armas' | 'granadas' | 'mochilas' | 'vender';
const ABAS: { valor: Aba; nome: string }[] = [
  { valor: 'armas', nome: 'Armas' },
  { valor: 'granadas', nome: 'Granadas' },
  { valor: 'mochilas', nome: 'Mochilas' },
  { valor: 'vender', nome: 'Vender saque' },
];
const QUANTIDADES = [1, 3, 5, 10];
const dias = (quantidade: number) => (quantidade === 1 ? '1 dia' : `${quantidade} dias`);

/**
 * O mercado dos Magnatas, no visual da Magnata Shop: cartões com a arma, e a janela de compra por cima. Com Grana a arma
 * é de uso único (perde ao morrer); com MagCoin, por dias ou para sempre, e volta ao baú quando você morre.
 */
export default async function MercadoDaIlha({ searchParams }: { searchParams: Promise<{ erro?: string; ok?: string; aba?: string; item?: string }> }) {
  const usuario = await exigirAcesso('/lemnos/mercado');
  const bd = obterBd();
  if (!(await ilhaAberta(bd, usuario))) redirect('/inicio');
  const { erro, ok, aba: pedida, item } = await searchParams;
  const aba = ABAS.find((opcao) => opcao.valor === pedida)?.valor ?? 'armas';
  const bau = await bauDaLemnos(bd, usuario.id);
  const quantasTenho = (id: string) => bau.filter((linha) => linha.itemId === id && !linha.vencido).length;
  const saque = bau.filter((linha) => linha.tipo === 'saque' && !linha.emCampo);
  const totalDoSaque = saque.reduce((soma, linha) => soma + (saqueLemnos(linha.itemId)?.valor ?? 0), 0);
  const tiposDoSaque = [...new Set(saque.map((linha) => linha.itemId))];

  // As mais fortes primeiro: é a AWP e a AK que dão vontade de entrar.
  const ids = aba === 'armas' ? [...ARMAS].reverse().map((arma) => arma.id) : aba === 'granadas' ? GRANADAS.map((granada) => granada.id) : aba === 'mochilas' ? MOCHILAS.filter((mochila) => mochila.precoGranaDias).map((mochila) => mochila.id) : [];
  const aberto = item && ids.includes(item) ? item : null;
  const endereco = (id?: string) => `/lemnos/mercado?aba=${aba}${id ? `&item=${id}` : ''}`;

  return (
    <div className="tela-jogar ilha-lemnos">
      <AbasDaIlha atual={aba === 'vender' ? 'vender' : 'mercado'} />
      <CarteiraDaShop titulo={aba === 'vender' ? 'Vender saque' : 'Mercado da ilha'} usuario={usuario} />
      {!aberto && <AvisoDaIlha erro={erro} ok={ok} />}

      <nav className="filtros-da-shop" aria-label="O que comprar">
        {ABAS.map((opcao) => (
          <Link key={opcao.valor} href={`/lemnos/mercado?aba=${opcao.valor}`} scroll={false} aria-current={aba === opcao.valor ? 'page' : undefined}>
            {opcao.nome}
            {opcao.valor === 'vender' && saque.length > 0 ? ` · ${saque.length}` : ''}
          </Link>
        ))}
      </nav>

      {aba === 'armas' && (
        <p className="apoio explicacao-do-mercado">
          <b>Com Grana:</b> a arma é sua para uma ida; se morrer, ela fica na ilha. <b>Com MagCoin:</b> por dias ou para sempre, e volta para o baú quando você
          morre.
        </p>
      )}

      {aba !== 'vender' && (
        <div className="grade-da-shop">
          {ids.map((id) => {
            const arma = armaLemnos(id);
            const granada = granadaLemnos(id);
            const mochila = mochilaLemnos(id);
            const tenho = quantasTenho(id);
            return (
              <Link key={id} href={endereco(id)} scroll={false} className={`cartao-da-shop raridade-${raridadeLemnos(id)}`}>
                <span className="palco-do-cartao">
                  <ImagemDoItem id={id} />
                  {tenho > 0 && <span className="tenho-do-cartao">Você tem {tenho}</span>}
                </span>
                <span className="dados-do-cartao">
                  <TipoDoItem id={id} />
                  <b className="nome-do-cartao">{nomeLemnos(id)}</b>
                  <span className="preco-do-cartao">
                    {arma && (
                      <>
                        <Preco valor={arma.precoGrana} /> <small>uso único · ou</small> <Preco valor={arma.precoMagcoinDias[1]} moeda="magcoin" /> <small>/ dia</small>
                      </>
                    )}
                    {granada && (
                      <>
                        <Preco valor={granada.precoGrana} /> <small>cada</small>
                      </>
                    )}
                    {mochila?.precoGranaDias && (
                      <>
                        <Preco valor={mochila.precoGranaDias[1]} /> <small>/ dia · {mochila.espacos} espaços</small>
                      </>
                    )}
                  </span>
                </span>
              </Link>
            );
          })}
        </div>
      )}

      {aba === 'vender' &&
        (saque.length === 0 ? (
          <div className="extrato-vazio">
            <b>Nada para vender ainda</b>
            <p>Traga relógios, joias, notebooks e barras de ouro da ilha. Tudo o que você extrair aparece aqui para virar Grana.</p>
            <Link className="botao-da-shop" href="/lemnos">
              Montar o kit
            </Link>
          </div>
        ) : (
          <>
            <form action={vender} className="vender-tudo">
              <input type="hidden" name="codigo" value={randomUUID()} />
              <input type="hidden" name="aba" value="vender" />
              {saque.map((linha) => (
                <input key={linha.linha} type="hidden" name="linha" value={linha.linha} />
              ))}
              <span>
                {saque.length} itens no baú, valendo <Preco valor={totalDoSaque} />
              </span>
              <BotaoDeDoisToques className="botao-da-shop" pergunta={`Confirmar: vender tudo por ${totalDoSaque}`}>
                Vender tudo
              </BotaoDeDoisToques>
            </form>
            <div className="grade-da-shop">
              {tiposDoSaque.map((id) => {
                const linhas = saque.filter((linha) => linha.itemId === id);
                const valor = (saqueLemnos(id)?.valor ?? 0) * linhas.length;
                return (
                  <div key={id} className={`cartao-da-shop raridade-${raridadeLemnos(id)}`}>
                    <span className="palco-do-cartao">
                      <ImagemDoItem id={id} />
                      {linhas.length > 1 && <span className="tenho-do-cartao">×{linhas.length}</span>}
                    </span>
                    <span className="dados-do-cartao">
                      <TipoDoItem id={id} />
                      <b className="nome-do-cartao">{nomeLemnos(id)}</b>
                      <span className="preco-do-cartao">
                        <Preco valor={saqueLemnos(id)?.valor ?? 0} /> <small>cada</small>
                      </span>
                    </span>
                    <form action={vender} className="acoes-do-cartao">
                      <input type="hidden" name="codigo" value={randomUUID()} />
                      <input type="hidden" name="aba" value="vender" />
                      {linhas.map((linha) => (
                        <input key={linha.linha} type="hidden" name="linha" value={linha.linha} />
                      ))}
                      <BotaoDeDoisToques className="botao-da-shop" pergunta={`Confirmar: vender por ${valor}`}>
                        Vender por {valor}
                      </BotaoDeDoisToques>
                    </form>
                  </div>
                );
              })}
            </div>
          </>
        ))}

      {aberto && <JanelaDeCompra id={aberto} aba={aba} usuario={usuario} tenho={quantasTenho(aberto)} fechar={endereco()} erro={erro} ok={ok} />}
    </div>
  );
}

function JanelaDeCompra({ id, aba, usuario, tenho, fechar, erro, ok }: { id: string; aba: Aba; usuario: Usuario; tenho: number; fechar: string; erro?: string; ok?: string }) {
  const arma = armaLemnos(id);
  const granada = granadaLemnos(id);
  const mochila = mochilaLemnos(id);
  const nome = nomeLemnos(id);
  const falta = (moeda: 'grana' | 'magcoin', preco: number) => Math.max(preco - (moeda === 'grana' ? usuario.grana : usuario.magcoin), 0);
  const grupos: GrupoDeCompra[] = [];

  if (arma || granada) {
    const unidade = arma?.precoGrana ?? granada?.precoGrana ?? 0;
    grupos.push({
      titulo: 'Com Grana · uso único, perde ao morrer',
      moeda: 'grana',
      acao: comprarGrana,
      campo: 'quantidade',
      opcoes: QUANTIDADES.map((quantidade) => ({
        valor: String(quantidade),
        rotulo: `${quantidade}×`,
        preco: unidade * quantidade,
        frase: `Comprar ${quantidade}× ${nome} por ${unidade * quantidade} Grana`,
        falta: falta('grana', unidade * quantidade),
      })),
    });
  }
  if (arma) {
    grupos.push({
      titulo: 'Com MagCoin · volta ao baú quando você morre',
      moeda: 'magcoin',
      acao: comprarMagcoin,
      campo: 'dias',
      opcoes: [
        ...DIAS_A_VENDA.map((quantidade) => ({
          valor: String(quantidade),
          rotulo: dias(quantidade),
          preco: arma.precoMagcoinDias[quantidade],
          frase: `Comprar ${nome} por ${dias(quantidade)} · ${arma.precoMagcoinDias[quantidade]} MagCoins`,
          falta: falta('magcoin', arma.precoMagcoinDias[quantidade]),
        })),
        {
          valor: 'sempre',
          rotulo: 'Para sempre · nunca se perde',
          preco: arma.precoMagcoinSempre,
          frase: `Comprar ${nome} para sempre · ${arma.precoMagcoinSempre} MagCoins`,
          falta: falta('magcoin', arma.precoMagcoinSempre),
          largo: true,
        },
      ],
    });
  }
  if (mochila?.precoGranaDias) {
    const precos = mochila.precoGranaDias;
    grupos.push({
      titulo: 'Com Grana · por dias',
      moeda: 'grana',
      acao: comprarUmaMochila,
      campo: 'dias',
      opcoes: DIAS_A_VENDA.map((quantidade) => ({
        valor: String(quantidade),
        rotulo: dias(quantidade),
        preco: precos[quantidade],
        frase: `Comprar ${nome} por ${dias(quantidade)} · ${precos[quantidade]} Grana`,
        falta: falta('grana', precos[quantidade]),
      })),
    });
    if (mochila.precoMagcoinSempre !== null) {
      grupos.push({
        titulo: 'Com MagCoin',
        moeda: 'magcoin',
        acao: comprarUmaMochila,
        campo: 'dias',
        opcoes: [
          {
            valor: 'sempre',
            rotulo: 'Para sempre',
            preco: mochila.precoMagcoinSempre,
            frase: `Comprar ${nome} para sempre · ${mochila.precoMagcoinSempre} MagCoins`,
            falta: falta('magcoin', mochila.precoMagcoinSempre),
            largo: true,
          },
        ],
      });
    }
  }

  return (
    <div className="janela-da-shop" role="dialog" aria-modal="true" aria-labelledby="nome-na-janela">
      <Link href={fechar} scroll={false} className="fundo-da-janela" aria-label="Fechar" tabIndex={-1} />
      <FecharComEsc para={fechar} />
      <div className={`caixa-da-janela raridade-${raridadeLemnos(id)}`}>
        <Link href={fechar} scroll={false} className="fechar-janela" aria-label="Fechar">
          ×
        </Link>
        <div className="palco-da-janela">
          <span className="rotulo-da-janela">{tenho > 0 ? `Você tem ${tenho} no baú` : 'Mercado dos Magnatas'}</span>
          <ImagemDoItem id={id} grande />
        </div>
        <div className="dados-da-janela">
          <TipoDoItem id={id} />
          <h2 id="nome-na-janela">{nome}</h2>
          <p>
            {arma && 'A arma de verdade do CS2. Leve no kit e saqueie a ilha com ela.'}
            {granada && 'Lançou, gastou. A que você não usar volta para o baú quando você extrai ou sai pelo posto.'}
            {mochila && `Carrega ${mochila.espacos} itens de saque em vez de 8. Se você morrer, ela volta vazia para o baú.`}
          </p>
          <AvisoDaIlha erro={erro} />
          {ok === 'compra' && (
            <p className="aviso presente-aberto" role="status">
              Comprado! Está no seu baú. <Link href="/lemnos">Pôr no kit</Link>
            </p>
          )}
          <CompraNaJanela grupos={grupos} escondidos={{ itemId: id, codigo: randomUUID(), aba, item: id }} />
        </div>
      </div>
    </div>
  );
}
