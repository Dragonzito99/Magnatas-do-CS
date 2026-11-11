import type { ClaResumido } from '@/dominio/clas';
import type { DesafioDaSala, FormatoDoDesafio } from '@/dominio/desafios';
import type { JuncaoDaSala } from '@/dominio/juncoes';
import { TAMANHO_DA_SALA, type SalaComMembros } from '@/dominio/salas';
import { Avatar } from '../avatar';
import { SiglaDoCla } from '../clas/sigla-do-cla';
import { aceitar, aceitarJuntar, cancelar, cancelarJuntar, chamarParaDesafio, criar, entrar, expulsar, juntar, recusar, recusarJuntar, sair } from '../salas/acoes';

const kdEmTexto = (kd: number | undefined) => (kd ?? 0).toFixed(2);

function segundosAte(data: Date): number {
  return Math.max(0, Math.ceil((data.getTime() - Date.now()) / 1000));
}

export type ClasDasPessoas = Map<string, ClaResumido>;

/** O clã da sala, quando os 5 (ou todos que estão nela) são do mesmo clã. */
export function claDaSala(sala: SalaComMembros, clas: ClasDasPessoas): ClaResumido | null {
  const primeiro = sala.membros[0] && clas.get(sala.membros[0].id);
  if (!primeiro || sala.membros.some((membro) => clas.get(membro.id)?.id !== primeiro.id)) return null;
  return primeiro;
}

function textoDoDesafio(desafio: DesafioDaSala): string {
  const formato = `MD${desafio.mapas}`;
  if (desafio.formato === 'cla') {
    return desafio.recebido ? `O clã [${desafio.outroClaSigla ?? '?'}] desafiou vocês para uma ${formato}` : `Clã x clã ${formato}: esperando ${desafio.outraSalaNome}`;
  }
  if (desafio.formato === 'treino') {
    return desafio.recebido ? `Seu clã chamou vocês para um treino ${formato}` : `Treino ${formato}: esperando ${desafio.outraSalaNome}`;
  }
  return desafio.recebido ? `${desafio.outraSalaNome} chamou vocês` : `Esperando ${desafio.outraSalaNome}`;
}

