import Link from 'next/link';
import { redirect } from 'next/navigation';
import { exigirAcesso } from '@/auth/guarda';
import { pode } from '@/auth/permissoes';
import { obterBd } from '@/bd/conexao';
import { listarBanimentosAbertos } from '@/dominio/banimentos';
import { casoEscolhido, listarCasosDeDenuncia, listarDenunciasDaDiversao, listarDenunciasDeMensagem, type CasoDeDenuncia } from '@/dominio/olho-de-aguia';
import { NOME_DA_GRAVACAO, nomeDaPartida, nomeDoMapa } from '@/dominio/textos-da-partida';
import { Atualizar } from '../atualizar';
import { Avatar } from '../avatar';
import { BotaoConfirmar } from '../botao-confirmar';
import { apagarDeMensagem, arquivarDeMensagem, encerrar, encerrarDaDiversao, proporDoCaso, suspenderDaDiversao, suspenderDoCaso } from './acoes';
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
const dataEHora = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short', timeZone: 'America/Sao_Paulo' });

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
        <textarea name="conclusao" aria-label="Conclusão da análise" placeholder="O que a equipe viu (vai junto da decisão)..." maxLength={480} required rows={2} />
        <div className="decisao-do-caso">
          {caso.podeEncerrar && (
            <BotaoConfirmar
              formAction={encerrar}
              mensagem={`${jaPunido ? 'Encerrar' : 'Recusar'} a denúncia ${acusado ? `contra ${apelido}` : 'a definir'}, na ${nomeDaPartida(partida)}? Isso não pode ser desfeito.`}
              className="botao contorno pequeno"
            >
              {jaPunido ? 'Encerrar caso' : 'Recusar denúncia'}
            </BotaoConfirmar>
          )}
          {acusado?.estado === 'ativo' && (
            <BotaoConfirmar
              formAction={suspenderDoCaso}
              mensagem={`Aprovar a denúncia e suspender ${apelido} agora? A pessoa sai da partida e fica sem acesso até um Adm decidir.`}
              className="botao vermelho pequeno"
            >
              Aprovar e suspender
            </BotaoConfirmar>
          )}
          {acusado && acusado.estado !== 'banido' && !caso.temPropostaAberta && (
            <BotaoConfirmar formAction={proporDoCaso} mensagem={`Aprovar a denúncia e propor o banimento de ${apelido}?`} className="botao vermelho pequeno">
              Aprovar e propor banimento
            </BotaoConfirmar>
          )}
        </div>
        {!caso.podeEncerrar && <small className="apoio">Você jogou ou denunciou nesta partida, então outra pessoa da equipe precisa decidir.</small>}
      </form>
    </section>
  );
}

