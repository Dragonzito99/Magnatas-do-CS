'use client';

import { useState } from 'react';
import { BotaoConfirmar } from '../botao-confirmar';
import { abrirPresente } from './acoes';

type Opcao = { id: string; nome: string; imagem?: string; descricao?: string };

/**
 * O presente de boas-vindas do Premium, fechado no topo do baú. Clicar sacode e abre a caixa, e aí a pessoa escolhe o
 * mutante que fica para sempre. A escolha pergunta antes, porque não dá para trocar depois.
 */
export function CaixaDePresente({ opcoes, diasDosOutros, itens }: { opcoes: Opcao[]; diasDosOutros: number; itens: string }) {
  const [etapa, setEtapa] = useState<'fechada' | 'abrindo' | 'escolher'>('fechada');

  function abrir() {
    setEtapa('abrindo');
    setTimeout(() => setEtapa('escolher'), 900);
  }

  return (
    <section className={`presente-do-bau ${etapa}`} id="presente" aria-label="Presente de Magnata">
      {etapa !== 'escolher' ? (
        <>
          <button type="button" className="caixa-do-presente" onClick={abrir} disabled={etapa === 'abrindo'} aria-label="Abrir o presente">
            <span className="tampa-do-presente" aria-hidden="true" />
            <span className="corpo-do-presente" aria-hidden="true" />
          </button>
          <div className="texto-do-presente">
            <span className="rotulo-da-janela">Magnata Premium</span>
            <h2>Chegou seu presente!</h2>
            <p>Um mutante seu para sempre, à sua escolha, e mais uns extras para começar.</p>
            <button type="button" className="botao-da-shop" onClick={abrir} disabled={etapa === 'abrindo'}>
              {etapa === 'abrindo' ? 'Abrindo...' : 'Abrir presente'}
            </button>
          </div>
        </>
      ) : (
        <div className="escolha-do-presente">
          <span className="rotulo-da-janela">Escolha o seu mutante para sempre</span>
          <p>
            Os outros ficam {diasDosOutros} dias com você, e junto vêm {itens}.
          </p>
          <div className="opcoes-do-presente">
            {opcoes.map((opcao) => (
              <form key={opcao.id} action={abrirPresente} className="opcao-do-presente">
                <input type="hidden" name="mutanteId" value={opcao.id} />
                {/* eslint-disable-next-line @next/next/no-img-element */}
                {opcao.imagem && <img src={opcao.imagem} alt="" />}
                <b>{opcao.nome}</b>
                {opcao.descricao && <small>{opcao.descricao}</small>}
                <BotaoConfirmar className="botao-da-shop" mensagem={`Ficar com ${opcao.nome} para sempre? Não dá para trocar depois.`}>
                  Quero este
                </BotaoConfirmar>
              </form>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
