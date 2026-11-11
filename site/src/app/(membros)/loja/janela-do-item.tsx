import { randomUUID } from 'node:crypto';
import Link from 'next/link';
import type { Usuario } from '@/bd/esquema';
import { DIAS_A_VENDA, NOME_DA_RARIDADE, NOME_DO_TIPO, PRECOS, PRECOS_MAGCOIN, precoDeHoje, RARIDADE, type ItemDaLoja, type ItemDoBau, type TipoDeItem } from '@/dominio/loja';
import { BotaoConfirmar } from '../botao-confirmar';
import { comprar, comprarComMagcoin } from './acoes';
import { FecharComEsc } from './fechar-com-esc';
import { Preco } from './preco-da-shop';
import { PreviaGrande } from './previa-do-item';

const ERROS: Record<string, string> = {
  saldo: 'Grana insuficiente para essa compra.',
  item: 'Esse item não está à venda desse jeito.',
  conta: 'Sua conta não pode comprar agora.',
  magcoin: 'MagCoins insuficientes. Compre um pacote em Apoie o clube.',
  'ja-seu': 'Esse item já é seu para sempre.',
};

const EXPLICACAO: Record<TipoDeItem, string> = {
  cor: 'Seu nome sai nessa cor no chat de todos os servidores.',
  etiqueta: 'Aparece antes do seu nome no chat de todos os servidores.',
  aviso: 'Quando você entra no servidor, todo mundo vê.',
  moldura: 'Uma borda especial na sua foto, no perfil e no ranking.',
  // Cada mutante tem o próprio texto no catálogo (descricao); este só vale se faltar.
  mutante: 'Na Mutação, você vira esse mutante e ganha um poder no G.',
};

const dias = (quantidade: number) => (quantidade === 1 ? '1 dia' : `${quantidade} dias`);

/**
 * A janela do item, por cima da vitrine: a prévia com o apelido e a foto de quem olha ("experimentar") e os preços. Fecha
 * pelo X, clicando fora ou com Esc; o endereço guarda o item aberto, então voltar e recarregar funcionam.
 */
export function JanelaDoItem({
  item,
  usuario,
  posse,
  fechar,
  erro,
  comprado,
  agora,
}: {
  item: ItemDaLoja;
  usuario: Pick<Usuario, 'apelido' | 'avatarUrl' | 'grana' | 'magcoin'>;
  posse: ItemDoBau | undefined;
  fechar: string;
  erro?: string;
  comprado: boolean;
  agora: Date;
}) {
  const precoParaSempre = PRECOS_MAGCOIN[item.tipo];
  const raridade = RARIDADE[item.tipo];
  return (
    <div className="janela-da-shop" role="dialog" aria-modal="true" aria-labelledby="nome-na-janela">
      <Link href={fechar} scroll={false} className="fundo-da-janela" aria-label="Fechar" tabIndex={-1} />
      <FecharComEsc para={fechar} />
      <div className={`caixa-da-janela raridade-${raridade}`}>
        <Link href={fechar} scroll={false} className="fechar-janela" aria-label="Fechar">
          ×
        </Link>
        <div className="palco-da-janela">
          <span className="rotulo-da-janela">Assim fica em você</span>
          <PreviaGrande item={item} usuario={usuario} />
        </div>
        <div className="dados-da-janela">
          <span className="selo-da-raridade">
            {NOME_DO_TIPO[item.tipo]} · {NOME_DA_RARIDADE[raridade]}
          </span>
          <h2 id="nome-na-janela">{item.nome}</h2>
          <p>{item.descricao ?? EXPLICACAO[item.tipo]}</p>
          {posse && <p className="posse-na-janela">{posse.diasRestantes === null ? 'Seu para sempre.' : `Você tem: ${dias(posse.diasRestantes)}. Comprar soma.`}</p>}
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

          {posse?.diasRestantes !== null && (
            <>
              <span className="rotulo-da-janela">Com Grana</span>
              <form action={comprar} className="dias-da-janela">
                <input type="hidden" name="itemId" value={item.id} />
                <input type="hidden" name="codigo" value={randomUUID()} />
                {DIAS_A_VENDA.map((quantidade) => {
                  const preco = precoDeHoje(item, quantidade, agora);
                  const cheio = PRECOS[item.tipo][quantidade];
                  const conteudo = (
                    <>
                      <span>{dias(quantidade)}</span>
                      <Preco valor={preco} antes={preco < cheio ? cheio : undefined} />
                    </>
                  );
                  if (preco > usuario.grana)
                    return (
                      <span key={quantidade} className="dia-da-janela sem-saldo" title={`Faltam ${preco - usuario.grana} Grana`}>
                        {conteudo}
                      </span>
                    );
                  return (
                    <BotaoConfirmar
                      key={quantidade}
                      className="dia-da-janela"
                      name="dias"
                      value={String(quantidade)}
                      mensagem={`Comprar ${NOME_DO_TIPO[item.tipo]} ${item.nome} por ${dias(quantidade)}, por ${preco} Grana?`}
                    >
                      {conteudo}
                    </BotaoConfirmar>
                  );
                })}
              </form>

              <span className="rotulo-da-janela">Com MagCoin</span>
              <form action={comprarComMagcoin}>
                <input type="hidden" name="itemId" value={item.id} />
                <input type="hidden" name="codigo" value={randomUUID()} />
                {precoParaSempre > usuario.magcoin ? (
                  <Link href="/apoio" className="para-sempre-da-janela sem-saldo">
                    <span>Para sempre · comprar MagCoin</span>
                    <Preco valor={precoParaSempre} moeda="magcoin" />
                  </Link>
                ) : (
                  <BotaoConfirmar className="para-sempre-da-janela" mensagem={`Comprar ${NOME_DO_TIPO[item.tipo]} ${item.nome} para sempre, por ${precoParaSempre} MagCoins?`}>
                    <span>Para sempre</span>
                    <Preco valor={precoParaSempre} moeda="magcoin" />
                  </BotaoConfirmar>
                )}
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
