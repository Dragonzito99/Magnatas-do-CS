import { beforeEach, expect, test } from 'vitest';
import type { Bd } from '@/bd/conexao';
import { criarBancoDeTeste, criarUsuario, STEAM_A, STEAM_B, STEAM_C, STEAM_D } from '@/bd/teste';
import { controladorFalso } from '@/servidor-jogo/controlador';
import { conexaoDoMataMata, fiscalizarMataMata, servidorDoMataMata, situacaoDoMataMata, VAGAS_DO_MATA_MATA, zerarSituacaoGuardada } from './mata-mata';

const SERVIDOR = { host: '10.0.0.7', porta: 27016 };
const AGORA = new Date('2026-11-04T12:00:00Z');

let bd: Bd;

beforeEach(async () => {
  bd = await criarBancoDeTeste();
  zerarSituacaoGuardada();
});

test('sem endereço configurado, o modo fica desligado', () => {
  expect(servidorDoMataMata({})).toBeNull();
  expect(servidorDoMataMata({ DIVERSAO_HOST: '  ', DIVERSAO_PORTA: '27016' })).toBeNull();
});

test('o endereço vem do ambiente, com a porta do modo como padrão', () => {
  expect(servidorDoMataMata({ DIVERSAO_HOST: '10.0.0.7' })).toEqual({ host: '10.0.0.7', porta: 27016 });
  expect(servidorDoMataMata({ DIVERSAO_HOST: '10.0.0.7', DIVERSAO_PORTA: '27020' })).toEqual({ host: '10.0.0.7', porta: 27020 });
});

test('porta inválida não vira endereço', () => {
  expect(servidorDoMataMata({ DIVERSAO_HOST: '10.0.0.7', DIVERSAO_PORTA: 'abc' })).toBeNull();
});

test('o link de conectar leva o endereço e a senha', () => {
  expect(conexaoDoMataMata(SERVIDOR, 'se nha')).toBe('steam://connect/10.0.0.7:27016/se%20nha');
});

test('quem é membro ativo fica no servidor', async () => {
  await criarUsuario(bd, { estado: 'ativo', steamid64: STEAM_A });
  const controlador = controladorFalso({ conectados: { [SERVIDOR.host]: [STEAM_A] } });
  await fiscalizarMataMata(bd, controlador, SERVIDOR);
  expect(controlador.chamadas.filter((chamada) => chamada.acao === 'expulsar')).toEqual([]);
});

test('conta suspensa, banida, sem verificação ou desconhecida é derrubada', async () => {
  await criarUsuario(bd, { estado: 'suspenso', steamid64: STEAM_A });
  await criarUsuario(bd, { estado: 'banido', steamid64: STEAM_B });
  await criarUsuario(bd, { estado: 'aguardando_verificacao', steamid64: STEAM_C });
  const controlador = controladorFalso({ conectados: { [SERVIDOR.host]: [STEAM_A, STEAM_B, STEAM_C, STEAM_D] } });
  await fiscalizarMataMata(bd, controlador, SERVIDOR);
  const derrubados = controlador.chamadas.flatMap((chamada) => (chamada.acao === 'expulsar' ? [chamada.steamid64] : []));
  expect(derrubados.sort()).toEqual([STEAM_A, STEAM_B, STEAM_C, STEAM_D].sort());
});

test('servidor vazio não faz nada', async () => {
  const controlador = controladorFalso({ conectados: { [SERVIDOR.host]: [] } });
  await fiscalizarMataMata(bd, controlador, SERVIDOR);
  expect(controlador.chamadas.filter((chamada) => chamada.acao === 'expulsar')).toEqual([]);
});

test('servidor fora do ar não dá erro, porque o modo pode estar desligado', async () => {
  await expect(fiscalizarMataMata(bd, controladorFalso({ hostsComFalha: [SERVIDOR.host] }), SERVIDOR)).resolves.toBeUndefined();
});

test('a situação mostra quantos estão jogando', async () => {
  const controlador = controladorFalso({ conectados: { [SERVIDOR.host]: [STEAM_A, STEAM_B] } });
  expect(await situacaoDoMataMata(controlador, SERVIDOR, AGORA)).toEqual({ ligado: true, jogando: 2, vagas: VAGAS_DO_MATA_MATA });
});

test('com o servidor fora do ar, a situação é desligado', async () => {
  const controlador = controladorFalso({ hostsComFalha: [SERVIDOR.host] });
  expect(await situacaoDoMataMata(controlador, SERVIDOR, AGORA)).toEqual({ ligado: false, jogando: 0, vagas: VAGAS_DO_MATA_MATA });
});

test('sem endereço configurado, a situação é desligado', async () => {
  expect(await situacaoDoMataMata(controladorFalso(), null, AGORA)).toEqual({ ligado: false, jogando: 0, vagas: VAGAS_DO_MATA_MATA });
});

test('a situação fica guardada por 10 segundos, para não perguntar ao servidor a cada página aberta', async () => {
  const conectados = { [SERVIDOR.host]: [STEAM_A] };
  const controlador = controladorFalso({ conectados });
  await situacaoDoMataMata(controlador, SERVIDOR, AGORA);
  conectados[SERVIDOR.host] = [STEAM_A, STEAM_B];
  const logoDepois = new Date(AGORA.getTime() + 9_000);
  expect((await situacaoDoMataMata(controlador, SERVIDOR, logoDepois)).jogando).toBe(1);
  const maisTarde = new Date(AGORA.getTime() + 11_000);
  expect((await situacaoDoMataMata(controlador, SERVIDOR, maisTarde)).jogando).toBe(2);
});

test('servidor que não responde a tempo conta como desligado, para a página não ficar presa', async () => {
  const controlador = { ...controladorFalso(), jogadoresConectados: () => new Promise<string[]>(() => undefined) };
  expect(await situacaoDoMataMata(controlador, SERVIDOR, AGORA, 10)).toEqual({ ligado: false, jogando: 0, vagas: VAGAS_DO_MATA_MATA });
});
