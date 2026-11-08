import { eq } from 'drizzle-orm';
import { beforeEach, describe, expect, test } from 'vitest';
import type { Bd } from '@/bd/conexao';
import { auditoria, claMembros, clas, partidas, type Usuario } from '@/bd/esquema';
import { criarBancoDeTeste, criarUsuario } from '@/bd/teste';
import {
  ClaInvalido,
  comoErroDoCla,
  chamadosDe,
  chamarParaCla,
  claDoUsuario,
  clasDosUsuarios,
  criarCla,
  desfazerCla,
  editarCla,
  entrarNoCla,
  expulsarDoCla,
  lerDadosDoCla,
  MAXIMO_DE_MEMBROS,
  membrosDoCla,
  mudarCargo,
  passarDono,
  pedidosDoCla,
  pedirParaEntrar,
  procurarClas,
  responderPedido,
  sairDoCla,
} from './clas';

let bd: Bd;
const AGORA = new Date('2026-11-08T15:00:00Z');
const HORA = 60 * 60_000;

beforeEach(async () => {
  bd = await criarBancoDeTeste();
});

const ativo = (valores: Partial<Usuario> = {}) => criarUsuario(bd, { estado: 'ativo', ...valores });
const dados = (valores: Partial<Parameters<typeof lerDadosDoCla>[0]> = {}) => ({
  nome: 'Magnatas Originais',
  sigla: 'mgn',
  cor: 'ouro',
  entrada: 'aberto',
  descricao: 'Jogamos toda noite.',
  ...valores,
});

async function motivoDe(promessa: Promise<unknown>): Promise<string> {
  try {
    await promessa;
  } catch (erro) {
    if (erro instanceof ClaInvalido) return erro.motivo;
    throw erro;
  }
  throw new Error('Era para falhar.');
}

describe('dados do clã', () => {
  test('a sigla fica em maiúsculas e o texto sem espaços sobrando', () => {
    expect(lerDadosDoCla(dados({ nome: '  Magnatas  ', sigla: ' mg ' }))).toMatchObject({ nome: 'Magnatas', sigla: 'MG' });
  });

  test.each([['M'], ['MAGNA'], ['M-G']])('sigla %s não vale', (sigla) => {
    expect(() => lerDadosDoCla(dados({ sigla }))).toThrow(ClaInvalido);
  });

  test.each([['ab'], ['x'.repeat(33)]])('nome %s não vale', (nome) => {
    expect(() => lerDadosDoCla(dados({ nome }))).toThrow(ClaInvalido);
  });

  test('cor e entrada fora da lista não valem, e a descrição é cortada em 280', () => {
    expect(() => lerDadosDoCla(dados({ cor: 'azul' }))).toThrow(ClaInvalido);
    expect(() => lerDadosDoCla(dados({ entrada: 'talvez' }))).toThrow(ClaInvalido);
    expect(lerDadosDoCla(dados({ descricao: 'a'.repeat(400) })).descricao).toHaveLength(280);
  });
});

describe('criar', () => {
  test('quem cria vira dono, com a sigla em maiúsculas', async () => {
    const dono = await ativo();
    const cla = await criarCla(bd, dono, dados({ sigla: 'mg' }), AGORA);
    expect(cla.sigla).toBe('MG');
    expect(await claDoUsuario(bd, dono.id)).toMatchObject({ id: cla.id, cargo: 'dono' });
  });

  test('nome ou sigla repetidos, em outra caixa, não valem', async () => {
    await criarCla(bd, await ativo(), dados(), AGORA);
    expect(await motivoDe(criarCla(bd, await ativo(), dados({ nome: 'MAGNATAS ORIGINAIS', sigla: 'xyz' }), AGORA))).toBe('repetido');
    expect(await motivoDe(criarCla(bd, await ativo(), dados({ nome: 'Outro Nome', sigla: 'MGN' }), AGORA))).toBe('repetido');
  });

  test('quem já tem clã não cria outro', async () => {
    const dono = await ativo();
    await criarCla(bd, dono, dados(), AGORA);
    expect(await motivoDe(criarCla(bd, dono, dados({ nome: 'Segundo', sigla: 'SEG' }), AGORA))).toBe('ja-tem-cla');
  });
});

