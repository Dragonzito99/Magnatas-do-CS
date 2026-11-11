import { eq, sql } from 'drizzle-orm';
import { beforeEach, expect, test } from 'vitest';
import type { Bd } from '@/bd/conexao';
import { estadosDaDiversao, servidoresDiversao } from '@/bd/esquema';
import { criarBancoDeTeste, criarUsuario, STEAM_A, STEAM_B, STEAM_C, STEAM_D } from '@/bd/teste';
import { controladorFalso } from '@/servidor-jogo/controlador';
import {
  alvoDoServidor,
  comandoDeConectar,
  estadoDoCartao,
  fiscalizarDiversao,
  fiscalizarServidor,
  fotoDoMapa,
  lerModo,
  linkDeEntrar,
  listarServidoresDaDiversao,
  mapaDoCartao,
  perguntarAoServidor,
  situacaoDoServidor,
  zerarSituacoesGuardadas,
} from './diversao';

const SERVIDOR = { host: '10.0.0.7', porta: 27016 };
const AGORA = new Date('2026-11-04T12:00:00Z');

let bd: Bd;

/** Cada linha cadastrada ganha um host próprio, 10.0.0.<ordem>, porque o controlador falso separa por host. */
async function darHostsDiferentes() {
  await bd.update(servidoresDiversao).set({ host: sql`'10.0.0.' || ${servidoresDiversao.ordem}` });
}

beforeEach(async () => {
  bd = await criarBancoDeTeste();
  zerarSituacoesGuardadas();
});

test('a lista de servidores vem em ordem', async () => {
  const servidores = await listarServidoresDaDiversao(bd);
  expect(servidores.map((servidor) => servidor.ordem)).toEqual([1, 2, 3, 4, 5, 6]);
});

test.each(['cada_um', 'equipe', 'mutacao', 'fantasma'] as const)('o modo %s é aceito', (modo) => {
  expect(lerModo(modo)).toBe(modo);
});

test.each([undefined, '', 'xyz'])('modo %s mostra todos', (valor) => {
  expect(lerModo(valor)).toBeNull();
});

test('o host do servidor vence o endereço padrão', () => {
  expect(alvoDoServidor({ host: '10.0.0.9', porta: 27017 }, '10.0.0.7')).toEqual({ host: '10.0.0.9', porta: 27017 });
});

test('sem host próprio, o servidor usa o endereço padrão', () => {
  expect(alvoDoServidor({ host: null, porta: 27017 }, ' 10.0.0.7 ')).toEqual({ host: '10.0.0.7', porta: 27017 });
});

test('sem nenhum endereço, não há para onde conectar', () => {
  expect(alvoDoServidor({ host: null, porta: 27017 }, undefined)).toBeNull();
  expect(alvoDoServidor({ host: '  ', porta: 27017 }, '  ')).toBeNull();
});

test('o link de entrar leva o endereço e a senha', () => {
  expect(linkDeEntrar(SERVIDOR, 'se nha')).toBe('steam://connect/10.0.0.7:27016/se%20nha');
});

test('o comando de copiar leva a senha e o endereço', () => {
  expect(comandoDeConectar({ host: '10.0.0.7', porta: 27017 }, 'abc')).toBe('password "abc"; connect 10.0.0.7:27017');
});

test.each(['a"b', 'a;b', 'a\nb'])('senha %j não gera comando, porque o console do jogo o quebraria', (senha) => {
  expect(comandoDeConectar(SERVIDOR, senha)).toBeNull();
});

test('o cartão de servidor inativo é em breve, mesmo que ele responda', () => {
  expect(estadoDoCartao({ ativo: false, vagas: 16 }, { ligado: true, jogando: 3 })).toBe('em_breve');
});

test('o cartão mostra fora do ar, cheio ou aberto', () => {
  const servidor = { ativo: true, vagas: 16 };
  expect(estadoDoCartao(servidor, { ligado: false, jogando: 0 })).toBe('fora_do_ar');
  expect(estadoDoCartao(servidor, { ligado: true, jogando: 16 })).toBe('cheio');
  expect(estadoDoCartao(servidor, { ligado: true, jogando: 17 })).toBe('cheio');
  expect(estadoDoCartao(servidor, { ligado: true, jogando: 15 })).toBe('aberto');
});

