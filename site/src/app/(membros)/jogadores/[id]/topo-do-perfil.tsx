import Link from 'next/link';
import type { Usuario } from '@/bd/esquema';
import type { SituacaoDaAmizade } from '@/dominio/amigos';
import { nomeDaInsignia, type ChaveDaInsignia } from '@/dominio/insignias';
import type { claDoUsuario } from '@/dominio/clas';
import { NIVEIS, type nivelAtivo } from '@/dominio/membros';
import { NOME_DO_PAPEL } from '@/dominio/textos-da-conta';
import { PATENTES, type progressoDe } from '@/dominio/xp';
import { Avatar } from '../../avatar';
import { chamar } from '../../clas/acoes';
import { SiglaDoCla } from '../../clas/sigla-do-cla';
import { BotaoDeAmizade } from '../../comunidade/botao-de-amizade';
import { Insignia } from '../../insignia';
import { InsigniaDaPatente } from '../../insignia-da-patente';

export type AbaDoPerfil = 'visao' | 'insignias' | 'partidas' | 'bau';

const ABAS: { valor: AbaDoPerfil; nome: string }[] = [
  { valor: 'visao', nome: 'Visão geral' },
  { valor: 'insignias', nome: 'Insígnias' },
  { valor: 'partidas', nome: 'Partidas' },
  { valor: 'bau', nome: 'Baú' },
];

const dataCurta = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeZone: 'America/Sao_Paulo' });
const numero = new Intl.NumberFormat('pt-BR');

type Cla = NonNullable<Awaited<ReturnType<typeof claDoUsuario>>>;

/**
 * O topo do perfil novo (dono, 11/11/2026): avatar com a moldura, nome na cor em uso, selos (papel, membro, patente,
 * clã e a insígnia principal), a barra da patente e os botões. O fundo é o mapa em que a pessoa mais joga.
 */
export function TopoDoPerfil({
  jogador,
  membro,
  progresso,
  xpTotal,
  claDele,
  principal,
  corDoNome,
  moldura,
  fundo,
  amizade,
  chamarPara,
  steamid64,
  aba,
}: {
  jogador: Pick<Usuario, 'id' | 'apelido' | 'avatarUrl' | 'papel' | 'criadoEm'>;
  membro: Awaited<ReturnType<typeof nivelAtivo>>;
  progresso: ReturnType<typeof progressoDe>;
  xpTotal: number;
  claDele: Cla | null;
  principal: ChaveDaInsignia | null;
  corDoNome: string | null;
  moldura: string | null;
  fundo: string | null;
  amizade: SituacaoDaAmizade | null;
  chamarPara: { id: string; sigla: string } | null;
  steamid64: string | null;
  aba: AbaDoPerfil;
}) {
  return (
    <>
      <section className="perfil-topo" style={fundo ? { backgroundImage: `linear-gradient(90deg, rgba(7, 4, 13, 0.97) 35%, rgba(7, 4, 13, 0.45)), url('${fundo}')` } : undefined}>
        <div className="perfil-avatar">
          <Avatar usuario={jogador} moldura={moldura} />
        </div>
        <div className="perfil-identidade">
          <h1 className="perfil-nome" style={corDoNome ? { color: corDoNome } : undefined}>
            {jogador.apelido}
          </h1>
          <div className="perfil-selos">
            <span className="selo">{NOME_DO_PAPEL[jogador.papel]}</span>
            {membro && <span className={`selo selo-de-membro ${membro}`}>{NIVEIS[membro].nome}</span>}
            <span className="patente-na-tabela">
              <InsigniaDaPatente patente={progresso.patente} classe="insignia-mini" />
              {progresso.patente.nome}
            </span>
            {claDele && (
              <span className="selo-do-cla">
                <SiglaDoCla cla={claDele} link /> {claDele.nome}
              </span>
            )}
            {principal && (
              <span className="perfil-principal">
                <Insignia familia={principal.familia} nivel={principal.nivel} tamanho={26} />
                {nomeDaInsignia(principal.familia, principal.nivel)}
              </span>
            )}
          </div>
          <div className="perfil-patente">
            <div className="barra-xp" role="progressbar" aria-label="Progresso até a próxima patente" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progresso.porcentagem}>
              <i style={{ width: `${progresso.porcentagem}%` }} />
            </div>
            <small>
              {progresso.proxima
                ? `${numero.format(xpTotal)} de ${numero.format(progresso.proxima.xp)} XP para ${progresso.proxima.nome}`
                : `${numero.format(xpTotal)} XP. Patente máxima`}{' '}
              · degrau {progresso.patente.nivel} de {PATENTES.length} · <Link href="/patentes">ver patentes</Link>
            </small>
          </div>
          <span className="apoio">Na Magnatas desde {dataCurta.format(jogador.criadoEm)}</span>
        </div>
        <div className="perfil-acoes">
          {amizade && <BotaoDeAmizade usuarioId={jogador.id} situacao={amizade} voltar={`/jogadores/${jogador.id}`} />}
          {chamarPara && (
            <form action={chamar}>
              <input type="hidden" name="claId" value={chamarPara.id} />
              <input type="hidden" name="usuarioId" value={jogador.id} />
              <button type="submit" className="botao ouro pequeno">
                Chamar para o clã [{chamarPara.sigla}]
              </button>
            </form>
          )}
          {steamid64 && (
            <a className="botao contorno pequeno" href={`https://steamcommunity.com/profiles/${steamid64}`} target="_blank" rel="noreferrer">
              Ver na Steam
            </a>
          )}
        </div>
      </section>
      <nav className="perfil-abas" aria-label="Perfil">
        {ABAS.map((item) => (
          <Link key={item.valor} href={item.valor === 'visao' ? `/jogadores/${jogador.id}` : `/jogadores/${jogador.id}?aba=${item.valor}`} aria-current={item.valor === aba ? 'page' : undefined}>
            {item.nome}
          </Link>
        ))}
      </nav>
    </>
  );
}
