import { redirect } from 'next/navigation';
import { destinoPara } from '@/auth/destino';
import { usuarioAtual } from '@/auth/sessao-atual';
import { entrarComConvite } from './acoes';
import { LogoGrande } from './logo-grande';

const ERROS: Record<string, string> = {
  convite: 'Este código não é válido. Confira com quem convidou você.',
  conta: 'Essa conta Steam ainda não faz parte. Entre com um código de convite.',
  steam: 'Não foi possível confirmar seu login na Steam. Tente de novo.',
  limite: 'Muitas tentativas. Espere um minuto e tente de novo.',
};

export default async function Inicio({ searchParams }: { searchParams: Promise<{ erro?: string }> }) {
  const destino = destinoPara(await usuarioAtual(), '/');
  if (destino) redirect(destino);
  const { erro } = await searchParams;

  return (
    <div className="centro">
      <main className="cartao-central">
        <LogoGrande />
        <p>Só entra quem tem convite.</p>
        {erro && ERROS[erro] && (
          <p role="alert" className="aviso">
            {ERROS[erro]}
          </p>
        )}
        <form action={entrarComConvite} className="formulario">
          <label htmlFor="codigo">Código de convite</label>
          <input id="codigo" name="codigo" className="mono" autoComplete="off" required maxLength={20} placeholder="7K2M9QX4TP" />
          <button type="submit" className="botao ouro">
            Entrar com a Steam
          </button>
        </form>
        {/* Fica como <a>, porque o Link do Next pré-carregaria a rota e abriria a Steam sozinho. */}
        <a href="/api/auth/steam" className="botao-texto">
          Já tenho conta
        </a>
      </main>
    </div>
  );
}
