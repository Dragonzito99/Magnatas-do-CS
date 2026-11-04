import { exigirAcesso } from '@/auth/guarda';
import { LogoGrande } from '../logo-grande';

export default async function Suspenso() {
  await exigirAcesso('/suspenso');
  return (
    <div className="centro">
      <main className="cartao-central">
        <LogoGrande />
        <h1>Conta suspensa</h1>
        <p>Sua conta está suspensa enquanto a equipe analisa o caso. Você não pode jogar até a análise terminar.</p>
        <form action="/api/auth/sair" method="post">
          <button type="submit" className="botao-texto">
            Sair
          </button>
        </form>
      </main>
    </div>
  );
}
