'use client';

import { useRef, useState } from 'react';
import { abrirPresenteConvite } from './acoes';

/**
 * O presente que veio no convite, fechado no topo do baú. Mostra o recado e o que tem dentro; clicar sacode e abre a
 * caixa, e aí o site entrega tudo.
 */
export function PresenteDoConvite({ presenteId, recado, conteudo }: { presenteId: string; recado: string | null; conteudo: string[] }) {
  const [abrindo, setAbrindo] = useState(false);
  const formulario = useRef<HTMLFormElement>(null);

  function abrir() {
    if (abrindo) return;
    setAbrindo(true);
    setTimeout(() => formulario.current?.requestSubmit(), 900);
  }

  return (
    <section className={`presente-do-bau ${abrindo ? 'abrindo' : 'fechada'}`} id="presente" aria-label="Presente do convite">
      <button type="button" className="caixa-do-presente" onClick={abrir} disabled={abrindo} aria-label="Abrir o presente">
        <span className="tampa-do-presente" aria-hidden="true" />
        <span className="corpo-do-presente" aria-hidden="true" />
      </button>
      <form ref={formulario} action={abrirPresenteConvite} className="texto-do-presente">
        <input type="hidden" name="presenteId" value={presenteId} />
        <span className="rotulo-da-janela">Presente do seu convite</span>
        <h2>Tem um presente para você!</h2>
        {recado && <blockquote className="recado-do-presente">{recado}</blockquote>}
        <ul className="conteudo-do-presente">
          {conteudo.map((linha) => (
            <li key={linha}>{linha}</li>
          ))}
        </ul>
        <button type="button" className="botao-da-shop" onClick={abrir} disabled={abrindo}>
          {abrindo ? 'Abrindo...' : 'Abrir presente'}
        </button>
      </form>
    </section>
  );
}