describe('entrar', () => {
  test('em clã aberto entra direto; em clã de convite não', async () => {
    const aberto = await criarCla(bd, await ativo(), dados(), AGORA);
    const fechado = await criarCla(bd, await ativo(), dados({ nome: 'Fechado', sigla: 'FCH', entrada: 'convite' }), AGORA);
    const novato = await ativo();
    expect(await motivoDe(entrarNoCla(bd, novato, fechado.id, AGORA))).toBe('convite');
    await entrarNoCla(bd, novato, aberto.id, AGORA);
    expect(await claDoUsuario(bd, novato.id)).toMatchObject({ id: aberto.id, cargo: 'membro' });
  });

  test('pedir para entrar em clã aberto já entra', async () => {
    const aberto = await criarCla(bd, await ativo(), dados(), AGORA);
    const novato = await ativo();
    await pedirParaEntrar(bd, novato, aberto.id, AGORA);
    expect((await claDoUsuario(bd, novato.id))?.id).toBe(aberto.id);
  });

  test(`o clã para em ${MAXIMO_DE_MEMBROS}`, async () => {
    const cla = await criarCla(bd, await ativo(), dados(), AGORA);
    for (let i = 1; i < MAXIMO_DE_MEMBROS; i += 1) await entrarNoCla(bd, await ativo(), cla.id, AGORA);
    expect(await motivoDe(entrarNoCla(bd, await ativo(), cla.id, AGORA))).toBe('cheio');
  });

  test('quem saiu espera 24 horas para entrar em outro', async () => {
    const primeiro = await criarCla(bd, await ativo(), dados(), AGORA);
    const segundo = await criarCla(bd, await ativo(), dados({ nome: 'Segundo', sigla: 'SEG' }), AGORA);
    const viajante = await ativo();
    await entrarNoCla(bd, viajante, primeiro.id, AGORA);
    await sairDoCla(bd, viajante, AGORA);
    expect(await motivoDe(entrarNoCla(bd, viajante, segundo.id, new Date(AGORA.getTime() + 23 * HORA)))).toBe('espera');
    await entrarNoCla(bd, viajante, segundo.id, new Date(AGORA.getTime() + 25 * HORA));
    expect((await claDoUsuario(bd, viajante.id))?.id).toBe(segundo.id);
  });

  test('quem já está num clã não entra em outro', async () => {
    const primeiro = await criarCla(bd, await ativo(), dados(), AGORA);
    const segundo = await criarCla(bd, await ativo(), dados({ nome: 'Segundo', sigla: 'SEG' }), AGORA);
    const pessoa = await ativo();
    await entrarNoCla(bd, pessoa, primeiro.id, AGORA);
    expect(await motivoDe(entrarNoCla(bd, pessoa, segundo.id, AGORA))).toBe('ja-tem-cla');
  });
});

describe('pedidos e chamados', () => {
  test('pedido em clã de convite espera o dono ou um capitão', async () => {
    const dono = await ativo();
    const cla = await criarCla(bd, dono, dados({ entrada: 'convite' }), AGORA);
    const novato = await ativo();
    await pedirParaEntrar(bd, novato, cla.id, AGORA);
    const [pedido] = await pedidosDoCla(bd, cla.id);
    expect(pedido).toMatchObject({ usuarioId: novato.id });
    const membro = await ativo();
    await chamarParaCla(bd, dono, cla.id, membro.id, AGORA);
    await responderPedido(bd, membro, (await chamadosDe(bd, membro.id))[0].id, true, AGORA);
    expect(await motivoDe(responderPedido(bd, membro, pedido.id, true, AGORA))).toBe('cargo');
    await responderPedido(bd, dono, pedido.id, true, AGORA);
    expect((await claDoUsuario(bd, novato.id))?.cargo).toBe('membro');
  });

  test('pedido e chamado da mesma pessoa: os dois querem, então ela já entra e os outros pedidos somem', async () => {
    const dono = await ativo();
    const cla = await criarCla(bd, dono, dados({ entrada: 'convite' }), AGORA);
    const outro = await criarCla(bd, await ativo(), dados({ nome: 'Outro Clã', sigla: 'OUT', entrada: 'convite' }), AGORA);
    const pessoa = await ativo();
    await pedirParaEntrar(bd, pessoa, cla.id, AGORA);
    await pedirParaEntrar(bd, pessoa, outro.id, AGORA);
    await chamarParaCla(bd, dono, cla.id, pessoa.id, AGORA);
    expect((await claDoUsuario(bd, pessoa.id))?.id).toBe(cla.id);
    expect(await pedidosDoCla(bd, cla.id)).toEqual([]);
    expect(await pedidosDoCla(bd, outro.id)).toEqual([]);
    expect(await chamadosDe(bd, pessoa.id)).toEqual([]);
  });

  test('chamado e depois pedido da mesma pessoa: ela entra no pedido', async () => {
    const dono = await ativo();
    const cla = await criarCla(bd, dono, dados({ entrada: 'convite' }), AGORA);
    const pessoa = await ativo();
    await chamarParaCla(bd, dono, cla.id, pessoa.id, AGORA);
    await pedirParaEntrar(bd, pessoa, cla.id, AGORA);
    expect((await claDoUsuario(bd, pessoa.id))?.id).toBe(cla.id);
  });

  test('membro comum não chama ninguém, e recusar apaga o pedido', async () => {
    const dono = await ativo();
    const cla = await criarCla(bd, dono, dados({ entrada: 'convite' }), AGORA);
    const membro = await ativo();
    await chamarParaCla(bd, dono, cla.id, membro.id, AGORA);
    await responderPedido(bd, membro, (await chamadosDe(bd, membro.id))[0].id, true, AGORA);
    expect(await motivoDe(chamarParaCla(bd, membro, cla.id, (await ativo()).id, AGORA))).toBe('cargo');
    const novato = await ativo();
    await pedirParaEntrar(bd, novato, cla.id, AGORA);
    await responderPedido(bd, dono, (await pedidosDoCla(bd, cla.id))[0].id, false, AGORA);
    expect(await pedidosDoCla(bd, cla.id)).toEqual([]);
    expect(await claDoUsuario(bd, novato.id)).toBeNull();
  });
});