test('quem é membro ativo fica no servidor', async () => {
  await criarUsuario(bd, { estado: 'ativo', steamid64: STEAM_A });
  const controlador = controladorFalso({ conectados: { [SERVIDOR.host]: [STEAM_A] } });
  await fiscalizarServidor(bd, controlador, SERVIDOR);
  expect(controlador.chamadas.filter((chamada) => chamada.acao === 'expulsar')).toEqual([]);
});

test('conta suspensa, banida, sem verificação ou desconhecida é derrubada', async () => {
  await criarUsuario(bd, { estado: 'suspenso', steamid64: STEAM_A });
  await criarUsuario(bd, { estado: 'banido', steamid64: STEAM_B });
  await criarUsuario(bd, { estado: 'aguardando_verificacao', steamid64: STEAM_C });
  const controlador = controladorFalso({ conectados: { [SERVIDOR.host]: [STEAM_A, STEAM_B, STEAM_C, STEAM_D] } });
  await fiscalizarServidor(bd, controlador, SERVIDOR);
  const derrubados = controlador.chamadas.flatMap((chamada) => (chamada.acao === 'expulsar' ? [chamada.steamid64] : []));
  expect(derrubados.sort()).toEqual([STEAM_A, STEAM_B, STEAM_C, STEAM_D].sort());
});

test('servidor vazio não faz nada', async () => {
  const controlador = controladorFalso({ conectados: { [SERVIDOR.host]: [] } });
  await fiscalizarServidor(bd, controlador, SERVIDOR);
  expect(controlador.chamadas.filter((chamada) => chamada.acao === 'expulsar')).toEqual([]);
});

test('servidor fora do ar não dá erro, porque ele pode estar desligado', async () => {
  await expect(fiscalizarServidor(bd, controladorFalso({ hostsComFalha: [SERVIDOR.host] }), SERVIDOR)).resolves.toBeUndefined();
});

test('a fiscalização só pergunta aos servidores ativos', async () => {
  await darHostsDiferentes();
  const controlador = controladorFalso();
  await fiscalizarDiversao(bd, controlador, undefined);
  const perguntados = controlador.chamadas.flatMap((chamada) => (chamada.acao === 'jogadoresConectados' ? [chamada.host] : []));
  expect(perguntados.sort()).toEqual(['10.0.0.1', '10.0.0.2', '10.0.0.3', '10.0.0.4', '10.0.0.5', '10.0.0.6']);
});

test('a fiscalização não pergunta a servidor desativado', async () => {
  await darHostsDiferentes();
  await bd.update(servidoresDiversao).set({ ativo: false }).where(eq(servidoresDiversao.ordem, 2));
  const controlador = controladorFalso();
  await fiscalizarDiversao(bd, controlador, undefined);
  expect(controlador.chamadas).not.toContainEqual({ acao: 'jogadoresConectados', host: '10.0.0.2' });
});

test('um servidor travado não prende a fiscalização dos outros', async () => {
  await darHostsDiferentes();
  const falso = controladorFalso({ conectados: { '10.0.0.2': [STEAM_D] } });
  const controlador = {
    ...falso,
    jogadoresConectados: (alvo: { host: string; porta: number }) =>
      alvo.host === '10.0.0.1' ? new Promise<string[]>(() => undefined) : falso.jogadoresConectados(alvo),
  };
  await fiscalizarDiversao(bd, controlador, undefined, 10);
  expect(falso.chamadas).toContainEqual({ acao: 'expulsar', host: '10.0.0.2', steamid64: STEAM_D });
});

test('sem endereço, a fiscalização não pergunta nada', async () => {
  const controlador = controladorFalso();
  await fiscalizarDiversao(bd, controlador, undefined);
  expect(controlador.chamadas).toEqual([]);
});

test('a situação mostra quantos estão jogando', async () => {
  const controlador = controladorFalso({ conectados: { [SERVIDOR.host]: [STEAM_A, STEAM_B] } });
  expect(await situacaoDoServidor(controlador, SERVIDOR, AGORA)).toEqual({ ligado: true, jogando: 2 });
});

test('com o servidor fora do ar, a situação é desligado', async () => {
  const controlador = controladorFalso({ hostsComFalha: [SERVIDOR.host] });
  expect(await situacaoDoServidor(controlador, SERVIDOR, AGORA)).toEqual({ ligado: false, jogando: 0 });
});

