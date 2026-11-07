import Link from 'next/link';
import { exigirAcesso } from '@/auth/guarda';

/** O momento em que a pessoa vira magnata: a verificação aprovada traz para cá, uma vez só. */
export default async function BemVindo() {
  const usuario = await exigirAcesso('/bem-vindo');
  const ilimitado = usuario.papel !== 'jogador';
  const convites = usuario.convitesRestantes === 1 ? '1 convite' : `${usuario.convitesRestantes} convites`;

  return (
    <div className="boas-vindas">
      <main className="boas-vindas-cartao">
        <svg className="coroa" viewBox="0 0 24 18" aria-hidden="true">
          <path d="M2 16 1 4l6 5 5-8 5 8 6-5-1 12z" />
        </svg>
        <small>Identidade confirmada, {usuario.apelido}</small>
        <h1>
          Agora você é um <em>Magnata do CS</em>
        </h1>
        <ul>
          <li>
            <b>Jogue limpo.</b> Quem é banido não volta, nem com outra conta.
          </li>
          <li>
            <b>{ilimitado ? 'Você gera convites sem limite.' : `Você tem ${convites}.`}</b> Escolha bem quem você traz para o clube.
          </li>
          <li>
            <b>O que acontece aqui fica aqui.</b> A equipe assiste às partidas e analisa as denúncias.
          </li>
        </ul>
        <Link className="botao ouro" href="/jogar">
          Entrar no clube
        </Link>
      </main>
    </div>
  );
}
