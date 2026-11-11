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
      { nome: 'Regras', href: '/jogo#regras' },
    ],
  },
  {
    nome: 'Ranking',
    href: '/ranking',
    filhos: [
      { nome: 'Comunidade', href: '/ranking' },
      { nome: 'Mix do mês', href: '/ranking?aba=mix' },
      { nome: 'MVPs', href: '/ranking?aba=mvps' },
    ],
  },
  { nome: 'Comunidade', href: '/comunidade', filhos: [{ nome: 'Amigos', href: '/comunidade' }] },
  {
    nome: 'Clãs',
    href: '/clas',
    filhos: [
      { nome: 'Meu clã', href: '/clas' },
      { nome: 'Procurar clãs', href: '/clas?aba=procurar' },
      { nome: 'Ranking de clãs', href: '/clas?aba=ranking' },
      { nome: 'Criar clã', href: '/clas?aba=criar' },
    ],
  },
  { nome: 'Magnata Shop', emBreve: true, destaque: true },
];

const MAGNATA_SHOP: ItemDoMenu = {
  nome: 'Magnata Shop',
  href: '/loja',
  destaque: true,
  filhos: [
    { nome: 'Loja', href: '/loja' },
    { nome: 'Minhas compras', href: '/compras' },
    { nome: 'Apoie o clube', href: '/apoio' },
  ],
};

// O baú fica ao lado da loja, a pedido do dono: é onde a pessoa escolhe o que usar.
const BAU: ItemDoMenu = { nome: 'Baú', href: '/bau' };

/** Enquanto a loja não abre para todos (só o Adm vê), Magnata Shop continua "em breve" e o Baú não aparece. */
export function itensDoMenu(loja: boolean): ItemDoMenu[] {
  if (!loja) return ITENS_DO_MENU;
  return [...ITENS_DO_MENU.map((item) => (item.nome === MAGNATA_SHOP.nome ? MAGNATA_SHOP : item)), BAU];
}

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
