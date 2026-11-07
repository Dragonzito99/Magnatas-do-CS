import { exigirAcesso } from '@/auth/guarda';
import { obterBd } from '@/bd/conexao';
import { desafiosDaSala, type DesafioDaSala } from '@/dominio/desafios';
import { partidaAtualDe } from '@/dominio/partidas';
import { listarSalas, minhaSala, TAMANHO_DA_SALA, type SalaComMembros } from '@/dominio/salas';
import { situacaoDasFaltas } from '@/dominio/faltas';
import { juncoesDaSala, type JuncaoDaSala } from '@/dominio/juncoes';
import { Atualizar } from '../atualizar';
import { AvisoDeBloqueio } from '../aviso-de-bloqueio';
import { Avatar } from '../avatar';
import { OnlineAgora } from '../online-agora';
import { aceitar, aceitarJuntar, cancelar, cancelarJuntar, chamarParaDesafio, criar, entrar, expulsar, juntar, recusar, recusarJuntar, sair } from './acoes';

const ERROS: Record<string, string> = {
  cheia: 'Esta sala já está completa.',
  'em-partida': 'Esta sala está em partida.',
  inexistente: 'Esta sala não existe mais.',
  'so-lider': 'Só o líder pode fazer isso.',
  ocupado: 'Você já está em uma sala, no mix ou em uma partida.',
  bloqueado: 'Você está sem jogar por não ter aceitado uma partida.',
  'sem-acesso': 'Sua conta não pode fazer isso agora.',
  incompleta: 'As duas salas precisam estar completas e com todos liberados para jogar.',
  desafio: 'Este desafio não está mais disponível.',
  juncao: 'Este pedido de junção não está mais disponível.',
};

function segundosAte(data: Date): number {
  return Math.max(0, Math.ceil((data.getTime() - Date.now()) / 1000));
}

function situacao(sala: SalaComMembros) {
  const total = sala.membros.length;
  if (total === TAMANHO_DA_SALA) return <span className="etiqueta ok">5/5, pronta</span>;
  const faltam = TAMANHO_DA_SALA - total;
  return (
    <span className="etiqueta">
      {total}/5, falta{faltam > 1 ? 'm' : ''} {faltam}
    </span>
  );
}

