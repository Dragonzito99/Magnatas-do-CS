'use client';

import { useState } from 'react';

const PASTA_DO_CS2 = 'Steam\\steamapps\\common\\Counter-Strike Global Offensive\\game\\csgo';

/** Baixa a gravação e mostra como abrir no jogo, porque o CS2 só abre o arquivo que está na pasta dele. */
export function AssistirNoCs2({ gravacaoId, numero }: { gravacaoId: string; numero: number }) {
  const [passosAbertos, setPassosAbertos] = useState(false);
  const [copiado, setCopiado] = useState(false);
  const comando = `playdemo ${numero}`;

  async function copiar() {
    try {
      await navigator.clipboard.writeText(comando);
      setCopiado(true);
    } catch {
      // Sem acesso à área de transferência, o comando continua na tela para digitar.
      setCopiado(false);
    }
  }

  return (
    <div className="assistir-no-cs2">
      <a className="botao ouro pequeno" href={`/api/gravacoes/${gravacaoId}`} onClick={() => setPassosAbertos(true)}>
        Assistir no CS2
      </a>
      {passosAbertos && (
        <ol className="passos-do-cs2">
          <li>
            Salve o arquivo <span className="mono">{numero}.dem</span> na pasta <span className="mono caminho">{PASTA_DO_CS2}</span>
          </li>
          <li>
            No console do CS2, digite <span className="mono">{comando}</span>{' '}
            <button type="button" className="botao cinza pequeno" onClick={copiar}>
              {copiado ? 'Copiado' : 'Copiar'}
            </button>
          </li>
          <li>
            Digite <span className="mono">demoui</span> para abrir a barra de controle e ir até a rodada denunciada.
          </li>
        </ol>
      )}
    </div>
  );
}
