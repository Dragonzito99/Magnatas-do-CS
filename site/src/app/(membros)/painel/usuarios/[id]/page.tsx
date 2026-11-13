import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { z } from 'zod';
import { exigirAcesso } from '@/auth/guarda';
import { pode } from '@/auth/permissoes';
import { obterBd } from '@/bd/conexao';
import type { Usuario } from '@/bd/esquema';
import { fichaDoUsuario } from '@/dominio/painel-adm';
import { NOME_DO_ESTADO, NOME_DO_PAPEL } from '@/dominio/textos-da-conta';
import { Avatar } from '../../../avatar';
import { TelaDoPainel } from '../../lateral-do-painel';
import { NOME_DA_ACAO } from '../../registro/nomes';
import { ajustarGranaNaFicha, ajustarMagcoinNaFicha, darConvitesNaFicha, liberarNaFicha, suspenderNaFicha, trocarCargo } from '../acoes';

const numero = new Intl.NumberFormat('pt-BR');
const quando = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short', timeZone: 'America/Sao_Paulo' });
const dia = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeZone: 'America/Sao_Paulo' });

const AVISOS: Record<string, string> = {
  cargo: 'Cargo trocado.',
  convites: 'Convites entregues.',
  grana: 'Grana ajustada.',
  magcoin: 'MagCoins ajustadas.',
  suspensa: 'Conta suspensa. Ela saiu da fila, da sala e dos servidores.',
  liberada: 'Suspensão retirada.',
};
const ERROS: Record<string, string> = {
  permissao: 'Seu cargo não permite isso.',
  'ultimo-adm': 'O clube precisa ter pelo menos um Adm ativo.',
  saldo: 'A conta não tem saldo para tirar essa quantidade.',
  ajuste: 'Confira a quantidade (número inteiro, diferente de zero) e escreva um motivo com pelo menos 3 letras.',
  motivo: 'Escreva o motivo.',
  situacao: 'A situação da conta não permite isso agora.',
};
const COR_DO_ESTADO: Record<Usuario['estado'], string> = { ativo: 'verde', aguardando_verificacao: 'azul', suspenso: 'ouro', banido: 'vermelho' };
const NOME_DO_NIVEL = { bronze: 'Bronze', prata: 'Prata', ouro: 'Ouro', premium: 'Magnata Premium' } as const;

