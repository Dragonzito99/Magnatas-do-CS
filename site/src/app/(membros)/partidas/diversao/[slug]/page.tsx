import Link from 'next/link';
import { notFound } from 'next/navigation';
import { exigirAcesso } from '@/auth/guarda';
import { obterBd } from '@/bd/conexao';
import {
  denunciasFeitasNaDiversao,
  elogiosFeitosNaDiversao,
  enderecoDaPartidaDaDiversao,
  marcarVistas,
  partidaDaDiversao,
  referenciaDaDiversao,
  resultadoDaConta,
  sessaoDaDiversao,
} from '@/dominio/avaliar';
import { TIPOS_DE_ELOGIO } from '@/dominio/elogios';
import { Avatar } from '../../../avatar';
import { SeuResultado } from '../../seu-resultado';
import { denunciarNaPartidaDaDiversao, elogiarNaPartidaDaDiversao } from './acoes';

const quando = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' });
const hora = new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' });
const NOME_DO_RESULTADO = { vitoria: 'Vitória', empate: 'Empate', derrota: 'Derrota' } as const;

const AVISOS: Record<string, string> = { elogiado: 'Elogio enviado.', denunciado: 'Denúncia enviada para a equipe.' };
const ERROS: Record<string, string> = {
  elogio: 'Só quem jogou a partida elogia outro jogador dela.',
  'elogio-repetido': 'Você já elogiou este jogador nesta partida.',
  motivo: 'Escreva o motivo, com até 500 caracteres.',
  'nao-jogou': 'Só quem jogou a partida pode denunciar.',
  acusado: 'Escolha alguém que jogou a partida com você.',
  repetida: 'Você já denunciou este jogador nesta partida.',
};

/**
 * A partida da Diversão (dono, 11/11/2026): quem jogou, o seu resultado, as suas partidas de agora e elogiar ou
 * denunciar, como no rascunho aprovado.
 */
