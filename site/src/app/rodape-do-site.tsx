import Image from 'next/image';
import Link from 'next/link';
import { enderecoDoDiscord } from '@/dominio/discord';

/**
 * O rodapé do site (dono, 13/11/2026): logo no centro e, embaixo, a faixa com o "©" da Forja de Hefesto (a Magnatas é
 * um produto dela), a frase do clube no meio e os links à direita.
 */
export function RodapeDoSite() {
  const discord = enderecoDoDiscord(process.env.DISCORD_URL);
  return (
    <footer className="rodape-do-site">
      <div className="logo-do-rodape">
        <Link href="/" aria-label="Magnatas do CS, início">
          <Image src="/marca/logo.webp" alt="Magnatas do CS" width={1000} height={334} />
        </Link>
      </div>
      <div className="faixa-do-rodape">
        <p>
          © {new Date().getFullYear()} <b>Forja de Hefesto</b> — Todos os direitos reservados
        </p>
        <p className="lema-do-rodape" aria-label="CS2, só por convite, sem hack">
          <i aria-hidden="true" />
          CS2 · Só por convite · Sem hack
          <i aria-hidden="true" />
        </p>
        <nav aria-label="Sobre o clube">
          <Link href="/regras">Regras</Link>
          <Link href="/privacidade">Privacidade</Link>
          {discord && (
            <a href={discord} target="_blank" rel="noreferrer">
              Discord
            </a>
          )}
        </nav>
      </div>
    </footer>
  );
}
