import { beforeEach, describe, expect, test } from 'vitest';
import { eq } from 'drizzle-orm';
import type { Bd } from '@/bd/conexao';
import { estadosDaDiversao, servidoresDiversao, type ServidorDiversao, type Usuario } from '@/bd/esquema';
import { criarBancoDeTeste, criarUsuario } from '@/bd/teste';
import { controladorFalso } from '@/servidor-jogo/controlador';
import { entradaLiberada, estadoDoCartao, type SituacaoDoServidor } from './diversao';
import { SemPermissao } from './equipe';
import type { ControleDaDiversao } from './sob-demanda';
import { aplicarTestesDaMutacao, etapaDoTeste, MutacaoOcupada, pedirTesteDaMutacao } from './teste-mutacao';

let bd: Bd;
let adm: Usuario;
let mutacao: ServidorDiversao;
let chamadas: string[];
let controle: ControleDaDiversao;
let resposta: SituacaoDoServidor;

const AGORA = new Date('2026-11-08T18:00:00Z');
const perguntar = async () => resposta;

async function estado() {
  const [linha] = await bd.select().from(estadosDaDiversao).where(eq(estadosDaDiversao.servidorId, mutacao.id));
  return linha;
}

async function marcar(valores: Partial<typeof estadosDaDiversao.$inferInsert>) {
  await bd
    .insert(estadosDaDiversao)
    .values({ servidorId: mutacao.id, desde: AGORA, ...valores })
    .onConflictDoUpdate({ target: estadosDaDiversao.servidorId, set: valores });
}

beforeEach(async () => {
  bd = await criarBancoDeTeste();
  await bd.update(servidoresDiversao).set({ ativo: true });
  [mutacao] = await bd.select().from(servidoresDiversao).where(eq(servidoresDiversao.modo, 'mutacao'));
  adm = await criarUsuario(bd, { estado: 'ativo', papel: 'adm' });
  chamadas = [];
  controle = {
    ligar: async (nome) => void chamadas.push(`ligar ${nome}`),
    desligar: async (nome) => void chamadas.push(`desligar ${nome}`),
  };
  resposta = { ligado: false, jogando: 0 };
});

describe('pedirTesteDaMutacao', () => {
  test('só o Adm pode', async () => {
    const gm = await criarUsuario(bd, { estado: 'ativo', papel: 'gm' });
    await expect(pedirTesteDaMutacao(bd, controle, perguntar, gm, 3, AGORA)).rejects.toBeInstanceOf(SemPermissao);
    expect(chamadas).toEqual([]);
  });

  test('com a Mutação desligada, liga e marca o teste', async () => {
    await pedirTesteDaMutacao(bd, controle, perguntar, adm, 3, AGORA);
    expect(chamadas).toEqual([`ligar ${mutacao.nomeNoServidor}`]);
    expect(await estado()).toMatchObject({ estado: 'ligando', teste: 'pedido' });
  });

  test('ligada e vazia, só marca o teste, sem ligar de novo', async () => {
    await marcar({ estado: 'ligado', vazioDesde: AGORA });
    resposta = { ligado: true, jogando: 0 };
    await pedirTesteDaMutacao(bd, controle, perguntar, adm, 3, AGORA);
    expect(chamadas).toEqual([]);
    expect(await estado()).toMatchObject({ estado: 'ligado', teste: 'pedido' });
  });

  test('com gente jogando de verdade, não atrapalha a partida', async () => {
    await marcar({ estado: 'ligado' });
    resposta = { ligado: true, jogando: 3 };
    await expect(pedirTesteDaMutacao(bd, controle, perguntar, adm, 3, AGORA)).rejects.toBeInstanceOf(MutacaoOcupada);
    expect((await estado()).teste).toBeNull();
  });

  test('já em teste, pedir de novo não muda nada', async () => {
    await marcar({ estado: 'ligado', teste: 'ativo' });
    resposta = { ligado: true, jogando: 1 };
    await pedirTesteDaMutacao(bd, controle, perguntar, adm, 3, AGORA);
    expect((await estado()).teste).toBe('ativo');
  });
});

