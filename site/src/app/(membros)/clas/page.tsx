import Link from 'next/link';
import { exigirAcesso } from '@/auth/guarda';
import { obterBd } from '@/bd/conexao';
import { chamadosDe, claDoUsuario, membrosDoCla, pedidosDoCla, pedidosFeitosPor, procurarClas } from '@/dominio/clas';
import { kdDosJogadores } from '@/dominio/ficha';
import { numerosDoCla, rankingDeClas, ultimasDoCla } from '@/dominio/ranking-clas';
import { BotaoConfirmar } from '../botao-confirmar';
import { criar, editar, entrar, pedir, responder, sair } from './acoes';
import { BlocoDoCla, ERROS_DO_CLA, VAGAS_DO_CLA, VagasDoCla } from './bloco-do-cla';
import { BrasaoDoCla } from './brasao-do-cla';
import { FormularioDoCla } from './formulario-do-cla';
import { SiglaDoCla } from './sigla-do-cla';

const ABAS = [
  { valor: 'meu', nome: 'Meu clã' },
  { valor: 'procurar', nome: 'Procurar clãs' },
  { valor: 'ranking', nome: 'Ranking de clãs' },
] as const;
type Aba = (typeof ABAS)[number]['valor'] | 'criar';

const FILTROS = [
  { valor: 'todos', nome: 'Todos' },
  { valor: 'abertos', nome: 'Abertos' },
  { valor: 'vaga', nome: 'Com vaga' },
] as const;

const AVISOS: Record<string, string> = {
  pedido: 'Pedido enviado. Agora é com o Dono ou um Capitão do clã.',
  editado: 'Clã atualizado.',
};

const vitorias = (quantas: number) => `${quantas} ${quantas === 1 ? 'vitória' : 'vitórias'}`;

/** Os clãs no jeito de jogo: Meu clã, Procurar e Ranking em abas, e o botão de criar no topo. */
export default async function Clas({ searchParams }: { searchParams: Promise<{ aba?: string; q?: string; filtro?: string; erro?: string; aviso?: string }> }) {
  const usuario = await exigirAcesso('/clas');
  const { aba: pedida, q, filtro, erro, aviso } = await searchParams;
  const bd = obterBd();
  const [meuCla, chamados] = await Promise.all([claDoUsuario(bd, usuario.id), chamadosDe(bd, usuario.id)]);
  const aba: Aba = pedida === 'criar' || ABAS.some((item) => item.valor === pedida) ? (pedida as Aba) : meuCla ? 'meu' : 'procurar';

  return (
    <div className="tela-jogar">
      <div className="carteira-da-shop">
        <h1>Clãs</h1>
        {!meuCla && (
          <Link className="botao-da-shop" href="/clas?aba=criar">
            + Criar clã
          </Link>
        )}
      </div>
      <nav className="filtros-da-shop" aria-label="Partes dos clãs">
        {ABAS.map((item) => (
          <Link key={item.valor} href={`/clas?aba=${item.valor}`} aria-current={aba === item.valor ? 'page' : undefined}>
            {item.nome}
          </Link>
        ))}
      </nav>
      {erro && ERROS_DO_CLA[erro] && (
        <p role="alert" className="aviso">
          {ERROS_DO_CLA[erro]}
        </p>
      )}
      {aviso && AVISOS[aviso] && <p className="aviso">{AVISOS[aviso]}</p>}

      {chamados.length > 0 && (
        <section className="chamados-do-cla">
          <h2>Chamados para você</h2>
          {chamados.map((chamado) => (
            <div className="pedido-do-cla" key={chamado.id}>
              <span>
                <SiglaDoCla cla={chamado.cla} link /> {chamado.cla.nome}
                <small>chamou você para o clã</small>
              </span>
              <form action={responder}>
                <input type="hidden" name="pedidoId" value={chamado.id} />
                <button type="submit" name="resposta" value="aceitar" className="botao-da-shop">
                  Aceitar
                </button>
              </form>
              <form action={responder}>
                <input type="hidden" name="pedidoId" value={chamado.id} />
                <button type="submit" name="resposta" value="recusar" className="botao-da-shop vazado">
                  Recusar
                </button>
              </form>
            </div>
          ))}
        </section>
      )}

      {aba === 'meu' && <MeuCla usuarioId={usuario.id} />}
      {aba === 'procurar' && <Procurar usuarioId={usuario.id} temCla={!!meuCla} busca={q} filtro={filtro} />}
      {aba === 'ranking' && <RankingDeClas meuClaId={meuCla?.id ?? null} />}
      {aba === 'criar' &&
        (meuCla ? (
          <div className="extrato-vazio">
            <b>Você já está num clã</b>
            <p>Para criar outro, saia dele antes.</p>
          </div>
        ) : (
          <FormularioDoCla acao={criar} botao="Criar clã" />
        ))}
    </div>
  );
}

