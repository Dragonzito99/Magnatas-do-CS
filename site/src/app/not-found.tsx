import Link from 'next/link';
import { LogoGrande } from './logo-grande';

export default function NaoEncontrada() {
  return (
    <div className="centro">
      <main className="cartao-central">
        <LogoGrande />
        <h1>Página não encontrada</h1>
        <p>Este endereço não existe no clube.</p>
        <Link className="botao ouro" href="/">
          Voltar ao início
        </Link>
      </main>
    </div>
  );
}