export default async function OlhoDeAguia({ searchParams }: { searchParams: Promise<{ caso?: string; erro?: string }> }) {
  const usuario = await exigirAcesso('/olho-de-aguia');
  if (!pode(usuario, 'moderar')) redirect('/inicio');
  const { caso: chave, erro } = await searchParams;
  const bd = obterBd();
  const [casos, propostas, daDiversao, deMensagem] = await Promise.all([
    listarCasosDeDenuncia(bd, usuario),
    listarBanimentosAbertos(bd, usuario),
    listarDenunciasDaDiversao(bd, usuario),
    listarDenunciasDeMensagem(bd, usuario),
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
      {casos.length === 0 && (
        <section className="painel">
          <p className="vazio">{encerrado ? 'Este caso já foi encerrado, e não há outras denúncias do mix abertas.' : 'Nenhuma denúncia do mix aberta.'}</p>
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

      <section className="painel" id="diversao">
        <div className="cabeca-painel">
          <h2>Denúncias da Diversão</h2>
          <span>{daDiversao.length}</span>
        </div>
        {daDiversao.length === 0 && <p className="vazio">Nenhuma denúncia da Diversão aberta.</p>}
        {daDiversao.map((denuncia) => (
          <div className="caso denuncia-da-diversao" key={denuncia.id}>
            <div className="caso-topo">
              <Avatar usuario={denuncia.acusado} />
              <div>
                <b>
                  <Link href={`/jogadores/${denuncia.acusado.id}`}>{denuncia.acusado.apelido}</Link>
                </b>
                <small>
                  <Link href={denuncia.endereco}>{denuncia.mapa ?? 'Partida da Diversão'}</Link>, {dataCurta.format(denuncia.criadoEm)}. Denunciado
                  por {denuncia.denuncianteApelido}.
                </small>
              </div>
            </div>
            <blockquote>{denuncia.motivo}</blockquote>
            {denuncia.podeEncerrar ? (
              <form className="conclusao-do-caso">
                <input type="hidden" name="denunciaId" value={denuncia.id} />
                <textarea name="conclusao" aria-label={`Conclusão da denúncia contra ${denuncia.acusado.apelido}`} placeholder="Conclusão da análise..." maxLength={480} required rows={2} />
                <input type="hidden" name="acusadoId" value={denuncia.acusado.id} />
                <div className="decisao-do-caso">
                  <BotaoConfirmar
                    formAction={encerrarDaDiversao}
                    mensagem={`Recusar a denúncia contra ${denuncia.acusado.apelido}? Ela fecha sem punição.`}
                    className="botao contorno pequeno"
                  >
                    Recusar denúncia
                  </BotaoConfirmar>
                  {denuncia.acusado.estado === 'ativo' && (
                    <BotaoConfirmar
                      formAction={suspenderDaDiversao}
                      mensagem={`Aprovar a denúncia e suspender ${denuncia.acusado.apelido} agora?`}
                      className="botao vermelho pequeno"
                    >
                      Aprovar e suspender
                    </BotaoConfirmar>
                  )}
                  <Link className="botao cinza pequeno" href={`/jogadores/${denuncia.acusado.id}`}>
                    Ver ficha
                  </Link>
                </div>
              </form>
            ) : (
              <small className="apoio">Você está envolvido nesta denúncia, então outra pessoa da equipe precisa encerrar.</small>
            )}
          </div>
        ))}
      </section>

      <section className="painel" id="mensagens">
        <div className="cabeca-painel">
          <h2>Mensagens denunciadas</h2>
          <span>{deMensagem.length}</span>
        </div>
        {deMensagem.length === 0 && <p className="vazio">Nenhuma mensagem denunciada.</p>}
        {deMensagem.map((denuncia) => (
          <div className="caso denuncia-da-diversao" key={denuncia.id}>
            <div className="caso-topo">
              <Avatar usuario={denuncia.autor} />
              <div>
                <b>
                  <Link href={`/jogadores/${denuncia.autor.id}`}>{denuncia.autor.apelido}</Link>
                </b>
                <small>
                  Mandou em {dataEHora.format(denuncia.enviadaEm)}. Denunciada por {denuncia.denuncianteApelido}.
                </small>
              </div>
            </div>
            <blockquote>{denuncia.texto}</blockquote>
            {denuncia.podeResolver ? (
              <form className="conclusao-do-caso">
                <input type="hidden" name="denunciaId" value={denuncia.id} />
                <div className="decisao-do-caso">
                  <BotaoConfirmar formAction={arquivarDeMensagem} mensagem="Recusar a denúncia e deixar a mensagem?" className="botao contorno pequeno">
                    Recusar denúncia
                  </BotaoConfirmar>
                  <BotaoConfirmar
                    formAction={apagarDeMensagem}
                    mensagem={`Aprovar a denúncia e apagar esta mensagem de ${denuncia.autor.apelido}? Ela some da conversa para todos.`}
                    className="botao vermelho pequeno"
                  >
                    Aprovar e apagar mensagem
                  </BotaoConfirmar>
                  <Link className="botao cinza pequeno" href={`/jogadores/${denuncia.autor.id}`}>
                    Ver ficha
                  </Link>
                </div>
              </form>
            ) : (
              <small className="apoio">Você está envolvido nesta denúncia, então outra pessoa da equipe precisa resolver.</small>
            )}
          </div>
        ))}
      </section>

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
