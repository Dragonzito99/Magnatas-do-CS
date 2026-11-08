import Link from 'next/link';
import { exigirAcesso } from '@/auth/guarda';
import { obterBd } from '@/bd/conexao';
import { chamadosDe, claDoUsuario, membrosDoCla, pedidosDoCla, pedidosFeitosPor, procurarClas } from '@/dominio/clas';
import { kdDosJogadores } from '@/dominio/ficha';
import { numerosDoCla, rankingDeClas, ultimasDoCla } from '@/dominio/ranking-clas';
import { BotaoConfirmar } from '../botao-confirmar';
import { criar, editar, entrar, pedir, responder, sair } from './acoes';
import { BlocoDoCla, ERROS_DO_CLA } from './bloco-do-cla';
import { FormularioDoCla } from './formulario-do-cla';
import { SiglaDoCla } from './sigla-do-cla';

const ABAS = [
  { valor: 'meu', nome: 'Meu clã' },
  { valor: 'procurar', nome: 'Procurar clãs' },
  { valor: 'ranking', nome: 'Ranking de clãs' },
  { valor: 'criar', nome: 'Criar clã' },
] as const;
type Aba = (typeof ABAS)[number]['valor'];


const AVISOS: Record<string, string> = {
  pedido: 'Pedido enviado. Agora é com o Dono ou um Capitão do clã.',
  editado: 'Clã atualizado.',
};

