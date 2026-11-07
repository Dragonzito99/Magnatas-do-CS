import Image from 'next/image';
import Link from 'next/link';
import { exigirAcesso } from '@/auth/guarda';
import { obterBd } from '@/bd/conexao';
import type { ServidorDiversao } from '@/bd/esquema';
import {
  alvoDoServidor,
  comandoDeConectar,
  estadoDoCartao,
  lerModo,
  linkDeEntrar,
  listarServidoresDaDiversao,
  mapaDoCartao,
  MODOS_DE_DIVERSAO,
  type SituacaoDoServidor,
} from '@/dominio/diversao';
import { estadosDaTela, type EstadoNaTela } from '@/dominio/sob-demanda';
import { controladorDoAmbiente } from '@/servidor-jogo/controlador';
import { diversaoDoAmbiente } from '@/servidor-jogo/diversao-do-ambiente';
import { Atualizar } from '../atualizar';
import { BotaoCopiar } from '../botao-copiar';
import { ligar } from './acoes';
import { AvisarAoEntrar, BotaoLigar, EntrarQuandoLigar, EsperarEEntrar, TempoLigando } from './esperar-e-entrar';

const SEM_RESPOSTA: SituacaoDoServidor = { ligado: false, jogando: 0 };
/** Depois disso o aviso de falha some e o cartão volta só com o botão. */
const AVISO_DE_FALHA_MS = 2 * 60_000;

const ERROS: Record<string, string> = {
  limite: 'Todos os servidores estão cheios de gente agora. Tente de novo em alguns minutos.',
  indisponivel: 'Este modo não pode ser ligado agora.',
};

function nomeDoModo(modo: ServidorDiversao['modo']) {
  return MODOS_DE_DIVERSAO.find((item) => item.valor === modo)?.nome;
}

function RodapeDoCartao({
  servidor,
  situacao,
  guardado,
  modo,
  agora,
}: {
  servidor: ServidorDiversao;
  situacao: SituacaoDoServidor;
  guardado: EstadoNaTela | undefined;
  modo: string | null;
  agora: number;
}) {
  const estado = estadoDoCartao(servidor, situacao, guardado?.estado);
  if (estado === 'em_breve') return <span className="etiqueta">Em breve</span>;
  if (estado === 'fora_do_ar') return <span className="etiqueta">Fora do ar</span>;
  if (estado === 'ligando') {
    return (
      <>
        <span className="etiqueta">Ligando... cerca de 1 minuto</span>
        {guardado && <TempoLigando desde={guardado.desde.toISOString()} />}
        <EntrarQuandoLigar servidorId={servidor.id} />
      </>
    );
  }
  if (estado === 'desligado_sob_demanda') {
    const falhou = guardado?.erro && agora - guardado.desde.getTime() < AVISO_DE_FALHA_MS;
    return (
      <form action={ligar} className="ligar-servidor">
        {falhou && <span className="etiqueta falha">Não consegui ligar agora. Tente de novo em instantes.</span>}
        <input type="hidden" name="servidor" value={servidor.id} />
        {modo && <input type="hidden" name="modo" value={modo} />}
        <BotaoLigar servidorId={servidor.id} />
      </form>
    );
  }

  const vagas = (
    <span className="vagas-servidor">
      {situacao.jogando}/{servidor.vagas}
    </span>
  );
  if (estado === 'cheio') {
    return (
      <>
        {vagas}
        <span className="etiqueta">Servidor cheio</span>
      </>
    );
  }

  const alvo = alvoDoServidor(servidor, process.env.DIVERSAO_HOST);
  if (!alvo) return null;
  const senha = process.env.SERVIDOR_SENHA ?? '';
  const comando = comandoDeConectar(alvo, senha);
  const link = linkDeEntrar(alvo, senha);
  return (
    <>
      {vagas}
      <AvisarAoEntrar servidorId={servidor.id}>
        {comando && <BotaoCopiar texto={comando} />}
        <a className="botao ouro pequeno" href={link}>
          Entrar
        </a>
      </AvisarAoEntrar>
      <EsperarEEntrar servidorId={servidor.id} link={link} />
    </>
  );
}

export default async function Diversao({ searchParams }: { searchParams: Promise<{ modo?: string; erro?: string }> }) {
  await exigirAcesso('/diversao');
  const { modo: texto, erro } = await searchParams;
  const modo = lerModo(texto);

  const bd = obterBd();
  const todos = await listarServidoresDaDiversao(bd);
  const servidores = modo ? todos.filter((servidor) => servidor.modo === modo) : todos;

  const diversao = diversaoDoAmbiente(controladorDoAmbiente());
  const [situacoes, guardados] = await Promise.all([
    Promise.all(servidores.map((servidor) => (servidor.ativo ? diversao.situacaoDaTela(servidor) : SEM_RESPOSTA))),
    estadosDaTela(
      bd,
      servidores.map((servidor) => servidor.id),
    ),
  ]);
  const algumLigando = servidores.some((servidor, indice) => estadoDoCartao(servidor, situacoes[indice], guardados.get(servidor.id)?.estado) === 'ligando');
  // eslint-disable-next-line react-hooks/purity -- página do servidor: a hora é lida uma vez por pedido.
  const agora = Date.now();

  return (
    <>
      <div className="topo-pagina">
        <h1>Diversão</h1>
      </div>
      <nav className="abas-pagina" aria-label="Modos de jogo">
        <Link className="aba-pagina" href="/diversao" aria-current={modo ? undefined : 'page'}>
          Todos
        </Link>
        {MODOS_DE_DIVERSAO.map((item) => (
          <Link key={item.valor} className="aba-pagina" href={`/diversao?modo=${item.valor}`} aria-current={modo === item.valor ? 'page' : undefined}>
            {item.nome}
          </Link>
        ))}
      </nav>
      {erro && ERROS[erro] && (
        <p role="alert" className="aviso">
          {ERROS[erro]}
        </p>
      )}
      {algumLigando && <Atualizar segundos={3} />}
      <div className="lista-servidores">
        {servidores.map((servidor, indice) => {
          const mapa = mapaDoCartao(servidor, situacoes[indice]);
          return (
            <article key={servidor.id} className="cartao-servidor">
              <Image className="foto-servidor" src={mapa.foto} alt={`Mapa ${mapa.nome}`} width={480} height={270} />
              <div className="corpo-servidor">
                <h2>{nomeDoModo(servidor.modo)}</h2>
                <p>{servidor.armas}</p>
                <small>{mapa.nome}</small>
                <div className="rodape-servidor">
                  <RodapeDoCartao servidor={servidor} situacao={situacoes[indice]} guardado={guardados.get(servidor.id)} modo={modo} agora={agora} />
                </div>
              </div>
            </article>
          );
        })}
      </div>
    </>
  );
}
