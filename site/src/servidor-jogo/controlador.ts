import { Rcon } from 'rcon-client';
import type { Servidor } from '@/bd/esquema';

export type ServidorAlvo = Pick<Servidor, 'host' | 'porta'>;

export type ControladorServidor = {
  carregarPartida(servidor: ServidorAlvo, numero: number): Promise<void>;
  encerrarPartida(servidor: ServidorAlvo): Promise<void>;
  expulsar(servidor: ServidorAlvo, steamid64: string): Promise<void>;
  /** Os SteamIDs das pessoas no servidor, sem os bots. */
  jogadoresConectados(servidor: ServidorAlvo): Promise<string[]>;
};

type AmbienteDoControlador = { RCON_SENHA?: string; SITE_URL?: string; SERVIDOR_TOKEN?: string };
type Conexao = { send(comando: string): Promise<string>; end(): Promise<void> };
type Conectar = (servidor: ServidorAlvo, senha: string) => Promise<Conexao>;

const TEMPO_LIMITE_MS = 5000;
// O limite da biblioteca vale por pacote, e não cobre abrir nem fechar a conexão.
const PRAZO_DO_COMANDO_MS = 15_000;
const BASE_DO_STEAMID64 = BigInt('76561197960265728');

const conectarPorRcon: Conectar = (servidor, senha) =>
  Rcon.connect({ host: servidor.host, port: servidor.porta, password: senha, timeout: TEMPO_LIMITE_MS });

/** O `status` do CS2 não mostra o SteamID, mas o `kickid` aceita o id único, desde que entre aspas. */
export function comandoDeExpulsar(steamid64: string): string {
  if (!/^\d+$/.test(steamid64)) throw new Error('SteamID inválido.');
  return `kickid "[U:1:${BigInt(steamid64) - BASE_DO_STEAMID64}]" "Removido pela equipe"`;
}

/** Lê o texto em vez de converter o JSON, porque um SteamID em forma de número perderia os últimos dígitos. */
function pessoasDoStatus(resposta: string): string[] {
  if (!resposta.includes('"server"')) throw new Error('O servidor não mandou o status.');
  return [...resposta.matchAll(/"steamid64"\s*:\s*"?(7656\d{13})"?/g)].map((achado) => achado[1]);
}

/** A varredura e as punições esperam esta resposta, então um servidor travado não pode prender ninguém. */
function comPrazo<T>(promessa: Promise<T>, prazoMs: number): Promise<T> {
  return new Promise((resolver, rejeitar) => {
    const relogio = setTimeout(() => rejeitar(new Error('O servidor não respondeu a tempo.')), prazoMs);
    promessa.then(resolver, rejeitar).finally(() => clearTimeout(relogio));
  });
}

export function controladorRcon(
  ambiente: AmbienteDoControlador,
  conectar: Conectar = conectarPorRcon,
  prazoMs: number = PRAZO_DO_COMANDO_MS,
): ControladorServidor {
  async function comConexao<T>(servidor: ServidorAlvo, trabalho: (conexao: Conexao) => Promise<T>): Promise<T> {
    if (!ambiente.RCON_SENHA) throw new Error('RCON_SENHA não configurada.');
    const abrindo = conectar(servidor, ambiente.RCON_SENHA);
    let conexao: Conexao | undefined;
    try {
      conexao = await comPrazo(abrindo, prazoMs);
      return await comPrazo(trabalho(conexao), prazoMs);
    } finally {
      // Fechar nunca é esperado: a resposta já veio, e uma conexão travada não pode prender quem chamou.
      if (conexao) conexao.end().catch(() => undefined);
      else abrindo.then((atrasada) => atrasada.end()).catch(() => undefined);
    }
  }

  return {
    async carregarPartida(servidor, numero) {
      if (!ambiente.SERVIDOR_TOKEN) throw new Error('SERVIDOR_TOKEN não configurado.');
      const endereco = `${ambiente.SITE_URL}/api/servidor/partidas/${numero}/config`;
      const carregar = `matchzy_loadmatch_url "${endereco}" "Authorization" "Bearer ${ambiente.SERVIDOR_TOKEN}"`;
      await comConexao(servidor, async (conexao) => {
        if (!/cannot load/i.test(await conexao.send(carregar))) return;
        // Só servidor livre chega aqui, então a partida que ele ainda tem é sobra.
        await conexao.send('get5_endmatch');
        if (/cannot load/i.test(await conexao.send(carregar))) throw new Error(`O servidor recusou a partida ${numero}.`);
      });
    },
    async encerrarPartida(servidor) {
      await comConexao(servidor, (conexao) => conexao.send('get5_endmatch'));
    },
    async expulsar(servidor, steamid64) {
      await comConexao(servidor, (conexao) => conexao.send(comandoDeExpulsar(steamid64)));
    },
    jogadoresConectados: (servidor) => comConexao(servidor, async (conexao) => pessoasDoStatus(await conexao.send('status_json'))),
  };
}

export function controladorDoAmbiente(): ControladorServidor {
  const { RCON_SENHA, SITE_URL, SERVIDOR_TOKEN } = process.env;
  return controladorRcon({ RCON_SENHA, SITE_URL, SERVIDOR_TOKEN });
}

type ChamadaFalsa =
  | { acao: 'carregarPartida'; host: string; numero: number }
  | { acao: 'encerrarPartida'; host: string }
  | { acao: 'expulsar'; host: string; steamid64: string }
  | { acao: 'jogadoresConectados'; host: string };

/** Só para testes: anota as chamadas, e os hosts da lista falham como se estivessem fora do ar. */
export function controladorFalso(
  opcoes: { hostsComFalha?: string[]; conectados?: Record<string, string[]> } = {},
): ControladorServidor & { chamadas: ChamadaFalsa[] } {
  const chamadas: ChamadaFalsa[] = [];
  const conferir = (servidor: ServidorAlvo) => {
    if (opcoes.hostsComFalha?.includes(servidor.host)) throw new Error('Servidor fora do ar.');
  };
  return {
    chamadas,
    async carregarPartida(servidor, numero) {
      conferir(servidor);
      chamadas.push({ acao: 'carregarPartida', host: servidor.host, numero });
    },
    async encerrarPartida(servidor) {
      conferir(servidor);
      chamadas.push({ acao: 'encerrarPartida', host: servidor.host });
    },
    async expulsar(servidor, steamid64) {
      conferir(servidor);
      chamadas.push({ acao: 'expulsar', host: servidor.host, steamid64 });
    },
    async jogadoresConectados(servidor) {
      conferir(servidor);
      chamadas.push({ acao: 'jogadoresConectados', host: servidor.host });
      return opcoes.conectados?.[servidor.host] ?? [];
    },
  };
}