async function MeuCla({ usuarioId }: { usuarioId: string }) {
  const bd = obterBd();
  const cla = await claDoUsuario(bd, usuarioId);
  if (!cla) {
    return (
      <div className="extrato-vazio">
        <b>Você ainda não está num clã</b>
        <p>Entre num clã para jogar com um time fixo e subir no ranking de clãs, ou crie o seu.</p>
        <div className="acoes-do-vazio">
          <Link className="botao-da-shop" href="/clas?aba=procurar">
            Procurar clãs
          </Link>
          <Link className="botao-da-shop vazado" href="/clas?aba=criar">
            Criar clã
          </Link>
        </div>
      </div>
    );
  }
  const [numeros, membros, ultimas, pedidos] = await Promise.all([numerosDoCla(bd, cla.id), membrosDoCla(bd, cla.id), ultimasDoCla(bd, cla.id), pedidosDoCla(bd, cla.id)]);
  const kd = await kdDosJogadores(
    bd,
    membros.map((membro) => membro.id),
  );
  return (
    <>
      <BlocoDoCla
        cla={cla}
        numeros={numeros}
        membros={membros}
        kd={kd}
        ultimas={ultimas}
        pedidos={pedidos}
        meuCargo={cla.cargo}
        meuId={usuarioId}
        botoes={
          <>
            {cla.cargo === 'dono' && (
              <a className="botao-da-shop vazado" href="#editar">
                Editar clã
              </a>
            )}
            <form action={sair}>
              <BotaoConfirmar
                mensagem={cla.cargo === 'dono' && membros.length === 1 ? 'Você é o último do clã. Sair desfaz o clã. Continuar?' : 'Sair do clã? Você só entra em outro daqui a 24 horas.'}
                className="botao-da-shop vazado"
              >
                Sair do clã
              </BotaoConfirmar>
            </form>
          </>
        }
      />
      {cla.cargo === 'dono' && (
        <details className="editar-o-cla" id="editar">
          <summary>Editar clã</summary>
          <FormularioDoCla acao={editar} inicial={cla} botao="Salvar" />
        </details>
      )}
    </>
  );
}

