import { exigirAcesso } from '@/auth/guarda';

export default async function Banido() {
  await exigirAcesso('/banido');
  return (
    <div className="centro">
      <main className="cartao-central">
        <h1>Conta banida</h1>
        <p>Esta conta foi banida da Magnatas de forma definitiva, e não é possível voltar com outra conta.</p>
        <form action="/api/auth/sair" method="post">
          <button type="submit" className="botao-texto">
            Sair
          </button>
        </form>
      </main>
    </div>
  );
}
