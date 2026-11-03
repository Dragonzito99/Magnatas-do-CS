import { notFound, redirect } from 'next/navigation';
import { usuarioAtual } from '@/auth/sessao-atual';
import { destinoPara } from '@/auth/destino';
import { criarVerificador } from '@/verificacao/verificador';
import { responderSimulador } from '../acoes';

export default async function Simulador({ searchParams }: { searchParams: Promise<{ ref?: string }> }) {
  if (criarVerificador(process.env).nome !== 'simulador') notFound();
  const usuario = await usuarioAtual();
  const destino = destinoPara(usuario, '/verificacao');
  if (destino) redirect(destino);
  const { ref } = await searchParams;
  if (!ref) redirect('/verificacao');

  return (
    <main className="cartao-central">
      <p role="note" className="aviso">
        Isto é um simulador de testes. Nenhum documento real é pedido ou guardado.
      </p>
      <h1>Simulador de verificação</h1>
      <form action={responderSimulador} className="formulario">
        <input type="hidden" name="referencia" value={ref} />
        <label htmlFor="cpf">CPF de teste (opcional, para testar CPF repetido)</label>
        <input id="cpf" name="cpf" autoComplete="off" inputMode="numeric" placeholder="Gerado automaticamente" />
        <div className="acoes">
          <button type="submit" name="escolha" value="aprovar" className="botao laranja">
            Aprovar
          </button>
          <button type="submit" name="escolha" value="reprovar" className="botao cinza">
            Reprovar
          </button>
          <button type="submit" name="escolha" value="menor" className="botao cinza">
            Menor de idade
          </button>
        </div>
      </form>
    </main>
  );
}
