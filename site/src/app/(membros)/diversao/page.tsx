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
  situacaoDoServidor,
  type SituacaoDoServidor,
} from '@/dominio/diversao';
import { controladorDoAmbiente } from '@/servidor-jogo/controlador';
import { BotaoCopiar } from '../botao-copiar';

const SEM_RESPOSTA: SituacaoDoServidor = { ligado: false, jogando: 0 };

function nomeDoModo(modo: ServidorDiversao['modo']) {
  return MODOS_DE_DIVERSAO.find((item) => item.valor === modo)?.nome;
}

function RodapeDoCartao({ servidor, situacao }: { servidor: ServidorDiversao; situacao: SituacaoDoServidor }) {
  const estado = estadoDoCartao(servidor, situacao);
  if (estado === 'em_breve') return <span className="etiqueta">Em breve</span>;
  if (estado === 'fora_do_ar') return <span className="etiqueta">Fora do ar</span>;

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
  return (
    <>
      {vagas}
      {comando && <BotaoCopiar texto={comando} />}
      <a className="botao ouro pequeno" href={linkDeEntrar(alvo, senha)}>
        Entrar
      </a>
    </>
  );
}

export default async function Diversao({ searchParams }: { searchParams: Promise<{ modo?: string }> }) {
  await exigirAcesso('/diversao');
  const { modo: texto } = await searchParams;
  const modo = lerModo(texto);

  const todos = await listarServidoresDaDiversao(obterBd());
  const servidores = modo ? todos.filter((servidor) => servidor.modo === modo) : todos;

  const controlador = controladorDoAmbiente();
  const situacoes = await Promise.all(
    servidores.map((servidor) =>
      servidor.ativo ? situacaoDoServidor(controlador, alvoDoServidor(servidor, process.env.DIVERSAO_HOST)) : SEM_RESPOSTA,
    ),
  );

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
                  <RodapeDoCartao servidor={servidor} situacao={situacoes[indice]} />
                </div>
              </div>
            </article>
          );
        })}
      </div>
    </>
  );
}
