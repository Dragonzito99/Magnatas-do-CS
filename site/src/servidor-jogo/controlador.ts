import { Rcon } from 'rcon-client';
import type { Servidor } from '@/bd/esquema';

export type ServidorAlvo = Pick<Servidor, 'host' | 'porta'>;

export type ControladorServidor = {
  carregarPartida(servidor: ServidorAlvo, numero: number): Promise<void>;
  encerrarPartida(servidor: ServidorAlvo): Promise<void>;
  expulsar(servidor: ServidorAlvo, steamid64: string): Promise<void>;
};

type AmbienteDoControlador = { RCON_SENHA?: string; SITE_URL?: string; SERVIDOR_TOKEN?: string };
type Conexao = { send(comando: string): Promise<string>; end(): Promise<void> };
type Conectar = (servidor: ServidorAlvo, senha: string) => Promise<Conexao>;

const TEMPO_LIMITE_MS = 5000;
const BASE_DO_STEAMID64 = BigInt('76561197960265728');

const conectarPorRcon: Conectar = (servidor, senha) =>
  Rcon.connect({ host: servidor.host, port: servidor.porta, password: senha, timeout: TEMPO_LIMITE_MS });

/** O `status` do CS2 não mostra o SteamID, mas o `kickid` aceita o id único, desde que entre aspas. */
export function comandoDeExpulsar(steamid64: string): string {
  if (!/^\d+$/.test(steamid64)) throw new Error('SteamID inválido.');
  return `kickid "[U:1:${BigInt(steamid64) - BASE_DO_STEAMID64}]" "Removido pela equipe"`;
}

export function controladorRcon(ambiente: AmbienteDoControlador, conectar: Conectar = conectarPorRcon): ControladorServidor {
  /** Responde com o que o servidor disse ao último comando. */
  async function enviar(servidor: ServidorAlvo, ...comandos: string[]): Promise<string> {
    if (!ambiente.RCON_SENHA) throw new Error('RCON_SENHA não configurada.');
    const conexao = await conectar(servidor, ambiente.RCON_SENHA);
    try {
      let resposta = '';
      for (const comando of comandos) resposta = await conexao.send(comando);
      return resposta;
    } finally {
      await conexao.end().catch(() => undefined);
    }
  }

  return {
    async carregarPartida(servidor, numero) {
      if (!ambiente.SERVIDOR_TOKEN) throw new Error('SERVIDOR_TOKEN não configurado.');
      const endereco = `${ambiente.SITE_URL}/api/servidor/partidas/${numero}/config`;
      // Só servidor livre chega aqui, então partida carregada nele é sobra, e o MatchZy recusaria a nova.
      const resposta = await enviar(servidor, 'get5_endmatch', `matchzy_loadmatch_url "${endereco}" "Authorization" "Bearer ${ambiente.SERVIDOR_TOKEN}"`);
      if (/cannot load/i.test(resposta)) throw new Error(`O servidor recusou a partida ${numero}.`);
    },
    async encerrarPartida(servidor) {
      await enviar(servidor, 'get5_endmatch');
    },
    async expulsar(servidor, steamid64) {
      await enviar(servidor, comandoDeExpulsar(steamid64));
    },
  };
}

export function controladorDoAmbiente(): ControladorServidor {
  const { RCON_SENHA, SITE_URL, SERVIDOR_TOKEN } = process.env;
  return controladorRcon({ RCON_SENHA, SITE_URL, SERVIDOR_TOKEN });
}

type ChamadaFalsa =
  | { acao: 'carregarPartida'; host: string; numero: number }
  | { acao: 'encerrarPartida'; host: string }
  | { acao: 'expulsar'; host: string; steamid64: string };

/** Só para testes: anota as chamadas, e os hosts da lista falham como se estivessem fora do ar. */
export function controladorFalso(opcoes: { hostsComFalha?: string[] } = {}): ControladorServidor & { chamadas: ChamadaFalsa[] } {
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
  };
}
