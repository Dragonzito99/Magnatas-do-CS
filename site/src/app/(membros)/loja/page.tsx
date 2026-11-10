import { randomUUID } from 'node:crypto';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { exigirAcesso } from '@/auth/guarda';
import { obterBd } from '@/bd/conexao';
import { bauDe, CATALOGO, DIAS_A_VENDA, itemDoCatalogo, lojaAberta, NOME_DO_TIPO, PRECOS, type TipoDeItem } from '@/dominio/loja';
import { BotaoConfirmar } from '../botao-confirmar';
import { comprar } from './acoes';
import { PreviaDoItem } from './previa-do-item';

const ERROS: Record<string, string> = {
  saldo: 'Grana insuficiente para essa compra.',
  item: 'Esse item não está à venda desse jeito.',
  conta: 'Sua conta não pode comprar agora.',
};

const EXPLICACAO: Record<TipoDeItem, string> = {
  cor: 'Seu nome sai nessa cor no chat de todos os servidores.',
  etiqueta: 'Aparece antes do seu nome no chat de todos os servidores.',
  aviso: 'Quando você entra no servidor, todo mundo vê.',
  moldura: 'Uma borda especial na sua foto, no perfil e no ranking.',
};

const TIPOS: TipoDeItem[] = ['cor', 'etiqueta', 'aviso', 'moldura'];
const dias = (quantidade: number) => (quantidade === 1 ? '1 dia' : `${quantidade} dias`);

export default async function Loja({ searchParams }: { searchParams: Promise<{ erro?: string; comprado?: string }> }) {
  const usuario = await exigirAcesso('/loja');
  if (!lojaAberta(usuario)) redirect('/inicio');
  const { erro, comprado } = await searchParams;
  const bau = await bauDe(obterBd(), usuario.id);
  const tenho = new Map(bau.filter((posse) => !posse.vencido).map((posse) => [posse.item.id, posse]));
  const itemComprado = comprado ? itemDoCatalogo(comprado) : undefined;

  return (
    <div className="tela-jogar">
      <div className="topo-jogar">
        <h1>Magnata Shop</h1>
        <p className="apoio">
          Você tem <b className="grana-destaque">{usuario.grana.toLocaleString('pt-BR')} Grana</b>. Ganhe jogando: 1 Grana a cada 10 XP. Comprar de novo
          soma os dias.
        </p>
      </div>
      {erro && ERROS[erro] && (
        <p role="alert" className="aviso">
          {ERROS[erro]}
        </p>
      )}
      {itemComprado && (
        <p className="aviso">
          {itemComprado.nome} comprado. <Link href="/bau">Abra o baú</Link> para usar.
        </p>
      )}

      {TIPOS.map((tipo) => (
        <section key={tipo} className="secao-loja">
          <div className="cabeca-secao-loja">
            <h2>{NOME_DO_TIPO[tipo]}</h2>
            <p className="apoio">{EXPLICACAO[tipo]}</p>
          </div>
          <div className="itens-loja">
            {CATALOGO.filter((item) => item.tipo === tipo).map((item) => {
              const posse = tenho.get(item.id);
              return (
                <form key={item.id} action={comprar} className="cartao-loja">
                  <input type="hidden" name="itemId" value={item.id} />
                  <input type="hidden" name="codigo" value={randomUUID()} />
                  <div className="previa-loja">
                    <PreviaDoItem item={item} usuario={usuario} />
                  </div>
                  <div className="nome-loja">
                    <b>{item.nome}</b>
                    {posse && <small>{posse.diasRestantes === null ? 'Seu para sempre' : `Você tem: ${dias(posse.diasRestantes)}`}</small>}
                  </div>
                  <div className="precos-loja">
                    {DIAS_A_VENDA.map((quantidade) => {
                      const preco = PRECOS[tipo][quantidade];
                      if (preco > usuario.grana)
                        return (
                          <span key={quantidade} className="preco-loja sem-saldo" title={`Faltam ${preco - usuario.grana} Grana`}>
                            <span>{dias(quantidade)}</span>
                            <b>{preco}</b>
                          </span>
                        );
                      return (
                        <BotaoConfirmar
                          key={quantidade}
                          className="preco-loja"
                          name="dias"
                          value={String(quantidade)}
                          mensagem={`Comprar ${NOME_DO_TIPO[tipo]} ${item.nome} por ${dias(quantidade)}, por ${preco} Grana?`}
                        >
                          <span>{dias(quantidade)}</span>
                          <b>{preco}</b>
                        </BotaoConfirmar>
                      );
                    })}
                  </div>
                </form>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}