export default async function PartidaDaDiversao({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ aviso?: string; erro?: string }> }) {
  const { slug } = await params;
  const { aviso, erro } = await searchParams;
  const usuario = await exigirAcesso(`/partidas/diversao/${slug}`);
  const referencia = referenciaDaDiversao(slug);
  if (!referencia) notFound();
  const bd = obterBd();
  const partida = await partidaDaDiversao(bd, referencia);
  if (!partida) notFound();
  const eu = partida.jogadores.find((jogador) => jogador.id === usuario.id);
  const [resultado, sessao, elogiados, denunciados] = eu
    ? await Promise.all([
        resultadoDaConta(bd, usuario.id, referencia),
        sessaoDaDiversao(bd, usuario.id),
        elogiosFeitosNaDiversao(bd, referencia, usuario.id),
        denunciasFeitasNaDiversao(bd, referencia, usuario.id),
      ])
    : [null, [], new Set<string>(), new Set<string>()];
  const daSessao = sessao.some((item) => item.referencia === referencia) ? sessao : [];
  // Abrir uma partida da sessão tira as avaliações dela do sino.
  if (eu) await marcarVistas(bd, usuario.id, [referencia, ...daSessao.map((item) => item.referencia)]);

  return (
    <div className="partida-da-diversao">
      <section className="capa-da-diversao" style={partida.foto ? { backgroundImage: `linear-gradient(90deg, rgba(7, 4, 13, 0.95) 40%, rgba(7, 4, 13, 0.5)), url('${partida.foto}')` } : undefined}>
        <small>
          Diversão · {partida.modo} · {quando.format(partida.data)}
        </small>
        <h1>{partida.mapa ?? partida.modo}</h1>
      </section>

      {aviso && AVISOS[aviso] && <p className="aviso">{AVISOS[aviso]}</p>}
      {erro && ERROS[erro] && (
        <p role="alert" className="aviso">
          {ERROS[erro]}
        </p>
      )}

      {daSessao.length > 1 && (
        <section className="painel">
          <div className="cabeca-painel">
            <h2>Suas partidas de agora</h2>
          </div>
          <div className="partidas-de-agora">
            {daSessao.map((item) => {
              const atual = item.referencia === referencia;
              return (
                <Link key={item.referencia} href={`${enderecoDaPartidaDaDiversao(item.referencia)}#avaliar`} className={atual ? 'partida-de-agora atual' : 'partida-de-agora'} aria-current={atual ? 'page' : undefined}>
                  <b>{item.mapa ?? item.modo}</b>
                  <small>
                    {hora.format(item.data)} · +{item.xp} XP · +{item.grana} Grana · {item.mortes === null ? `${item.abates} abates` : `${item.abates}/${item.mortes}`}
                  </small>
                  <span className={`res ${item.resultado}`}>{NOME_DO_RESULTADO[item.resultado]}</span>
                  <em>{atual ? 'Você está aqui' : 'Avaliar'}</em>
                </Link>
              );
            })}
          </div>
        </section>
      )}

      {resultado && <SeuResultado resultado={resultado} />}

      <section className="painel" id="avaliar">
        <div className="cabeca-painel">
          <h2>{eu ? 'Avalie os jogadores' : 'Quem jogou'}</h2>
          {eu && <span>Elogie quem jogou bem. Denuncie trapaça ou comportamento ruim.</span>}
        </div>
        <div className="jogadores-da-diversao">
          {partida.jogadores.map((jogador) => {
            const souEu = jogador.id === usuario.id;
            return (
              <div key={jogador.id} className={souEu ? 'jogador-da-diversao voce' : 'jogador-da-diversao'}>
                <Avatar usuario={jogador} />
                <span className="nome-do-jogador-da-diversao">
                  <Link href={`/jogadores/${jogador.id}`}>{jogador.apelido}</Link>
                  <small>
                    {souEu ? 'Você · ' : ''}
                    {NOME_DO_RESULTADO[jogador.resultado]}
                  </small>
                </span>
                <span className="numero-do-jogador" title="Abates e mortes">
                  {jogador.mortes === null ? jogador.abates : `${jogador.abates}/${jogador.mortes}`}
                </span>
                <span className="numero-do-jogador">+{jogador.xp}</span>
                {eu && !souEu && (
                  <span className="acoes-do-jogador">
                    {elogiados.has(jogador.id) ? (
                      <span className="botao pequeno feito">Elogiado ✓</span>
                    ) : (
                      <form action={elogiarNaPartidaDaDiversao} className="form-de-avaliar">
                        <input type="hidden" name="slug" value={slug} />
                        <input type="hidden" name="elogiadoId" value={jogador.id} />
                        <select name="tipo" aria-label={`Elogio para ${jogador.apelido}`} required defaultValue="">
                          <option value="" disabled>
                            Elogiar...
                          </option>
                          {TIPOS_DE_ELOGIO.map((tipo) => (
                            <option key={tipo.valor} value={tipo.valor}>
                              {tipo.nome}
                            </option>
                          ))}
                        </select>
                        <button type="submit" className="botao pequeno elogiar">
                          Elogiar
                        </button>
                      </form>
                    )}
                    {denunciados.has(jogador.id) ? (
                      <span className="botao pequeno feito">Denunciado</span>
                    ) : (
                      <details className="denunciar-na-diversao">
                        <summary className="botao pequeno denunciar">Denunciar</summary>
                        <form action={denunciarNaPartidaDaDiversao}>
                          <input type="hidden" name="slug" value={slug} />
                          <input type="hidden" name="acusadoId" value={jogador.id} />
                          <textarea name="motivo" maxLength={500} required placeholder="O que aconteceu?" aria-label={`Motivo da denúncia de ${jogador.apelido}`} />
                          <button type="submit" className="botao pequeno denunciar">
                            Enviar para a equipe
                          </button>
                        </form>
                      </details>
                    )}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