/** A ficha de uma conta no Painel ADM: tudo sobre ela e o que a equipe pode fazer, cada ação conforme o cargo. */
export default async function FichaDoUsuario({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ aviso?: string; erro?: string }> }) {
  const { id } = await params;
  const usuario = await exigirAcesso(`/painel/usuarios/${id}`);
  if (!pode(usuario, 'ver_equipe')) redirect('/inicio');
  if (!z.uuid().safeParse(id).success) notFound();
  const { aviso, erro } = await searchParams;
  const agora = new Date();
  const ficha = await fichaDoUsuario(obterBd(), id, agora);
  if (!ficha) notFound();
  const { usuario: conta, assinatura, verificacao } = ficha;
  const assinaturaValendo = assinatura?.estado === 'ativa' && assinatura.pagoAte && assinatura.pagoAte > agora;
  const eu = conta.id === usuario.id;

  return (
    <TelaDoPainel
      usuario={usuario}
      atual="usuarios"
      titulo={conta.apelido}
      extra={
        <Link className="botao contorno pequeno" href="/painel/usuarios">
          Voltar à lista
        </Link>
      }
    >
      {aviso && AVISOS[aviso] && (
        <p role="status" className="aviso ok">
          {AVISOS[aviso]}
        </p>
      )}
      {erro && ERROS[erro] && (
        <p role="alert" className="aviso">
          {ERROS[erro]}
        </p>
      )}

      <section className="ficha-adm">
        <div className="ficha-adm-topo">
          <Avatar usuario={conta} />
          <div>
            <b>{conta.apelido}</b>
            <small className="mono">{conta.steamid64}</small>
            <div className="selos-adm">
              <i className="selo-adm" data-cor={COR_DO_ESTADO[conta.estado]}>
                {NOME_DO_ESTADO[conta.estado]}
              </i>
              <i className="selo-adm" data-cor={conta.papel === 'jogador' ? 'cinza' : 'roxo'}>
                {NOME_DO_PAPEL[conta.papel]}
              </i>
              {assinaturaValendo && assinatura && (
                <i className="selo-adm" data-cor="ouro">
                  {NOME_DO_NIVEL[assinatura.nivel]}
                </i>
              )}
            </div>
          </div>
          <div className="ficha-adm-links">
            <Link className="botao contorno pequeno" href={`/jogadores/${conta.id}`}>
              Ver perfil e punições
            </Link>
            <a className="botao contorno pequeno" href={`https://steamcommunity.com/profiles/${conta.steamid64}`} target="_blank" rel="noreferrer">
              Steam
            </a>
          </div>
        </div>
        <dl className="dados-adm">
          <div>
            <dt>Entrou</dt>
            <dd>{quando.format(conta.criadoEm)}</dd>
          </div>
          <div>
            <dt>Último acesso</dt>
            <dd>{conta.vistoEm ? quando.format(conta.vistoEm) : 'nunca'}</dd>
          </div>
          <div>
            <dt>Convidado por</dt>
            <dd>{ficha.convidadoPor ? <Link href={`/painel/usuarios/${ficha.convidadoPor.id}`}>{ficha.convidadoPor.apelido}</Link> : 'sem convite registrado'}</dd>
          </div>
          <div>
            <dt>Convites</dt>
            <dd>
              {conta.convitesRestantes} para usar · {ficha.convitesGerados} gerados · {ficha.convidados.length} entraram
            </dd>
          </div>
          <div>
            <dt>Grana</dt>
            <dd className="mono">{numero.format(conta.grana)}</dd>
          </div>
          <div>
            <dt>MagCoins</dt>
            <dd className="mono">{numero.format(conta.magcoin)}</dd>
          </div>
          <div>
            <dt>XP</dt>
            <dd className="mono">{numero.format(conta.xpTotal)}</dd>
          </div>
          <div>
            <dt>Partidas encerradas</dt>
            <dd className="mono">{numero.format(ficha.partidasJogadas)}</dd>
          </div>
          <div>
            <dt>Verificação</dt>
            <dd>
              {verificacao
                ? `${{ pendente: 'Pendente', aprovada: 'Aprovada', reprovada: 'Reprovada', banido: 'Documento banido' }[verificacao.estado]} em ${dia.format(verificacao.concluidoEm ?? verificacao.criadoEm)}${verificacao.motivo ? ` · ${verificacao.motivo}` : ''}`
                : 'não fez'}
            </dd>
          </div>
          <div>
            <dt>Assinatura</dt>
            <dd>
              {assinatura
                ? `${NOME_DO_NIVEL[assinatura.nivel]} · ${assinaturaValendo ? `em dia até ${dia.format(assinatura.pagoAte!)}` : assinatura.estado === 'cancelada' ? 'cancelada' : 'sem pagamento em dia'} · ${assinatura.mensalidadesPagas} ${assinatura.mensalidadesPagas === 1 ? 'mensalidade' : 'mensalidades'}`
                : 'nenhuma'}
            </dd>
          </div>
        </dl>
      </section>

      <h3 className="faixa-adm">Ações</h3>
      <div className="acoes-adm">
        {pode(usuario, 'mudar_papel') && !eu && (
          <form action={trocarCargo} className="cartao-acao-adm">
            <b>Cargo</b>
            <small>GM modera; Adm decide banimentos, Grana e servidores.</small>
            <input type="hidden" name="alvo" value={conta.id} />
            <select name="papel" defaultValue={conta.papel} aria-label="Novo cargo">
              {Object.entries(NOME_DO_PAPEL).map(([valor, nome]) => (
                <option key={valor} value={valor}>
                  {nome}
                </option>
              ))}
            </select>
            <button type="submit" className="botao ouro pequeno">
              Trocar cargo
            </button>
          </form>
        )}
        {pode(usuario, 'dar_convites') && (
          <form action={darConvitesNaFicha} className="cartao-acao-adm">
            <b>Dar convites</b>
            <small>Somam aos {conta.convitesRestantes} que a conta já tem.</small>
            <input type="hidden" name="alvo" value={conta.id} />
            <input name="quantidade" type="number" min={1} max={100} defaultValue={2} aria-label="Quantos convites" />
            <button type="submit" className="botao ouro pequeno">
              Dar convites
            </button>
          </form>
        )}
        {pode(usuario, 'ajustar_grana') && (
          <>
            <form action={ajustarGranaNaFicha} className="cartao-acao-adm">
              <b>Grana</b>
              <small>Negativo tira. Fica no extrato da conta com o motivo.</small>
              <input type="hidden" name="alvo" value={conta.id} />
              <input name="quantidade" type="number" step={1} placeholder="ex.: 500 ou -200" required aria-label="Quantidade de Grana" />
              <input name="motivo" placeholder="Motivo" required minLength={3} maxLength={200} aria-label="Motivo do ajuste de Grana" />
              <button type="submit" className="botao ouro pequeno">
                Ajustar Grana
              </button>
            </form>
            <form action={ajustarMagcoinNaFicha} className="cartao-acao-adm">
              <b>MagCoins</b>
              <small>Para compra que não caiu ou presente. Negativo tira.</small>
              <input type="hidden" name="alvo" value={conta.id} />
              <input name="quantidade" type="number" step={1} placeholder="ex.: 100" required aria-label="Quantidade de MagCoins" />
              <input name="motivo" placeholder="Motivo" required minLength={3} maxLength={200} aria-label="Motivo do ajuste de MagCoins" />
              <button type="submit" className="botao ouro pequeno">
                Ajustar MagCoins
              </button>
            </form>
          </>
        )}
        {pode(usuario, 'moderar') && conta.estado === 'ativo' && !eu && (
          <form action={suspenderNaFicha} className="cartao-acao-adm perigo">
            <b>Suspender</b>
            <small>Tira da fila, da sala e dos servidores na hora. Só o Adm retira.</small>
            <input type="hidden" name="alvo" value={conta.id} />
            <input name="motivo" placeholder="Motivo" required maxLength={500} aria-label="Motivo da suspensão" />
            <button type="submit" className="botao vermelho pequeno">
              Suspender conta
            </button>
          </form>
        )}
        {pode(usuario, 'decidir_banimento') && conta.estado === 'suspenso' && (
          <form action={liberarNaFicha} className="cartao-acao-adm">
            <b>Retirar suspensão</b>
            <small>A conta volta a jogar.</small>
            <input type="hidden" name="alvo" value={conta.id} />
            <input name="motivo" placeholder="Motivo" required maxLength={500} aria-label="Motivo para retirar a suspensão" />
            <button type="submit" className="botao ouro pequeno">
              Retirar suspensão
            </button>
          </form>
        )}
        {pode(usuario, 'moderar') && !eu && (
          <div className="cartao-acao-adm">
            <b>Banimento</b>
            <small>Proposta, confirmação e reversão ficam no perfil, com o histórico de punições.</small>
            <Link className="botao contorno pequeno" href={`/jogadores/${conta.id}`}>
              Abrir punições
            </Link>
          </div>
        )}
      </div>

      <div className="colunas-adm">
        <section className="cartao-adm">
          <h3>Convidou ({ficha.convidados.length})</h3>
          {ficha.convidados.length === 0 && <p className="vazio">Ninguém entrou pelo convite desta conta.</p>}
          {ficha.convidados.map((amigo) => (
            <Link key={amigo.id} href={`/painel/usuarios/${amigo.id}`} className="linha-simples-adm">
              <span>{amigo.apelido}</span>
              <small>
                {NOME_DO_ESTADO[amigo.estado]} · {dia.format(amigo.criadoEm)}
              </small>
            </Link>
          ))}
        </section>
        <section className="cartao-adm">
          <h3>Histórico da equipe</h3>
          {ficha.historico.length === 0 && <p className="vazio">A equipe ainda não mexeu nesta conta.</p>}
          {ficha.historico.map((linha) => (
            <div key={linha.id} className="linha-simples-adm">
              <span>
                {NOME_DA_ACAO[linha.acao] ?? linha.acao}
                {linha.alvoId === conta.id ? '' : linha.alvoApelido ? ` · em ${linha.alvoApelido}` : ''}
              </span>
              <small>
                {linha.atorId === conta.id ? 'feito por esta conta' : `por ${linha.atorApelido ?? 'sistema'}`} · {quando.format(linha.criadoEm)}
              </small>
            </div>
          ))}
        </section>
      </div>
    </TelaDoPainel>
  );
}