function Desafio({ desafio }: { desafio: DesafioDaSala }) {
  return (
    <div className="vidro">
      <small>{desafio.recebido ? 'Desafio recebido' : 'Desafio enviado'}</small>
      <p>
        {desafio.recebido ? `${desafio.outraSalaNome} chamou vocês` : `Esperando ${desafio.outraSalaNome}`}, {segundosAte(desafio.expiraEm)}s
      </p>
      <div className="acoes">
        {desafio.recebido ? (
          <>
            <form action={aceitar}>
              <input type="hidden" name="desafioId" value={desafio.id} />
              <button type="submit" className="botao ouro pequeno">
                Aceitar
              </button>
            </form>
            <form action={recusar}>
              <input type="hidden" name="desafioId" value={desafio.id} />
              <button type="submit" className="botao contorno pequeno">
                Recusar
              </button>
            </form>
          </>
        ) : (
          <form action={cancelar}>
            <input type="hidden" name="desafioId" value={desafio.id} />
            <button type="submit" className="botao contorno pequeno">
              Cancelar
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

function Juncao({ juncao }: { juncao: JuncaoDaSala }) {
  return (
    <div className="vidro">
      <small>{juncao.recebido ? 'Pedido para juntar' : 'Pedido de junção enviado'}</small>
      <p>
        {juncao.recebido
          ? `${juncao.outraSalaNome} (${juncao.outraSalaTamanho}) quer entrar na sua sala`
          : `Esperando ${juncao.outraSalaNome} (${juncao.outraSalaTamanho})`}
        , {segundosAte(juncao.expiraEm)}s
      </p>
      <div className="acoes">
        {juncao.recebido ? (
          <>
            <form action={aceitarJuntar}>
              <input type="hidden" name="juncaoId" value={juncao.id} />
              <button type="submit" className="botao ouro pequeno">
                Aceitar
              </button>
            </form>
            <form action={recusarJuntar}>
              <input type="hidden" name="juncaoId" value={juncao.id} />
              <button type="submit" className="botao contorno pequeno">
                Recusar
              </button>
            </form>
          </>
        ) : (
          <form action={cancelarJuntar}>
            <input type="hidden" name="juncaoId" value={juncao.id} />
            <button type="submit" className="botao contorno pequeno">
              Cancelar
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

function SuaSala({ sala, usuarioId, desafio, juncoes }: { sala: SalaComMembros; usuarioId: string; desafio?: DesafioDaSala; juncoes: JuncaoDaSala[] }) {
  const souLider = sala.liderId === usuarioId;
  return (
    <section className="cartao-escuro">
      <span className="ao-vivo">
        Sua sala, {sala.membros.length}/{TAMANHO_DA_SALA}
      </span>
      <h2>{sala.nome}</h2>
      <ul className="membros-da-sala">
        {sala.membros.map((membro) => (
          <li key={membro.id}>
            <Avatar usuario={membro} />
            <span className="nome">{membro.apelido}</span>
            {membro.id === sala.liderId && <small>líder</small>}
            {souLider && membro.id !== usuarioId && !sala.partidaId && (
              <form action={expulsar}>
                <input type="hidden" name="usuarioId" value={membro.id} />
                <button type="submit" className="botao-texto claro">
                  Expulsar
                </button>
              </form>
            )}
          </li>
        ))}
      </ul>
      {desafio && <Desafio desafio={desafio} />}
      {souLider && juncoes.map((juncao) => <Juncao key={juncao.id} juncao={juncao} />)}
      {!sala.partidaId && (
        <form action={sair}>
          <button type="submit" className="botao contorno pequeno">
            Sair da sala
          </button>
        </form>
      )}
    </section>
  );
}

export default async function Salas({ searchParams }: { searchParams: Promise<{ erro?: string }> }) {
  const usuario = await exigirAcesso('/salas');
  const { erro } = await searchParams;
  const bd = obterBd();
  const [salas, minha, partida, faltas] = await Promise.all([
    listarSalas(bd),
    minhaSala(bd, usuario.id),
    partidaAtualDe(bd, usuario.id),
    situacaoDasFaltas(bd, usuario.id),
  ]);
  const [desafio] = minha ? await desafiosDaSala(bd, minha.id) : [];
  const juncoes = minha ? await juncoesDaSala(bd, minha.id) : [];
  const souLider = !!minha && minha.liderId === usuario.id;
  const possoDesafiar = souLider && minha.membros.length === TAMANHO_DA_SALA && !minha.partidaId && !desafio;
  // Juntar: eu líder, minha sala fora de partida, a soma cabendo em 5 e nenhum pedido aberto com essa sala.
  const possoJuntarCom = (sala: SalaComMembros) =>
    souLider && !minha.partidaId && minha.membros.length + sala.membros.length <= TAMANHO_DA_SALA && !juncoes.some((juncao) => juncao.outraSalaId === sala.id);
  const outras = salas.filter((sala) => sala.id !== minha?.id);

  function acaoDaSala(sala: SalaComMembros) {
    if (sala.partidaId) return <span className="etiqueta">Em partida</span>;
    const completa = sala.membros.length === TAMANHO_DA_SALA;
    if (!completa && !minha && !partida) {
      return (
        <form action={entrar}>
          <input type="hidden" name="salaId" value={sala.id} />
          <button type="submit" className="botao cinza pequeno">
            Entrar
          </button>
        </form>
      );
    }
    if (completa && possoDesafiar) {
      return (
        <form action={chamarParaDesafio}>
          <input type="hidden" name="salaId" value={sala.id} />
          <button type="submit" className="botao cinza pequeno">
            Desafiar
          </button>
        </form>
      );
    }
    if (!completa && possoJuntarCom(sala)) {
      return (
        <form action={juntar}>
          <input type="hidden" name="salaId" value={sala.id} />
          <button type="submit" className="botao cinza pequeno">
            Juntar
          </button>
        </form>
      );
    }
    return null;
  }

  return (
    <>
      <Atualizar segundos={3} />
      <AvisoDeBloqueio situacao={faltas} />
      <div className="topo-pagina">
        <h1>Salas</h1>
        {!minha && !partida && (
          <form action={criar} className="formulario-linha">
            <button type="submit" className="botao ouro pequeno">
              Criar sala
            </button>
          </form>
        )}
      </div>
      {erro && ERROS[erro] && (
        <p role="alert" className="aviso">
          {ERROS[erro]}
        </p>
      )}
      <div className="grade">
        <section className="painel">
          <div className="cabeca-painel">
            <h2>Salas abertas</h2>
            <span>Prontas primeiro</span>
          </div>
          {outras.length === 0 && <p className="vazio">Nenhuma outra sala aberta agora.</p>}
          {outras.map((sala) => (
            <div className="linha-sala" key={sala.id}>
              <b>{sala.nome}</b>
              <div className="fila-avatares">
                {sala.membros.map((membro) => (
                  <Avatar key={membro.id} usuario={membro} />
                ))}
              </div>
              {situacao(sala)}
              <div className="acao-da-sala">{acaoDaSala(sala)}</div>
            </div>
          ))}
        </section>
        <div className="pilha">
          {minha ? (
            <SuaSala sala={minha} usuarioId={usuario.id} desafio={desafio} juncoes={juncoes} />
          ) : (
            <section className="cartao-escuro">
              <h2>Sem sala</h2>
              <p>Crie uma sala ou entre em uma aberta. Salas incompletas podem se juntar. Com 5 pessoas, o líder pode desafiar outra sala completa.</p>
            </section>
          )}
          <OnlineAgora />
        </div>
      </div>
    </>
  );
}
