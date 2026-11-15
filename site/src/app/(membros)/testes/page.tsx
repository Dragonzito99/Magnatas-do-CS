import { eq } from 'drizzle-orm';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { exigirAcesso } from '@/auth/guarda';
import { pode } from '@/auth/permissoes';
import { obterBd } from '@/bd/conexao';
import { estadosDaDiversao, servidoresDiversao } from '@/bd/esquema';
import { ehCelular } from '@/dominio/aparelho';
import { alvoDoServidor, comandoDeConectar, linkDeEntrar, situacaoDoServidor } from '@/dominio/diversao';
import { alvoDoLaboratorio, etapaDoLaboratorio, LABORATORIOS, pedidoRecente } from '@/dominio/laboratorio';
import { etapaDoTeste, servidorDaMutacao } from '@/dominio/teste-mutacao';
import { controladorDoAmbiente } from '@/servidor-jogo/controlador';
import { diversaoDoAmbiente } from '@/servidor-jogo/diversao-do-ambiente';
import { BotaoCopiar } from '../botao-copiar';
import { TelaDoPainel } from '../painel/lateral-do-painel';
import { AvisarAoEntrar, TempoLigando } from '../diversao/esperar-e-entrar';
import { ligarLaboratorioPelaTela, testarCompetitivo, testarMutacao } from './acoes';

const ERROS: Record<string, string> = {
  ocupado: 'Saia da sala, da fila ou da partida em que você está antes de testar o competitivo.',
  mutacao_ocupada: 'A Mutação está com gente jogando agora. Tente o teste quando ela esvaziar.',
  limite: 'Todos os servidores estão cheios de gente agora. Tente de novo em alguns minutos.',
  indisponivel: 'Não consegui ligar o servidor da Mutação agora. Tente de novo em instantes.',
  celular: 'Os testes ligam servidor, e o servidor só liga pelo PC, onde o CS2 roda.',
  laboratorio: 'Não consegui ligar o laboratório agora. Tente de novo em instantes.',
};

