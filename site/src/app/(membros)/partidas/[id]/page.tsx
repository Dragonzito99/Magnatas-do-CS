import Link from 'next/link';
import { notFound } from 'next/navigation';
import { z } from 'zod';
import { exigirAcesso } from '@/auth/guarda';
import { pode } from '@/auth/permissoes';
import { obterBd } from '@/bd/conexao';
import { ESTADOS_ATIVOS_DE_PARTIDA } from '@/dominio/disponibilidade';
import { dadosDeConexao, detalheDaPartida, type JogadorDaPartida } from '@/dominio/partidas';
import { nomeDaPartida, nomeDoMapa, TEXTOS_DO_ESTADO } from '@/dominio/textos-da-partida';
import { Atualizar } from '../../atualizar';
import { Avatar } from '../../avatar';
import { BotaoConfirmar } from '../../botao-confirmar';
import { cancelar, chamar, denunciarJogador } from './acoes';

const ERROS: Record<string, string> = {
  motivo: 'Escreva o motivo, com até 500 caracteres.',
  acusado: 'Escolha outro jogador desta partida.',
  repetida: 'Você já denunciou este jogador nesta partida.',
  'nao-jogou': 'Só quem joga a partida pode fazer isso.',
  chamado: 'Esta partida não recebe mais chamados.',
  'sem-acesso': 'Sua conta não pode fazer isso agora.',
  cancelar: 'Quem joga a partida não pode cancelar. Outra pessoa da equipe precisa fazer isso.',
  terminada: 'Esta partida já terminou.',
};

const AVISOS: Record<string, string> = {
  denunciado: 'Denúncia enviada para a equipe.',
  chamado: 'A equipe foi chamada. Um GM vai entrar como espectador.',
  'sem-equipe': 'Não há ninguém da equipe online agora. Seu chamado virou uma denúncia, e a partida será analisada depois.',
};

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
            <th scope="col">XP</th>
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
              <td>{jogador.xp ?? '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

export default async function PaginaDaPartida({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ erro?: string; aviso?: string }>;
}) {
  const { id } = await params;
  const { erro, aviso } = await searchParams;
  const usuario = await exigirAcesso(`/partidas/${id}`);
  if (!z.uuid().safeParse(id).success) notFound();
  const detalhe = await detalheDaPartida(obterBd(), id);
  if (!detalhe) notFound();

  const { partida, servidor, jogadores } = detalhe;
  const estado = TEXTOS_DO_ESTADO[partida.estado];
  const ativa = (ESTADOS_ATIVOS_DE_PARTIDA as readonly string[]).includes(partida.estado);
  const jogaNaPartida = jogadores.some((jogador) => jogador.id === usuario.id);
  const podeChamar = jogaNaPartida && (partida.estado === 'ao_vivo' || partida.estado === 'aguardando_jogadores');
  const conexao = dadosDeConexao(partida, servidor, { papel: usuario.papel, jogaNaPartida }, process.env.SERVIDOR_SENHA ?? '');

  return (
    <>
      {ativa && <Atualizar segundos={3} />}
      <div className="topo-pagina">
        <h1>{nomeDaPartida(partida)}</h1>
        <span className="etiqueta">{nomeDoMapa(partida.mapa)}</span>
      </div>
      {erro && ERROS[erro] && (
        <p role="alert" className="aviso">
          {ERROS[erro]}
        </p>
      )}
      {aviso && AVISOS[aviso] && <p className="aviso">{AVISOS[aviso]}</p>}
      <section className="cartao-escuro">
        <span className="ao-vivo">{estado.etiqueta}</span>
        <div className="numero-grande mono">
          {partida.placar1}
          <small> x </small>
          {partida.placar2}
        </div>
        <p>{estado.explicacao}</p>
        <div className="acoes">
          {conexao && (
            <a className="botao ouro" href={conexao.url}>
              {jogaNaPartida ? 'Conectar ao servidor' : 'Assistir como espectador'}
            </a>
          )}
          {podeChamar && (
            <form action={chamar}>
              <input type="hidden" name="partidaId" value={partida.id} />
              <button type="submit" className="botao contorno">
                Chamar a equipe
              </button>
            </form>
          )}
          {ativa && pode(usuario, 'moderar') && !jogaNaPartida && (
            <form action={cancelar}>
              <input type="hidden" name="partidaId" value={partida.id} />
              <BotaoConfirmar
                mensagem={`Cancelar a ${nomeDaPartida(partida)}? Ela não conta nas estatísticas, e todo mundo fica livre para jogar de novo.`}
                className="botao contorno"
              >
                Cancelar partida
              </BotaoConfirmar>
            </form>
          )}
        </div>
      </section>
      <div className="grade-times">
        <Time titulo={partida.vencedor === 1 ? 'Time 1, vencedor' : 'Time 1'} jogadores={jogadores.filter((jogador) => jogador.time === 1)} />
        <Time titulo={partida.vencedor === 2 ? 'Time 2, vencedor' : 'Time 2'} jogadores={jogadores.filter((jogador) => jogador.time === 2)} />
      </div>
      {jogaNaPartida && (
        <section className="painel">
          <div className="cabeca-painel">
            <h2>Denunciar um jogador</h2>
            <span>Só a equipe vê</span>
          </div>
          <form action={denunciarJogador} className="formulario-denuncia">
            <input type="hidden" name="partidaId" value={partida.id} />
            <select name="acusadoId" aria-label="Jogador denunciado" required defaultValue="">
              <option value="" disabled>
                Escolha o jogador
              </option>
              {jogadores
                .filter((jogador) => jogador.id !== usuario.id)
                .map((jogador) => (
                  <option key={jogador.id} value={jogador.id}>
                    {jogador.apelido}
                  </option>
                ))}
            </select>
            <textarea name="motivo" aria-label="Motivo" placeholder="O que aconteceu? Se puder, diga a rodada." maxLength={500} required rows={3} />
            <div>
              <button type="submit" className="botao cinza pequeno">
                Enviar denúncia
              </button>
            </div>
          </form>
        </section>
      )}
    </>
  );
}
