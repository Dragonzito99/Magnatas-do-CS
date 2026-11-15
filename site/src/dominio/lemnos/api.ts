import { z } from 'zod';
import { tokenConfere } from '@/auth/token-servidor';
import type { Bd } from '@/bd/conexao';
import { lerAte } from '@/dominio/eventos';
import { ItemInvalido } from '@/dominio/loja';
import { SAQUES } from './catalogo';
import { entrarNaIlha, extrair, fecharSessoesDaPorta, morrer, renascer, sair, SessaoEncerrada } from './sessoes';

/*
 * As rotas que o servidor da Ilha Lemnos chama, todas com o SERVIDOR_TOKEN: /api/servidor/lemnos/<aviso>. O plugin
 * MagnatasLemnos usa exatamente estes nomes de campo.
 */
const LIMITE_BYTES = 64 * 1024;
const MAXIMO_DE_ITENS = 20;

const steamid64 = z.string().regex(/^7656\d{13}$/);
const referencia = z.string().regex(/^[A-Za-z0-9:-]{1,80}$/);
const sessao = z.string().uuid();
const linha = z.string().uuid();
const porta = z.number().int().min(1).max(65_535);
const idsDoSaque = SAQUES.map((item) => item.id) as [string, ...string[]];
const armas = z.array(z.object({ linha: linha.nullable(), classe: z.string().regex(/^weapon_[a-z0-9_]{1,40}$/) })).max(MAXIMO_DE_ITENS);
const gastas = z.array(linha).max(MAXIMO_DE_ITENS);

const AVISOS = {
  inicio: { formato: z.object({ porta, referencia }), fazer: async (bd: Bd, corpo: { porta: number; referencia: string }) => ({ fechadas: await fecharSessoesDaPorta(bd, corpo) }) },
  entrada: { formato: z.object({ porta, steamid64, referencia }), fazer: entrarNaIlha },
  renascer: { formato: z.object({ sessao, referencia }), fazer: renascer },
  extracao: { formato: z.object({ sessao, referencia, saque: z.array(z.enum(idsDoSaque)).max(MAXIMO_DE_ITENS), armas, gastas }), fazer: extrair },
  morte: {
    formato: z.object({ sessao, referencia, matador: steamid64.nullable(), gastas }),
    fazer: async (bd: Bd, corpo: Parameters<typeof morrer>[1]) => {
      await morrer(bd, corpo);
      return { ok: true };
    },
  },
  saida: {
    formato: z.object({ sessao, referencia, motivo: z.enum(['saiu', 'kick_afk', 'kick_acampar']), naSafeZone: z.boolean(), gastas, armas }),
    fazer: async (bd: Bd, corpo: Parameters<typeof sair>[1]) => {
      await sair(bd, corpo);
      return { ok: true };
    },
  },
} as const;

type Aviso = keyof typeof AVISOS;
const ehAviso = (texto: string): texto is Aviso => Object.hasOwn(AVISOS, texto);

export async function respostaDoAviso(bd: Bd, aviso: string, pedido: Request, tokenEsperado: string | undefined): Promise<Response> {
  if (!tokenConfere(pedido.headers.get('authorization'), tokenEsperado)) return new Response('Não autorizado.', { status: 401 });
  if (!ehAviso(aviso)) return new Response('Aviso desconhecido.', { status: 404 });
  const texto = await lerAte(pedido, LIMITE_BYTES);
  if (texto === null) return new Response('Aviso grande demais.', { status: 413 });
  let corpo: unknown;
  try {
    corpo = JSON.parse(texto);
  } catch {
    return new Response('Aviso inválido.', { status: 400 });
  }
  const { formato, fazer } = AVISOS[aviso];
  const lido = formato.safeParse(corpo);
  if (!lido.success) return new Response('Aviso inválido.', { status: 400 });
  try {
    // Cada formato casa com a própria função; o TypeScript não acompanha a união, então a chamada passa por unknown.
    const resposta = await (fazer as (bd: Bd, corpo: unknown) => Promise<unknown>)(bd, lido.data);
    return Response.json(resposta);
  } catch (erro) {
    if (erro instanceof SessaoEncerrada) return new Response(erro.message, { status: 409 });
    if (erro instanceof ItemInvalido) return new Response(erro.message, { status: 400 });
    throw erro;
  }
}
