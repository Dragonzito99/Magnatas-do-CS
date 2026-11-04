import { exigirAcesso } from '@/auth/guarda';
import { conexaoDoMataMata, mataMataDoAmbiente, situacaoDoMataMata } from '@/dominio/mata-mata';
import { controladorDoAmbiente } from '@/servidor-jogo/controlador';

export default async function Diversao() {
  await exigirAcesso('/diversao');
  const servidor = mataMataDoAmbiente();
  const { ligado, jogando, vagas } = await situacaoDoMataMata(controladorDoAmbiente(), servidor);
  const cheio = jogando >= vagas;

  return (
    <>
      <div className="topo-pagina">
        <h1>Diversão</h1>
      </div>
      <article className="cartao-escuro modo mata-mata">
        <svg className="arte" viewBox="0 0 24 24" aria-hidden="true">
          <circle cx="12" cy="12" r="9" />
          <circle cx="12" cy="12" r="3.5" />
          <path d="M12 1v4" />
          <path d="M12 19v4" />
          <path d="M1 12h4" />
          <path d="M19 12h4" />
        </svg>
        <span className={ligado ? 'ao-vivo' : 'ao-vivo fora-do-ar'}>{ligado ? 'Ao vivo' : 'Fora do ar'}</span>
        <div className="mata-mata-texto">
          <div>
            <h2>Cada um por si</h2>
            <p>Dust 2, só AK e Desert. Morreu, renasce na hora em outro lugar do mapa.</p>
            {ligado && (
              <small>
                {jogando} de {vagas} jogando
              </small>
            )}
          </div>
          {ligado && servidor && !cheio && (
            <a className="botao ouro" href={conexaoDoMataMata(servidor, process.env.SERVIDOR_SENHA ?? '')}>
              Entrar
            </a>
          )}
          {ligado && cheio && <span className="etiqueta">Servidor cheio</span>}
        </div>
      </article>
      <div className="modos">
        <article className="cartao-escuro modo fantasma">
          <svg className="arte" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M9 10h.01" />
            <path d="M15 10h.01" />
            <path d="M12 2a8 8 0 0 0-8 8v12l3-3 2.5 2.5L12 19l2.5 2.5L17 19l3 3V10a8 8 0 0 0-8-8z" />
          </svg>
          <span className="ao-vivo">Em breve</span>
          <div>
            <h2>Fantasma</h2>
            <p>Um time invisível, só na faca, contra um time armado.</p>
          </div>
        </article>
        <article className="cartao-escuro modo mutacao">
          <svg className="arte" viewBox="0 0 24 24" aria-hidden="true">
            <circle cx="12" cy="11.9" r="2" />
            <path d="M6.7 3.4c-.9 2.5 0 5.2 2.2 6.7C6.5 9 3.7 9.6 2 11.6" />
            <path d="m8.9 10.1 1.4.8" />
            <path d="M17.3 3.4c.9 2.5 0 5.2-2.2 6.7 2.4-1.2 5.2-.6 6.9 1.5" />
            <path d="m15.1 10.1-1.4.8" />
            <path d="M16.7 20.8c-2.6-.4-4.6-2.6-4.7-5.3-.2 2.6-2.1 4.8-4.7 5.2" />
            <path d="M12 13.9v1.6" />
            <path d="M13.5 5.4c-1-.2-2-.2-3 0" />
            <path d="M17 16.4c.7-.7 1.2-1.6 1.5-2.5" />
            <path d="M5.5 13.9c.3.9.8 1.8 1.5 2.5" />
          </svg>
          <span className="ao-vivo">Em breve</span>
          <div>
            <h2>Mutação</h2>
            <p>Quem é pego vira mutante. Os humanos tentam sobreviver.</p>
          </div>
        </article>
      </div>
      <div className="proximo-modo">
        <h3>Próximo modo</h3>
        <p>Os novos modos entram aqui.</p>
      </div>
    </>
  );
}
