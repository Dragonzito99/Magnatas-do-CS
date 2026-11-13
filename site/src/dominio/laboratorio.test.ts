import { beforeEach, describe, expect, test } from 'vitest';
import type { Bd } from '@/bd/conexao';
import type { Usuario } from '@/bd/esquema';
import { criarBancoDeTeste, criarUsuario } from '@/bd/teste';
import { pode } from '@/auth/permissoes';
import { SemPermissao } from './equipe';
import { alvoDoLaboratorio, etapaDoLaboratorio, LABORATORIOS, LaboratorioDesconhecido, ligarLaboratorio, lerLaboratorio, pedidoRecente } from './laboratorio';
import { NOME_NO_SERVIDOR_VALIDO, PRAZO_PARA_LIGAR_MS, type ControleDaDiversao } from './sob-demanda';

let bd: Bd;
let adm: Usuario;
let chamadas: string[];
let controle: ControleDaDiversao;

beforeEach(async () => {
  bd = await criarBancoDeTeste();
  adm = await criarUsuario(bd, { estado: 'ativo', papel: 'adm' });
  chamadas = [];
  controle = {
    ligar: async (nome) => void chamadas.push(`ligar ${nome}`),
    desligar: async (nome) => void chamadas.push(`desligar ${nome}`),
  };
});

describe('os laboratórios', () => {
  test('personagens na 27022 e mutantes na 27023, com o nome do .conf da VPS', () => {
    expect(LABORATORIOS.map(({ chave, nome, porta }) => ({ chave, nome, porta }))).toEqual([
      { chave: 'personagens', nome: 'laboratorio-personagens', porta: 27022 },
      { chave: 'mutantes', nome: 'laboratorio-mutantes', porta: 27023 },
    ]);
    for (const laboratorio of LABORATORIOS) expect(NOME_NO_SERVIDOR_VALIDO.test(laboratorio.nome)).toBe(true);
  });

  test('só o Adm usa', () => {
    expect(pode({ papel: 'adm', estado: 'ativo' }, 'usar_laboratorio')).toBe(true);
    expect(pode({ papel: 'gm', estado: 'ativo' }, 'usar_laboratorio')).toBe(false);
    expect(pode({ papel: 'jogador', estado: 'ativo' }, 'usar_laboratorio')).toBe(false);
  });

  test('lê a escolha da tela só se for um dos dois', () => {
    expect(lerLaboratorio('mutantes')?.nome).toBe('laboratorio-mutantes');
    expect(lerLaboratorio('mutacao')).toBeNull();
    expect(lerLaboratorio(null)).toBeNull();
  });

  test('o endereço é o da Diversão, na porta do laboratório', () => {
    expect(alvoDoLaboratorio(LABORATORIOS[1], '10.0.0.9')).toEqual({ host: '10.0.0.9', porta: 27023 });
    expect(alvoDoLaboratorio(LABORATORIOS[1], undefined)).toBeNull();
  });
});

describe('ligarLaboratorio', () => {
  test('o Adm liga pelo script da Diversão', async () => {
    const laboratorio = await ligarLaboratorio(bd, controle, adm, 'personagens');
    expect(laboratorio.nome).toBe('laboratorio-personagens');
    expect(chamadas).toEqual(['ligar laboratorio-personagens']);
  });

  test('quem não é Adm não liga nada', async () => {
    const gm = await criarUsuario(bd, { estado: 'ativo', papel: 'gm' });
    await expect(ligarLaboratorio(bd, controle, gm, 'mutantes')).rejects.toBeInstanceOf(SemPermissao);
    expect(chamadas).toEqual([]);
  });

  test('outro nome não vira comando na VPS', async () => {
    await expect(ligarLaboratorio(bd, controle, adm, 'mutacao')).rejects.toBeInstanceOf(LaboratorioDesconhecido);
    expect(chamadas).toEqual([]);
  });
});

describe('etapaDoLaboratorio', () => {
  test('respondendo, pronto para entrar', () => {
    expect(etapaDoLaboratorio({ ligado: true, jogando: 0 }, false)).toBe('pronto');
    expect(etapaDoLaboratorio({ ligado: true, jogando: 1 }, true)).toBe('pronto');
  });

  test('pedido agora e ainda sem responder, ligando', () => {
    expect(etapaDoLaboratorio({ ligado: false, jogando: 0 }, true)).toBe('ligando');
  });

  test('o pedido da tela vale só pelo prazo de ligar', () => {
    const agora = Date.parse('2026-11-13T12:00:00Z');
    expect(pedidoRecente(String(agora - 60_000), agora)).toBe(true);
    expect(pedidoRecente(String(agora - PRAZO_PARA_LIGAR_MS - 1), agora)).toBe(false);
    expect(pedidoRecente(undefined, agora)).toBe(false);
    expect(pedidoRecente('abc', agora)).toBe(false);
    // Uma hora no futuro não segura a tela em "ligando".
    expect(pedidoRecente(String(agora + 60 * 60_000), agora)).toBe(false);
  });

  test('sem pedido e sem responder, desligado', () => {
    expect(etapaDoLaboratorio({ ligado: false, jogando: 0 }, false)).toBe('desligado');
  });
});
