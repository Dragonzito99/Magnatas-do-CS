import Link from 'next/link';
import { redirect } from 'next/navigation';
import { exigirAcesso } from '@/auth/guarda';
import { pode } from '@/auth/permissoes';
import { obterBd } from '@/bd/conexao';
import { partidas, servidoresDiversao } from '@/bd/esquema';
import { alvoDoServidor, MODOS_DE_DIVERSAO, nomeDoMapaConhecido, perguntarAoServidor } from '@/dominio/diversao';
import { alvoDoLaboratorio, LABORATORIOS } from '@/dominio/laboratorio';
import { manutencaoAtual } from '@/dominio/manutencao';
import { servidoresDoCompetitivo } from '@/dominio/painel-adm';
import { quedasDoPainel } from '@/dominio/painel';
import { estadosDaTela } from '@/dominio/sob-demanda';
import { nomeDaPartida } from '@/dominio/textos-da-partida';
import { controladorDoAmbiente } from '@/servidor-jogo/controlador';
import { asc, inArray } from 'drizzle-orm';
import { Atualizar } from '../../atualizar';
import { BotaoConfirmar } from '../../botao-confirmar';
import { mudarManutencao } from '../acoes';
import { TelaDoPainel } from '../lateral-do-painel';
import { desligarServidor, ligarServidor, reiniciarServidor } from './acoes';

const quando = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short', timeZone: 'America/Sao_Paulo' });
const AVISOS: Record<string, string> = {
  ligando: 'Ligando: o servidor fica pronto em cerca de 1 minuto.',
  desligado: 'Servidor desligado.',
  reiniciando: 'Reiniciando: volta em cerca de 1 minuto.',
};
const ERROS: Record<string, string> = {
  permissao: 'Seu cargo não mexe nos servidores.',
  limite: 'Já estão ligados todos os servidores que a máquina aguenta. Desligue um vazio antes.',
  indisponivel: 'Este servidor não pode ser ligado agora (manutenção ou falha ao ligar).',
  falhou: 'Não deu certo. Tente de novo em instantes.',
};
const NOME_DO_ESTADO = { ligado: 'Ligado', ligando: 'Ligando', desligado: 'Desligado' } as const;
const COR_DO_ESTADO = { ligado: 'verde', ligando: 'ouro', desligado: 'cinza' } as const;

