import Link from 'next/link';
import { notFound } from 'next/navigation';
import { z } from 'zod';
import { exigirAcesso } from '@/auth/guarda';
import { obterBd } from '@/bd/conexao';
import { ESTADOS_ATIVOS_DE_PARTIDA } from '@/dominio/disponibilidade';
import { dadosDeConexao, detalheDaPartida, type JogadorDaPartida } from '@/dominio/partidas';
import { nomeDaPartida, nomeDoMapa, TEXTOS_DO_ESTADO } from '@/dominio/textos-da-partida';
import { Atualizar } from '../../atualizar';
import { Avatar } from '../../avatar';

function Time({ titulo, jogadores }: { titulo: string; jogadores: JogadorDaPartida[] }) {
  return (
    <section className="painel">
      <div className="cabeca-painel">
        <h2>{titulo}</h2>
      </div>
      <table className="tabela">
        <thead>
          <tr>
            <th scope="col">Jogador</th>
            <th scope="col" title="Abates">
              K
            </th>
            <th scope="col" title="Mortes">
              D
            </th>
            <th scope="col" title="Assistências">
              A
            </th>
            <th scope="col" title="Dano por rodada">
              ADR
            </th>
          </tr>
        </thead>
        <tbody>
          {jogadores.map((jogador) => (
            <tr key={jogador.id}>
              <th scope="row">
                <span className="perfil">
                  <Avatar usuario={jogador} />
                  <Link className="nome" href={`/jogadores/${jogador.id}`}>
                    {jogador.apelido}
                  </Link>
                </span>
              </th>
              <td>{jogador.kills}</td>
              <td>{jogador.deaths}</td>
              <td>{jogador.assists}</td>
              <td>{jogador.rodadas > 0 ? Math.round(jogador.damage / jogador.rodadas) : 0}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

export default async function PaginaDaPartida({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const usuario = await exigirAcesso(`/partidas/${id}`);
  if (!z.uuid().safeParse(id).success) notFound();
  const detalhe = await detalheDaPartida(obterBd(), id);
  if (!detalhe) notFound();

  const { partida, servidor, jogadores } = detalhe;
  const estado = TEXTOS_DO_ESTADO[partida.estado];
  const ativa = (ESTADOS_ATIVOS_DE_PARTIDA as readonly string[]).includes(partida.estado);
  const jogaNaPartida = jogadores.some((jogador) => jogador.id === usuario.id);
  const conexao = dadosDeConexao(partida, servidor, { papel: usuario.papel, jogaNaPartida }, process.env.SERVIDOR_SENHA ?? '');

  return (
    <>
      {ativa && <Atualizar segundos={3} />}
      <div className="topo-pagina">
        <h1>{nomeDaPartida(partida)}</h1>
        <span className="etiqueta">{nomeDoMapa(partida.mapa)}</span>
      </div>
      <section className="cartao-escuro">
        <span className="ao-vivo">{estado.etiqueta}</span>
        <div className="numero-grande mono">
          {partida.placar1}
          <small> x </small>
          {partida.placar2}
        </div>
        <p>{estado.explicacao}</p>
        {conexao && (
          <div className="acoes">
            <a className="botao laranja" href={conexao.url}>
              Conectar ao servidor
            </a>
          </div>
        )}
      </section>
      <div className="grade-times">
        <Time titulo={partida.vencedor === 1 ? 'Time 1, vencedor' : 'Time 1'} jogadores={jogadores.filter((jogador) => jogador.time === 1)} />
        <Time titulo={partida.vencedor === 2 ? 'Time 2, vencedor' : 'Time 2'} jogadores={jogadores.filter((jogador) => jogador.time === 2)} />
      </div>
    </>
  );
}
