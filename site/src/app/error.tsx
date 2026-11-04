'use client';

import { LogoGrande } from './logo-grande';

export default function Erro({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="centro">
      <main className="cartao-central">
        <LogoGrande />
        <h1>Algo deu errado</h1>
        <p>Não foi possível abrir esta página agora. Tente de novo em instantes.</p>
        <button type="button" className="botao ouro" onClick={reset}>
          Tentar de novo
        </button>
      </main>
    </div>
  );
}
