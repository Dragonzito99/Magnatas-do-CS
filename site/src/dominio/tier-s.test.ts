import { beforeEach, expect, test } from 'vitest';
import type { Bd } from '@/bd/conexao';
import { criarBancoDeTeste } from '@/bd/teste';
import amostraDeJogos from './exemplos/liquipedia-matches.json';
import amostraDeTorneios from './exemplos/liquipedia-s-tier.json';
import { atualizarTierS, jogosBrasileiros, lerDatas, lerJogos, lerTorneiosSTier, TIMES_BRASILEIROS, tierSDaTela } from './tier-s';

let bd: Bd;
const AGORA = new Date('2026-11-07T15:00:00Z');
const minutos = (n: number) => new Date(AGORA.getTime() + n * 60_000);
const htmlDe = (amostra: { parse: { text: string } }) => amostra.parse.text;

beforeEach(async () => {
  bd = await criarBancoDeTeste();
});

test('a lista de times brasileiros', () => {
  expect(TIMES_BRASILEIROS).toEqual(['FURIA', 'MIBR', 'paiN', 'Imperial', 'Legacy', 'Fluxo', 'RED Canids', 'ODDIK']);
});

test.each([
  ['Nov 02–08, 2026', '2026-11-02', '2026-11-08'],
  ['Nov 24 – Dec 13, 2026', '2026-11-24', '2026-12-13'],
  ['Dec 30, 2026 – Jan 05, 2027', '2026-12-30', '2027-01-05'],
  ['Nov 08, 2026', '2026-11-08', '2026-11-08'],
])('lerDatas(%s)', (texto, inicio, fim) => {
  expect(lerDatas(texto)).toEqual({ inicio, fim });
});

test.each(['Postponed', 'TBA', ''])('lerDatas(%j) não entende e devolve null', (texto) => {
  expect(lerDatas(texto)).toBeNull();
});

test('na amostra, o IEM Beijing 2026 está em andamento em 07/11 e o BLAST Rivals começa em 4 dias', () => {
  const torneios = lerTorneiosSTier(htmlDe(amostraDeTorneios), AGORA);
  expect(torneios[0]).toEqual({
    nome: 'Intel Extreme Masters Beijing 2026',
    pagina: '/counterstrike/Intel_Extreme_Masters/2026/Beijing',
    inicio: '2026-11-02',
    fim: '2026-11-08',
    premiacao: '$1,250,000',
    situacao: 'andamento',
  });
  expect(torneios.find((torneio) => torneio.pagina === '/counterstrike/BLAST/Rivals/2026/Fall')).toMatchObject({ situacao: 'em_breve', inicio: '2026-11-11' });
  expect(torneios.every((torneio) => torneio.fim >= '2026-11-07' && torneio.inicio <= '2026-11-14')).toBe(true);
});

test('lerJogos tira os times, o torneio sem âncora, a hora e o placar', () => {
  const jogos = lerJogos(htmlDe(amostraDeJogos));
  expect(jogos.length).toBeGreaterThan(50);
  expect(jogos).toContainEqual({
    pagina: '/counterstrike/BLAST/Rivals/2026/Fall',
    torneio: expect.any(String),
    time1: 'Legacy',
    time2: 'FURIA',
    placar: null,
    quando: new Date(1794362400 * 1000),
  });
  expect(jogos).toContainEqual(expect.objectContaining({ time1: 'FURIA', time2: 'NAVI', placar: '2:1', pagina: '/counterstrike/Intel_Extreme_Masters/2026/Beijing' }));
});

test('jogosBrasileiros fica só com Tier S e time brasileiro', () => {
  const torneios = lerTorneiosSTier(htmlDe(amostraDeTorneios), AGORA);
  const jogos = jogosBrasileiros(lerJogos(htmlDe(amostraDeJogos)), torneios);
  expect(jogos.length).toBeGreaterThan(0);
  expect(jogos.every((jogo) => [jogo.time1, jogo.time2].some((time) => (TIMES_BRASILEIROS as readonly string[]).includes(time)))).toBe(true);
  expect(jogos.some((jogo) => jogo.pagina.startsWith('/counterstrike/Gamers_Club'))).toBe(false);
  expect(jogos.some((jogo) => jogo.time1 === 'Legacy' && jogo.time2 === 'FURIA')).toBe(true);
});

function pedidoFalso(respostas: (unknown | Error)[]) {
  const pedidos: Record<string, string>[] = [];
  const pedir = async (parametros: Record<string, string>) => {
    pedidos.push(parametros);
    const resposta = respostas.shift();
    if (resposta instanceof Error) throw resposta;
    return resposta;
  };
  return { pedir, pedidos };
}

