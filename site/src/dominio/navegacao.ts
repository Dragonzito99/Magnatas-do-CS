/** Um item do menu de cima. Sem `href`, aparece com a etiqueta "em breve" e não leva a lugar nenhum. */
export type LinkDoMenu = { nome: string; href: string };
export type ItemDoMenu = { nome: string; href?: string; emBreve?: boolean; destaque?: boolean; filhos?: LinkDoMenu[] };

// As áreas da equipe ficam no Painel ADM, e o convite vai para o menu da conta.
export const ITENS_DO_MENU: ItemDoMenu[] = [
  { nome: 'Notícias', href: '/noticias' },
  {
    nome: 'Jogo',
    href: '/jogo',
    filhos: [
      { nome: 'Como funciona', href: '/jogo#como-funciona' },
      { nome: 'Modos', href: '/jogo#modos' },
      { nome: 'Mapas', href: '/jogo#mapas' },
      { nome: 'Patentes', href: '/patentes' },
    ],
  },
  { nome: 'Ranking', href: '/ranking' },
  { nome: 'Convites', href: '/convites' },
  { nome: 'Clãs', emBreve: true },
  { nome: 'Magnata Shop', emBreve: true, destaque: true },
];

// Salas, mix e Diversão ficam juntos na tela Jogar, com filtros.
export const DESTINO_DO_JOGAR = '/jogar';

/** Acende na própria página, nas de dentro dela e nas do submenu que ficam em outro endereço. */
export function itemAtivo(caminho: string, href: string, filhos: LinkDoMenu[] = []): boolean {
  const dentro = (destino: string) => caminho === destino || caminho.startsWith(`${destino}/`);
  return dentro(href) || filhos.some((filho) => !filho.href.includes('#') && dentro(filho.href));
}

export type ResumoDaSala = { nome: string; membros: number; emPartida: boolean };

/** Fora da tela Jogar, quem está numa sala vê um aviso para voltar. Em partida, o aviso da partida já cuida disso. */
export function mostrarAvisoDeSala(caminho: string, sala: ResumoDaSala | null): boolean {
  return sala !== null && !sala.emPartida && !itemAtivo(caminho, DESTINO_DO_JOGAR);
}
