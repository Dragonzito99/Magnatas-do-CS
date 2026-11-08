import type { Partida } from '@/bd/esquema';
import type { SituacaoDaGravacao } from './ficha';

export const NOME_DA_GRAVACAO: Record<Exclude<SituacaoDaGravacao, 'disponivel'>, string> = {
  aguardando: 'Gravação chegando',
  sem: 'Sem gravação',
  apagada: 'Gravação apagada',
};

export type FaseDaPartida = 'aceite' | 'vetos' | 'entrar' | 'vivo' | 'fim';

/** As cinco fases que a tela da partida mostra no alto, na ordem em que acontecem. */
export const FASES_DA_PARTIDA: readonly { fase: FaseDaPartida; nome: string }[] = [
  { fase: 'aceite', nome: 'Aceite' },
  { fase: 'vetos', nome: 'Vetos' },
  { fase: 'entrar', nome: 'Entrar no servidor' },
  { fase: 'vivo', nome: 'Ao vivo' },
  { fase: 'fim', nome: 'Fim' },
];

const FASE_DO_ESTADO: Record<Partida['estado'], FaseDaPartida> = {
  aguardando_aceite: 'aceite',
  vetando: 'vetos',
  aguardando_servidor: 'entrar',
  carregando: 'entrar',
  aguardando_jogadores: 'entrar',
  ao_vivo: 'vivo',
  encerrada: 'fim',
  cancelada: 'fim',
};

export function faseDaPartida(estado: Partida['estado']): FaseDaPartida {
  return FASE_DO_ESTADO[estado];
}

export function nomeDaPartida(partida: Pick<Partida, 'tipo' | 'numero'>): string {
  return `${partida.tipo === 'mix' ? 'Mix' : 'Desafio'} #${partida.numero}`;
}

/** Sem mapa ainda: a partida está no aceite ou nos vetos. */
export function nomeDoMapa(mapa: string | null): string {
  if (!mapa) return 'Mapa a definir';
  const nome = mapa.replace(/^de_/, '');
  return nome.charAt(0).toUpperCase() + nome.slice(1);
}

export const TEXTOS_DO_ESTADO: Record<Partida['estado'], { etiqueta: string; explicacao: string }> = {
  aguardando_aceite: { etiqueta: 'Aguardando aceite', explicacao: 'Todos têm 30 segundos para aceitar a partida.' },
  vetando: { etiqueta: 'Vetos', explicacao: 'Os líderes estão vetando os mapas. O que sobrar é o mapa da partida.' },
  aguardando_servidor: { etiqueta: 'Aguardando servidor', explicacao: 'Assim que um servidor ficar livre, a partida começa a carregar.' },
  carregando: { etiqueta: 'Carregando', explicacao: 'O servidor está preparando a partida.' },
  aguardando_jogadores: { etiqueta: 'Aguardando jogadores', explicacao: 'O servidor está pronto. Todos precisam entrar para começar.' },
  ao_vivo: { etiqueta: 'Ao vivo', explicacao: 'A partida está rolando.' },
  encerrada: { etiqueta: 'Encerrada', explicacao: 'A partida terminou.' },
  cancelada: { etiqueta: 'Cancelada', explicacao: 'A partida foi cancelada e não conta nas estatísticas.' },
};
