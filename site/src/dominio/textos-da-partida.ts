import type { Partida } from '@/bd/esquema';

export function nomeDaPartida(partida: Pick<Partida, 'tipo' | 'numero'>): string {
  return `${partida.tipo === 'mix' ? 'Mix' : 'Desafio'} #${partida.numero}`;
}

export function nomeDoMapa(mapa: string): string {
  const nome = mapa.replace(/^de_/, '');
  return nome.charAt(0).toUpperCase() + nome.slice(1);
}

export const TEXTOS_DO_ESTADO: Record<Partida['estado'], { etiqueta: string; explicacao: string }> = {
  aguardando_servidor: { etiqueta: 'Aguardando servidor', explicacao: 'Assim que um servidor ficar livre, a partida começa a carregar.' },
  carregando: { etiqueta: 'Carregando', explicacao: 'O servidor está preparando a partida.' },
  aguardando_jogadores: { etiqueta: 'Aguardando jogadores', explicacao: 'O servidor está pronto. Todos precisam entrar para começar.' },
  ao_vivo: { etiqueta: 'Ao vivo', explicacao: 'A partida está rolando.' },
  encerrada: { etiqueta: 'Encerrada', explicacao: 'A partida terminou.' },
  cancelada: { etiqueta: 'Cancelada', explicacao: 'A partida foi cancelada e não conta nas estatísticas.' },
};
