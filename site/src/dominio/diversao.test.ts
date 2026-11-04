import { eq, sql } from 'drizzle-orm';
import { beforeEach, expect, test } from 'vitest';
import type { Bd } from '@/bd/conexao';
import { servidoresDiversao } from '@/bd/esquema';
import { criarBancoDeTeste, criarUsuario, STEAM_A, STEAM_B, STEAM_C, STEAM_D } from '@/bd/teste';
import { controladorFalso } from '@/servidor-jogo/controlador';
import {
  alvoDoServidor,
  comandoDeConectar,
  estadoDoCartao,
  fiscalizarDiversao,
  fiscalizarServidor,
  lerModo,
  linkDeEntrar,
  listarServidoresDaDiversao,
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
  expect(perguntados.sort()).toEqual(['10.0.0.1', '10.0.0.2', '10.0.0.3', '10.0.0.4']);
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