function Desafio({ desafio }: { desafio: DesafioDaSala }) {
  return (
    <div className="pedido-sala">
      <small>{desafio.recebido ? 'Desafio recebido' : 'Desafio enviado'}</small>
      <p>
        {textoDoDesafio(desafio)}, {segundosAte(desafio.expiraEm)}s
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
  clas,
}: {
  sala: SalaComMembros;
  usuarioId: string;
  kd: Map<string, number>;
  desafio?: DesafioDaSala;
  juncoes: JuncaoDaSala[];
  clas: ClasDasPessoas;
}) {
  const souLider = sala.liderId === usuarioId;
  const cla = claDaSala(sala, clas);
  const vagas = TAMANHO_DA_SALA - sala.membros.length;
  return (
    <aside className="barra-sala" aria-label="Sua sala">
      <div className="barra-sala-topo">
        <span className="selo-modo ouro">Sua sala</span>
        <h2>
          Sala de {sala.nome}
          {cla && (
            <>
              {' '}
              <SiglaDoCla cla={cla} />
            </>
          )}
        </h2>
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
              <span>
                {clas.get(membro.id) && !cla && (
                  <>
                    <SiglaDoCla cla={clas.get(membro.id)!} />{' '}
                  </>
                )}
                {membro.apelido}
              </span>
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

/** As 5 (ou 10) vagas em círculo: foto de quem já está, tracejado onde ainda falta gente. */
export function VagasEmCirculo({ pessoas, total, tamanho = 'normal' }: { pessoas: { id: string; apelido: string; avatarUrl: string | null }[]; total: number; tamanho?: 'normal' | 'pequeno' }) {
  return (
    <span className={`vagas-em-circulo ${tamanho}`} aria-label={`${pessoas.length} de ${total}`}>
      {pessoas.slice(0, total).map((pessoa) => (
        <span key={pessoa.id} className="vaga-cheia" title={pessoa.apelido}>
          <Avatar usuario={pessoa} />
        </span>
      ))}
      {Array.from({ length: Math.max(0, total - pessoas.length) }, (_, indice) => (
        <span key={`livre-${indice}`} className="vaga-vazia" aria-hidden="true" />
      ))}
    </span>
  );
}

/** Uma sala aberta, em linha: nome, clã, como ela está, as vagas e o que dá para fazer com ela. */
export function LinhaDaSala({ sala, kd, acao, clas }: { sala: SalaComMembros; kd: Map<string, number>; acao: React.ReactNode; clas: ClasDasPessoas }) {
  const total = sala.membros.length;
  const cla = claDaSala(sala, clas);
  const media = total ? sala.membros.reduce((soma, membro) => soma + (kd.get(membro.id) ?? 0), 0) / total : 0;
  const situacao = sala.partidaId ? 'Em partida' : total === TAMANHO_DA_SALA ? 'Completa · esperando desafio' : `Faltam ${TAMANHO_DA_SALA - total}`;
  return (
    <div className="linha-da-sala">
      <span>
        <b>
          Sala de {sala.nome}
          {cla && (
            <>
              {' '}
              <SiglaDoCla cla={cla} />
            </>
          )}
        </b>
        <small>
          {situacao} · K/D médio {kdEmTexto(media)}
        </small>
      </span>
      <VagasEmCirculo pessoas={sala.membros} total={TAMANHO_DA_SALA} tamanho="pequeno" />
      <span className="acao-da-sala">{acao}</span>
    </div>
  );
}

const NOME_DA_ESCOLHA: Record<string, string> = {
  'comum-1': 'Desafio',
  'cla-1': 'Clã x clã MD1',
  'cla-3': 'Clã x clã MD3',
  'treino-1': 'Treino MD1',
  'treino-3': 'Treino MD3',
};

/** Desafiar: sem clã, o botão de sempre; com as duas salas de clã, dá para escolher clã x clã ou treino, MD1 ou MD3. */
export function BotaoDeDesafio({ salaId, opcoes }: { salaId: string; opcoes: FormatoDoDesafio['formato'][] }) {
  if (opcoes.length <= 1) return <BotaoDaSala tipo="desafiar" salaId={salaId} />;
  const escolhas = opcoes.flatMap((formato) => (formato === 'comum' ? ['comum-1'] : [`${formato}-1`, `${formato}-3`]));
  return (
    <form action={chamarParaDesafio} className="desafio-com-escolha">
      <input type="hidden" name="salaId" value={salaId} />
      <select name="escolha" aria-label="Tipo de desafio" defaultValue={escolhas[1] ?? escolhas[0]}>
        {escolhas.map((escolha) => (
          <option key={escolha} value={escolha}>
            {NOME_DA_ESCOLHA[escolha]}
          </option>
        ))}
      </select>
      <button type="submit" className="botao-da-shop">
        Desafiar
      </button>
    </form>
  );
}

export function BotaoDaSala({ tipo, salaId }: { tipo: 'entrar' | 'juntar' | 'desafiar'; salaId: string }) {
  const acao = tipo === 'entrar' ? entrar : tipo === 'juntar' ? juntar : chamarParaDesafio;
  const nome = tipo === 'entrar' ? 'Entrar' : tipo === 'juntar' ? 'Juntar' : 'Desafiar';
  return (
    <form action={acao}>
      <input type="hidden" name="salaId" value={salaId} />
      <button type="submit" className={tipo === 'entrar' ? 'botao-da-shop' : 'botao-da-shop vazado'}>
        {nome}
      </button>
    </form>
  );
}

export function BotaoCriarSala() {
  return (
    <form action={criar}>
      <button type="submit" className="botao-da-shop">
        Criar sala
      </button>
    </form>
  );
}
