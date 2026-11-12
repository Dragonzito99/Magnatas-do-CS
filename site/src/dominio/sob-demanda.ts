import { and, asc, eq, inArray, isNotNull } from 'drizzle-orm';
import type { Bd } from '@/bd/conexao';
import { estadosDaDiversao, servidoresDiversao, type EstadoDaDiversao, type ServidorDiversao } from '@/bd/esquema';
import { exigirServidoresNoAr } from './manutencao';

/** Liga e desliga um servidor da Diversão pelo nome dele na VPS. */
export type ControleDaDiversao = { ligar(nome: string): Promise<void>; desligar(nome: string): Promise<void> };
export type RespostaDoServidor = { ligado: boolean; jogando: number };

export const PRAZO_PARA_LIGAR_MS = 3 * 60_000;
export const TEMPO_VAZIO_MS = 5 * 60_000;
/** Na troca de mapa o servidor fica alguns segundos sem responder: só depois disso conta como desligado. */
export const PRAZO_SEM_RESPOSTA_MS = 45_000;
export const MAXIMO_LIGADOS_PADRAO = 3;
/** O nome vai para um comando: só letras minúsculas, números e hífen. */
export const NOME_NO_SERVIDOR_VALIDO = /^[a-z0-9-]{1,32}$/;

export class LimiteDeServidores extends Error {
  constructor() {
    super('Todos os servidores estão cheios de gente agora. Tente de novo em alguns minutos.');
    this.name = 'LimiteDeServidores';
  }
}

export class ServidorIndisponivel extends Error {
  constructor() {
    super('Este modo não pode ser ligado agora.');
    this.name = 'ServidorIndisponivel';
  }
}

type Transacao = Parameters<Parameters<Bd['transaction']>[0]>[0];

function nomeValido(nome: string | null): nome is string {
  return nome !== null && NOME_NO_SERVIDOR_VALIDO.test(nome);
}

function mensagemDoErro(erro: unknown): string {
  return (erro instanceof Error ? erro.message : String(erro)).slice(0, 200);
}

/** Servidor que o site ainda não acompanhava ganha a linha de estado, desligado. */
async function garantirEstados(bd: Bd | Transacao, ids: string[], agora: Date): Promise<void> {
  if (ids.length === 0) return;
  await bd
    .insert(estadosDaDiversao)
    .values(ids.map((servidorId) => ({ servidorId, desde: agora })))
    .onConflictDoNothing();
}

/** Lê o valor do .env.local; vazio ou inválido vale o padrão. */
export function maximoDeLigados(valor: string | undefined): number {
  const numero = Number(valor);
  return Number.isInteger(numero) && numero > 0 ? numero : MAXIMO_LIGADOS_PADRAO;
}

/**
 * Marca o servidor como ligando e chama o script. Com o limite cheio, desliga o servidor vazio há mais tempo.
 * Devolve 'desligado' quando o script de ligar falhou: o erro fica no estado, e o cartão não fica preso em "Ligando".
 */
