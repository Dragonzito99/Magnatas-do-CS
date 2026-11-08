import Link from 'next/link';
import type { ReactNode } from 'react';
import type { Cla } from '@/bd/esquema';
import type { Cargo, PedidoDoCla } from '@/dominio/clas';
import type { UltimaDoCla } from '@/dominio/ranking-clas';
import { nomeDoMapa } from '@/dominio/textos-da-partida';
import { patenteDe } from '@/dominio/xp';
import { Avatar } from '../avatar';
import { BotaoConfirmar } from '../botao-confirmar';
import { InsigniaDaPatente } from '../insignia-da-patente';
import { expulsar, passarCargoDeDono, responder, trocarCargo } from './acoes';
import { SiglaDoCla } from './sigla-do-cla';

export const NOME_DO_CARGO: Record<Cargo, string> = { dono: 'Dono', capitao: 'Capitão', membro: 'Membro' };
export const ERROS_DO_CLA: Record<string, string> = {
  nome: 'O nome do clã precisa ter de 3 a 32 caracteres.',
  sigla: 'A sigla precisa ter de 2 a 4 letras ou números.',
  cor: 'Escolha uma das cores.',
  entrada: 'Escolha quem pode entrar.',
  repetido: 'Já existe um clã com esse nome ou essa sigla.',
  cheio: 'Esse clã já tem 20 membros.',
  'ja-tem-cla': 'Essa pessoa já está num clã.',
  espera: 'Quem saiu de um clã só entra em outro 24 horas depois.',
  cargo: 'Só o Dono ou um Capitão pode fazer isso.',
  convite: 'Esse clã só aceita quem é chamado ou pede para entrar.',
  'dono-sai': 'Passe o cargo de Dono para outra pessoa antes de sair.',
  'sem-pedido': 'Esse pedido não existe mais.',
  'sem-cla': 'Esse clã não existe mais.',
};

const RESULTADO: Record<UltimaDoCla['resultado'], string> = { vitoria: 'Vitória', derrota: 'Derrota', empate: 'Empate' };
const diaEMes = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', timeZone: 'America/Sao_Paulo' });

type Membro = { id: string; apelido: string; avatarUrl: string | null; cargo: Cargo; xpTotal: number };

/**
 * O clã como no rascunho: capa, quatro números, membros e as últimas. Quem vê sem cargo (ou de fora) recebe a
 * versão sem os botões de cuidar do clã.
 */