test('sem endereço, a situação é desligado', async () => {
  expect(await situacaoDoServidor(controladorFalso(), null, AGORA)).toEqual({ ligado: false, jogando: 0 });
});

test('a situação fica guardada por 10 segundos, para não perguntar ao servidor a cada página aberta', async () => {
  const conectados = { [SERVIDOR.host]: [STEAM_A] };
  const controlador = controladorFalso({ conectados });
  await situacaoDoServidor(controlador, SERVIDOR, AGORA);
  conectados[SERVIDOR.host] = [STEAM_A, STEAM_B];
  const logoDepois = new Date(AGORA.getTime() + 9_000);
  expect((await situacaoDoServidor(controlador, SERVIDOR, logoDepois)).jogando).toBe(1);
  const maisTarde = new Date(AGORA.getTime() + 11_000);
  expect((await situacaoDoServidor(controlador, SERVIDOR, maisTarde)).jogando).toBe(2);
});

test('a situação de um servidor não aparece em outro de mesmo host', async () => {
  const controlador = {
    ...controladorFalso(),
    jogadoresConectados: async (alvo: { host: string; porta: number }) => (alvo.porta === 27016 ? [STEAM_A] : [STEAM_A, STEAM_B]),
  };
  expect((await situacaoDoServidor(controlador, { host: '10.0.0.7', porta: 27016 }, AGORA)).jogando).toBe(1);
  expect((await situacaoDoServidor(controlador, { host: '10.0.0.7', porta: 27017 }, AGORA)).jogando).toBe(2);
});

test('servidor que não responde a tempo conta como desligado, para a página não ficar presa', async () => {
  const controlador = { ...controladorFalso(), jogadoresConectados: () => new Promise<string[]>(() => undefined) };
  expect(await situacaoDoServidor(controlador, SERVIDOR, AGORA, 10)).toEqual({ ligado: false, jogando: 0 });
});

test('a situação traz o mapa que está rodando', async () => {
  const controlador = controladorFalso({ conectados: { '10.0.0.7': [STEAM_A] }, mapas: { '10.0.0.7': 'de_luxville' } });
  expect(await situacaoDoServidor(controlador, SERVIDOR, AGORA)).toEqual({ ligado: true, jogando: 1, mapa: 'de_luxville' });
});

test('o cartão mostra o mapa atual, e o cadastrado quando não o conhece ou o servidor está fora', () => {
  const servidor = { mapa: 'Transport Ship', foto: '/mapas/transport-ship.webp' };
  expect(mapaDoCartao(servidor, { ligado: true, jogando: 0, mapa: 'de_luxville' })).toEqual({ nome: 'Luxville', foto: '/mapas/luxville.webp' });
  expect(mapaDoCartao(servidor, { ligado: true, jogando: 0, mapa: 'de_estranho' })).toEqual({ nome: 'de_estranho', foto: '/mapas/transport-ship.webp' });
  expect(mapaDoCartao(servidor, { ligado: false, jogando: 0 })).toEqual({ nome: 'Transport Ship', foto: '/mapas/transport-ship.webp' });
});

test('servidor sob demanda desligado mostra o botão de ligar; ligando mostra a espera', () => {
  const servidor = { ativo: true, vagas: 16, sobDemanda: true, nomeNoServidor: 'awp' };
  const desligado = { ligado: false, jogando: 0 };
  expect(estadoDoCartao(servidor, desligado, 'desligado')).toBe('desligado_sob_demanda');
  expect(estadoDoCartao(servidor, desligado)).toBe('desligado_sob_demanda');
  expect(estadoDoCartao(servidor, desligado, 'ligando')).toBe('ligando');
  // Se o servidor já responde, vale o que ele diz, mesmo antes de a varredura confirmar.
  expect(estadoDoCartao(servidor, { ligado: true, jogando: 2 }, 'ligando')).toBe('aberto');
});

test('sem nome na VPS ou fora do sob demanda, desligado continua fora do ar', () => {
  const desligado = { ligado: false, jogando: 0 };
  expect(estadoDoCartao({ ativo: true, vagas: 16, sobDemanda: false, nomeNoServidor: 'awp' }, desligado, 'desligado')).toBe('fora_do_ar');
  expect(estadoDoCartao({ ativo: true, vagas: 16, sobDemanda: true, nomeNoServidor: null }, desligado, 'desligado')).toBe('fora_do_ar');
});

