import { expect, test } from 'vitest';
import type { ServidorDiversao } from '@/bd/esquema';
import { controladorFalso } from './controlador';
import { diversaoDoAmbiente } from './diversao-do-ambiente';

const fantasma = { nomeNoServidor: 'fantasma', host: '10.0.0.6', porta: 27021 } as ServidorDiversao;

test('em desenvolvimento com DIVERSAO_CONTROLE=falso, o servidor "sobe" 5 segundos depois de ligar', async () => {
  let agora = 1_000_000;
  const diversao = diversaoDoAmbiente(controladorFalso(), { NODE_ENV: 'development', DIVERSAO_CONTROLE: 'falso' }, () => agora);
  expect(await diversao.perguntar(fantasma)).toEqual({ ligado: false, jogando: 0 });
  await diversao.controle.ligar('fantasma');
  agora += 4_999;
  expect((await diversao.perguntar(fantasma)).ligado).toBe(false);
  agora += 1;
  expect(await diversao.perguntar(fantasma)).toEqual({ ligado: true, jogando: 0 });
  expect((await diversao.situacaoDaTela(fantasma)).ligado).toBe(true);
  await diversao.controle.desligar('fantasma');
  expect((await diversao.perguntar(fantasma)).ligado).toBe(false);
});

test('em produção o controle falso nunca vale, mesmo com a variável', async () => {
  const controlador = controladorFalso({ conectados: { '10.0.0.6': ['76561198000000001'] } });
  const diversao = diversaoDoAmbiente(controlador, { NODE_ENV: 'production', DIVERSAO_CONTROLE: 'falso' });
  await expect(diversao.controle.ligar('fantasma; rm -rf /')).rejects.toThrow('Nome de servidor inválido');
  expect(await diversao.perguntar(fantasma)).toEqual({ ligado: true, jogando: 1 });
  expect(controlador.chamadas).toContainEqual({ acao: 'jogadoresConectados', host: '10.0.0.6' });
});
