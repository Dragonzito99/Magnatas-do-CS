import { Rcon } from 'rcon-client';
import type { Servidor } from '@/bd/esquema';

export type ServidorAlvo = Pick<Servidor, 'host' | 'porta'>;

export type ControladorServidor = {
  carregarPartida(servidor: ServidorAlvo, numero: number): Promise<void>;
  encerrarPartida(servidor: ServidorAlvo): Promise<void>;
  expulsar(servidor: ServidorAlvo, steamid64: string): Promise<void>;
  /** Os SteamIDs das pessoas no servidor, sem os bots. */
  jogadoresConectados(servidor: ServidorAlvo): Promise<string[]>;
  /** As pessoas e o mapa que está rodando, numa pergunta só. */
  estadoDoServidor(servidor: ServidorAlvo): Promise<EstadoDoServidor>;
  /** Só no teste do competitivo: completa os times com bots e, se `comecar`, força o início da partida. */
  chamarBots(servidor: ServidorAlvo, comecar: boolean): Promise<void>;
  /** Só na Mutação: o teste do Adm, na Dust 2 com bots e sem XP. Falha se o plugin não confirmar. */
  comecarTesteComBots(servidor: ServidorAlvo): Promise<void>;
};

/** O modo "fill" conta as pessoas: com uma pessoa, entram 9 bots. */
export const COMANDOS_DOS_BOTS = ['mp_autoteambalance 1', 'bot_quota_mode fill', 'bot_quota 10'];

export type EstadoDoServidor = { contas: string[]; mapa?: string };

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

/** Vem do plugin do modo Cada um por si, porque o `status_json` do CS2 só olha as primeiras vagas do servidor. */
function pessoasDaLista(resposta: string): string[] {
  const lista = resposta.match(/magnatas_jogadores=\[([^\]]*)\]/);
  if (!lista) throw new Error('O servidor não mandou a lista de jogadores.');
  return lista[1].match(/7656\d{13}/g) ?? [];
}

/** Lê o texto em vez de converter o JSON, porque um SteamID em forma de número perderia os últimos dígitos. */
function estadoDoStatus(resposta: string): EstadoDoServidor {
  if (!resposta.includes('"server"')) throw new Error('O servidor não mandou a lista de jogadores.');
  const contas = [...resposta.matchAll(/"steamid64"\s*:\s*"?(7656\d{13})"?/g)].map((achado) => achado[1]);
  const mapa = resposta.match(/"map"\s*:\s*"([A-Za-z0-9_-]{1,64})"/)?.[1];
  return mapa ? { contas, mapa } : { contas };
}

/** Os bots de verdade no `status_json`, sem a SourceTV, que também aparece como bot. */
function botsDoStatus(resposta: string): number {
  return [...resposta.matchAll(/"bot"\s*:\s*true\s*,\s*"name"\s*:\s*"([^"]*)"/g)].filter((achado) => achado[1] !== 'SourceTV').length;
}

/**
 * Os servidores da Diversão têm o plugin, que lista todas as vagas. O do competitivo só tem o MatchZy: lá a lista vem
 * do `status_json`, que basta para as 10 vagas de uma partida.
 */
async function perguntarEstado(conexao: Conexao): Promise<EstadoDoServidor> {
  const resposta = await conexao.send('magnatas_jogadores');
  if (/magnatas_jogadores=\[/.test(resposta)) return estadoDaResposta(resposta);
  return estadoDoStatus(await conexao.send('status_json'));
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
    jogadoresConectados: (servidor) => comConexao(servidor, async (conexao) => (await perguntarEstado(conexao)).contas),
    estadoDoServidor: (servidor) => comConexao(servidor, perguntarEstado),
    async chamarBots(servidor, comecar) {
      await comConexao(servidor, async (conexao) => {
        for (const comando of COMANDOS_DOS_BOTS) await conexao.send(comando);
        // Só a cota não basta num servidor sem bot nenhum: o primeiro precisa ser chamado, e a cota volta para 10.
        if (botsDoStatus(await conexao.send('status_json')) === 0) {
          await conexao.send('bot_add_ct');
          await conexao.send('bot_quota 10');
        }
        if (comecar) await conexao.send('css_start');
      });
    },
    async comecarTesteComBots(servidor) {
      const resposta = await comConexao(servidor, (conexao) => conexao.send('magnatas_teste_bots'));
      if (!resposta.includes('teste_bots=1')) throw new Error('O servidor não confirmou o teste com bots.');
    },
  };
}

/** O plugin manda o mapa depois da lista. Um servidor antigo, sem o mapa, continua valendo. */
function estadoDaResposta(resposta: string): EstadoDoServidor {
  const contas = pessoasDaLista(resposta);
  const mapa = resposta.match(/ mapa=([A-Za-z0-9_-]{1,64})/)?.[1];
  return mapa ? { contas, mapa } : { contas };
}

export function controladorDoAmbiente(): ControladorServidor {
  const { RCON_SENHA, SITE_URL, SERVIDOR_TOKEN } = process.env;
  return controladorRcon({ RCON_SENHA, SITE_URL, SERVIDOR_TOKEN });
}

type ChamadaFalsa =
  | { acao: 'carregarPartida'; host: string; numero: number }
  | { acao: 'encerrarPartida'; host: string }
  | { acao: 'expulsar'; host: string; steamid64: string }
  | { acao: 'jogadoresConectados'; host: string }
  | { acao: 'chamarBots'; host: string; comecar: boolean }
  | { acao: 'testeComBots'; host: string; porta: number };

/** Só para testes: anota as chamadas, e os hosts da lista falham como se estivessem fora do ar. */
export function controladorFalso(
  opcoes: { hostsComFalha?: string[]; conectados?: Record<string, string[]>; mapas?: Record<string, string> } = {},
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
    // Passa pelo jogadoresConectados do próprio objeto, para os testes que o trocam valerem aqui também.
    async estadoDoServidor(this: ControladorServidor, servidor) {
      const contas = await this.jogadoresConectados(servidor);
      const mapa = opcoes.mapas?.[servidor.host];
      return mapa ? { contas, mapa } : { contas };
    },
    async chamarBots(servidor, comecar) {
      conferir(servidor);
      chamadas.push({ acao: 'chamarBots', host: servidor.host, comecar });
    },
    async comecarTesteComBots(servidor) {
      conferir(servidor);
      chamadas.push({ acao: 'testeComBots', host: servidor.host, porta: servidor.porta });
    },
  };
}
