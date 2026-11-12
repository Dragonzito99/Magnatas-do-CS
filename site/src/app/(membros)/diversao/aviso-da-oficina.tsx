'use client';

import { useEffect, useState, useSyncExternalStore, type MouseEvent } from 'react';
import { createPortal } from 'react-dom';

/** Quem marcou "não mostrar de novo" fica guardado só neste navegador (pedido do dono, 12/11/2026). */
const CHAVE = 'magnatas:aviso-da-oficina-visto';
const EVENTO = 'magnatas:aviso-da-oficina';

function jaViu(): boolean {
  try {
    return localStorage.getItem(CHAVE) === '1';
  } catch {
    return false;
  }
}

function marcarVisto(): void {
  try {
    localStorage.setItem(CHAVE, '1');
    window.dispatchEvent(new Event(EVENTO));
  } catch {
    // Sem localStorage o aviso só volta a aparecer da próxima vez.
  }
}

function assinar(aoMudar: () => void): () => void {
  window.addEventListener(EVENTO, aoMudar);
  return () => window.removeEventListener(EVENTO, aoMudar);
}

const TEXTO =
  'Na primeira vez, o jogo baixa da Oficina os mapas, os bonecos e os sons do servidor. A tela de carregamento pode ficar parada alguns minutos: não feche o jogo.';

/** O botão Entrar dos servidores da Diversão: antes de abrir o jogo, avisa que vai baixar coisas da Oficina. */
export function EntrarComAviso({ link, colecao }: { link: string; colecao: string | null }) {
  const [aberto, setAberto] = useState(false);
  const [naoMostrar, setNaoMostrar] = useState(false);

  useEffect(() => {
    if (!aberto) return;
    const aoTeclar = (evento: KeyboardEvent) => {
      if (evento.key === 'Escape') setAberto(false);
    };
    window.addEventListener('keydown', aoTeclar);
    return () => window.removeEventListener('keydown', aoTeclar);
  }, [aberto]);

  function aoClicar(evento: MouseEvent<HTMLAnchorElement>) {
    if (jaViu()) return;
    evento.preventDefault();
    setAberto(true);
  }

  function abrirJogo() {
    if (naoMostrar) marcarVisto();
    setAberto(false);
    window.location.href = link;
  }

  return (
    <>
      <a className="botao ouro pequeno" href={link} onClick={aoClicar}>
        Entrar
      </a>
      {aberto &&
        createPortal(
          <div className="janela-da-oficina" role="dialog" aria-modal="true" aria-labelledby="titulo-da-oficina">
            <button type="button" className="fundo-da-janela" aria-label="Fechar" tabIndex={-1} onClick={() => setAberto(false)} />
            <div className="caixa-da-oficina">
              <button type="button" className="fechar-janela" aria-label="Fechar" onClick={() => setAberto(false)}>
                ×
              </button>
              <h2 id="titulo-da-oficina">Primeira vez neste servidor?</h2>
              <p>{TEXTO}</p>
              {colecao && (
                <p>
                  Para entrar rápido, inscreva-se antes na coleção dos Magnatas na Oficina. O Steam baixa tudo sozinho, com o jogo fechado.
                </p>
              )}
              <label className="nao-mostrar-oficina">
                <input type="checkbox" checked={naoMostrar} onChange={(evento) => setNaoMostrar(evento.target.checked)} />
                Já baixei, não mostrar de novo
              </label>
              <div className="botoes-da-oficina">
                {colecao && (
                  <a className="botao cinza pequeno" href={colecao} target="_blank" rel="noreferrer">
                    Baixar antes
                  </a>
                )}
                <button type="button" className="botao ouro pequeno" onClick={abrirJogo}>
                  Abrir o jogo
                </button>
              </div>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}

/** Enquanto o servidor liga, quem ainda não marcou "não mostrar de novo" lê o mesmo aviso, já que o jogo abre sozinho. */
export function LembreteDaOficina({ colecao }: { colecao: string | null }) {
  const visto = useSyncExternalStore(assinar, jaViu, () => true);
  if (visto) return null;
  return (
    <span className="lembrete-da-oficina">
      Primeira vez? O jogo baixa coisas da Oficina e pode ficar parado alguns minutos. Não feche.{' '}
      {colecao && (
        <a href={colecao} target="_blank" rel="noreferrer">
          Baixar antes
        </a>
      )}
    </span>
  );
}
