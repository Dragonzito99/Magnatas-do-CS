import { notFound, redirect } from 'next/navigation';
import { usuarioAtual } from '@/auth/sessao-atual';
import { destinoPara } from '@/auth/destino';
import { criarVerificador } from '@/verificacao/verificador';
import { responderSimulador } from '../acoes';
import { MolduraDaVerificacao } from '../moldura';

/** Só para testes: faz o papel da empresa de verificação, sem pedir documento nenhum. */
export default async function Simulador({ searchParams }: { searchParams: Promise<{ ref?: string }> }) {
  const { ref } = await searchParams;
  if (criarVerificador(process.env).nome !== 'simulador') notFound();
  const usuario = await usuarioAtual();
  const destino = destinoPara(usuario, '/verificacao');
  if (destino) redirect(destino);
  if (!ref) redirect('/verificacao');

  return (
    <MolduraDaVerificacao passo="Modo de teste" titulo="Simulador de verificação">
      <p role="note" className="aviso">
        Isto é um simulador de testes. Nenhum documento real é pedido ou guardado.
      </p>
      <form action={responderSimulador} className="formulario">
        <input type="hidden" name="referencia" value={ref} />
        <label htmlFor="cpf">CPF de teste (opcional, para testar CPF repetido)</label>
        <input id="cpf" name="cpf" autoComplete="off" inputMode="numeric" placeholder="Gerado automaticamente" />
        <div className="acoes-do-simulador">
          <button type="submit" name="escolha" value="aprovar" className="botao-da-shop botao-grande">
            Aprovar
          </button>
          <button type="submit" name="escolha" value="reprovar" className="botao-da-shop vazado">
            Reprovar
          </button>
          <button type="submit" name="escolha" value="menor" className="botao-da-shop vazado">
            Menor de idade
          </button>
        </div>
      </form>
    </MolduraDaVerificacao>
  );
}
