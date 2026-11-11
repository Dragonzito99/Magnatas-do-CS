import type { Noticia, Partida } from '@/bd/esquema';
import { nomeDaPartida, nomeDoMapa } from './textos-da-partida';

/** O botão do Discord só vira link com um endereço https de verdade. */
export function enderecoDoDiscord(valor: string | undefined): string | null {
  const texto = valor?.trim();
  if (!texto) return null;
  try {
    return new URL(texto).protocol === 'https:' ? texto : null;
  } catch {
    return null;
  }
}

/** Só aceita webhook do próprio Discord: o site nunca manda nada para outro endereço. */
export function webhookDoDiscord(valor: string | undefined): string | null {
  const texto = valor?.trim();
  if (!texto) return null;
  try {
    const url = new URL(texto);
    const doDiscord = url.hostname === 'discord.com' || url.hostname === 'discordapp.com';
    return url.protocol === 'https:' && doDiscord && url.pathname.startsWith('/api/webhooks/') ? texto : null;
  } catch {
    return null;
  }
}

type Cartao = { title: string; url: string; description: string; color: number };
/** `parse: []` impede que um texto com @everyone marque o servidor inteiro. */
export type CorpoDoDiscord = { embeds: Cartao[]; allowed_mentions: { parse: [] } };

const COR_DO_CLUBE = 0xf5b301;
const TAMANHO_DO_RESUMO = 300;

const semBarra = (site: string) => site.replace(/\/+$/, '');

function resumir(texto: string): string {
  const limpo = texto.trim();
  return limpo.length <= TAMANHO_DO_RESUMO ? limpo : `${limpo.slice(0, TAMANHO_DO_RESUMO - 1).trimEnd()}…`;
}

export function mensagemDaNoticia(noticia: Pick<Noticia, 'id' | 'titulo' | 'texto'>, site: string): CorpoDoDiscord {
  return {
    embeds: [{ title: noticia.titulo, url: `${semBarra(site)}/noticias/${noticia.id}`, description: resumir(noticia.texto), color: COR_DO_CLUBE }],
    allowed_mentions: { parse: [] },
  };
}

type PartidaDoResultado = Pick<Partida, 'id' | 'numero' | 'tipo' | 'mapa' | 'nomeTime1' | 'nomeTime2' | 'placar1' | 'placar2' | 'vencedor'>;

/** Teste (Adm contra bots) e treino (clã contra ele mesmo) não interessam a ninguém no Discord. */
export function mensagemDoResultado(partida: PartidaDoResultado, site: string): CorpoDoDiscord | null {
  if (partida.tipo === 'teste' || partida.tipo === 'treino') return null;
  const nome = (time: 1 | 2, texto: string | null) => {
    const exibido = texto?.trim() || `Time ${time}`;
    return partida.vencedor === time ? `**${exibido}**` : exibido;
  };
  return {
    embeds: [
      {
        title: `${nomeDaPartida(partida)} · ${nomeDoMapa(partida.mapa)}`,
        url: `${semBarra(site)}/partidas/${partida.id}`,
        description: `${nome(1, partida.nomeTime1)} ${partida.placar1} x ${partida.placar2} ${nome(2, partida.nomeTime2)}`,
        color: COR_DO_CLUBE,
      },
    ],
    allowed_mentions: { parse: [] },
  };
}

const SEGUNDOS_DE_ESPERA = 5;

/**
 * Posta no canal do webhook. Nunca derruba quem chamou: sem webhook não faz nada, e com o Discord fora do ar só anota
 * no registro.
 */
export async function avisarNoDiscord(webhook: string | undefined, corpo: CorpoDoDiscord, buscar: typeof fetch = fetch): Promise<void> {
  const endereco = webhookDoDiscord(webhook);
  if (!endereco) return;
  try {
    const resposta = await buscar(endereco, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(corpo),
      signal: AbortSignal.timeout(SEGUNDOS_DE_ESPERA * 1000),
    });
    if (!resposta.ok) console.warn(`Discord recusou o aviso (${resposta.status}).`);
  } catch {
    console.warn('Discord fora do ar: o aviso não foi.');
  }
}
