import Image from 'next/image';
import type { DesafioDaSala } from '@/dominio/desafios';
import type { JuncaoDaSala } from '@/dominio/juncoes';
import { TAMANHO_DA_SALA, type SalaComMembros } from '@/dominio/salas';
import { Avatar } from '../avatar';
import { aceitar, aceitarJuntar, cancelar, cancelarJuntar, chamarParaDesafio, criar, entrar, expulsar, juntar, recusar, recusarJuntar, sair } from '../salas/acoes';

const FOTO_DO_COMPETITIVO = '/mapas/dust2.webp';
const kdEmTexto = (kd: number | undefined) => (kd ?? 0).toFixed(2);

function segundosAte(data: Date): number {
  return Math.max(0, Math.ceil((data.getTime() - Date.now()) / 1000));
}

function Desafio({ desafio }: { desafio: DesafioDaSala }) {
  return (
    <div className="pedido-sala">
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
    <div className="pedido-sala">
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

function textoDaSala(sala: SalaComMembros, souLider: boolean): string {
  if (sala.partidaId) return 'Em partida';
  const faltam = TAMANHO_DA_SALA - sala.membros.length;
  if (faltam > 0) return `Falta${faltam > 1 ? 'm' : ''} ${faltam} para poder desafiar`;
  return souLider ? 'Completa: desafie uma sala completa' : 'Completa: o líder escolhe quem desafiar';
}

/** A sala de quem está numa: uma barra presa na esquerda da tela, só na tela Jogar. */
export function BarraDaSala({
  sala,
  usuarioId,
  kd,
  desafio,
  juncoes,
}: {
  sala: SalaComMembros;
  usuarioId: string;
  kd: Map<string, number>;
  desafio?: DesafioDaSala;
  juncoes: JuncaoDaSala[];
}) {
  const souLider = sala.liderId === usuarioId;
  const vagas = TAMANHO_DA_SALA - sala.membros.length;
  return (
    <aside className="barra-sala" aria-label="Sua sala">
      <div className="barra-sala-topo">
        <span className="selo-modo ouro">Sua sala</span>
        <h2>Sala de {sala.nome}</h2>
        <small>
          {souLider ? 'Você é o líder · ' : ''}
          {textoDaSala(sala, souLider)}
        </small>
      </div>
      <ul className="barra-sala-lista">
        {sala.membros.map((membro) => (
          <li key={membro.id} className={membro.id === sala.liderId ? 'lider' : undefined}>
            <Avatar usuario={membro} />
            <span className="barra-sala-nome">
              {membro.apelido}
              <small>
                K/D {kdEmTexto(kd.get(membro.id))}
                {membro.id === sala.liderId ? ' · líder' : ''}
              </small>
            </span>
            {souLider && membro.id !== usuarioId && !sala.partidaId && (
              <form action={expulsar}>
                <input type="hidden" name="usuarioId" value={membro.id} />
                <button type="submit" className="botao-expulsar" aria-label={`Expulsar ${membro.apelido}`} title="Expulsar">
                  ×
                </button>
              </form>
            )}
          </li>
        ))}
        {Array.from({ length: vagas }, (_, indice) => (
          <li key={`livre-${indice}`} className="livre">
            <span className="avatar vaga-livre" aria-hidden="true">
              +
            </span>
            <span className="barra-sala-nome">
              Vaga livre<small>chame alguém</small>
            </span>
          </li>
        ))}
      </ul>
      {desafio && <Desafio desafio={desafio} />}
      {souLider && juncoes.map((juncao) => <Juncao key={juncao.id} juncao={juncao} />)}
      {!sala.partidaId && (
        <form action={sair} className="barra-sala-botoes">
          <button type="submit" className="botao contorno pequeno">
            Sair da sala
          </button>
        </form>
      )}
    </aside>
  );
}

export function CriarSalaCartao() {
  return (
    <article className="cartao-jogar">
      <div className="foto-jogar vazia">
        <span className="selo-modo">Competitivo</span>
      </div>
      <div className="corpo-jogar">
        <h2>Criar sala</h2>
        <p>Monte o seu time de 5 e chame os amigos. Com a sala completa, desafie outra sala completa.</p>
        <div className="rodape-jogar">
          <span />
          <form action={criar}>
            <button type="submit" className="botao ouro pequeno">
              Criar sala
            </button>
          </form>
        </div>
      </div>
    </article>
  );
}

/** O que dá para fazer com outra sala: entrar, juntar a sua ou desafiar. */
export function SalaCartao({ sala, kd, acao }: { sala: SalaComMembros; kd: Map<string, number>; acao: React.ReactNode }) {
  const total = sala.membros.length;
  return (
    <article className="cartao-jogar">
      <div className="foto-jogar">
        <Image src={FOTO_DO_COMPETITIVO} alt="" width={480} height={270} />
        <span className="selo-modo">Competitivo</span>
      </div>
      <div className="corpo-jogar">
        <h2>Sala de {sala.nome}</h2>
        <div className="vagas-sala">
          {sala.membros.map((membro) => (
            <span key={membro.id} className="vaga-sala" title={membro.apelido}>
              <Avatar usuario={membro} />
              <small>{kdEmTexto(kd.get(membro.id))}</small>
            </span>
          ))}
          {Array.from({ length: TAMANHO_DA_SALA - total }, (_, indice) => (
            <span key={indice} className="vaga-sala">
              <span className="avatar vaga-livre" aria-hidden="true">
                +
              </span>
              <small>livre</small>
            </span>
          ))}
        </div>
        <div className="barra-ocupacao" aria-hidden="true">
          <i style={{ width: `${(total / TAMANHO_DA_SALA) * 100}%` }} />
        </div>
        <div className="rodape-jogar">
          <b className="ocupacao">
            {total}/{TAMANHO_DA_SALA}
          </b>
          <div className="acoes">{acao}</div>
        </div>
      </div>
    </article>
  );
}

export function BotaoDaSala({ tipo, salaId }: { tipo: 'entrar' | 'juntar' | 'desafiar'; salaId: string }) {
  const acao = tipo === 'entrar' ? entrar : tipo === 'juntar' ? juntar : chamarParaDesafio;
  const nome = tipo === 'entrar' ? 'Entrar' : tipo === 'juntar' ? 'Juntar' : 'Desafiar';
  return (
    <form action={acao}>
      <input type="hidden" name="salaId" value={salaId} />
      <button type="submit" className={tipo === 'entrar' ? 'botao ouro pequeno' : 'botao contorno pequeno'}>
        {nome}
      </button>
    </form>
  );
}
