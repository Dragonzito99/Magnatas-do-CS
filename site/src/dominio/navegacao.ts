/** Um item do menu de cima. Sem `href`, aparece com a etiqueta "em breve" e não leva a lugar nenhum. */
export type ItemDoMenu = { nome: string; href?: string; emBreve?: boolean; destaque?: boolean };

// As áreas da equipe ficam no Painel ADM, e o convite vai para o menu da conta.
export const ITENS_DO_MENU: ItemDoMenu[] = [
  { nome: 'Ranking', href: '/ranking' },
  { nome: 'Convites', href: '/convites' },
  { nome: 'Clãs', emBreve: true },
  { nome: 'Magnata Shop', emBreve: true, destaque: true },
];

// Salas, mix e Diversão ficam juntos na tela Jogar, com filtros.
export const DESTINO_DO_JOGAR = '/jogar';

export function itemAtivo(caminho: string, href: string): boolean {
  return caminho === href || caminho.startsWith(`${href}/`);
}

export type ResumoDaSala = { nome: string; membros: number; emPartida: boolean };

/** Fora da tela Jogar, quem está numa sala vê um aviso para voltar. Em partida, o aviso da partida já cuida disso. */
export function mostrarAvisoDeSala(caminho: string, sala: ResumoDaSala | null): boolean {
  return sala !== null && !sala.emPartida && !itemAtivo(caminho, DESTINO_DO_JOGAR);
}
