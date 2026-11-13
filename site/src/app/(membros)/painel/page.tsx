import Link from 'next/link';
import { redirect } from 'next/navigation';
import { exigirAcesso } from '@/auth/guarda';
import { pode } from '@/auth/permissoes';
import { obterBd } from '@/bd/conexao';
import { listarBanimentosAbertos } from '@/dominio/banimentos';
import { contagemDeCasos, membrosOnline } from '@/dominio/denuncias';
import { nomeDoMapaConhecido } from '@/dominio/diversao';
import { manutencaoAtual } from '@/dominio/manutencao';
import { chamadosEmAndamento, listarCasosDeDenuncia } from '@/dominio/olho-de-aguia';
import { quedasDoPainel, servidoresDoPainel } from '@/dominio/painel';
import { numerosDoDash } from '@/dominio/painel-adm';
import { nomeDaPartida, nomeDoMapa, TEXTOS_DO_ESTADO } from '@/dominio/textos-da-partida';
import { Atualizar } from '../atualizar';
import { atender } from '../olho-de-aguia/acoes';
import { mudarManutencao } from './acoes';
import { GraficoDeDias, NumeroDoPainel, TelaDoPainel } from './lateral-do-painel';

const CASOS_NO_RESUMO = 4;
const horaDaQueda = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short', timeZone: 'America/Sao_Paulo' });
const reais = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const NOME_DO_ESTADO_DO_SERVIDOR = { ligado: 'Ligado', ligando: 'Ligando', desligado: 'Desligado' } as const;

