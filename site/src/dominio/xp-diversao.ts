import { and, eq, inArray } from 'drizzle-orm';
import { z } from 'zod';
import { tokenConfere } from '@/auth/token-servidor';
import type { Bd } from '@/bd/conexao';
import { servidoresDiversao, usuarios, xpPartidas, type ServidorDiversao } from '@/bd/esquema';
import { lerAte } from './eventos';
import { lancarXp, patenteDe, type GanhoDePartida } from './xp';

const LIMITE_DO_RESULTADO_BYTES = 1024 * 1024;
/** Quem saiu no meio continua no resultado, então uma partida de 16 vagas pode trazer muito mais nomes. */
const MAXIMO_DE_JOGADORES = 128;
const MINIMO_DE_PESSOAS_NO_FIM = 2;
const MINUTOS_MINIMOS_NO_CADA_UM = 5;
const PRAZO_MAXIMO_EM_MINUTOS = 240;

const Jogador = z.object({
  steamid64: z.string().regex(/^7656\d{13}$/),
  abates: z.number().int().min(0).max(100_000),
  minutos: z.number().min(0).max(PRAZO_MAXIMO_EM_MINUTOS),
  ateOFim: z.boolean(),
  time: z.enum(['ct', 'tr']).optional(),
});

const Resultado = z.object({
  porta: z.number().int().min(1).max(65_535),
  partida: z.string().regex(/^[A-Za-z0-9-]{1,64}$/),
  duracaoMinutos: z.number().positive().max(PRAZO_MAXIMO_EM_MINUTOS),
  vencedor: z.enum(['ct', 'tr', 'empate']).nullable(),
  jogadores: z.array(Jogador).max(MAXIMO_DE_JOGADORES),
});

type ResultadoRecebido = z.infer<typeof Resultado>;
type JogadorRecebido = z.infer<typeof Jogador>;
type ConsequenciaDaPartida = Pick<GanhoDePartida, 'resultado' | 'jogouAteOFim'>;

/** Sem time fixo, vence o terço de cima do placar, entre quem jogou o bastante. Na Mutação, a mesma pessoa joga nos dois lados. */
function consequenciasDoCadaUm(jogadores: JogadorRecebido[]): Map<string, ConsequenciaDaPartida> {
  const elegiveis = jogadores.filter((jogador) => jogador.ateOFim && jogador.minutos >= MINUTOS_MINIMOS_NO_CADA_UM);
  const vagas = Math.ceil(elegiveis.length / 3);
  const corte = [...elegiveis].sort((a, b) => b.abates - a.abates)[vagas - 1]?.abates ?? 0;
  return new Map(
    jogadores.map((jogador) => [
      jogador.steamid64,
      {
        jogouAteOFim: elegiveis.includes(jogador),
        resultado: elegiveis.includes(jogador) && jogador.abates > 0 && jogador.abates >= corte ? 'vitoria' : 'derrota',
      },
    ]),
  );
}

function consequenciasDosTimes(recebido: ResultadoRecebido): Map<string, ConsequenciaDaPartida> {
  return new Map(
    recebido.jogadores.map((jogador) => [
      jogador.steamid64,
      {
        jogouAteOFim: jogador.ateOFim && jogador.minutos * 2 >= recebido.duracaoMinutos,
        resultado: recebido.vencedor === 'empate' ? 'empate' : jogador.time === recebido.vencedor ? 'vitoria' : 'derrota',
      },
    ]),
  );
}

function consequencias(modo: ServidorDiversao['modo'], recebido: ResultadoRecebido, membros: Set<string>): Map<string, ConsequenciaDaPartida> {
  const dosMembros = { ...recebido, jogadores: recebido.jogadores.filter((jogador) => membros.has(jogador.steamid64)) };
  const decididas = modo === 'cada_um' || modo === 'mutacao' ? consequenciasDoCadaUm(dosMembros.jogadores) : consequenciasDosTimes(dosMembros);
  // Sozinho não há partida: ficar parado num servidor vazio não pode render XP.
  const noFim = new Set(dosMembros.jogadores.filter((jogador) => jogador.ateOFim).map((jogador) => jogador.steamid64));
  // A liberação é só para o dono ver o XP jogando com bots na fase de teste. Sai antes de abrir o clube.
  const liberadoParaTeste = process.env.XP_SOZINHO_PARA_TESTE === 'sim';
  if (noFim.size < MINIMO_DE_PESSOAS_NO_FIM && !liberadoParaTeste) {
    for (const [steamid64, decidida] of decididas) decididas.set(steamid64, { ...decidida, jogouAteOFim: false });
  }
  return decididas;
}

/** O servidor envia só os números. Quem calcula o XP é o site, para um servidor não conseguir inventar XP. */
async function registrar(bd: Bd, recebido: ResultadoRecebido) {
  return bd.transaction(async (tx) => {
    const [servidor] = await tx
      .select()
      .from(servidoresDiversao)
      .where(and(eq(servidoresDiversao.porta, recebido.porta), eq(servidoresDiversao.ativo, true)));
    if (!servidor) return null;

    const steamids = recebido.jogadores.map((jogador) => jogador.steamid64);
    const contas =
      steamids.length === 0
        ? []
        : await tx
            .select({ id: usuarios.id, steamid64: usuarios.steamid64 })
            .from(usuarios)
            .where(and(eq(usuarios.estado, 'ativo'), inArray(usuarios.steamid64, steamids)));
    const porConta = new Map(contas.map((conta) => [conta.steamid64, conta.id]));
    const decididas = consequencias(servidor.modo, recebido, new Set(porConta.keys()));
    const referencia = `diversao:${recebido.porta}:${recebido.partida}`;

    await lancarXp(
      tx,
      recebido.jogadores.flatMap((jogador) => {
        const usuarioId = porConta.get(jogador.steamid64);
        const decidida = decididas.get(jogador.steamid64);
        return usuarioId && decidida ? [{ usuarioId, origem: 'diversao' as const, referencia, abates: jogador.abates, ...decidida }] : [];
      }),
    );

    // Lê do que está gravado, para um reenvio receber a mesma resposta.
    const gravadas = await tx
      .select({ steamid64: usuarios.steamid64, xp: xpPartidas.xp, xpTotal: usuarios.xpTotal })
      .from(xpPartidas)
      .innerJoin(usuarios, eq(xpPartidas.usuarioId, usuarios.id))
      .where(eq(xpPartidas.referencia, referencia));
    return gravadas.map(({ steamid64, xp, xpTotal }) => {
      const patente = patenteDe(xpTotal);
      return { steamid64, xp, xpTotal, patente: patente.nome, subiu: patente.nivel > patenteDe(xpTotal - xp).nivel };
    });
  });
}

export async function respostaDoResultado(bd: Bd, pedido: Request, tokenEsperado: string | undefined): Promise<Response> {
  if (!tokenConfere(pedido.headers.get('authorization'), tokenEsperado)) return new Response('Não autorizado.', { status: 401 });
  const texto = await lerAte(pedido, LIMITE_DO_RESULTADO_BYTES);
  if (texto === null) return new Response('Resultado grande demais.', { status: 413 });
  let corpo: unknown;
  try {
    corpo = JSON.parse(texto);
  } catch {
    return new Response('Resultado inválido.', { status: 400 });
  }
  const lido = Resultado.safeParse(corpo);
  if (!lido.success) return new Response('Resultado inválido.', { status: 400 });
  const ganhos = await registrar(bd, lido.data);
  if (!ganhos) return new Response('Servidor desconhecido.', { status: 404 });
  return Response.json({ ganhos });
}
