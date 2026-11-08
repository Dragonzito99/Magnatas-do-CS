import Link from 'next/link';
import { redirect } from 'next/navigation';
import { exigirAcesso } from '@/auth/guarda';
import { pode } from '@/auth/permissoes';
import { obterBd } from '@/bd/conexao';
import { listarBanimentosAbertos } from '@/dominio/banimentos';
import { casoEscolhido, chamadosEmAndamento, listarCasosDeDenuncia, type CasoDeDenuncia } from '@/dominio/olho-de-aguia';
import { NOME_DA_GRAVACAO, nomeDaPartida, nomeDoMapa, TEXTOS_DO_ESTADO } from '@/dominio/textos-da-partida';
import { Atualizar } from '../atualizar';
import { Avatar } from '../avatar';
import { BotaoConfirmar } from '../botao-confirmar';
import { atender, encerrar, proporDoCaso, suspenderDoCaso } from './acoes';
import { TelaDoPainel } from '../painel/lateral-do-painel';
import { AssistirNoCs2 } from './assistir-no-cs2';

const ERROS: Record<string, string> = {
  jogando: 'Você joga essa partida, então outra pessoa da equipe precisa atender.',
  chamado: 'Este chamado não está mais disponível.',
  propria: 'Você está envolvido nesse caso, então outra pessoa da equipe precisa encerrar.',
  conclusao: 'Escreva a conclusão, com até 480 caracteres.',
  denuncia: 'Este caso já foi encerrado.',
  alvo: 'A situação desta conta não permite isso.',
  proposta: 'Já existe uma proposta de banimento aberta para esta conta.',
  permissao: 'Você não tem permissão para isso.',
};

const dataCurta = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeZone: 'America/Sao_Paulo' });

function Numero({ valor, rotulo }: { valor: string | number; rotulo: string }) {
  return (
    <div>
      <b className="mono">{valor}</b>
      <small>{rotulo}</small>
    </div>
  );
}

function DetalheDoCaso({ caso }: { caso: CasoDeDenuncia }) {
  const { acusado, numeros, partida } = caso;
  const quando = partida.encerradaEm ?? partida.criadoEm;
  const jaPunido = !!acusado && (acusado.estado !== 'ativo' || caso.temPropostaAberta);
  const apelido = acusado?.apelido ?? '';

  return (
    <section className="painel caso-aberto">
      <div className="caso-topo">
        {acusado && <Avatar usuario={acusado} />}
        <div>
          <b>{acusado ? acusado.apelido : 'Acusado a definir'}</b>
          <small>
            <Link href={`/partidas/${partida.id}`}>{nomeDaPartida(partida)}</Link>, {nomeDoMapa(partida.mapa)}, {dataCurta.format(quando)}
          </small>
        </div>
        {acusado && (
          <Link className="botao cinza pequeno" href={`/jogadores/${acusado.id}`}>
            Ver ficha
          </Link>
        )}
      </div>

      {numeros && (
        <div className="numeros numeros-do-caso">
          <Numero valor={`${numeros.kills}/${numeros.deaths}`} rotulo="K/D na partida" />
          <Numero valor={`${numeros.hsPct}%`} rotulo="Na cabeça" />
          <Numero valor={numeros.adr} rotulo="Dano por rodada" />
          <Numero valor={caso.denunciasContraEle} rotulo="Denúncias contra ele" />
        </div>
      )}

      <div className="lista-de-denuncias">
        {caso.denuncias.map((denuncia) => (
          <blockquote key={denuncia.id}>
            <small>{denuncia.denuncianteApelido}</small>
            {denuncia.motivo}
          </blockquote>
        ))}
      </div>

      <div className="bloco-da-gravacao">
        <div>
          <b>Gravação da partida</b>
          <small>Guardada enquanto a denúncia estiver aberta</small>
        </div>
        {caso.gravacao === 'disponivel' && caso.gravacaoId ? (
          <AssistirNoCs2 gravacaoId={caso.gravacaoId} numero={partida.numero} />
        ) : (
          caso.gravacao !== 'disponivel' && <span className="etiqueta">{NOME_DA_GRAVACAO[caso.gravacao]}</span>
        )}
      </div>

      <form className="conclusao-do-caso">
        <input type="hidden" name="partidaId" value={partida.id} />
        <input type="hidden" name="acusadoId" value={acusado?.id ?? ''} />
        <textarea name="conclusao" aria-label="Conclusão da análise" placeholder="Conclusão da análise..." maxLength={480} required rows={2} />
        <div className="acoes">
          {caso.podeEncerrar && (
            <BotaoConfirmar
              formAction={encerrar}
              mensagem={`Encerrar o caso de ${acusado ? apelido : 'acusado a definir'}, na ${nomeDaPartida(partida)}? Isso não pode ser desfeito.`}
              className="botao cinza pequeno"
            >
              {jaPunido ? 'Encerrar caso' : 'Encerrar sem punição'}
            </BotaoConfirmar>
          )}
          {acusado?.estado === 'ativo' && (
            <BotaoConfirmar
              formAction={suspenderDoCaso}
              mensagem={`Suspender ${apelido} agora? A pessoa sai da partida e fica sem acesso até um Adm decidir.`}
              className="botao cinza pequeno"
            >
              Suspender
            </BotaoConfirmar>
          )}
          {acusado && acusado.estado !== 'banido' && !caso.temPropostaAberta && (
            <BotaoConfirmar formAction={proporDoCaso} mensagem={`Propor o banimento de ${apelido}?`} className="botao cinza pequeno">
              Propor banimento
            </BotaoConfirmar>
          )}
        </div>
        {!caso.podeEncerrar && <small className="apoio">Você está envolvido nesse caso, então outra pessoa da equipe precisa encerrar.</small>}
      </form>
    </section>
  );
}

