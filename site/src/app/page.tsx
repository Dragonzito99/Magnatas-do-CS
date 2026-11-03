import { entrarComConvite } from './acoes';

const ERROS: Record<string, string> = {
  convite: 'Este código não é válido. Confira com quem convidou você.',
  conta: 'Essa conta Steam ainda não faz parte. Entre com um código de convite.',
  steam: 'Não foi possível confirmar seu login na Steam. Tente de novo.',
  limite: 'Muitas tentativas. Espere um minuto e tente de novo.',
};

export default async function Inicio({ searchParams }: { searchParams: Promise<{ erro?: string }> }) {
  const { erro } = await searchParams;
  return (
    <main className="entrada">
      <h1>Magnatas</h1>
      <p>Só entra quem tem convite.</p>
      {erro && ERROS[erro] && <p role="alert">{ERROS[erro]}</p>}
      <form action={entrarComConvite}>
        <label htmlFor="codigo">Código de convite</label>
        <input id="codigo" name="codigo" autoComplete="off" required maxLength={20} placeholder="7K2M9QX4TP" />
        <button type="submit">Entrar com a Steam</button>
      </form>
      <a href="/api/auth/steam">Já tenho conta</a>
    </main>
  );
}
