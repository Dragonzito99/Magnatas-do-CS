import Link from 'next/link';
import type { ReactNode } from 'react';
import type { Cla } from '@/bd/esquema';
import type { Cargo, PedidoDoCla } from '@/dominio/clas';
import type { UltimaDoCla } from '@/dominio/ranking-clas';
import { nomeDoMapa } from '@/dominio/textos-da-partida';
import { patenteDe } from '@/dominio/xp';
import { Avatar } from '../avatar';
import { BotaoConfirmar } from '../botao-confirmar';
import { expulsar, passarCargoDeDono, responder, trocarCargo } from './acoes';
import { BrasaoDoCla } from './brasao-do-cla';
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

export const VAGAS_DO_CLA = 20;
const RESULTADO: Record<UltimaDoCla['resultado'], string> = { vitoria: 'v', derrota: 'd', empate: 'e' };
const diaEMes = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', timeZone: 'America/Sao_Paulo' });
const ORDEM_DO_CARGO: Record<Cargo, number> = { dono: 0, capitao: 1, membro: 2 };

type Membro = { id: string; apelido: string; avatarUrl: string | null; cargo: Cargo; xpTotal: number };

/** A barra das vagas do clã (membros de 20). */
export function VagasDoCla({ membros }: { membros: number }) {
  return (
    <span className="vagas-do-cla" role="meter" aria-valuenow={membros} aria-valuemin={0} aria-valuemax={VAGAS_DO_CLA} aria-label="Vagas do clã">
      <i style={{ width: `${Math.min(100, (membros / VAGAS_DO_CLA) * 100)}%` }} />
    </span>
  );
}

