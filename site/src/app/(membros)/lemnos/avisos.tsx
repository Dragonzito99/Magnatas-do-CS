const ERROS: Record<string, string> = {
  grana: 'Você não tem Grana suficiente para isso.',
  magcoin: 'Você não tem MagCoins suficientes para isso.',
  'em-campo': 'Você está na Ilha Lemnos agora. Saia do servidor para trocar o kit.',
  'ja-seu': 'Isso já é seu para sempre.',
  item: 'Isso não deu certo. Confira o que você escolheu e tente de novo.',
  conta: 'Sua conta não pode fazer isso agora.',
};

const OK: Record<string, string> = {
  kit: 'Kit salvo. É com ele que você entra na Ilha Lemnos.',
  compra: 'Comprado. Já está no seu baú da ilha.',
  venda: 'Vendido. A Grana já caiu na sua conta.',
};

/** O aviso que volta das ações da ilha, pelo ?erro= ou ?ok= da URL. */
export function AvisoDaIlha({ erro, ok }: { erro?: string; ok?: string }) {
  if (erro && ERROS[erro])
    return (
      <p role="alert" className="aviso">
        {ERROS[erro]}
      </p>
    );
  if (ok && OK[ok])
    return (
      <p role="status" className="aviso presente-aberto">
        {OK[ok]}
      </p>
    );
  return null;
}