/** Os clãs como no rascunho: Meu clã, Procurar, Ranking e Criar, em abas. */
export default async function Clas({ searchParams }: { searchParams: Promise<{ aba?: string; q?: string; erro?: string; aviso?: string }> }) {
  const usuario = await exigirAcesso('/clas');
  const { aba: pedida, q, erro, aviso } = await searchParams;
  const bd = obterBd();
  const [meuCla, chamados] = await Promise.all([claDoUsuario(bd, usuario.id), chamadosDe(bd, usuario.id)]);
  const aba: Aba = ABAS.some((item) => item.valor === pedida) ? (pedida as Aba) : meuCla ? 'meu' : 'procurar';

  return (
    <div className="tela-jogar">
      <div className="topo-jogar">
        <h1>Clãs</h1>
        <p className="apoio">Monte o seu time fixo, jogue junto e suba no ranking de clãs.</p>
      </div>
      <nav className="filtros-jogar" aria-label="Partes dos clãs">
        {ABAS.map((item) => (
          <Link key={item.valor} className="filtro-jogar" href={`/clas?aba=${item.valor}`} aria-current={aba === item.valor ? 'page' : undefined}>
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
        <section className="painel">
          <div className="cabeca-painel">
            <h2>Chamados para você</h2>
          </div>
          {chamados.map((chamado) => (
            <div className="linha-caso" key={chamado.id}>
              <div>
                O clã <SiglaDoCla cla={chamado.cla} link /> {chamado.cla.nome} chamou você
              </div>
              <form action={responder}>
                <input type="hidden" name="pedidoId" value={chamado.id} />
                <button type="submit" name="resposta" value="aceitar" className="botao ouro pequeno">
                  Aceitar
                </button>
              </form>
              <form action={responder}>
                <input type="hidden" name="pedidoId" value={chamado.id} />
                <button type="submit" name="resposta" value="recusar" className="botao contorno pequeno">
                  Recusar
                </button>
              </form>
            </div>
          ))}
        </section>
      )}

      {aba === 'meu' && <MeuCla usuarioId={usuario.id} />}
      {aba === 'procurar' && <Procurar usuarioId={usuario.id} temCla={!!meuCla} busca={q} />}
      {aba === 'ranking' && <RankingDeClas meuClaId={meuCla?.id ?? null} />}
      {aba === 'criar' &&
        (meuCla ? (
          <section className="painel">
            <p className="vazio">Você já está num clã. Para criar outro, saia dele antes.</p>
          </section>
        ) : (
          <FormularioDoCla acao={criar} botao="CRIAR CLÃ" />
        ))}
    </div>
  );
}

async function MeuCla({ usuarioId }: { usuarioId: string }) {
  const bd = obterBd();
  const cla = await claDoUsuario(bd, usuarioId);
  if (!cla) {
    return (
      <section className="painel sem-cla">
        <p className="vazio">Você ainda não está num clã.</p>
        <div className="acoes-partida">
          <Link className="botao ouro" href="/clas?aba=procurar">
            Procurar clãs
          </Link>
          <Link className="botao contorno" href="/clas?aba=criar">
            Criar clã
          </Link>
        </div>
      </section>
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
          <form action={sair}>
            <BotaoConfirmar
              mensagem={cla.cargo === 'dono' && membros.length === 1 ? 'Você é o último do clã. Sair desfaz o clã. Continuar?' : 'Sair do clã? Você só entra em outro daqui a 24 horas.'}
              className="botao contorno pequeno"
            >
              Sair do clã
            </BotaoConfirmar>
          </form>
        }
      />
      {cla.cargo === 'dono' && (
        <details className="painel editar-cla">
          <summary>Editar clã</summary>
          <FormularioDoCla acao={editar} inicial={cla} botao="SALVAR" />
        </details>
      )}
    </>
  );
}

async function Procurar({ usuarioId, temCla, busca }: { usuarioId: string; temCla: boolean; busca: string | undefined }) {
  const bd = obterBd();
  const [lista, ranking, pedidos] = await Promise.all([procurarClas(bd, busca), rankingDeClas(bd), pedidosFeitosPor(bd, usuarioId)]);
  const numeros = new Map(ranking.map((linha) => [linha.cla.id, linha]));
  return (
    <>
      <form className="busca-cla" action="/clas">
        <input type="hidden" name="aba" value="procurar" />
        <input name="q" defaultValue={busca ?? ''} placeholder="Nome ou sigla do clã" aria-label="Procurar clã" />
        <button type="submit" className="botao ouro pequeno">
          Procurar
        </button>
      </form>
      {lista.length === 0 && (
        <section className="painel">
          <p className="vazio">{busca ? 'Nenhum clã com esse nome ou sigla.' : 'Ainda não existe nenhum clã. Que tal criar o primeiro?'}</p>
        </section>
      )}
      <div className="clas-lista">
        {lista.map(({ cla, membros }) => {
          const linha = numeros.get(cla.id);
          const cheio = membros >= 20;
          return (
            <div className={`cla-cartao borda-cla-${cla.cor}`} key={cla.id}>
              <div>
                <Link href={`/clas/${cla.id}`} className="cla-cartao-nome">
                  <SiglaDoCla cla={cla} /> {cla.nome}
                </Link>
                <span>
                  {membros} {membros === 1 ? 'membro' : 'membros'} · {linha?.vitorias ?? 0} {linha?.vitorias === 1 ? 'vitória' : 'vitórias'} · {linha?.aproveitamento ?? 0}%
                </span>
              </div>
              <span className={cla.entrada === 'aberto' ? 'selo-caso verde' : 'selo-caso'}>{cla.entrada === 'aberto' ? 'Aberto' : 'Com convite'}</span>
              {temCla || cheio ? (
                <span className="apoio">{cheio ? 'Cheio' : ''}</span>
              ) : pedidos.has(cla.id) ? (
                <span className="apoio">Pedido enviado</span>
              ) : (
                <form action={cla.entrada === 'aberto' ? entrar : pedir}>
                  <input type="hidden" name="claId" value={cla.id} />
                  <button type="submit" className={cla.entrada === 'aberto' ? 'botao ouro pequeno' : 'botao contorno pequeno'}>
                    {cla.entrada === 'aberto' ? 'Entrar' : 'Pedir para entrar'}
                  </button>
                </form>
              )}
            </div>
          );
        })}
      </div>
    </>
  );
}

async function RankingDeClas({ meuClaId }: { meuClaId: string | null }) {
  const linhas = await rankingDeClas(obterBd());
  return (
    <>
      <section className="painel">
        {linhas.length === 0 && <p className="vazio">Ainda não existe nenhum clã.</p>}
        {linhas.length > 0 && (
          <table className="tabela tabela-ranking">
            <thead>
              <tr>
                <th scope="col">#</th>
                <th scope="col">Clã</th>
                <th scope="col">Vitórias</th>
                <th scope="col">Aproveitamento</th>
                <th scope="col" className="so-computador">
                  Membros
                </th>
              </tr>
            </thead>
            <tbody>
              {linhas.map((linha) => (
                <tr key={linha.cla.id} className={linha.cla.id === meuClaId ? 'minha-linha' : undefined}>
                  <td>{linha.posicao ?? '—'}</td>
                  <th scope="row">
                    <Link href={`/clas/${linha.cla.id}`} className="cla-cartao-nome">
                      <SiglaDoCla cla={linha.cla} /> {linha.cla.nome}
                    </Link>
                  </th>
                  <td>
                    <b>{linha.vitorias}</b>
                  </td>
                  <td>{linha.aproveitamento}%</td>
                  <td className="so-computador">{linha.membros}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
      <p className="apoio frase-do-ranking">Conta só clã x clã, com os 5 do clã no time. Contra o mesmo clã, só 1 partida por dia.</p>
    </>
  );
}