export async function pedirParaLigar(
  bd: Bd,
  controle: ControleDaDiversao,
  servidorId: string,
  ator: { id: string },
  maximo: number,
  agora: Date = new Date(),
): Promise<'ligando' | 'ligado' | 'desligado'> {
  type Decisao = { pronto: 'ligando' | 'ligado' } | { nome: string; vitima: string | null };
  const decisao = await bd.transaction(async (tx): Promise<Decisao> => {
    await exigirServidoresNoAr(tx);
    const todos = await tx.select({ id: servidoresDiversao.id }).from(servidoresDiversao);
    await garantirEstados(
      tx,
      todos.map((servidor) => servidor.id),
      agora,
    );
    // Trava todas as linhas na mesma ordem: dois pedidos de modos diferentes não passam juntos do limite.
    const linhas = await tx
      .select({ estado: estadosDaDiversao, servidor: servidoresDiversao })
      .from(estadosDaDiversao)
      .innerJoin(servidoresDiversao, eq(servidoresDiversao.id, estadosDaDiversao.servidorId))
      .orderBy(asc(estadosDaDiversao.servidorId))
      .for('update', { of: estadosDaDiversao });
    const pedido = linhas.find((linha) => linha.servidor.id === servidorId);
    if (!pedido || !pedido.servidor.ativo || !nomeValido(pedido.servidor.nomeNoServidor)) throw new ServidorIndisponivel();
    if (pedido.estado.estado !== 'desligado') return { pronto: pedido.estado.estado };

    const ocupados = linhas.filter((linha) => linha.servidor.ativo && linha.estado.estado !== 'desligado');
    let vitima: string | null = null;
    if (ocupados.length >= maximo) {
      const vazios = ocupados
        .filter((linha) => linha.estado.estado === 'ligado' && linha.servidor.sobDemanda && linha.estado.vazioDesde && nomeValido(linha.servidor.nomeNoServidor))
        .sort((a, b) => a.estado.vazioDesde!.getTime() - b.estado.vazioDesde!.getTime());
      const escolhido = vazios[0];
      if (!escolhido) throw new LimiteDeServidores();
      vitima = escolhido.servidor.nomeNoServidor;
      await tx
        .update(estadosDaDiversao)
        .set({ estado: 'desligado', desde: agora, vazioDesde: null, semRespostaDesde: null, pedidoPor: null, erro: null })
        .where(eq(estadosDaDiversao.servidorId, escolhido.servidor.id));
    }
    await tx
      .update(estadosDaDiversao)
      .set({ estado: 'ligando', desde: agora, vazioDesde: null, semRespostaDesde: null, pedidoPor: ator.id, erro: null })
      .where(eq(estadosDaDiversao.servidorId, servidorId));
    return { nome: pedido.servidor.nomeNoServidor, vitima };
  });
  if ('pronto' in decisao) return decisao.pronto;

  if (decisao.vitima) {
    await controle.desligar(decisao.vitima).catch((erro) => {
      console.warn(`Não foi possível desligar o servidor ${decisao.vitima} da Diversão:`, erro);
    });
  }
  try {
    await controle.ligar(decisao.nome);
    return 'ligando';
  } catch (erro) {
    console.warn(`Não foi possível ligar o servidor ${decisao.nome} da Diversão:`, erro);
    await bd
      .update(estadosDaDiversao)
      .set({ estado: 'desligado', desde: agora, erro: mensagemDoErro(erro) })
      .where(and(eq(estadosDaDiversao.servidorId, servidorId), eq(estadosDaDiversao.estado, 'ligando')));
    return 'desligado';
  }
}

type Mudanca = Partial<Pick<EstadoDaDiversao, 'estado' | 'desde' | 'vazioDesde' | 'semRespostaDesde' | 'erro'>>;

/** O que fazer com um servidor, dada a resposta dele. Devolve a mudança no estado e se é para fechar o servidor. */
function decidir(servidor: ServidorDiversao, estado: EstadoDaDiversao, resposta: RespostaDoServidor, agora: Date): { mudanca?: Mudanca; desligar?: boolean } {
  const podeFechar = servidor.sobDemanda && nomeValido(servidor.nomeNoServidor);
  if (resposta.ligado) {
    const vazioDesde = resposta.jogando > 0 ? null : (estado.vazioDesde ?? agora);
    if (estado.estado !== 'ligado') return { mudanca: { estado: 'ligado', desde: agora, vazioDesde, semRespostaDesde: null, erro: null } };
    if (vazioDesde && podeFechar && agora.getTime() - vazioDesde.getTime() >= TEMPO_VAZIO_MS) {
      return { mudanca: { estado: 'desligado', desde: agora, vazioDesde: null, semRespostaDesde: null }, desligar: true };
    }
    return { mudanca: { vazioDesde, semRespostaDesde: null } };
  }
  if (estado.estado === 'ligado') {
    if (!estado.semRespostaDesde) return { mudanca: { semRespostaDesde: agora } };
    if (agora.getTime() - estado.semRespostaDesde.getTime() < PRAZO_SEM_RESPOSTA_MS) return {};
    return { mudanca: { estado: 'desligado', desde: agora, vazioDesde: null, semRespostaDesde: null } };
  }
  if (estado.estado === 'ligando' && agora.getTime() - estado.desde.getTime() >= PRAZO_PARA_LIGAR_MS) {
    return { mudanca: { estado: 'desligado', desde: agora, vazioDesde: null, erro: 'não respondeu' }, desligar: podeFechar };
  }
  return {};
}