async function Procurar({ usuarioId, temCla, busca, filtro }: { usuarioId: string; temCla: boolean; busca: string | undefined; filtro: string | undefined }) {
  const bd = obterBd();
  const [lista, ranking, pedidos] = await Promise.all([procurarClas(bd, busca), rankingDeClas(bd), pedidosFeitosPor(bd, usuarioId)]);
  const numeros = new Map(ranking.map((linha) => [linha.cla.id, linha]));
  const escolhido = FILTROS.find((opcao) => opcao.valor === filtro)?.valor ?? 'todos';
  const visiveis = lista.filter(({ cla, membros }) => (escolhido === 'abertos' ? cla.entrada === 'aberto' : escolhido === 'vaga' ? membros < VAGAS_DO_CLA : true));
  const endereco = (valor: string) => `/clas?${new URLSearchParams({ aba: 'procurar', ...(busca ? { q: busca } : {}), ...(valor !== 'todos' ? { filtro: valor } : {}) }).toString()}`;
  return (
    <>
      <form className="busca-de-cla" action="/clas">
        <input type="hidden" name="aba" value="procurar" />
        {escolhido !== 'todos' && <input type="hidden" name="filtro" value={escolhido} />}
        <input name="q" defaultValue={busca ?? ''} placeholder="Nome ou sigla do clã" aria-label="Procurar clã" />
        <button type="submit" className="botao-da-shop">
          Procurar
        </button>
      </form>
      <nav className="filtros-da-shop" aria-label="Filtrar clãs">
        {FILTROS.map((opcao) => (
          <Link key={opcao.valor} href={endereco(opcao.valor)} aria-current={escolhido === opcao.valor ? 'page' : undefined}>
            {opcao.nome}
          </Link>
        ))}
      </nav>
      {visiveis.length === 0 && (
        <div className="extrato-vazio">
          <b>{busca || escolhido !== 'todos' ? 'Nenhum clã encontrado' : 'Ainda não existe nenhum clã'}</b>
          <p>{busca || escolhido !== 'todos' ? 'Tente outro nome ou tire o filtro.' : 'Que tal criar o primeiro?'}</p>
        </div>
      )}
      <div className="grade-de-clas">
        {visiveis.map(({ cla, membros }) => {
          const linha = numeros.get(cla.id);
          const cheio = membros >= VAGAS_DO_CLA;
          return (
            <div className={`cartao-de-cla borda-cla-${cla.cor}`} key={cla.id}>
              <Link href={`/clas/${cla.id}`} className="palco-de-cla" aria-label={`Ver o clã ${cla.nome}`}>
                <BrasaoDoCla cla={cla} />
              </Link>
              <div className="dados-de-cla">
                <Link href={`/clas/${cla.id}`} className="nome-de-cla">
                  {cla.nome}
                </Link>
                <small>
                  {cla.entrada === 'aberto' ? 'Aberto' : 'Com convite'} · {linha?.posicao ? `${linha.posicao}º no ranking` : 'sem jogos'}
                </small>
                <span className="linha-de-cla">
                  <span>
                    {membros}/{VAGAS_DO_CLA} membros
                  </span>
                  <span>
                    {vitorias(linha?.vitorias ?? 0)}
                    {linha?.vitorias ? ` · ${linha.aproveitamento}%` : ''}
                  </span>
                </span>
                <VagasDoCla membros={membros} />
                {temCla ? null : cheio ? (
                  <span className="botao-da-shop vazado apagado">Cheio</span>
                ) : pedidos.has(cla.id) ? (
                  <span className="botao-da-shop vazado apagado">Pedido enviado</span>
                ) : (
                  <form action={cla.entrada === 'aberto' ? entrar : pedir}>
                    <input type="hidden" name="claId" value={cla.id} />
                    <button type="submit" className={cla.entrada === 'aberto' ? 'botao-da-shop' : 'botao-da-shop vazado'}>
                      {cla.entrada === 'aberto' ? 'Entrar' : 'Pedir para entrar'}
                    </button>
                  </form>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}

async function RankingDeClas({ meuClaId }: { meuClaId: string | null }) {
  const linhas = await rankingDeClas(obterBd());
  if (linhas.length === 0) {
    return (
      <div className="extrato-vazio">
        <b>Ainda não existe nenhum clã</b>
        <p>Crie o primeiro e chame a sua turma.</p>
      </div>
    );
  }
  // O pódio só com quem já tem posição (jogou clã x clã), na ordem 2º, 1º, 3º.
  const comPosicao = linhas.filter((linha) => linha.posicao !== null).slice(0, 3);
  const podio = [comPosicao[1], comPosicao[0], comPosicao[2]].filter(Boolean);
  return (
    <>
      {podio.length > 0 && (
        <div className="podio-de-clas">
          {podio.map((linha) => (
            <Link key={linha.cla.id} href={`/clas/${linha.cla.id}`} className={`lugar-no-podio p${linha.posicao} borda-cla-${linha.cla.cor}`}>
              <span className="numero-do-lugar">{linha.posicao}º</span>
              <BrasaoDoCla cla={linha.cla} tamanho={linha.posicao === 1 ? 'medio' : 'podio'} />
              <b>{linha.cla.nome}</b>
              <small>
                {vitorias(linha.vitorias)} · {linha.aproveitamento}%
              </small>
            </Link>
          ))}
        </div>
      )}
      <div className="rolagem-da-comparacao">
        <div className="tabela-de-clas" role="table" aria-label="Ranking de clãs">
          <div role="row" className="linha-de-clas cabeca">
            <span role="columnheader">#</span>
            <span role="columnheader" />
            <span role="columnheader">Clã</span>
            <span role="columnheader">Vitórias</span>
            <span role="columnheader">Aproveitamento</span>
            <span role="columnheader">Membros</span>
          </div>
          {linhas.map((linha) => (
            <div role="row" key={linha.cla.id} className={`linha-de-clas borda-cla-${linha.cla.cor}${linha.cla.id === meuClaId ? ' minha' : ''}`}>
              <span role="cell" className="posicao-de-cla">
                {linha.posicao ?? '—'}
              </span>
              <span role="cell">
                <BrasaoDoCla cla={linha.cla} tamanho="pequeno" />
              </span>
              <span role="cell">
                <Link href={`/clas/${linha.cla.id}`} className="nome-de-cla">
                  <SiglaDoCla cla={linha.cla} /> {linha.cla.nome}
                </Link>
              </span>
              <b role="cell">{linha.vitorias}</b>
              <span role="cell" className="aproveitamento-de-cla">
                <i style={{ width: `${linha.aproveitamento}%` }} />
                <span>{linha.aproveitamento}%</span>
              </span>
              <span role="cell">{linha.membros}</span>
            </div>
          ))}
        </div>
      </div>
      <p className="legenda-da-secao frase-de-clas">Conta só clã x clã, com os 5 do clã no time. Contra o mesmo clã, só 1 partida por dia.</p>
    </>
  );
}