/**
 * O clã no jeito de jogo: capa com o brasão, os quatro números, o elenco em cartões, as últimas partidas e os pedidos.
 * Quem vê sem cargo (ou de fora) recebe a versão sem os botões de cuidar do clã.
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
  const elenco = [...membros].sort((a, b) => ORDEM_DO_CARGO[a.cargo] - ORDEM_DO_CARGO[b.cargo] || b.xpTotal - a.xpTotal);
  return (
    <div className={`borda-cla-${cla.cor}`}>
      <section className="capa-do-cla">
        <BrasaoDoCla cla={cla} tamanho="grande" />
        <div className="nome-na-capa-do-cla">
          <div className="selos-do-cla">
            {numeros.posicao && <span className="selo-do-cla forte">{numeros.posicao}º no ranking</span>}
            <span className="selo-do-cla">{cla.entrada === 'aberto' ? 'Aberto: qualquer um entra' : 'Só com convite'}</span>
          </div>
          <h2>
            <SiglaDoCla cla={cla} /> {cla.nome}
          </h2>
          {cla.descricao && <p>{cla.descricao}</p>}
        </div>
        <div className="botoes-da-capa-do-cla">{botoes}</div>
      </section>

      <div className="numeros-do-cla">
        <div>
          <small>Posição</small>
          <b>{numeros.posicao ? `${numeros.posicao}º` : '—'}</b>
        </div>
        <div>
          <small>Vitórias juntos</small>
          <b className="verde">{numeros.vitorias}</b>
        </div>
        <div>
          <small>Aproveitamento</small>
          <b>{numeros.aproveitamento}%</b>
        </div>
        <div>
          <small>Membros</small>
          <b>
            {membros.length}/{VAGAS_DO_CLA}
          </b>
          <VagasDoCla membros={membros.length} />
        </div>
      </div>

      <div className="colunas-do-cla">
        <div>
          <div className="secao-da-shop">
            <h2>Elenco</h2>
            <span className="legenda-da-secao">Dono, capitães e membros</span>
          </div>
          <div className="elenco-do-cla">
            {elenco.map((membro) => {
              const patente = patenteDe(membro.xpTotal);
              const podeExpulsar = comando && membro.id !== meuId && membro.cargo !== 'dono' && (meuCargo === 'dono' || membro.cargo === 'membro');
              const cuidar = (meuCargo === 'dono' && membro.cargo !== 'dono') || podeExpulsar;
              return (
                <div key={membro.id} className={membro.cargo === 'dono' ? 'membro-do-cla dono' : 'membro-do-cla'}>
                  {membro.cargo !== 'membro' && <span className={`cargo-no-elenco ${membro.cargo}`}>{NOME_DO_CARGO[membro.cargo]}</span>}
                  <Avatar usuario={membro} />
                  <span>
                    <Link className="nome-no-elenco" href={`/jogadores/${membro.id}`}>
                      {membro.apelido}
                    </Link>
                    <small>
                      {patente.nome} · K/D <em>{(kd.get(membro.id) ?? 0).toFixed(2)}</em>
                    </small>
                  </span>
                  {cuidar && (
                    <div className="cuidar-do-membro">
                      {meuCargo === 'dono' && membro.cargo !== 'dono' && (
                        <form action={trocarCargo}>
                          <input type="hidden" name="usuarioId" value={membro.id} />
                          <input type="hidden" name="cargo" value={membro.cargo === 'capitao' ? 'membro' : 'capitao'} />
                          <button type="submit">{membro.cargo === 'capitao' ? 'Rebaixar' : 'Promover'}</button>
                        </form>
                      )}
                      {meuCargo === 'dono' && membro.cargo !== 'dono' && (
                        <form action={passarCargoDeDono}>
                          <input type="hidden" name="usuarioId" value={membro.id} />
                          <BotaoConfirmar mensagem={`Passar o cargo de Dono para ${membro.apelido}? Você vira Capitão.`} className="">
                            Passar dono
                          </BotaoConfirmar>
                        </form>
                      )}
                      {podeExpulsar && (
                        <form action={expulsar}>
                          <input type="hidden" name="usuarioId" value={membro.id} />
                          <BotaoConfirmar mensagem={`Tirar ${membro.apelido} do clã? Ele só entra em outro clã daqui a 24 horas.`} className="perigo">
                            Expulsar
                          </BotaoConfirmar>
                        </form>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        <div>
          <div className="secao-da-shop">
            <h2>Últimas</h2>
            <span className="legenda-da-secao">Clã x clã</span>
          </div>
          {ultimas.length === 0 && <p className="vazio-do-cla">Nenhum clã x clã ainda.</p>}
          {ultimas.map((ultima) => (
            <div key={ultima.id} className={`jogo-do-cla ${RESULTADO[ultima.resultado]}`}>
              <i aria-hidden="true" />
              <span>
                <b>
                  vs [{ultima.adversario.sigla}] {ultima.adversario.nome}
                </b>
                <small>
                  {ultima.mapas === 3 ? 'MD3' : 'MD1'}
                  {ultima.mapa ? ` · ${nomeDoMapa(ultima.mapa)}` : ''} · {diaEMes.format(ultima.data)}
                  {!ultima.contou && ' · não contou no ranking'}
                </small>
              </span>
              <span className="placar-do-cla">
                <span className="so-leitor">{ultima.resultado === 'vitoria' ? 'Vitória' : ultima.resultado === 'derrota' ? 'Derrota' : 'Empate'} </span>
                {ultima.placar}
              </span>
            </div>
          ))}

          {comando && (
            <>
              <div className="secao-da-shop">
                <h2>Pedidos</h2>
                <span className="legenda-da-secao">{pedidos.length === 0 ? 'Nenhum agora' : `${pedidos.length} esperando`}</span>
              </div>
              {pedidos.map((pedido) => (
                <div className="pedido-do-cla" key={pedido.id}>
                  <span>
                    <Link href={`/jogadores/${pedido.usuarioId}`}>{pedido.apelido}</Link>
                    <small>{patenteDe(pedido.xpTotal).nome}</small>
                  </span>
                  <form action={responder}>
                    <input type="hidden" name="pedidoId" value={pedido.id} />
                    <button type="submit" name="resposta" value="aceitar" className="botao-da-shop">
                      Aceitar
                    </button>
                  </form>
                  <form action={responder}>
                    <input type="hidden" name="pedidoId" value={pedido.id} />
                    <button type="submit" name="resposta" value="recusar" className="botao-da-shop vazado">
                      Recusar
                    </button>
                  </form>
                </div>
              ))}
              <p className="legenda-da-secao">Para chamar alguém, abra o perfil da pessoa e clique em &quot;Chamar para o clã&quot;.</p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