/**
 * Roda na varredura. Confirma quem ligou, adota quem já estava ligado, desliga quem ficou vazio ou não subiu.
 * `agora` é o momento da pergunta: um estado que mudou depois dela (alguém pediu ou o site desligou) espera a próxima.
 */
export async function acompanharDiversao(
  bd: Bd,
  controle: ControleDaDiversao,
  perguntar: (servidor: ServidorDiversao) => Promise<RespostaDoServidor>,
  agora: Date = new Date(),
): Promise<void> {
  const ativos = await bd.select().from(servidoresDiversao).where(eq(servidoresDiversao.ativo, true));
  await garantirEstados(
    bd,
    ativos.map((servidor) => servidor.id),
    agora,
  );
  const respostas = await Promise.all(
    ativos.map(async (servidor) => {
      const resposta = await Promise.resolve()
        .then(() => perguntar(servidor))
        .catch((): RespostaDoServidor => ({ ligado: false, jogando: 0 }));
      return { servidor, resposta };
    }),
  );
  for (const { servidor, resposta } of respostas) {
    const fechar = await bd.transaction(async (tx) => {
      const [estado] = await tx.select().from(estadosDaDiversao).where(eq(estadosDaDiversao.servidorId, servidor.id)).for('update');
      if (!estado || estado.desde.getTime() > agora.getTime()) return false;
      const { mudanca, desligar } = decidir(servidor, estado, resposta, agora);
      if (mudanca) await tx.update(estadosDaDiversao).set(mudanca).where(eq(estadosDaDiversao.servidorId, servidor.id));
      return Boolean(desligar);
    });
    if (fechar && servidor.nomeNoServidor) {
      await controle.desligar(servidor.nomeNoServidor).catch((erro) => {
        console.warn(`Não foi possível desligar o servidor ${servidor.nomeNoServidor} da Diversão:`, erro);
      });
    }
  }
}

/**
 * Quem clica em Entrar ainda está conectando, e o servidor só conta quem já entrou.
 * O relógio de vazio recomeça, para o servidor não cair enquanto a pessoa baixa o mapa.
 */
export async function adiarDesligamento(bd: Bd, servidorId: string, agora: Date = new Date()): Promise<void> {
  await bd
    .update(estadosDaDiversao)
    .set({ vazioDesde: agora })
    .where(and(eq(estadosDaDiversao.servidorId, servidorId), eq(estadosDaDiversao.estado, 'ligado'), isNotNull(estadosDaDiversao.vazioDesde)));
}

export type EstadoNaTela = Pick<EstadoDaDiversao, 'estado' | 'desde' | 'erro' | 'pedidoPor' | 'teste'>;

export async function estadosDaTela(bd: Bd, ids?: string[]): Promise<Map<string, EstadoNaTela>> {
  const linhas = await bd
    .select()
    .from(estadosDaDiversao)
    .where(ids ? inArray(estadosDaDiversao.servidorId, ids) : undefined);
  return new Map(linhas.map((linha) => [linha.servidorId, { estado: linha.estado, desde: linha.desde, erro: linha.erro, pedidoPor: linha.pedidoPor, teste: linha.teste }]));
}
