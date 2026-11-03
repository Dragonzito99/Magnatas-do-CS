import { redirect } from 'next/navigation';
import { usuarioAtual } from '@/auth/sessao-atual';
import { destinoPara } from '@/auth/destino';
import { comecar } from './acoes';

const RESULTADOS: Record<string, string> = {
  reprovada: 'Não foi possível confirmar seus dados. Confira as regras abaixo e tente de novo.',
};

export default async function Verificacao({ searchParams }: { searchParams: Promise<{ resultado?: string }> }) {
  const usuario = await usuarioAtual();
  const destino = destinoPara(usuario, '/verificacao');
  if (destino) redirect(destino);
  const { resultado } = await searchParams;

  return (
    <main className="cartao-central">
      <h1>Confirme sua identidade</h1>
      <p>Para manter a plataforma sem hack, cada pessoa pode ter só uma conta.</p>
      {resultado && RESULTADOS[resultado] && (
        <p role="alert" className="aviso">
          {RESULTADOS[resultado]}
        </p>
      )}
      <ul className="lista-regras">
        <li>Você vai precisar de um documento com foto e de uma selfie.</li>
        <li>É preciso ter 18 anos ou mais.</li>
        <li>Quem é banido não volta, nem com outra conta Steam.</li>
        <li>Não guardamos a foto do seu documento.</li>
      </ul>
      <form action={comecar}>
        <button type="submit" className="botao laranja">
          Começar verificação
        </button>
      </form>
      <form action="/api/auth/sair" method="post">
        <button type="submit" className="botao-texto">
          Sair
        </button>
      </form>
    </main>
  );
}
