import { expect, test } from 'vitest';
import { STEAM_A } from '@/bd/teste';
import { comandoDeExpulsar, controladorRcon } from './controlador';

const SERVIDOR = { host: '10.0.0.1', porta: 27015 };
const AMBIENTE = { RCON_SENHA: 'senha', SITE_URL: 'https://site.test', SERVIDOR_TOKEN: 'token' };

function conexaoFalsa(resposta = '') {
  const enviados: string[] = [];
  const estado = { fechada: false };
  const conexao = {
    send: async (comando: string) => {
      enviados.push(comando);
      return resposta;
    },
    end: async () => {
      estado.fechada = true;
    },
  };
  return { conexao, enviados, estado };
}

test('carregar pede a configuração da partida, com o token no cabeçalho', async () => {
  const { conexao, enviados, estado } = conexaoFalsa();
  await controladorRcon(AMBIENTE, async () => conexao).carregarPartida(SERVIDOR, 42);
  expect(enviados).toEqual(['matchzy_loadmatch_url "https://site.test/api/servidor/partidas/42/config" "Authorization" "Bearer token"']);
  expect(estado.fechada).toBe(true);
});

test('encerrar manda o comando que cancela a partida', async () => {
  const { conexao, enviados } = conexaoFalsa();
  await controladorRcon(AMBIENTE, async () => conexao).encerrarPartida(SERVIDOR);
  expect(enviados).toEqual(['get5_endmatch']);
});

test('o comando de expulsar usa o id único entre aspas', () => {
  expect(comandoDeExpulsar('76561198000000002')).toBe('kickid "[U:1:39734274]" "Removido pela equipe"');
});

test('o comando de expulsar recusa o que não é SteamID', () => {
  expect(() => comandoDeExpulsar('1; quit')).toThrow();
  expect(() => comandoDeExpulsar('0x10')).toThrow();
});

test('expulsar manda o kickid da pessoa', async () => {
  const { conexao, enviados } = conexaoFalsa();
  await controladorRcon(AMBIENTE, async () => conexao).expulsar(SERVIDOR, STEAM_A);
  expect(enviados).toEqual([comandoDeExpulsar(STEAM_A)]);
});

test('expulsar quem não está no servidor não dá erro', async () => {
  const { conexao } = conexaoFalsa('uniqueid "[U:1:39734274]" not found');
  await expect(controladorRcon(AMBIENTE, async () => conexao).expulsar(SERVIDOR, STEAM_A)).resolves.toBeUndefined();
});

test('erro de envio sobe, e a conexão fecha mesmo assim', async () => {
  const { conexao, estado } = conexaoFalsa();
  conexao.send = async () => {
    throw new Error('Timeout');
  };
  await expect(controladorRcon(AMBIENTE, async () => conexao).encerrarPartida(SERVIDOR)).rejects.toThrow('Timeout');
  expect(estado.fechada).toBe(true);
});

test('erro ao fechar a conexão não atrapalha quem já terminou', async () => {
  const { conexao } = conexaoFalsa();
  conexao.end = async () => {
    throw new Error('já fechada');
  };
  await expect(controladorRcon(AMBIENTE, async () => conexao).encerrarPartida(SERVIDOR)).resolves.toBeUndefined();
});

test('sem senha ou token configurados, recusa antes de conectar', async () => {
  let conectou = false;
  const conectar = async () => {
    conectou = true;
    return conexaoFalsa().conexao;
  };
  await expect(controladorRcon({ ...AMBIENTE, RCON_SENHA: '' }, conectar).encerrarPartida(SERVIDOR)).rejects.toThrow(/RCON_SENHA/);
  await expect(controladorRcon({ ...AMBIENTE, SERVIDOR_TOKEN: '' }, conectar).carregarPartida(SERVIDOR, 1)).rejects.toThrow(/SERVIDOR_TOKEN/);
  expect(conectou).toBe(false);
});