describe('aplicarTestesDaMutacao', () => {
  test('com o servidor de pé, manda o comando e o teste fica ativo', async () => {
    await marcar({ estado: 'ligado', teste: 'pedido' });
    const controlador = controladorFalso();
    await aplicarTestesDaMutacao(bd, controlador, '10.0.0.9');
    expect(controlador.chamadas).toEqual([{ acao: 'testeComBots', host: '10.0.0.9', porta: mutacao.porta }]);
    expect((await estado()).teste).toBe('ativo');
  });

  test('ainda ligando, espera a próxima volta', async () => {
    await marcar({ estado: 'ligando', teste: 'pedido' });
    const controlador = controladorFalso();
    await aplicarTestesDaMutacao(bd, controlador, '10.0.0.9');
    expect(controlador.chamadas).toEqual([]);
    expect((await estado()).teste).toBe('pedido');
  });

  test('se o servidor não respondeu ao comando, tenta de novo na próxima volta', async () => {
    await marcar({ estado: 'ligado', teste: 'pedido' });
    await aplicarTestesDaMutacao(bd, controladorFalso({ hostsComFalha: ['10.0.0.9'] }), '10.0.0.9');
    expect((await estado()).teste).toBe('pedido');
  });

  test('desligado, o teste acaba e a Mutação volta ao normal', async () => {
    await marcar({ estado: 'desligado', teste: 'ativo' });
    await aplicarTestesDaMutacao(bd, controladorFalso(), '10.0.0.9');
    expect((await estado()).teste).toBeNull();
  });
});

describe('na tela', () => {
  test('o cartão da Mutação mostra que está em teste', () => {
    expect(estadoDoCartao(mutacao, { ligado: true, jogando: 1 }, 'ligado', 'ativo')).toBe('em_teste');
    expect(estadoDoCartao(mutacao, { ligado: false, jogando: 0 }, 'ligando', 'pedido')).toBe('em_teste');
    expect(estadoDoCartao(mutacao, { ligado: true, jogando: 1 }, 'ligado', null)).toBe('aberto');
  });

  test('no teste já ligado os membros podem entrar junto com os bots, até lotar (pedido do dono, 10/11/2026)', () => {
    expect(entradaLiberada(mutacao, 'em_teste', { ligado: true, jogando: 1 })).toBe(true);
    expect(entradaLiberada(mutacao, 'em_teste', { ligado: false, jogando: 0 })).toBe(false);
    expect(entradaLiberada(mutacao, 'em_teste', { ligado: true, jogando: mutacao.vagas })).toBe(false);
    expect(entradaLiberada(mutacao, 'aberto', { ligado: true, jogando: 1 })).toBe(true);
    expect(entradaLiberada(mutacao, 'cheio', { ligado: true, jogando: mutacao.vagas })).toBe(false);
  });

  test('a aba Testes mostra em que pé está o teste', () => {
    expect(etapaDoTeste(undefined, { ligado: false, jogando: 0 })).toBe('livre');
    expect(etapaDoTeste({ estado: 'ligando', teste: 'pedido' }, { ligado: false, jogando: 0 })).toBe('ligando');
    expect(etapaDoTeste({ estado: 'ligado', teste: 'pedido' }, { ligado: true, jogando: 0, mapa: 'zm_biochemical_hotel' })).toBe('preparando');
    // O comando já foi, mas a Dust 2 ainda está carregando.
    expect(etapaDoTeste({ estado: 'ligado', teste: 'ativo' }, { ligado: false, jogando: 0 })).toBe('preparando');
    expect(etapaDoTeste({ estado: 'ligado', teste: 'ativo' }, { ligado: true, jogando: 0, mapa: 'de_dust2' })).toBe('pronto');
    expect(etapaDoTeste({ estado: 'ligado', teste: null }, { ligado: true, jogando: 2 })).toBe('livre');
  });
});