export default async function OlhoDeAguia({ searchParams }: { searchParams: Promise<{ caso?: string; erro?: string }> }) {
  const usuario = await exigirAcesso('/olho-de-aguia');
  if (!pode(usuario, 'moderar')) redirect('/inicio');
  const { caso: chave, erro } = await searchParams;
  const bd = obterBd();
  const [chamados, casos, propostas] = await Promise.all([
    chamadosEmAndamento(bd, usuario),
    listarCasosDeDenuncia(bd, usuario),
    listarBanimentosAbertos(bd, usuario),
  ]);
  const { aberto, encerrado } = casoEscolhido(casos, chave);
  // Sem caso no endereço, fixa o primeiro: se a lista mudar, a tela não troca de caso sozinha.
  if (aberto && !chave) redirect(`/olho-de-aguia?caso=${aberto.chave}${erro ? `&erro=${erro}` : ''}`);

  return (
    <TelaDoPainel usuario={usuario} atual="olho" titulo="Olho de Águia">
      <Atualizar segundos={5} />
      {erro && ERROS[erro] && (
        <p role="alert" className="aviso">
          {ERROS[erro]}
        </p>
      )}
      <div id="chamados" className="ancora-do-painel" />
      {chamados.map((chamado) => (
        <div className="chamado-agora" key={chamado.id}>
          <span>
            <strong>CHAMADO AGORA</strong>
            {nomeDaPartida({ tipo: chamado.partidaTipo, numero: chamado.partidaNumero })}, {TEXTOS_DO_ESTADO[chamado.estado].etiqueta.toLowerCase()}. Chamado por{' '}
            {chamado.chamadoPorApelido}.
          </span>
          <form action={atender}>
            <input type="hidden" name="chamadoId" value={chamado.id} />
            <button type="submit" className="botao ouro pequeno">
              Assistir ao vivo
            </button>
          </form>
        </div>
      ))}

      {casos.length === 0 && (
        <section className="painel">
          <p className="vazio">{encerrado ? 'Este caso já foi encerrado, e não há outras denúncias abertas.' : 'Nenhuma denúncia aberta.'}</p>
        </section>
      )}
      {casos.length > 0 && (
        <div className="grade-de-casos">
          <section className="painel">
            <div className="cabeca-painel">
              <h2>Partidas denunciadas</h2>
            </div>
            <nav aria-label="Partidas denunciadas">
              {casos.map((caso) => (
                <Link
                  key={caso.chave}
                  href={`/olho-de-aguia?caso=${caso.chave}`}
                  className="item-de-caso"
                  aria-current={caso.chave === aberto?.chave ? 'true' : undefined}
                >
                  {caso.acusado ? <Avatar usuario={caso.acusado} /> : <span className="avatar">?</span>}
                  <span className="item-de-caso-texto">
                    <b>{caso.acusado?.apelido ?? 'Acusado a definir'}</b>
                    <small>
                      {nomeDaPartida(caso.partida)}, {nomeDoMapa(caso.partida.mapa)}
                    </small>
                  </span>
                  <em className="mono">{caso.denuncias.length}</em>
                </Link>
              ))}
            </nav>
          </section>
          {aberto ? (
            // A chave descarta o que foi digitado se o caso mudar, para a conclusão não ir parar em outro.
            <DetalheDoCaso key={aberto.chave} caso={aberto} />
          ) : (
            <section className="painel">
              <p className="vazio">Este caso já foi encerrado. Escolha outro na lista.</p>
            </section>
          )}
        </div>
      )}

      <section className="painel">
        <div className="cabeca-painel">
          <h2>Propostas de banimento</h2>
          <span>{propostas.length}</span>
        </div>
        {propostas.length === 0 && <p className="vazio">Nenhuma proposta aberta.</p>}
        {propostas.map((proposta) => (
          <div className="caso" key={proposta.id}>
            <div>
              <b>
                <Link href={`/jogadores/${proposta.usuarioId}`}>{proposta.alvoApelido}</Link>
              </b>
              <small>Proposto por {proposta.propostoPorApelido}. A decisão fica na ficha do jogador.</small>
            </div>
            <p>{proposta.motivo}</p>
          </div>
        ))}
      </section>
    </TelaDoPainel>
  );
}
