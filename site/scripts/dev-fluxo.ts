// Só para conferir as telas no navegador: faz pelas contas fictícias o que elas fariam clicando.
// Uso: npx tsx scripts/dev-fluxo.ts desafiar <sala A> <sala B>        (A desafia B e B aceita)
//      npx tsx scripts/dev-fluxo.ts aceitar [apelido para pular]      (todos aceitam, menos um)
//      npx tsx scripts/dev-fluxo.ts vencer-aceite                      (a varredura resolve o prazo)
//      npx tsx scripts/dev-fluxo.ts vetar-auto                         (um veto automático pelo time da vez)
//      npx tsx scripts/dev-fluxo.ts encerrar                           (fecha a partida com números de mentira)
//      npx tsx scripts/dev-fluxo.ts sessao <apelido>                   (imprime uma sessão da conta)
import { eq, inArray } from 'drizzle-orm';
import { criarSessao } from '@/auth/sessoes';
import { obterBd } from '@/bd/conexao';
import { partidaJogadores, partidas, salas, usuarios } from '@/bd/esquema';
import { aceitarPartida, resolverAceitesVencidos } from '@/dominio/aceites';
import { aceitarDesafio, desafiar } from '@/dominio/desafios';
import { ESTADOS_ATIVOS_DE_PARTIDA } from '@/dominio/disponibilidade';
import { finalizarPartida } from '@/dominio/partidas';
import { resolverVetosVencidos } from '@/dominio/vetos';
import { carregarAmbiente } from './ambiente';

async function principal() {
  if (process.env.NODE_ENV === 'production') throw new Error('Este script não roda em produção.');
  carregarAmbiente();
  const bd = obterBd();
  const [modo, ...resto] = process.argv.slice(2);
  const ativa = async () => {
    const [partida] = await bd.select().from(partidas).where(inArray(partidas.estado, [...ESTADOS_ATIVOS_DE_PARTIDA]));
    if (!partida) throw new Error('Nenhuma partida em andamento.');
    return partida;
  };

  if (modo === 'desafiar') {
    const [a] = await bd.select().from(salas).where(eq(salas.nome, resto[0] ?? ''));
    const [b] = await bd.select().from(salas).where(eq(salas.nome, resto[1] ?? ''));
    if (!a || !b) throw new Error('Sala não encontrada.');
    const desafio = await desafiar(bd, { id: a.liderId }, b.id);
    const partida = await aceitarDesafio(bd, { id: b.liderId }, desafio.id);
    console.log(`Partida ${partida.id} aguardando aceite.`);
  } else if (modo === 'aceitar') {
    const partida = await ativa();
    const jogadores = await bd
      .select({ id: usuarios.id, apelido: usuarios.apelido })
      .from(partidaJogadores)
      .innerJoin(usuarios, eq(partidaJogadores.usuarioId, usuarios.id))
      .where(eq(partidaJogadores.partidaId, partida.id));
    for (const jogador of jogadores) {
      if (jogador.apelido === resto[0]) continue;
      await aceitarPartida(bd, jogador, partida.id);
    }
    console.log(`Aceito por todos${resto[0] ? `, menos ${resto[0]}` : ''}.`);
  } else if (modo === 'vencer-aceite') {
    const partida = await ativa();
    await resolverAceitesVencidos(bd, partida.aceiteAte ?? new Date());
    console.log('Prazo do aceite resolvido.');
  } else if (modo === 'vetar-auto') {
    const partida = await ativa();
    await resolverVetosVencidos(bd, partida.vetoAte ?? new Date());
    console.log('Veto automático feito.');
  } else if (modo === 'encerrar') {
    const partida = await ativa();
    const jogadores = await bd.select().from(partidaJogadores).where(eq(partidaJogadores.partidaId, partida.id));
    let i = 0;
    for (const jogador of jogadores) {
      i += 1;
      await bd
        .update(partidaJogadores)
        .set({ kills: 10 + i * 2, deaths: 25 - i, assists: i, damage: 1200 + i * 150, headshotKills: 3 + i, rodadas: 24, mvps: i % 4, kast: 12 + i, k1: 6, k2: 2, k3: i % 3, k4: 0, k5: 0 })
        .where(eq(partidaJogadores.usuarioId, jogador.usuarioId));
    }
    await bd.transaction((tx) => finalizarPartida(tx, partida.id, { estado: 'encerrada', vencedor: 1 }));
    await bd.update(partidas).set({ placar1: 13, placar2: 9 }).where(eq(partidas.id, partida.id));
    console.log('Partida encerrada.');
  } else if (modo === 'sessao') {
    const [conta] = await bd.select().from(usuarios).where(eq(usuarios.apelido, resto[0] ?? ''));
    if (!conta) throw new Error('Conta não encontrada.');
    console.log(await criarSessao(bd, conta.id));
  } else {
    throw new Error('Modo desconhecido.');
  }
}

principal()
  .then(() => process.exit(0))
  .catch((erro) => {
    console.error(erro.message);
    process.exit(1);
  });