test('atualizarTierS grava torneios e jogos, e a tela lê sem pedir nada', async () => {
  const { pedir, pedidos } = pedidoFalso([amostraDeTorneios, amostraDeJogos]);
  await atualizarTierS(bd, pedir, AGORA);
  expect(pedidos.map((pedido) => pedido.page)).toEqual(['S-Tier_Tournaments', 'Liquipedia:Matches']);
  expect(pedidos.every((pedido) => pedido.action === 'parse')).toBe(true);
  const tela = await tierSDaTela(bd);
  expect(tela?.torneios[0].nome).toBe('Intel Extreme Masters Beijing 2026');
  expect(tela?.jogos.length).toBeGreaterThan(0);
  expect(tela?.atualizadoEm).toEqual(AGORA);
});

test('dentro de 10 minutos não pede nada de novo', async () => {
  const { pedir, pedidos } = pedidoFalso([amostraDeTorneios, amostraDeJogos, amostraDeTorneios, amostraDeJogos]);
  await atualizarTierS(bd, pedir, AGORA);
  await atualizarTierS(bd, pedir, minutos(9));
  expect(pedidos).toHaveLength(2);
  await atualizarTierS(bd, pedir, minutos(11));
  expect(pedidos).toHaveLength(4);
});

test('erro ou resposta estranha mantém o último dado bom', async () => {
  const { pedir } = pedidoFalso([amostraDeTorneios, amostraDeJogos, new Error('429'), { error: { code: 'ratelimited' } }, { error: 1 }]);
  await atualizarTierS(bd, pedir, AGORA);
  await expect(atualizarTierS(bd, pedir, minutos(11))).resolves.toBeUndefined();
  await expect(atualizarTierS(bd, pedir, minutos(22))).resolves.toBeUndefined();
  const tela = await tierSDaTela(bd);
  expect(tela?.torneios[0].nome).toBe('Intel Extreme Masters Beijing 2026');
  expect(tela?.atualizadoEm).toEqual(AGORA);
});

test('sem dado nenhum ainda, a tela recebe null', async () => {
  expect(await tierSDaTela(bd)).toBeNull();
});

test('se a Liquipedia mudar o HTML, o último dado bom fica e nada é apagado', async () => {
  const mudado = { parse: { text: '<div class="layout-novo"><p>Nada que o leitor conheça</p></div>' } };
  const { pedir } = pedidoFalso([amostraDeTorneios, amostraDeJogos, mudado, amostraDeJogos, amostraDeTorneios, mudado]);
  await atualizarTierS(bd, pedir, AGORA);
  await atualizarTierS(bd, pedir, minutos(11));
  await atualizarTierS(bd, pedir, minutos(22));
  const tela = await tierSDaTela(bd);
  expect(tela?.torneios[0].nome).toBe('Intel Extreme Masters Beijing 2026');
  expect(tela?.jogos.length).toBeGreaterThan(0);
  expect(tela?.atualizadoEm).toEqual(AGORA);
});

test('na leitura, torneio que já acabou some e o que começou passa a "rolando agora"', async () => {
  const { pedir } = pedidoFalso([amostraDeTorneios, amostraDeJogos]);
  await atualizarTierS(bd, pedir, AGORA);
  const dias = (n: number) => new Date(AGORA.getTime() + n * 86_400_000);
  const depois = await tierSDaTela(bd, dias(5));
  expect(depois?.torneios.some((torneio) => torneio.pagina === '/counterstrike/Intel_Extreme_Masters/2026/Beijing')).toBe(false);
  expect(depois?.torneios.find((torneio) => torneio.pagina === '/counterstrike/BLAST/Rivals/2026/Fall')?.situacao).toBe('andamento');
  expect(depois?.jogos.some((jogo) => jogo.pagina === '/counterstrike/Intel_Extreme_Masters/2026/Beijing')).toBe(false);
});

test('só aceita links da própria wiki do CS na Liquipedia', () => {
  const html = `<table class="tournaments-listing"><tr><td></td><td></td><td><a href="@outro.site/x">Falso</a></td><td>Nov 02–08, 2026</td><td>$1</td></tr>
    <tr><td></td><td></td><td><a href="/counterstrike/Bom">Bom</a></td><td>Nov 02–08, 2026</td><td>$1</td></tr></table>`;
  expect(lerTorneiosSTier(html, AGORA).map((torneio) => torneio.nome)).toEqual(['Bom']);
  const jogos = `<div class="match-info"><div class="match-info-header-opponent"><span class="name">FURIA</span></div><div class="match-info-header-opponent"><span class="name">NAVI</span></div><div class="match-info-tournament"><a href="//outro.site/x">T</a></div></div>`;
  expect(lerJogos(jogos)).toEqual([]);
});

test('a rodada agendada de 10 em 10 minutos não é pulada por alguns segundos de diferença', async () => {
  const { pedir, pedidos } = pedidoFalso([amostraDeTorneios, amostraDeJogos, amostraDeTorneios, amostraDeJogos]);
  await atualizarTierS(bd, pedir, AGORA);
  await atualizarTierS(bd, pedir, new Date(AGORA.getTime() + 9 * 60_000 + 45_000));
  expect(pedidos).toHaveLength(4);
});
