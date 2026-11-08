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

test('jogadores conectados vêm da lista do plugin', async () => {
  const { conexao, enviados } = conexaoFalsa('magnatas_jogadores=[76561198000000001,76561198000000002]');
  expect(await controladorRcon(AMBIENTE, async () => conexao).jogadoresConectados(SERVIDOR)).toEqual(['76561198000000001', '76561198000000002']);
  expect(enviados).toEqual(['magnatas_jogadores']);
});

test('jogadores conectados aceita texto antes da lista e servidor vazio', async () => {
  const { conexao } = conexaoFalsa('algum aviso\nmagnatas_jogadores=[]\n');
  expect(await controladorRcon(AMBIENTE, async () => conexao).jogadoresConectados(SERVIDOR)).toEqual([]);
});

const STATUS_JSON = `{
  "server":
  {
    "map": "de_anubis",
    "clients":
    [
      { "steamid64": "90071996842377219", "steamid": "[A:1:3:1]", "bot": true, "name": "SourceTV" },
      { "steamid64": "0", "steamid": "[I:0:0]", "bot": false, "name": "" },
      { "steamid64": "76561198000000001", "steamid": "[U:1:39734273]", "bot": false, "name": "Fulano" }
    ],
    "steamid64": "85568392936940659"
  }
}`;

test('servidor do competitivo, sem o plugin, responde pelo status_json, sem bots, sem quem ainda conecta e com o mapa', async () => {
  const { conexao, enviados } = conexaoFalsa(["Unknown command 'magnatas_jogadores'", STATUS_JSON]);
  expect(await controladorRcon(AMBIENTE, async () => conexao).estadoDoServidor(SERVIDOR)).toEqual({ contas: ['76561198000000001'], mapa: 'de_anubis' });
  expect(enviados).toEqual(['magnatas_jogadores', 'status_json']);
});

test('servidor que não manda nem a lista nem o status dá erro, e não uma lista vazia', async () => {
  const { conexao } = conexaoFalsa("Unknown command 'magnatas_jogadores'");
  await expect(controladorRcon(AMBIENTE, async () => conexao).jogadoresConectados(SERVIDOR)).rejects.toThrow(/lista/);
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

test('o mapa atual vem junto da lista do plugin', async () => {
  const { conexao } = conexaoFalsa('magnatas_jogadores=[76561198000000001] mapa=luxville');
  expect(await controladorRcon(AMBIENTE, async () => conexao).estadoDoServidor(SERVIDOR)).toEqual({ contas: ['76561198000000001'], mapa: 'luxville' });
});

test('sem o mapa na resposta, o estado vem só com as contas', async () => {
  const { conexao } = conexaoFalsa('magnatas_jogadores=[76561198000000001]');
  expect(await controladorRcon(AMBIENTE, async () => conexao).estadoDoServidor(SERVIDOR)).toEqual({ contas: ['76561198000000001'] });
});

test('chamar os bots completa os times e, se nenhum bot entrou ainda, puxa o primeiro para o servidor começar a encher', async () => {
  const { conexao, enviados } = conexaoFalsa(['', '', '', STATUS_JSON]);
  await controladorRcon(AMBIENTE, async () => conexao).chamarBots(SERVIDOR, true);
  expect(enviados).toEqual(['mp_autoteambalance 1', 'bot_quota_mode fill', 'bot_quota 10', 'status_json', 'bot_add_ct', 'bot_quota 10', 'css_start']);
});

test('com bots já no servidor, chamar os bots só confirma a quantidade', async () => {
  const darryl = '{ "steamid64": "0", "steamid": "[I:0:0]", "bot": true, "name": "Darryl" }';
  const comBot = STATUS_JSON.replace('"name": "Fulano" }', `"name": "Fulano" }, ${darryl}`);
  const { conexao, enviados } = conexaoFalsa(['', '', '', comBot]);
  await controladorRcon(AMBIENTE, async () => conexao).chamarBots(SERVIDOR, false);
  expect(enviados).toEqual(['mp_autoteambalance 1', 'bot_quota_mode fill', 'bot_quota 10', 'status_json']);
});