/** Gestão dos servidores (dono, 13/11/2026): competitivo, Diversão e laboratórios, quem está dentro e os botões. */
export default async function Servidores({ searchParams }: { searchParams: Promise<{ aviso?: string; erro?: string }> }) {
  const usuario = await exigirAcesso('/painel/servidores');
  if (!pode(usuario, 'ver_equipe')) redirect('/inicio');
  const { aviso, erro } = await searchParams;
  const mexer = pode(usuario, 'cuidar_dos_servidores');
  const bd = obterBd();
  const controlador = controladorDoAmbiente();
  const host = process.env.DIVERSAO_HOST;

  const [competitivo, diversao, manutencao, quedas] = await Promise.all([
    servidoresDoCompetitivo(bd),
    bd.select().from(servidoresDiversao).orderBy(asc(servidoresDiversao.ordem)),
    manutencaoAtual(bd),
    pode(usuario, 'ver_quedas') ? quedasDoPainel(bd, 5) : Promise.resolve([]),
  ]);
  const estados = await estadosDaTela(
    bd,
    diversao.map((servidor) => servidor.id),
  );
  const ocupados = competitivo.flatMap((servidor) => (servidor.partidaId ? [servidor.partidaId] : []));
  const partidasDosServidores = ocupados.length ? await bd.select().from(partidas).where(inArray(partidas.id, ocupados)) : [];
  // Todos perguntados ao mesmo tempo, cada um com prazo curto: um servidor travado não segura a página.
  const [vivosDoCompetitivo, vivosDaDiversao, vivosDoLaboratorio] = await Promise.all([
    Promise.all(competitivo.map((servidor) => perguntarAoServidor(controlador, { host: servidor.host, porta: servidor.porta }))),
    Promise.all(diversao.map((servidor) => perguntarAoServidor(controlador, alvoDoServidor(servidor, host)))),
    Promise.all(LABORATORIOS.map((laboratorio) => perguntarAoServidor(controlador, alvoDoLaboratorio(laboratorio, host)))),
  ]);

  return (
    <>
      <Atualizar segundos={20} />
      <TelaDoPainel usuario={usuario} atual="servidores" titulo="Servidores">
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

        {mexer && (
          <form action={mudarManutencao} className="cartao-adm manutencao-adm">
            <div>
              <b>Aviso de manutenção</b>
              <small>
                {manutencao
                  ? `${manutencao.automatica ? 'Ligado sozinho' : 'Ligado na mão'} em ${quando.format(manutencao.desde)}${manutencao.motivo ? `: ${manutencao.motivo}` : ''}. Trava fila, salas e Diversão.`
                  : 'Desligado. Liga sozinho quando uma atualização do CS2 dá problema.'}
              </small>
            </div>
            <input type="hidden" name="ligar" value={manutencao ? 'nao' : 'sim'} />
            <button type="submit" className={manutencao ? 'chave-da-manutencao ligada' : 'chave-da-manutencao'} aria-pressed={!!manutencao}>
              <i aria-hidden="true" />
              {manutencao ? 'Ligado' : 'Desligado'}
            </button>
          </form>
        )}

        <h3 className="faixa-adm">Competitivo</h3>
        <div className="grade-adm">
          {competitivo.map((servidor, indice) => {
            const vivo = vivosDoCompetitivo[indice];
            const partida = partidasDosServidores.find((linha) => linha.id === servidor.partidaId);
            return (
              <div key={servidor.id} className="cartao-servidor-adm" data-cor={vivo.ligado ? 'verde' : 'vermelho'}>
                <span className="tipo-adm">Competitivo</span>
                <b>{servidor.nome}</b>
                <small className="mono">
                  {servidor.host}:{servidor.porta}
                </small>
                <div className="selos-adm">
                  <i className="selo-adm" data-cor={vivo.ligado ? 'verde' : 'vermelho'}>
                    {vivo.ligado ? 'No ar' : 'Sem resposta'}
                  </i>
                  {!servidor.ativo && (
                    <i className="selo-adm" data-cor="cinza">
                      Fora da fila
                    </i>
                  )}
                </div>
                <p>
                  {partida ? <Link href={`/partidas/${partida.id}`}>{nomeDaPartida(partida)}</Link> : 'Livre'}
                  {vivo.ligado && ` · ${vivo.jogando} ${vivo.jogando === 1 ? 'pessoa' : 'pessoas'}`}
                </p>
              </div>
            );
          })}
        </div>

        <h3 className="faixa-adm">Diversão</h3>
        <div className="grade-adm">
          {diversao.map((servidor, indice) => {
            const vivo = vivosDaDiversao[indice];
            const guardado = estados.get(servidor.id);
            const estado = vivo.ligado ? 'ligado' : (guardado?.estado ?? 'desligado');
            const modo = MODOS_DE_DIVERSAO.find((item) => item.valor === servidor.modo)?.nome ?? servidor.modo;
            return (
              <div key={servidor.id} className="cartao-servidor-adm" data-cor={COR_DO_ESTADO[estado]}>
                <span className="tipo-adm">{modo}</span>
                <b>{nomeDoMapaConhecido(vivo.mapa ?? servidor.mapa) ?? vivo.mapa ?? servidor.mapa}</b>
                <small className="mono">
                  {servidor.nomeNoServidor ?? '—'} · porta {servidor.porta}
                </small>
                <div className="selos-adm">
                  <i className="selo-adm" data-cor={COR_DO_ESTADO[estado]}>
                    {NOME_DO_ESTADO[estado]}
                  </i>
                  {guardado?.teste && (
                    <i className="selo-adm" data-cor="azul">
                      Teste com bots
                    </i>
                  )}
                  {!servidor.ativo && (
                    <i className="selo-adm" data-cor="cinza">
                      Fora do Jogar
                    </i>
                  )}
                </div>
                <p>
                  {vivo.ligado ? `${vivo.jogando} de ${servidor.vagas} jogando` : guardado?.erro ? `Último erro: ${guardado.erro}` : 'Liga quando alguém pede para jogar.'}
                </p>
                {mexer && servidor.nomeNoServidor && (
                  <form className="botoes-adm">
                    <input type="hidden" name="servidor" value={servidor.id} />
                    {estado === 'desligado' ? (
                      <button type="submit" formAction={ligarServidor} className="botao ouro pequeno">
                        Ligar
                      </button>
                    ) : (
                      <>
                        <BotaoConfirmar
                          mensagem={vivo.jogando > 0 ? `Tem ${vivo.jogando} jogando em ${modo}. Desligar mesmo assim?` : `Desligar ${modo}?`}
                          formAction={desligarServidor}
                          className="botao contorno pequeno"
                        >
                          Desligar
                        </BotaoConfirmar>
                        <BotaoConfirmar
                          mensagem={vivo.jogando > 0 ? `Tem ${vivo.jogando} jogando em ${modo}. Reiniciar mesmo assim?` : `Reiniciar ${modo}?`}
                          formAction={reiniciarServidor}
                          className="botao contorno pequeno"
                        >
                          Reiniciar
                        </BotaoConfirmar>
                      </>
                    )}
                  </form>
                )}
              </div>
            );
          })}
        </div>

        <h3 className="faixa-adm">Laboratórios</h3>
        <div className="grade-adm">
          {LABORATORIOS.map((laboratorio, indice) => {
            const vivo = vivosDoLaboratorio[indice];
            return (
              <div key={laboratorio.chave} className="cartao-servidor-adm" data-cor={vivo.ligado ? 'verde' : 'cinza'}>
                <span className="tipo-adm">Só Adm</span>
                <b>{laboratorio.titulo}</b>
                <small className="mono">
                  {laboratorio.nome} · porta {laboratorio.porta}
                </small>
                <div className="selos-adm">
                  <i className="selo-adm" data-cor={vivo.ligado ? 'verde' : 'cinza'}>
                    {vivo.ligado ? 'Ligado' : 'Desligado'}
                  </i>
                </div>
                <p>{vivo.ligado ? `${vivo.jogando} dentro · desliga sozinho 10 min depois de esvaziar` : 'Liga pela aba Testes.'}</p>
                <div className="botoes-adm">
                  <Link className="botao contorno pequeno" href="/testes">
                    Abrir Testes
                  </Link>
                </div>
              </div>
            );
          })}
        </div>

        {quedas.length > 0 && (
          <>
            <h3 className="faixa-adm">Últimas quedas do jogo</h3>
            <section className="cartao-adm">
              {quedas.map((queda) => (
                <div key={queda.id} className="linha-simples-adm">
                  <span>{queda.motivo}</span>
                  <small>
                    {quando.format(queda.quando)} · {queda.onde}
                    {queda.observacao ? ` · ${queda.observacao}` : ''}
                  </small>
                </div>
              ))}
            </section>
          </>
        )}
      </TelaDoPainel>
    </>
  );
}
