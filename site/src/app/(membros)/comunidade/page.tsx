import Link from 'next/link';
import { exigirAcesso } from '@/auth/guarda';
import { obterBd } from '@/bd/conexao';
import { amigosDe, convitesDeSalaPara, pedidosDeAmizadePara, procurarMembros, type Amigo } from '@/dominio/amigos';
import { conversasDe } from '@/dominio/mensagens';
import { Avatar } from '../avatar';
import { BotaoConfirmar } from '../botao-confirmar';
import { BotaoDeConversa } from '../janela-de-conversa';
import { aceitarConvite, desfazer, novoGrupo, recusarConvite, responder, sairGrupo } from './acoes';
import { BotaoDeAmizade } from './botao-de-amizade';

const NOME_DA_SITUACAO: Record<Amigo['situacao'], string> = { jogando: 'jogando agora', online: 'online', offline: 'offline' };

const ERROS: Record<string, string> = {
  amizade: 'Não dá para pedir amizade a essa pessoa.',
  grupo: 'O nome do grupo precisa ter de 2 a 40 letras.',
  'grupo-amigos': 'Só dá para chamar amigos para o grupo.',
};

/**
 * A Comunidade, etapa 1 (dono, 11/11/2026): amigos, pedidos de amizade, convites para a sala e a busca de membros.
 * O mural de posts e as mensagens chegam nas próximas etapas.
 */
export default async function Comunidade({ searchParams }: { searchParams: Promise<{ q?: string; erro?: string; aviso?: string }> }) {
  const usuario = await exigirAcesso('/comunidade');
  const { q, erro, aviso } = await searchParams;
  const bd = obterBd();
  const [amigos, pedidos, convites, achados, conversas] = await Promise.all([
    amigosDe(bd, usuario.id),
    pedidosDeAmizadePara(bd, usuario.id),
    convitesDeSalaPara(bd, usuario.id),
    q ? procurarMembros(bd, usuario.id, q) : Promise.resolve([]),
    conversasDe(bd, usuario.id),
  ]);
  const grupos = conversas.filter((conversa) => conversa.tipo !== 'direta');
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
      {aviso === 'grupo' && <p className="aviso">Grupo criado. Ele já aparece na barra da direita.</p>}

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
              <BotaoDeConversa alvo={{ amigoId: amigo.id }} className="conversar-com-amigo" title={`Conversar com ${amigo.apelido}`}>
                💬
              </BotaoDeConversa>
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

      <div className="secao-da-shop" id="grupos">
        <h2>Grupos</h2>
        <span className="legenda-da-secao">Conversa com vários amigos; o do clã é automático</span>
      </div>
      {grupos.length > 0 && (
        <div className="grade-de-amigos">
          {grupos.map((grupo) => (
            <div key={grupo.id} className="cartao-de-amigo grupo">
              <span className={grupo.tipo === 'cla' ? 'grupo-na-barra cla' : 'grupo-na-barra'}>{grupo.tipo === 'cla' ? 'CLÃ' : '👥'}</span>
              <span>
                <b className="nome-do-amigo">{grupo.nome}</b>
                <small className="situacao-do-amigo">{grupo.naoLidas > 0 ? `${grupo.naoLidas} novas` : grupo.tipo === 'cla' ? 'grupo do clã' : 'grupo'}</small>
              </span>
              <span className="acoes-do-grupo">
                <BotaoDeConversa alvo={{ conversaId: grupo.id }} className="conversar-com-amigo" title="Abrir conversa">
                  💬
                </BotaoDeConversa>
                {grupo.tipo === 'grupo' && (
                  <form action={sairGrupo}>
                    <input type="hidden" name="conversaId" value={grupo.id} />
                    <BotaoConfirmar className="desfazer-amizade" mensagem={`Sair do grupo ${grupo.nome}?`}>
                      ×
                    </BotaoConfirmar>
                  </form>
                )}
              </span>
            </div>
          ))}
        </div>
      )}
      {amigos.length > 0 && (
        <details className="editar-o-cla criar-grupo">
          <summary>+ Criar grupo</summary>
          <form action={novoGrupo} className="formulario-cla">
            <label>
              Nome do grupo
              <input name="nome" required minLength={2} maxLength={40} placeholder="Mix de sexta" />
            </label>
            <fieldset className="amigos-do-grupo">
              <legend>Quem entra (só amigos)</legend>
              {amigos.map((amigo) => (
                <label key={amigo.id}>
                  <input type="checkbox" name="amigos" value={amigo.id} />
                  {amigo.apelido}
                </label>
              ))}
            </fieldset>
            <div>
              <button type="submit" className="botao-da-shop">
                Criar grupo
              </button>
            </div>
          </form>
        </details>
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

      <p className="legenda-da-secao frase-de-clas">Em breve aqui: o mural de jogadas, táticas e dúvidas.</p>
    </div>
  );
}
