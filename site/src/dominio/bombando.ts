import type { Bd } from '@/bd/conexao';
import type { Partida } from '@/bd/esquema';
import type { ControladorServidor } from '@/servidor-jogo/controlador';
import { alvoDoServidor, linkDeEntrar, listarServidoresDaDiversao, mapaDoCartao, MODOS_DE_DIVERSAO, situacaoDoServidor } from './diversao';
import { verMix } from './mix';
import { partidasEmAndamento } from './partidas';
import { listarSalas, TAMANHO_DA_SALA } from './salas';

const TOTAL_DO_MIX = 10;
const MAXIMO_DE_CARTOES = 4;
const MAXIMO_AO_VIVO = 3;

export type CartaoBombando = { tipo: 'sala' | 'mix' | 'diversao'; titulo: string; ocupacao: string; jogando: number; href: string; foto?: string; mapa?: string };

/** Os lugares com mais gente agora, para chamar quem chega a jogar. */
export async function bombandoAgora(
  bd: Bd,
  controlador: ControladorServidor,
  hostDaDiversao: string | undefined,
  senhaDosServidores: string = '',
): Promise<{ cartoes: CartaoBombando[]; aoVivo: Partida[]; naFilaDoMix: number; naDiversao: number }> {
  const [salas, mix, servidores, andamento] = await Promise.all([listarSalas(bd), verMix(bd), listarServidoresDaDiversao(bd), partidasEmAndamento(bd)]);
  const cartoes: CartaoBombando[] = [];

  for (const sala of salas) {
    const total = sala.membros.length;
    if (sala.partidaId || total >= TAMANHO_DA_SALA) continue;
    cartoes.push({ tipo: 'sala', titulo: `Sala do ${sala.nome}`, ocupacao: `${total}/${TAMANHO_DA_SALA}`, jogando: total, href: '/jogar?modo=competitivo' });
  }

  if (mix.total > 0) cartoes.push({ tipo: 'mix', titulo: 'Mix', ocupacao: `${mix.total}/${TOTAL_DO_MIX}`, jogando: mix.total, href: '/jogar?modo=mix' });

  // Cada servidor tem seu prazo de resposta: um fora do ar não segura a página.
  const situacoes = await Promise.all(
    servidores.map(async (servidor) => {
      const alvo = servidor.ativo ? alvoDoServidor(servidor, hostDaDiversao) : null;
      return { servidor, alvo, situacao: alvo ? await situacaoDoServidor(controlador, alvo) : null };
    }),
  );
  let naDiversao = 0;
  for (const { servidor, alvo, situacao } of situacoes) {
    if (!alvo || !situacao?.ligado || situacao.jogando === 0) continue;
    naDiversao += situacao.jogando;
    const mapa = mapaDoCartao(servidor, situacao);
    cartoes.push({
      tipo: 'diversao',
      titulo: MODOS_DE_DIVERSAO.find((modo) => modo.valor === servidor.modo)?.nome ?? 'Diversão',
      ocupacao: `${situacao.jogando}/${servidor.vagas}`,
      jogando: situacao.jogando,
      href: linkDeEntrar(alvo, senhaDosServidores),
      foto: mapa.foto,
      mapa: mapa.nome,
    });
  }

  return {
    cartoes: cartoes.sort((a, b) => b.jogando - a.jogando).slice(0, MAXIMO_DE_CARTOES),
    aoVivo: andamento.filter((partida) => partida.estado === 'ao_vivo').slice(0, MAXIMO_AO_VIVO),
    naFilaDoMix: mix.total,
    naDiversao,
  };
}