/** Só o Adm: os testes dos modos num lugar só, sem XP e fora do perfil. A página se atualiza sozinha a cada 15 segundos. */
export default async function Testes({ searchParams }: { searchParams: Promise<{ erro?: string; ligando?: string; desde?: string }> }) {
  const usuario = await exigirAcesso('/testes');
  if (!pode(usuario, 'testar_competitivo') && !pode(usuario, 'testar_mutacao') && !pode(usuario, 'usar_laboratorio')) redirect('/inicio');
  const { erro, ligando, desde } = await searchParams;

  const bd = obterBd();
  const mutacao = await servidorDaMutacao(bd);
  const diversao = diversaoDoAmbiente(controladorDoAmbiente());
  const [guardado] = mutacao ? await bd.select().from(estadosDaDiversao).where(eq(estadosDaDiversao.servidorId, mutacao.id)) : [];
  const situacao = mutacao ? await diversao.perguntar(mutacao) : { ligado: false, jogando: 0 };
  const etapa = etapaDoTeste(guardado, situacao);
  const alvo = mutacao ? alvoDoServidor(mutacao, process.env.DIVERSAO_HOST) : null;
  const senha = process.env.SERVIDOR_SENHA ?? '';
  const celular = ehCelular(await headers());
  // Ilha Lemnos antes de abrir para todos (15/11/2026): o Adm entra por aqui, porque na tela Jogar ela ainda não aparece.
  const [ilha] = pode(usuario, 'cuidar_de_lemnos') ? await bd.select().from(servidoresDiversao).where(eq(servidoresDiversao.modo, 'lemnos')) : [];
  const alvoDaIlha = ilha ? alvoDoServidor(ilha, process.env.DIVERSAO_HOST) : null;
  const ilhaNoAr = alvoDaIlha ? (await situacaoDoServidor(controladorDoAmbiente(), alvoDaIlha)).ligado : false;
  const laboratorios = await Promise.all(
    LABORATORIOS.map(async (laboratorio) => {
      const alvoDoLab = alvoDoLaboratorio(laboratorio, process.env.DIVERSAO_HOST);
      const situacaoDoLab = await situacaoDoServidor(controladorDoAmbiente(), alvoDoLab);
      return { laboratorio, alvo: alvoDoLab, etapa: etapaDoLaboratorio(situacaoDoLab, ligando === laboratorio.chave && pedidoRecente(desde)) };
    }),
  );

  return (
    <TelaDoPainel usuario={usuario} atual="testes" titulo="Testes e laboratório">
      <p className="apoio">Nenhum teste vale XP nem aparece no perfil.</p>
      {erro && ERROS[erro] && (
        <p role="alert" className="aviso">
          {ERROS[erro]}
        </p>
      )}

      <section className="painel">
        <div className="linha">
          <div>
            <b>Competitivo contra bots</b>
            <p className="apoio">Uma partida 5x5 com você e 9 bots: aceite, vetos, servidor e tela final.</p>
          </div>
          <div className="acoes">
            {celular && <span className="etiqueta">Ligue pelo PC</span>}
            {!celular && pode(usuario, 'testar_competitivo') && (
              <form action={testarCompetitivo}>
                <button type="submit" className="botao ouro pequeno">
                  Testar o competitivo
                </button>
              </form>
            )}
          </div>
        </div>

        <div className="linha">
          <div>
            <b>Mutação com bots</b>
            <p className="apoio">Na Dust 2, com você e 9 bots. Enquanto roda, a Mutação fica fechada na tela Jogar.</p>
          </div>
          <div className="acoes">
            {!mutacao && <span className="etiqueta">Mutação fora do ar</span>}
            {mutacao && etapa === 'livre' && celular && <span className="etiqueta">Ligue pelo PC</span>}
            {mutacao && etapa === 'livre' && !celular && pode(usuario, 'testar_mutacao') && (
              <form action={testarMutacao}>
                <button type="submit" className="botao ouro pequeno">
                  Testar a Mutação
                </button>
              </form>
            )}
            {etapa === 'ligando' && (
              <>
                <span className="etiqueta">Ligando o servidor... cerca de 1 minuto</span>
                {guardado && <TempoLigando desde={guardado.desde.toISOString()} />}
              </>
            )}
            {etapa === 'preparando' && <span className="etiqueta">Trocando para a Dust 2 e chamando os bots...</span>}
            {mutacao && etapa === 'pronto' && alvo && (
              <AvisarAoEntrar servidorId={mutacao.id}>
                {comandoDeConectar(alvo, senha) && <BotaoCopiar texto={comandoDeConectar(alvo, senha)!} />}
                <a className="botao ouro pequeno" href={linkDeEntrar(alvo, senha)}>
                  Entrar
                </a>
              </AvisarAoEntrar>
            )}
          </div>
        </div>
      </section>

      {pode(usuario, 'usar_laboratorio') && (
        <section className="painel">
          <h2>Laboratório</h2>
          <p className="apoio">Servidor só seu, na Dust 2, para testar pelo chat. Desliga sozinho depois de 10 minutos vazio.</p>
          {laboratorios.map(({ laboratorio, alvo: alvoDoLab, etapa: etapaDoLab }) => (
            <div className="linha" key={laboratorio.chave}>
              <div>
                <b>{laboratorio.titulo}</b>
                <p className="apoio">{laboratorio.descricao}</p>
              </div>
              <div className="acoes">
                {etapaDoLab === 'desligado' && celular && <span className="etiqueta">Ligue pelo PC</span>}
                {etapaDoLab === 'desligado' && !celular && (
                  <form action={ligarLaboratorioPelaTela}>
                    <input type="hidden" name="laboratorio" value={laboratorio.chave} />
                    <button type="submit" className="botao ouro pequeno">
                      Ligar
                    </button>
                  </form>
                )}
                {etapaDoLab === 'ligando' && <span className="etiqueta">Ligando o servidor... cerca de 1 minuto</span>}
                {etapaDoLab === 'pronto' && alvoDoLab && (
                  <>
                    {comandoDeConectar(alvoDoLab, senha) && <BotaoCopiar texto={comandoDeConectar(alvoDoLab, senha)!} />}
                    <a className="botao ouro pequeno" href={linkDeEntrar(alvoDoLab, senha)}>
                      Entrar
                    </a>
                  </>
                )}
              </div>
            </div>
          ))}
        </section>
      )}
      {ilha && alvoDaIlha && (
        <section className="painel">
          <h2>Ilha Lemnos</h2>
          <p className="apoio">
            {ilha.ativo ? 'Aberta para todos, pela tela Jogar.' : 'Ainda escondida dos jogadores. Só você entra, por aqui, para testar e marcar o mapa (!marcar).'}
          </p>
          <div className="linha">
            <div>
              <b>Ilha Lemnos · Sirocco</b>
              <p className="apoio">{ilhaNoAr ? 'No ar.' : 'Desligada.'}</p>
            </div>
            <div className="acoes">
              {ilhaNoAr ? (
                <>
                  {comandoDeConectar(alvoDaIlha, senha) && <BotaoCopiar texto={comandoDeConectar(alvoDaIlha, senha)!} />}
                  <a className="botao ouro pequeno" href={linkDeEntrar(alvoDaIlha, senha)}>
                    Entrar
                  </a>
                </>
              ) : (
                <span className="etiqueta">Desligada</span>
              )}
            </div>
          </div>
        </section>
      )}
    </TelaDoPainel>
  );
}