describe('cargos e saída', () => {
  async function claComTres() {
    const dono = await ativo();
    const cla = await criarCla(bd, dono, dados(), AGORA);
    const capitao = await ativo();
    const membro = await ativo();
    await entrarNoCla(bd, capitao, cla.id, AGORA);
    await entrarNoCla(bd, membro, cla.id, AGORA);
    await mudarCargo(bd, dono, capitao.id, 'capitao');
    return { cla, dono, capitao, membro };
  }

  test('capitão expulsa membro mas não expulsa capitão, e quem é expulso espera as 24 horas', async () => {
    const { cla, dono, capitao, membro } = await claComTres();
    await expulsarDoCla(bd, capitao, membro.id, AGORA);
    expect(await claDoUsuario(bd, membro.id)).toBeNull();
    expect(await motivoDe(entrarNoCla(bd, membro, cla.id, AGORA))).toBe('espera');
    const outro = await ativo();
    await entrarNoCla(bd, outro, cla.id, AGORA);
    await mudarCargo(bd, dono, outro.id, 'capitao');
    expect(await motivoDe(expulsarDoCla(bd, capitao, outro.id, AGORA))).toBe('cargo');
    expect(await motivoDe(expulsarDoCla(bd, capitao, dono.id, AGORA))).toBe('cargo');
  });

  test('só o dono muda cargo e edita o clã', async () => {
    const { cla, capitao, membro } = await claComTres();
    expect(await motivoDe(mudarCargo(bd, capitao, membro.id, 'capitao'))).toBe('cargo');
    expect(await motivoDe(editarCla(bd, capitao, dados({ descricao: 'Novo' })))).toBe('cargo');
    expect(cla.descricao).toBe('Jogamos toda noite.');
  });

  test('dono edita o clã', async () => {
    const { dono } = await claComTres();
    await editarCla(bd, dono, dados({ descricao: 'Treino às 21h', cor: 'verde' }));
    expect(await claDoUsuario(bd, dono.id)).toMatchObject({ descricao: 'Treino às 21h', cor: 'verde' });
  });

  test('dono com mais gente não sai; passando o cargo, sai', async () => {
    const { dono, capitao } = await claComTres();
    expect(await motivoDe(sairDoCla(bd, dono, AGORA))).toBe('dono-sai');
    await passarDono(bd, dono, capitao.id);
    expect((await claDoUsuario(bd, capitao.id))?.cargo).toBe('dono');
    expect((await claDoUsuario(bd, dono.id))?.cargo).toBe('capitao');
    await sairDoCla(bd, dono, AGORA);
    expect(await claDoUsuario(bd, dono.id)).toBeNull();
  });

  test('dono sozinho sai e desfaz o clã, que continua achável pelas partidas antigas', async () => {
    const dono = await ativo();
    const cla = await criarCla(bd, dono, dados(), AGORA);
    const [partida] = await bd.insert(partidas).values({ tipo: 'cla', estado: 'encerrada', claTime1Id: cla.id }).returning();
    await sairDoCla(bd, dono, AGORA);
    const [guardado] = await bd.select().from(clas).where(eq(clas.id, partida.claTime1Id!));
    expect(guardado).toMatchObject({ nome: 'Magnatas Originais', sigla: 'MGN' });
    expect(guardado.desfeitoEm).not.toBeNull();
    expect(await procurarClas(bd)).toEqual([]);
    await criarCla(bd, await ativo(), dados(), AGORA);
  });
});

