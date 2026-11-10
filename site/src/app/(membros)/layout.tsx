import { redirect } from 'next/navigation';
import { pode } from '@/auth/permissoes';
import { usuarioAtual } from '@/auth/sessao-atual';
import { obterBd } from '@/bd/conexao';
import { enderecoDoDiscord } from '@/dominio/discord';
import { casosDe, notificacoesDe } from '@/dominio/notificacoes';
import { partidaAtualDe } from '@/dominio/partidas';
import { lojaAberta } from '@/dominio/loja';
import { minhaSala } from '@/dominio/salas';
import { patenteDe } from '@/dominio/xp';
import { Atualizar } from './atualizar';
import { AvisoDePartida } from './aviso-de-partida';
import { AvisoDeSala } from './aviso-de-sala';
import { Cabecalho } from './cabecalho';
import { ManterPresenca } from './manter-presenca';
import { Sino } from './sino';
import { VoltarParaAPartida } from './voltar-para-a-partida';

export default async function LayoutDeMembros({ children }: { children: React.ReactNode }) {
  const usuario = await usuarioAtual();
  if (!usuario) redirect('/');

  const [notificacoes, partida, sala] = await Promise.all([
    notificacoesDe(obterBd(), usuario),
    partidaAtualDe(obterBd(), usuario.id),
    minhaSala(obterBd(), usuario.id),
  ]);

  return (
    <div className="app">
      <Atualizar segundos={15} />
      <ManterPresenca />
      <Cabecalho
        usuario={usuario}
        patente={patenteDe(usuario.xpTotal)}
        discord={enderecoDoDiscord(process.env.DISCORD_URL)}
        sino={<Sino notificacoes={notificacoes} />}
        casosDaEquipe={pode(usuario, 'ver_equipe') ? casosDe(notificacoes) : null}
        testes={pode(usuario, 'testar_competitivo') || pode(usuario, 'testar_mutacao')}
        grana={lojaAberta(usuario) ? usuario.grana : null}
        magcoin={usuario.magcoin}
      />
      <main className="conteudo largura">
        <AvisoDePartida />
        {partida && <VoltarParaAPartida partidaId={partida.id} />}
        {children}
      </main>
      <AvisoDeSala sala={sala ? { nome: sala.nome, membros: sala.membros.length, emPartida: sala.partidaId !== null } : null} />
    </div>
  );
}