export function BlocoDoCla({
  cla,
  numeros,
  membros,
  kd,
  ultimas,
  pedidos,
  meuCargo,
  meuId,
  botoes,
}: {
  cla: Cla;
  numeros: { posicao: number | null; vitorias: number; aproveitamento: number; membros: number };
  membros: Membro[];
  kd: Map<string, number>;
  ultimas: UltimaDoCla[];
  pedidos: PedidoDoCla[];
  meuCargo: Cargo | null;
  meuId: string;
  botoes: ReactNode;
}) {
  const comando = meuCargo === 'dono' || meuCargo === 'capitao';
  return (
    <>
      <section className={`capa-cla borda-cla-${cla.cor}`}>
        <div className="capa-cla-nome">
          <h2>
            <SiglaDoCla cla={cla} /> {cla.nome}
          </h2>
          {cla.descricao && <p>{cla.descricao}</p>}
          <span className="apoio">{cla.entrada === 'aberto' ? 'Aberto: qualquer um entra' : 'Só com convite'}</span>
        </div>
        <div className="capa-cla-botoes">{botoes}</div>
      </section>

      <div className="numeros-painel numeros-cla">
        <div className="numero-painel">
          <span>Posição no ranking</span>
          <b>{numeros.posicao ? `${numeros.posicao}º` : '—'}</b>
        </div>
        <div className="numero-painel ok">
          <span>Vitórias juntos</span>
          <b>{numeros.vitorias}</b>
        </div>
        <div className="numero-painel">
          <span>Aproveitamento</span>
          <b>{numeros.aproveitamento}%</b>
        </div>
        <div className="numero-painel">
          <span>Membros</span>
          <b>{membros.length}/20</b>
        </div>
      </div>

      <div className="colunas-cla">
        <section className="painel">
          <div className="cabeca-painel">
            <h2>Membros</h2>
            <span>Dono, capitães e membros</span>
          </div>
          <table className="tabela tabela-cla">
            <thead>
              <tr>
                <th scope="col">Jogador</th>
                <th scope="col">Cargo</th>
                <th scope="col" className="so-computador">
                  Patente
                </th>
                <th scope="col">K/D</th>
                {comando && <th scope="col">Cuidar</th>}
              </tr>
            </thead>
            <tbody>
              {membros.map((membro) => {
                const patente = patenteDe(membro.xpTotal);
                const podeExpulsar = membro.id !== meuId && membro.cargo !== 'dono' && (meuCargo === 'dono' || membro.cargo === 'membro');
                return (
                  <tr key={membro.id}>
                    <th scope="row">
                      <span className="perfil">
                        <Avatar usuario={membro} />
                        <Link className="nome" href={`/jogadores/${membro.id}`}>
                          {membro.apelido}
                        </Link>
                      </span>
                    </th>
                    <td>
                      <span className={`cargo-cla ${membro.cargo}`}>{NOME_DO_CARGO[membro.cargo]}</span>
                    </td>
                    <td className="so-computador">
                      <span className="patente-na-tabela">
                        <InsigniaDaPatente patente={patente} classe="insignia-mini" />
                        {patente.nome}
                      </span>
                    </td>
                    <td className="mono">{(kd.get(membro.id) ?? 0).toFixed(2)}</td>
                    {comando && (
                      <td>
                        <div className="acoes-do-membro">
                          {meuCargo === 'dono' && membro.cargo !== 'dono' && (
                            <form action={trocarCargo}>
                              <input type="hidden" name="usuarioId" value={membro.id} />
                              <input type="hidden" name="cargo" value={membro.cargo === 'capitao' ? 'membro' : 'capitao'} />
                              <button type="submit" className="botao contorno pequeno">
                                {membro.cargo === 'capitao' ? 'Rebaixar' : 'Promover'}
                              </button>
                            </form>
                          )}
                          {meuCargo === 'dono' && membro.cargo !== 'dono' && (
                            <form action={passarCargoDeDono}>
                              <input type="hidden" name="usuarioId" value={membro.id} />
                              <BotaoConfirmar mensagem={`Passar o cargo de Dono para ${membro.apelido}? Você vira Capitão.`} className="botao contorno pequeno">
                                Passar dono
                              </BotaoConfirmar>
                            </form>
                          )}
                          {podeExpulsar && (
                            <form action={expulsar}>
                              <input type="hidden" name="usuarioId" value={membro.id} />
                              <BotaoConfirmar mensagem={`Tirar ${membro.apelido} do clã? Ele só entra em outro clã daqui a 24 horas.`} className="botao cinza pequeno">
                                Expulsar
                              </BotaoConfirmar>
                            </form>
                          )}
                        </div>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>

        <div className="pilha-cla">
          <section className="painel">
            <div className="cabeca-painel">
              <h2>Últimas do clã</h2>
            </div>
            {ultimas.length === 0 && <p className="vazio">Nenhum clã x clã ainda.</p>}
            {ultimas.map((ultima) => (
              <div className="linha-caso" key={ultima.id}>
                <div>
                  {ultima.mapas === 3 ? 'MD3' : 'MD1'} contra [{ultima.adversario.sigla}] {ultima.adversario.nome}
                  <small>
                    {ultima.mapa ? `${nomeDoMapa(ultima.mapa)} · ` : ''}
                    {diaEMes.format(ultima.data)}
                    {!ultima.contou && ' · não contou no ranking'}
                  </small>
                </div>
                <span className={ultima.resultado === 'vitoria' ? 'res vitoria' : ultima.resultado === 'derrota' ? 'res derrota' : 'res'}>
                  {RESULTADO[ultima.resultado]} {ultima.placar}
                </span>
              </div>
            ))}
          </section>

          {comando && (
            <section className="painel">
              <div className="cabeca-painel">
                <h2>Pedidos para entrar</h2>
                <span>{pedidos.length}</span>
              </div>
              {pedidos.length === 0 && <p className="vazio">Nenhum pedido agora.</p>}
              {pedidos.map((pedido) => (
                <div className="linha-caso" key={pedido.id}>
                  <div>
                    <Link href={`/jogadores/${pedido.usuarioId}`}>{pedido.apelido}</Link>
                    <small>{patenteDe(pedido.xpTotal).nome}</small>
                  </div>
                  <form action={responder}>
                    <input type="hidden" name="pedidoId" value={pedido.id} />
                    <button type="submit" name="resposta" value="aceitar" className="botao ouro pequeno">
                      Aceitar
                    </button>
                  </form>
                  <form action={responder}>
                    <input type="hidden" name="pedidoId" value={pedido.id} />
                    <button type="submit" name="resposta" value="recusar" className="botao contorno pequeno">
                      Recusar
                    </button>
                  </form>
                </div>
              ))}
              <p className="apoio nota-do-painel">Para chamar alguém, abra o perfil da pessoa e clique em &quot;Chamar para o clã&quot;.</p>
            </section>
          )}
        </div>
      </div>
    </>
  );
}
