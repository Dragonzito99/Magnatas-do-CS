import Link from 'next/link';
import { exigirAcesso } from '@/auth/guarda';
import { obterBd } from '@/bd/conexao';
import { amigosDe, convitesDeSalaPara, pedidosDeAmizadePara, procurarMembros, type Amigo } from '@/dominio/amigos';
import { Avatar } from '../avatar';
import { BotaoConfirmar } from '../botao-confirmar';
import { aceitarConvite, desfazer, recusarConvite, responder } from './acoes';
import { BotaoDeAmizade } from './botao-de-amizade';

const NOME_DA_SITUACAO: Record<Amigo['situacao'], string> = { jogando: 'jogando agora', online: 'online', offline: 'offline' };

const ERROS: Record<string, string> = { amizade: 'Não dá para pedir amizade a essa pessoa.' };

/**
 * A Comunidade, etapa 1 (dono, 11/11/2026): amigos, pedidos de amizade, convites para a sala e a busca de membros.
 * O mural de posts e as mensagens chegam nas próximas etapas.
 */
export default async function Comunidade({ searchParams }: { searchParams: Promise<{ q?: string; erro?: string }> }) {
  const usuario = await exigirAcesso('/comunidade');
  const { q, erro } = await searchParams;
  const bd = obterBd();
  const [amigos, pedidos, convites, achados] = await Promise.all([
    amigosDe(bd, usuario.id),
    pedidosDeAmizadePara(bd, usuario.id),
    convitesDeSalaPara(bd, usuario.id),
    q ? procurarMembros(bd, usuario.id, q) : Promise.resolve([]),
  ]);
  const online = amigos.filter((amigo) => amigo.situacao !== 'offline').length;

  return (
    <div className="tela-jogar">
      <div className="carteira-da-shop">
        <h1>Comunidade</h1>
        <span className="moeda-da-shop">
          <b>{amigos.length}</b>
          <small>{amigos.length === 1 ? 'amigo' : 'amigos'}</small>
        </span>
        <span className="moeda-da-shop">
          <b>{online}</b>
          <small>online agora</small>
        </span>
      </div>
      {erro && ERROS[erro] && (
        <p role="alert" className="aviso">
          {ERROS[erro]}
        </p>
      )}

      {convites.length > 0 && (
        <section className="chamados-do-cla" id="convites">
          <h2>Chamaram você para jogar</h2>
          {convites.map((convite) => (
            <div key={convite.id} className="pedido-do-cla">
              <span>
                <b>{convite.deApelido}</b> chamou você para a sala de {convite.salaNome}
                <small>
                  {convite.membros}/5 · vale por 2 minutos
                </small>
              </span>
              <form action={aceitarConvite}>
                <input type="hidden" name="conviteId" value={convite.id} />
                <button type="submit" className="botao-da-shop">
                  Entrar na sala
                </button>
              </form>
              <form action={recusarConvite}>
                <input type="hidden" name="conviteId" value={convite.id} />
                <button type="submit" className="botao-da-shop vazado">
                  Recusar
                </button>
              </form>
            </div>
          ))}
        </section>
      )}

      {pedidos.length > 0 && (
        <section className="chamados-do-cla" id="pedidos">
          <h2>Pedidos de amizade</h2>
          {pedidos.map((pedido) => (
            <div key={pedido.id} className="pedido-do-cla">
              <span className="pessoa-do-pedido">
                <Avatar usuario={pedido} />
                <Link href={`/jogadores/${pedido.id}`}>{pedido.apelido}</Link>
              </span>
              <form action={responder}>
                <input type="hidden" name="usuarioId" value={pedido.id} />
                <button type="submit" name="resposta" value="aceitar" className="botao-da-shop">
                  Aceitar
                </button>
              </form>
              <form action={responder}>
                <input type="hidden" name="usuarioId" value={pedido.id} />
                <button type="submit" name="resposta" value="recusar" className="botao-da-shop vazado">
                  Recusar
                </button>
              </form>
            </div>
          ))}
        </section>
      )}

      <div className="secao-da-shop">
        <h2>Meus amigos</h2>
        <span className="legenda-da-secao">A barra da direita mostra quem está online</span>
      </div>
      {amigos.length === 0 ? (
        <div className="extrato-vazio">
          <b>Você ainda não tem amigos aqui</b>
          <p>Procure o apelido de quem joga com você aqui embaixo, ou clique em &quot;Adicionar amigo&quot; no perfil da pessoa.</p>
        </div>
      ) : (
        <div className="grade-de-amigos">
          {amigos.map((amigo) => (
            <div key={amigo.id} className={`cartao-de-amigo ${amigo.situacao}`}>
              <span className="foto-do-amigo">
                <Avatar usuario={amigo} />
                <i aria-hidden="true" />
              </span>
              <span>
                <Link href={`/jogadores/${amigo.id}`} className="nome-do-amigo">
                  {amigo.apelido}
                </Link>
                <small className={`situacao-do-amigo ${amigo.situacao}`}>{NOME_DA_SITUACAO[amigo.situacao]}</small>
              </span>
              <form action={desfazer}>
                <input type="hidden" name="usuarioId" value={amigo.id} />
                <BotaoConfirmar className="desfazer-amizade" mensagem={`Desfazer a amizade com ${amigo.apelido}?`}>
                  ×
                </BotaoConfirmar>
              </form>
            </div>
          ))}
        </div>
      )}

      <div className="secao-da-shop" id="procurar">
        <h2>Procurar membros</h2>
        <span className="legenda-da-secao">Pelo apelido, para mandar um pedido de amizade</span>
      </div>
      <form className="busca-de-cla" action="/comunidade">
        <input name="q" defaultValue={q ?? ''} placeholder="Apelido do membro" aria-label="Procurar membro" minLength={2} />
        <button type="submit" className="botao-da-shop">
          Procurar
        </button>
      </form>
      {q && achados.length === 0 && <p className="legenda-da-secao">Ninguém com esse apelido.</p>}
      {achados.length > 0 && (
        <div className="grade-de-amigos">
          {achados.map((membro) => (
            <div key={membro.id} className="cartao-de-amigo achado">
              <span className="foto-do-amigo">
                <Avatar usuario={membro} />
              </span>
              <Link href={`/jogadores/${membro.id}`} className="nome-do-amigo">
                {membro.apelido}
              </Link>
              <BotaoDeAmizade usuarioId={membro.id} situacao={membro.situacao} voltar={`/comunidade?q=${encodeURIComponent(q ?? '')}`} />
            </div>
          ))}
        </div>
      )}

      <p className="legenda-da-secao frase-de-clas">Em breve aqui: o mural de jogadas, táticas e dúvidas, e as mensagens com os amigos.</p>
    </div>
  );
}
