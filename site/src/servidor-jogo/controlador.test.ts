import { expect, test } from 'vitest';
import { STEAM_A } from '@/bd/teste';
import { comandoDeExpulsar, controladorRcon } from './controlador';

const SERVIDOR = { host: '10.0.0.1', porta: 27015 };
const AMBIENTE = { RCON_SENHA: 'senha', SITE_URL: 'https://site.test', SERVIDOR_TOKEN: 'token' };

const COMANDO_DE_CARREGAR = (numero: number) =>
  `matchzy_loadmatch_url "https://site.test/api/servidor/partidas/${numero}/config" "Authorization" "Bearer token"`;
const RECUSA = '[MatchZy] [LoadMatchDataCommand] A match is already setup with id: 3, cannot load a new match!';

function conexaoFalsa(resposta: string | string[] = '') {
  const enviados: string[] = [];
  const estado = { fechada: false };
  const conexao = {
    send: async (comando: string) => {
      const indice = enviados.push(comando) - 1;
      return Array.isArray(resposta) ? (resposta[indice] ?? '') : resposta;
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
  expect(enviados).toEqual([COMANDO_DE_CARREGAR(42)]);
  expect(estado.fechada).toBe(true);
});

test('com outra partida sobrando no servidor, carregar tira a sobra e tenta de novo', async () => {
  const { conexao, enviados } = conexaoFalsa([RECUSA, '', '']);
  await controladorRcon(AMBIENTE, async () => conexao).carregarPartida(SERVIDOR, 4);
  expect(enviados).toEqual([COMANDO_DE_CARREGAR(4), 'get5_endmatch', COMANDO_DE_CARREGAR(4)]);
});

test('quando o servidor recusa mesmo depois de limpar, carregar dá erro em vez de fingir que deu certo', async () => {
  const { conexao, estado } = conexaoFalsa(RECUSA);
  await expect(controladorRcon(AMBIENTE, async () => conexao).carregarPartida(SERVIDOR, 4)).rejects.toThrow(/recusou a partida 4/);
  expect(estado.fechada).toBe(true);
});

const PRAZO_CURTO_MS = 20;
const nunca = <T,>() => new Promise<T>(() => undefined);

test('conexão que nunca abre dá erro dentro do prazo', async () => {
  await expect(controladorRcon(AMBIENTE, () => nunca(), PRAZO_CURTO_MS).encerrarPartida(SERVIDOR)).rejects.toThrow(/não respondeu/);
});

test('comando que nunca responde dá erro dentro do prazo, e a conexão é fechada', async () => {
  const { conexao, estado } = conexaoFalsa();
  conexao.send = () => nunca();
  await expect(controladorRcon(AMBIENTE, async () => conexao, PRAZO_CURTO_MS).encerrarPartida(SERVIDOR)).rejects.toThrow(/não respondeu/);
  expect(estado.fechada).toBe(true);
});

test('fechar uma conexão que não termina não prende quem chamou', async () => {
  const { conexao } = conexaoFalsa();
  conexao.end = () => nunca();
  await expect(controladorRcon(AMBIENTE, async () => conexao, PRAZO_CURTO_MS).encerrarPartida(SERVIDOR)).resolves.toBeUndefined();
});

test('conexão que só abre depois do prazo é fechada, para não ficar aberta à toa', async () => {
  const { conexao, estado } = conexaoFalsa();
  const atrasada = new Promise<typeof conexao>((pronto) => setTimeout(() => pronto(conexao), PRAZO_CURTO_MS * 2));
  await expect(controladorRcon(AMBIENTE, () => atrasada, PRAZO_CURTO_MS).encerrarPartida(SERVIDOR)).rejects.toThrow(/não respondeu/);
  await atrasada;
  await new Promise((pronto) => setTimeout(pronto, 5));
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
