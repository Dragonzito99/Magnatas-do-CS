import { redirect } from 'next/navigation';
import { pode } from '@/auth/permissoes';
import { usuarioAtual } from '@/auth/sessao-atual';
import { obterBd } from '@/bd/conexao';
import { enderecoDoDiscord } from '@/dominio/discord';
import { amigosDe, convitesDeSalaPara, pedidosDeAmizadePara } from '@/dominio/amigos';
import { conversasDe } from '@/dominio/mensagens';
import { casosDe, notificacoesDe } from '@/dominio/notificacoes';
import { partidaAtualDe } from '@/dominio/partidas';
import { lojaAberta } from '@/dominio/loja';
import { manutencaoAtual } from '@/dominio/manutencao';
import { minhaSala } from '@/dominio/salas';
import { patenteDe } from '@/dominio/xp';
import { AoVivo } from './ao-vivo';
import { Atualizar } from './atualizar';
import { AvisoDeConvite, BarraDeAmigos } from './barra-de-amigos';
import { IrParaAvaliar } from './ir-para-avaliar';
import { JanelaDeConversa } from './janela-de-conversa';
import { AvisoDeManutencao } from './aviso-de-manutencao';
import { AvisoDePartida } from './aviso-de-partida';
import { AvisoDeSala } from './aviso-de-sala';
import { Cabecalho } from './cabecalho';
import { ManterPresenca } from './manter-presenca';
import { Sino } from './sino';
import { VoltarParaAPartida } from './voltar-para-a-partida';

export default async function LayoutDeMembros({ children }: { children: React.ReactNode }) {
  const usuario = await usuarioAtual();
  if (!usuario) redirect('/');

  const [notificacoes, partida, sala, amigos, pedidos, convites, conversas, manutencao] = await Promise.all([
    notificacoesDe(obterBd(), usuario),
    partidaAtualDe(obterBd(), usuario.id),
    minhaSala(obterBd(), usuario.id),
    amigosDe(obterBd(), usuario.id),
    pedidosDeAmizadePara(obterBd(), usuario.id),
    convitesDeSalaPara(obterBd(), usuario.id),
    conversasDe(obterBd(), usuario.id),
    manutencaoAtual(obterBd()),
  ]);
  const naoLidas = conversas.reduce((soma, conversa) => soma + conversa.naoLidas, 0);
  const grupos = conversas.flatMap((conversa) => (conversa.tipo === 'direta' ? [] : [{ id: conversa.id, nome: conversa.nome, tipo: conversa.tipo as 'grupo' | 'cla', naoLidas: conversa.naoLidas }]));

  return (
    <div className="app com-amigos">
      <Atualizar segundos={15} />
      <AoVivo />
      <ManterPresenca />
      {notificacoes.some((notificacao) => notificacao.tipo === 'avaliar') && <IrParaAvaliar />}
      <Cabecalho
        usuario={usuario}
        patente={patenteDe(usuario.xpTotal)}
        discord={enderecoDoDiscord(process.env.DISCORD_URL)}
        sino={<Sino notificacoes={notificacoes} />}
        casosDaEquipe={pode(usuario, 'ver_equipe') ? casosDe(notificacoes) : null}
        grana={lojaAberta(usuario) ? usuario.grana : null}
        magcoin={usuario.magcoin}
      />
      {manutencao && <AvisoDeManutencao />}
      <main className="conteudo largura">
        <AvisoDePartida />
        {partida && <VoltarParaAPartida partidaId={partida.id} />}
        {children}
      </main>
      <AvisoDeSala sala={sala ? { nome: sala.nome, membros: sala.membros.length, emPartida: sala.partidaId !== null } : null} />
      <BarraDeAmigos amigos={amigos} pendentes={pedidos.length + convites.length} naoLidas={naoLidas} grupos={grupos} />
      <JanelaDeConversa />
      {!sala && !partida && <AvisoDeConvite convite={convites[0] ?? null} />}
    </div>
  );
}
