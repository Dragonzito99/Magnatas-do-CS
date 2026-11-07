import { beforeEach, expect, test, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import type { Bd } from '@/bd/conexao';
import { estadosDaDiversao, servidoresDiversao, type ServidorDiversao, type Usuario } from '@/bd/esquema';
import { criarBancoDeTeste, criarUsuario } from '@/bd/teste';
import {
  acompanharDiversao,
  estadosDaTela,
  LimiteDeServidores,
  pedirParaLigar,
  PRAZO_PARA_LIGAR_MS,
  TEMPO_VAZIO_MS,
  type ControleDaDiversao,
} from './sob-demanda';

let bd: Bd;
let jogador: Usuario;
let servidores: Record<string, ServidorDiversao>;
let controle: ControleDaDiversao & { chamadas: string[] };
/** Quem responde e quantos jogam, pelo nome no servidor. Quem não está aqui não responde. */
let respondendo: Record<string, number>;

const AGORA = new Date('2026-11-07T12:00:00Z');
const depois = (ms: number) => new Date(AGORA.getTime() + ms);
const perguntar = async (servidor: ServidorDiversao) => {
  const jogando = servidor.nomeNoServidor ? respondendo[servidor.nomeNoServidor] : undefined;
  return jogando === undefined ? { ligado: false, jogando: 0 } : { ligado: true, jogando };
};
const estadoDe = async (nome: string) => {
  const [linha] = await bd.select().from(estadosDaDiversao).where(eq(estadosDaDiversao.servidorId, servidores[nome].id));
  return linha;
};

function criarControle(): ControleDaDiversao & { chamadas: string[] } {
  const chamadas: string[] = [];
  return {
    chamadas,
    ligar: vi.fn(async (nome: string) => {
      chamadas.push(`ligar ${nome}`);
    }),
    desligar: vi.fn(async (nome: string) => {
      chamadas.push(`desligar ${nome}`);
    }),
  };
}

beforeEach(async () => {
  bd = await criarBancoDeTeste();
  await bd.update(servidoresDiversao).set({ ativo: true });
  const linhas = await bd.select().from(servidoresDiversao);
  servidores = Object.fromEntries(linhas.map((linha) => [linha.nomeNoServidor!, linha]));
  jogador = await criarUsuario(bd, { estado: 'ativo' });
  controle = criarControle();
  respondendo = {};
});

/** Deixa estes servidores como ligados, com o relógio de vazio já correndo desde o momento dado. */
async function jaLigados(nomes: Record<string, Date | null>) {
  for (const [nome, vazioDesde] of Object.entries(nomes)) {
    await bd
      .insert(estadosDaDiversao)
      .values({ servidorId: servidores[nome].id, estado: 'ligado', desde: AGORA, vazioDesde })
      .onConflictDoUpdate({ target: estadosDaDiversao.servidorId, set: { estado: 'ligado', vazioDesde } });
  }
}

test('pedir para ligar marca ligando e chama o script uma vez', async () => {
  expect(await pedirParaLigar(bd, controle, servidores.fantasma.id, jogador, 3, AGORA)).toBe('ligando');
  expect(controle.chamadas).toEqual(['ligar fantasma']);
  expect(await estadoDe('fantasma')).toMatchObject({ estado: 'ligando', desde: AGORA, pedidoPor: jogador.id, erro: null });
});

test('dois pedidos ao mesmo tempo no mesmo modo chamam ligar uma vez só', async () => {
  const outro = await criarUsuario(bd, { estado: 'ativo' });
  const respostas = await Promise.all([
    pedirParaLigar(bd, controle, servidores.fantasma.id, jogador, 3, AGORA),
    pedirParaLigar(bd, controle, servidores.fantasma.id, outro, 3, AGORA),
  ]);
  expect(respostas).toEqual(['ligando', 'ligando']);
  expect(controle.chamadas).toEqual(['ligar fantasma']);
});

test('pedir um servidor que já está ligado não chama nada', async () => {
  await jaLigados({ awp: null });
  expect(await pedirParaLigar(bd, controle, servidores.awp.id, jogador, 3, AGORA)).toBe('ligado');
  expect(controle.chamadas).toEqual([]);
});

test('limite cheio com servidor vazio: desliga o vazio há mais tempo e liga o pedido', async () => {
  await jaLigados({ equipe: null, mutacao: depois(-60_000), awp: depois(-120_000) });
  expect(await pedirParaLigar(bd, controle, servidores.fantasma.id, jogador, 3, AGORA)).toBe('ligando');
  expect(controle.chamadas).toEqual(['desligar awp', 'ligar fantasma']);
  expect((await estadoDe('awp')).estado).toBe('desligado');
  expect((await estadoDe('mutacao')).estado).toBe('ligado');
});

test('limite cheio e todos com gente: recusa sem chamar nada', async () => {
  await jaLigados({ equipe: null, mutacao: null, awp: null });
  await expect(pedirParaLigar(bd, controle, servidores.fantasma.id, jogador, 3, AGORA)).rejects.toThrow(LimiteDeServidores);
  expect(controle.chamadas).toEqual([]);
  expect((await estadoDe('fantasma'))?.estado ?? 'desligado').toBe('desligado');
});

test('servidor vazio que não é sob demanda não sai para dar lugar', async () => {
  await jaLigados({ equipe: depois(-600_000), mutacao: null, awp: null });
  await bd.update(servidoresDiversao).set({ sobDemanda: false }).where(eq(servidoresDiversao.id, servidores.equipe.id));
  await expect(pedirParaLigar(bd, controle, servidores.fantasma.id, jogador, 3, AGORA)).rejects.toThrow(LimiteDeServidores);
});

test('o limite conta também quem está ligando', async () => {
  await jaLigados({ equipe: null, mutacao: null });
  await pedirParaLigar(bd, controle, servidores.awp.id, jogador, 3, AGORA);
  await expect(pedirParaLigar(bd, controle, servidores.fantasma.id, jogador, 3, AGORA)).rejects.toThrow(LimiteDeServidores);
});

test('script de ligar que falha volta a desligado com o erro, sem ficar preso em ligando', async () => {
  controle.ligar = vi.fn(async () => {
    throw new Error('sudo: a password is required');
  });
  const aviso = vi.spyOn(console, 'warn').mockImplementation(() => {});
  expect(await pedirParaLigar(bd, controle, servidores.fantasma.id, jogador, 3, AGORA)).toBe('desligado');
  expect(await estadoDe('fantasma')).toMatchObject({ estado: 'desligado', erro: 'sudo: a password is required' });
  expect(aviso).toHaveBeenCalled();
  aviso.mockRestore();
});

test('servidor sem nome na VPS ou desativado não liga', async () => {
  await bd.update(servidoresDiversao).set({ nomeNoServidor: null }).where(eq(servidoresDiversao.id, servidores.awp.id));
  await bd.update(servidoresDiversao).set({ ativo: false }).where(eq(servidoresDiversao.id, servidores.pistola.id));
  await expect(pedirParaLigar(bd, controle, servidores.awp.id, jogador, 3, AGORA)).rejects.toThrow();
  await expect(pedirParaLigar(bd, controle, servidores.pistola.id, jogador, 3, AGORA)).rejects.toThrow();
  expect(controle.chamadas).toEqual([]);
});

test('acompanhar adota um servidor que já responde, sem ligar de novo', async () => {
  respondendo = { equipe: 2, mutacao: 0 };
  await acompanharDiversao(bd, controle, perguntar, AGORA);
  expect(await estadoDe('equipe')).toMatchObject({ estado: 'ligado', vazioDesde: null });
  expect(await estadoDe('mutacao')).toMatchObject({ estado: 'ligado', vazioDesde: AGORA });
  expect((await estadoDe('fantasma')).estado).toBe('desligado');
  expect(controle.chamadas).toEqual([]);
});

test('resposta de antes de o site desligar o servidor não o adota de volta', async () => {
  await jaLigados({ equipe: null, mutacao: null, awp: depois(-120_000) });
  // A varredura perguntou em AGORA, com o AWP ainda no ar; o pedido desligou o AWP 2 segundos depois.
  await pedirParaLigar(bd, controle, servidores.fantasma.id, jogador, 3, depois(2_000));
  respondendo = { equipe: 1, mutacao: 1, awp: 0 };
  await acompanharDiversao(bd, controle, perguntar, AGORA);
  expect((await estadoDe('awp')).estado).toBe('desligado');
  expect((await estadoDe('fantasma')).estado).toBe('ligando');
});

test('ligando que responde vira ligado', async () => {
  await pedirParaLigar(bd, controle, servidores.fantasma.id, jogador, 3, AGORA);
  respondendo = { fantasma: 0 };
  await acompanharDiversao(bd, controle, perguntar, depois(50_000));
  expect(await estadoDe('fantasma')).toMatchObject({ estado: 'ligado', desde: depois(50_000), vazioDesde: depois(50_000), pedidoPor: jogador.id });
});

test('vazio por 4:59 não desliga; com 5:00 desliga', async () => {
  await jaLigados({ awp: AGORA });
  respondendo = { awp: 0 };
  await acompanharDiversao(bd, controle, perguntar, depois(TEMPO_VAZIO_MS - 1_000));
  expect((await estadoDe('awp')).estado).toBe('ligado');
  expect(controle.chamadas).toEqual([]);
  await acompanharDiversao(bd, controle, perguntar, depois(TEMPO_VAZIO_MS));
  expect(await estadoDe('awp')).toMatchObject({ estado: 'desligado', vazioDesde: null });
  expect(controle.chamadas).toEqual(['desligar awp']);
});

test('alguém entra em 4:59: o relógio de vazio zera', async () => {
  await jaLigados({ awp: AGORA });
  respondendo = { awp: 1 };
  await acompanharDiversao(bd, controle, perguntar, depois(TEMPO_VAZIO_MS - 1_000));
  expect((await estadoDe('awp')).vazioDesde).toBeNull();
  respondendo = { awp: 0 };
  await acompanharDiversao(bd, controle, perguntar, depois(TEMPO_VAZIO_MS + 1_000));
  expect(await estadoDe('awp')).toMatchObject({ estado: 'ligado', vazioDesde: depois(TEMPO_VAZIO_MS + 1_000) });
  expect(controle.chamadas).toEqual([]);
});

test('ligado que para de responder vira desligado, sem chamar o script', async () => {
  await jaLigados({ awp: null });
  await acompanharDiversao(bd, controle, perguntar, depois(15_000));
  expect((await estadoDe('awp')).estado).toBe('desligado');
  expect(controle.chamadas).toEqual([]);
});

test('ligando sem resposta por 3 minutos: desliga o que sobrou e marca o erro', async () => {
  await pedirParaLigar(bd, controle, servidores.fantasma.id, jogador, 3, AGORA);
  await acompanharDiversao(bd, controle, perguntar, depois(PRAZO_PARA_LIGAR_MS - 1_000));
  expect((await estadoDe('fantasma')).estado).toBe('ligando');
  await acompanharDiversao(bd, controle, perguntar, depois(PRAZO_PARA_LIGAR_MS));
  expect(await estadoDe('fantasma')).toMatchObject({ estado: 'desligado', erro: 'não respondeu' });
  expect(controle.chamadas).toEqual(['ligar fantasma', 'desligar fantasma']);
});

test('servidor que não é sob demanda nunca é desligado pelo site', async () => {
  await bd.update(servidoresDiversao).set({ sobDemanda: false }).where(eq(servidoresDiversao.id, servidores.equipe.id));
  await jaLigados({ equipe: AGORA });
  respondendo = { equipe: 0 };
  await acompanharDiversao(bd, controle, perguntar, depois(TEMPO_VAZIO_MS * 10));
  expect((await estadoDe('equipe')).estado).toBe('ligado');
  expect(controle.chamadas).toEqual([]);
});

test('um servidor que não responde à pergunta não atrapalha os outros', async () => {
  await jaLigados({ awp: AGORA });
  respondendo = { awp: 0 };
  const quebrada = async (servidor: ServidorDiversao) => {
    if (servidor.nomeNoServidor === 'equipe') throw new Error('rcon caiu');
    return perguntar(servidor);
  };
  await acompanharDiversao(bd, controle, quebrada, depois(TEMPO_VAZIO_MS));
  expect(controle.chamadas).toEqual(['desligar awp']);
});

test('estadosDaTela traz o estado de cada servidor', async () => {
  await pedirParaLigar(bd, controle, servidores.fantasma.id, jogador, 3, AGORA);
  const tela = await estadosDaTela(bd);
  expect(tela.get(servidores.fantasma.id)).toMatchObject({ estado: 'ligando', desde: AGORA, pedidoPor: jogador.id, erro: null });
});