describe('equipe do site', () => {
  test('jogador não desfaz clã; adm desfaz e fica na auditoria', async () => {
    const dono = await ativo();
    const cla = await criarCla(bd, dono, dados(), AGORA);
    await expect(desfazerCla(bd, await ativo(), cla.id, AGORA)).rejects.toThrow();
    const adm = await ativo({ papel: 'adm' });
    await desfazerCla(bd, adm, cla.id, AGORA);
    expect(await claDoUsuario(bd, dono.id)).toBeNull();
    expect(await bd.select().from(claMembros)).toEqual([]);
    const [registro] = await bd.select().from(auditoria).where(eq(auditoria.acao, 'desfazer_cla'));
    expect(registro).toMatchObject({ atorId: adm.id });
  });
});

describe('leituras', () => {
  test('membros vêm com dono, capitães e membros, e a busca acha por nome ou sigla', async () => {
    const dono = await ativo({ apelido: 'Zeca' });
    const cla = await criarCla(bd, dono, dados(), AGORA);
    const capitao = await ativo({ apelido: 'Bia' });
    const membro = await ativo({ apelido: 'Ana' });
    await entrarNoCla(bd, membro, cla.id, AGORA);
    await entrarNoCla(bd, capitao, cla.id, AGORA);
    await mudarCargo(bd, dono, capitao.id, 'capitao');
    expect((await membrosDoCla(bd, cla.id)).map((linha) => [linha.apelido, linha.cargo])).toEqual([
      ['Zeca', 'dono'],
      ['Bia', 'capitao'],
      ['Ana', 'membro'],
    ]);
    expect((await procurarClas(bd, 'origi')).map((linha) => [linha.cla.sigla, linha.membros])).toEqual([['MGN', 3]]);
    expect((await procurarClas(bd, 'mg')).length).toBe(1);
    expect(await procurarClas(bd, 'nada')).toEqual([]);
    const mapa = await clasDosUsuarios(bd, [dono.id, membro.id, (await ativo()).id]);
    expect(mapa.get(membro.id)).toMatchObject({ sigla: 'MGN', cor: 'ouro' });
    expect(mapa.size).toBe(2);
  });
});

describe('comoErroDoCla', () => {
  async function erroDe(acao: () => Promise<unknown>): Promise<unknown> {
    return acao().then(
      () => null,
      (erro: unknown) => erro,
    );
  }

  test('nome ou sigla repetidos no mesmo instante viram a mensagem de repetido, e não uma página de erro', async () => {
    await bd.insert(clas).values({ nome: 'Magnatas', sigla: 'MGN', cor: 'ouro', entrada: 'aberto' });
    const nome = comoErroDoCla(await erroDe(() => bd.insert(clas).values({ nome: 'MAGNATAS', sigla: 'XYZ', cor: 'roxo', entrada: 'aberto' })));
    const sigla = comoErroDoCla(await erroDe(() => bd.insert(clas).values({ nome: 'Outro', sigla: 'mgn', cor: 'roxo', entrada: 'aberto' })));
    expect(nome).toBeInstanceOf(ClaInvalido);
    expect((nome as ClaInvalido).motivo).toBe('repetido');
    expect((sigla as ClaInvalido).motivo).toBe('repetido');
  });

  test('a mesma pessoa criando dois clãs ao mesmo tempo vira "já tem clã"', async () => {
    const conta = await criarUsuario(bd, { estado: 'ativo' });
    const [a] = await bd.insert(clas).values({ nome: 'Alfa', sigla: 'ALF', cor: 'ouro', entrada: 'aberto' }).returning();
    const [b] = await bd.insert(clas).values({ nome: 'Bravo', sigla: 'BRV', cor: 'ouro', entrada: 'aberto' }).returning();
    await bd.insert(claMembros).values({ usuarioId: conta.id, claId: a.id, cargo: 'dono' });
    const erro = comoErroDoCla(await erroDe(() => bd.insert(claMembros).values({ usuarioId: conta.id, claId: b.id, cargo: 'dono' })));
    expect((erro as ClaInvalido).motivo).toBe('ja-tem-cla');
  });

  test('outros erros passam como vieram', () => {
    const outro = new Error('caiu a conexão');
    expect(comoErroDoCla(outro)).toBe(outro);
  });
});