test('a fiscalização não pergunta a servidor que o site sabe estar desligado', async () => {
  await darHostsDiferentes();
  const linhas = await bd.select().from(servidoresDiversao);
  const porOrdem = (ordem: number) => linhas.find((linha) => linha.ordem === ordem)!.id;
  await bd.insert(estadosDaDiversao).values([
    { servidorId: porOrdem(1), estado: 'desligado' },
    { servidorId: porOrdem(2), estado: 'ligando' },
    { servidorId: porOrdem(3), estado: 'ligado' },
  ]);
  await bd.update(servidoresDiversao).set({ ativo: true });
  const controlador = controladorFalso();
  await fiscalizarDiversao(bd, controlador, undefined);
  const perguntados = controlador.chamadas.flatMap((chamada) => (chamada.acao === 'jogadoresConectados' ? [chamada.host] : []));
  // Sem estado ainda (4, 5 e 6), pergunta: pode estar ligado desde antes de o site acompanhar.
  expect(perguntados.sort()).toEqual(['10.0.0.2', '10.0.0.3', '10.0.0.4', '10.0.0.5', '10.0.0.6']);
});

test('perguntarAoServidor não guarda a resposta: a varredura sempre recebe a de agora', async () => {
  const controlador = controladorFalso({ conectados: { [SERVIDOR.host]: [STEAM_A] } });
  expect(await perguntarAoServidor(controlador, SERVIDOR)).toEqual({ ligado: true, jogando: 1 });
  expect(await perguntarAoServidor(controladorFalso({ hostsComFalha: [SERVIDOR.host] }), SERVIDOR)).toEqual({ ligado: false, jogando: 0 });
  expect(await perguntarAoServidor(controlador, null)).toEqual({ ligado: false, jogando: 0 });
  await perguntarAoServidor(controlador, SERVIDOR);
  expect(controlador.chamadas.filter((chamada) => chamada.acao === 'jogadoresConectados')).toHaveLength(2);
});

test('servidor ligado que não respondeu à página aparece trocando de mapa', () => {
  const servidor = { ativo: true, vagas: 16, sobDemanda: true, nomeNoServidor: 'awp' };
  expect(estadoDoCartao(servidor, { ligado: false, jogando: 0 }, 'ligado')).toBe('trocando_mapa');
  expect(estadoDoCartao(servidor, { ligado: true, jogando: 3 }, 'ligado')).toBe('aberto');
});

test('o cartão da Mutação mostra o Silent Village quando ele está rodando', () => {
  const servidor = { mapa: 'Biochemical Hotel', foto: '/mapas/biochemical-hotel.webp' };
  expect(mapaDoCartao(servidor, { ligado: true, jogando: 0, mapa: 'zm_silent_village' })).toEqual({ nome: 'Silent Village', foto: '/mapas/silent-village.webp' });
});

test('o cartão da Mutação mostra a Dust 2 de Halloween quando ela está rodando', () => {
  const servidor = { mapa: 'Silent Village', foto: '/mapas/silent-village.webp' };
  expect(mapaDoCartao(servidor, { ligado: true, jogando: 0, mapa: 'zm_dust2_halloween_zmbio' })).toEqual({ nome: 'Dust 2 Halloween', foto: '/mapas/dust2-halloween.webp' });
});

test('o cartão do Equipe mostra o Egypt quando ele está rodando', () => {
  const servidor = { mapa: 'Transport Ship', foto: '/mapas/transport-ship.webp' };
  expect(mapaDoCartao(servidor, { ligado: true, jogando: 0, mapa: 'egypt' })).toEqual({ nome: 'Egypt', foto: '/mapas/egypt.webp' });
});

test('a foto de um mapa conhecido vem do site; mapa sem foto fica sem', () => {
  expect(fotoDoMapa('de_mirage')).toBe('/mapas/mirage.webp');
  expect(fotoDoMapa('egypt')).toBe('/mapas/egypt.webp');
  expect(fotoDoMapa('de_inferno')).toBeNull();
  expect(fotoDoMapa(null)).toBeNull();
});