/** O Dashboard do Painel ADM (dono, 13/11/2026: "um dash completo"): membros, jogo, dinheiro, gráficos e o que pede atenção. */
export default async function PainelAdm() {
  const usuario = await exigirAcesso('/painel');
  if (!pode(usuario, 'ver_equipe')) redirect('/inicio');

  const bd = obterBd();
  const moderar = pode(usuario, 'moderar');
  const verQuedas = pode(usuario, 'ver_quedas');
  const cuidarDosServidores = pode(usuario, 'cuidar_dos_servidores');
  const [contagem, numeros, online, servidores, casos, propostas, chamados, quedas, manutencao] = await Promise.all([
    moderar ? contagemDeCasos(bd, usuario) : null,
    numerosDoDash(bd),
    membrosOnline(bd),
    servidoresDoPainel(bd),
    moderar ? listarCasosDeDenuncia(bd, usuario) : [],
    moderar ? listarBanimentosAbertos(bd, usuario) : [],
    moderar ? chamadosEmAndamento(bd, usuario) : [],
    verQuedas ? quedasDoPainel(bd) : [],
    manutencaoAtual(bd),
  ]);
  const abertos = contagem ? contagem.chamados + contagem.denuncias + contagem.propostas : 0;
  const ligados = servidores.filter((servidor) => servidor.estado === 'ligado').length;
  const { membros, dinheiro } = numeros;

  return (
    <>
      <Atualizar segundos={30} />
      <TelaDoPainel
        usuario={usuario}
        atual="resumo"
        titulo="Dashboard"
      >
        <h3 className="faixa-adm">Membros</h3>
        <div className="numeros-adm">
          <NumeroDoPainel rotulo="Contas" valor={membros.total} apoio={`${membros.ativos} ativas`} href="/painel/usuarios" />
          <NumeroDoPainel rotulo="Online agora" valor={online.length} cor="verde" />
          <NumeroDoPainel rotulo="Novos hoje" valor={membros.novosHoje} apoio={`${membros.novos7Dias} na semana`} cor="ouro" />
          <NumeroDoPainel
            rotulo="Esperando verificação"
            valor={membros.aguardandoVerificacao}
            cor={membros.aguardandoVerificacao > 0 ? 'azul' : 'cinza'}
            href="/painel/usuarios?estado=aguardando_verificacao"
          />
          <NumeroDoPainel rotulo="Suspensos e banidos" valor={membros.punidos} cor={membros.punidos > 0 ? 'vermelho' : 'cinza'} href="/painel/usuarios?estado=suspenso" />
          <NumeroDoPainel rotulo="Convites usados" valor={numeros.convitesUsados7Dias} apoio="nos últimos 7 dias" href="/convites" />
        </div>

        <h3 className="faixa-adm">Jogo e dinheiro</h3>
        <div className="numeros-adm">
          <NumeroDoPainel rotulo="Partidas hoje" valor={numeros.partidas.hoje} apoio={`${numeros.partidas.semana} na semana`} href="/painel/partidas" />
          <NumeroDoPainel rotulo="Servidores ligados" valor={ligados} apoio={`de ${servidores.length} da Diversão`} cor="verde" href="/painel/servidores" />
          <NumeroDoPainel rotulo="Casos abertos" valor={abertos} cor={abertos > 0 ? 'vermelho' : 'cinza'} href={moderar ? '/olho-de-aguia' : undefined} />
          <NumeroDoPainel
            rotulo="Vendas do mês"
            valor={reais.format((dinheiro.magcoinsDoMesCentavos + dinheiro.mensalidadesDoMesCentavos) / 100)}
            apoio="MagCoins e mensalidades"
            cor="ouro"
            href={pode(usuario, 'ver_envios') ? '/painel/envios' : undefined}
          />
          <NumeroDoPainel rotulo="Premium" valor={dinheiro.premiumAtivos} apoio="assinaturas em dia" cor="ouro" href="/painel/usuarios?premium=1" />
          <NumeroDoPainel rotulo="Apoiadores" valor={dinheiro.apoiadoresAtivos} apoio="Bronze, Prata e Ouro" />
        </div>

        <div className="graficos-adm">
          <GraficoDeDias titulo="Cadastros por dia" pontos={numeros.cadastrosPorDia} />
          <GraficoDeDias titulo="Partidas por dia" pontos={numeros.partidasPorDia} />
        </div>

        {moderar && (
          <section className="painel">
            <div className="cabeca-painel">
              <h2>Olho de Águia</h2>
              <Link href="/olho-de-aguia">Ver tudo</Link>
            </div>
            {casos.length === 0 && propostas.length === 0 && <p className="vazio">Nenhum caso aberto. Tudo tranquilo.</p>}
            {casos.slice(0, CASOS_NO_RESUMO).map((caso) => (
              <div className="linha-caso" key={caso.chave}>
                <div>
                  {nomeDaPartida(caso.partida)} · {nomeDoMapa(caso.partida.mapa)}
                  <small>
                    Denunciada por {caso.denuncias.length} {caso.denuncias.length === 1 ? 'jogador' : 'jogadores'}
                    {caso.acusado ? ` · contra ${caso.acusado.apelido}` : ''}
                  </small>
                </div>
                <span className="selo-caso vermelho">Denúncia</span>
                <Link className="botao ouro pequeno" href={`/olho-de-aguia?caso=${caso.chave}`}>
                  Revisar
                </Link>
              </div>
            ))}
            {propostas.slice(0, CASOS_NO_RESUMO).map((proposta) => (
              <div className="linha-caso" key={proposta.id}>
                <div>
                  Proposta de banimento · {proposta.alvoApelido}
                  <small>Proposta por {proposta.propostoPorApelido}. A decisão fica na ficha do jogador.</small>
                </div>
                <span className="selo-caso">Proposta</span>
                <Link className="botao contorno pequeno" href={`/jogadores/${proposta.usuarioId}`}>
                  Revisar
                </Link>
              </div>
            ))}
          </section>
        )}

        <div className="colunas-painel">
          {moderar && (
            <section className="painel">
              <div className="cabeca-painel">
                <h2>Chamados</h2>
                <Link href="/olho-de-aguia#chamados">Ver tudo</Link>
              </div>
              {chamados.length === 0 && <p className="vazio">Ninguém chamou a equipe agora.</p>}
              {chamados.map((chamado) => (
                <div className="linha-caso" key={chamado.id}>
                  <div>
                    {chamado.chamadoPorApelido} pediu ajuda
                    <small>
                      {nomeDaPartida({ tipo: chamado.partidaTipo, numero: chamado.partidaNumero })} · {TEXTOS_DO_ESTADO[chamado.estado].etiqueta.toLowerCase()}
                    </small>
                  </div>
                  <span className="selo-caso vermelho">Aberto</span>
                  <form action={atender}>
                    <input type="hidden" name="chamadoId" value={chamado.id} />
                    <button type="submit" className="botao ouro pequeno">
                      Atender
                    </button>
                  </form>
                </div>
              ))}
            </section>
          )}
          <section className="painel">
            <div className="cabeca-painel">
              <h2>Servidores</h2>
              <Link href="/painel/servidores">Gerenciar</Link>
            </div>
            {cuidarDosServidores && (
              <form action={mudarManutencao} className="linha-caso linha-da-manutencao">
                <div>
                  Aviso de manutenção
                  <small>
                    {manutencao
                      ? `${manutencao.automatica ? 'Ligado sozinho' : 'Ligado na mão'} em ${horaDaQueda.format(manutencao.desde)}${manutencao.motivo ? `: ${manutencao.motivo}` : ''}. Trava fila, salas e Diversão.`
                      : 'Desligado. Liga sozinho quando a atualização do CS2 dá problema.'}
                  </small>
                </div>
                <input type="hidden" name="ligar" value={manutencao ? 'nao' : 'sim'} />
                <button type="submit" className={manutencao ? 'chave-da-manutencao ligada' : 'chave-da-manutencao'} aria-pressed={!!manutencao}>
                  <i aria-hidden="true" />
                  {manutencao ? 'Ligado' : 'Desligado'}
                </button>
              </form>
            )}
            {servidores.length === 0 && <p className="vazio">Nenhum servidor da Diversão ativo.</p>}
            {servidores.map((servidor) => (
              <div className="linha-caso" key={servidor.id}>
                <div>
                  {servidor.modo}
                  <small>{nomeDoMapaConhecido(servidor.mapa) ?? servidor.mapa}</small>
                </div>
                <span className={servidor.estado === 'ligado' ? 'selo-caso verde' : 'selo-caso'}>{NOME_DO_ESTADO_DO_SERVIDOR[servidor.estado]}</span>
              </div>
            ))}
            <p className="apoio nota-do-painel">Os servidores da Diversão ligam quando alguém pede para jogar.</p>
          </section>
        </div>

        {verQuedas && (
          <section className="painel">
            <div className="cabeca-painel">
              <h2>Quedas do jogo</h2>
            </div>
            {quedas.length === 0 && <p className="vazio">Nenhuma queda registrada.</p>}
            {quedas.map((queda) => (
              <div className="linha-caso" key={queda.id}>
                <div>
                  {queda.motivo}
                  <small>
                    {horaDaQueda.format(queda.quando)} · {queda.onde}
                    {queda.observacao ? ` · ${queda.observacao}` : ''}
                  </small>
                </div>
                <span className="selo-caso vermelho">Queda</span>
              </div>
            ))}
            <p className="apoio nota-do-painel">Só o resumo fica aqui. O arquivo que o CS2 deixa a cada queda tem de 5 a 10 GB e é apagado do PC.</p>
          </section>
        )}

      </TelaDoPainel>
    </>
  );
}
