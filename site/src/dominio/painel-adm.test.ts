import { beforeEach, describe, expect, test } from 'vitest';
import type { Bd } from '@/bd/conexao';
import { assinaturas, auditoria, convites, mensalidades, partidas, pedidos, servidores } from '@/bd/esquema';
import { criarBancoDeTeste, criarUsuario } from '@/bd/teste';
import { buscarUsuarios, fichaDoUsuario, numerosDoDash, partidasRolando, registroDaEquipe, serieDeDias } from './painel-adm';

let bd: Bd;
const AGORA = new Date('2026-11-13T15:00:00Z'); // 12h em Brasília
const diasAtras = (dias: number, horaUtc = 15) => new Date(Date.UTC(2026, 10, 13 - dias, horaUtc));

beforeEach(async () => {
  bd = await criarBancoDeTeste();
});

describe('numerosDoDash', () => {
  test('membros: total, ativos, novos hoje e na semana, e quem espera verificação', async () => {
    await criarUsuario(bd, { estado: 'ativo', criadoEm: diasAtras(30) });
    await criarUsuario(bd, { estado: 'ativo', criadoEm: diasAtras(0, 13) });
    await criarUsuario(bd, { estado: 'aguardando_verificacao', criadoEm: diasAtras(3) });
    await criarUsuario(bd, { estado: 'banido', criadoEm: diasAtras(10) });
    const numeros = await numerosDoDash(bd, AGORA);
    expect(numeros.membros).toEqual({ total: 4, ativos: 2, novosHoje: 1, novos7Dias: 2, aguardandoVerificacao: 1, punidos: 1 });
  });

  test('dinheiro do mês: MagCoins pagas e mensalidades, sem pedido aberto nem do mês passado', async () => {
    const quem = await criarUsuario(bd, { estado: 'ativo' });
    await bd.insert(pedidos).values([
      { usuarioId: quem.id, pacote: 'pequeno', valorCentavos: 1000, magcoins: 100, estado: 'pago', pagoEm: diasAtras(2) },
      { usuarioId: quem.id, pacote: 'medio', valorCentavos: 2500, magcoins: 300, estado: 'aberto' },
      { usuarioId: quem.id, pacote: 'pequeno', valorCentavos: 1000, magcoins: 100, estado: 'pago', pagoEm: new Date('2026-10-20T12:00:00Z') },
    ]);
    const [assinatura] = await bd
      .insert(assinaturas)
      .values({ usuarioId: quem.id, nivel: 'premium', email: 'x@x.com', estado: 'ativa', pagoAte: new Date('2026-12-10T00:00:00Z') })
      .returning();
    await bd.insert(mensalidades).values({ assinaturaId: assinatura.id, mpPagamentoId: 'mp1', valorCentavos: 3000, pagoEm: diasAtras(1) });
    const numeros = await numerosDoDash(bd, AGORA);
    expect(numeros.dinheiro).toEqual({ magcoinsDoMesCentavos: 1000, mensalidadesDoMesCentavos: 3000, premiumAtivos: 1, apoiadoresAtivos: 0 });
  });

  test('convites usados na semana e partidas de hoje e da semana, sem as canceladas', async () => {
    const quem = await criarUsuario(bd, { estado: 'ativo' });
    await bd.insert(convites).values([
      { codigo: 'a', criadoPor: quem.id, usadoPor: quem.id, usadoEm: diasAtras(1) },
      { codigo: 'b', criadoPor: quem.id, usadoPor: quem.id, usadoEm: diasAtras(20) },
      { codigo: 'c', criadoPor: quem.id },
    ]);
    await bd.insert(partidas).values([
      { tipo: 'mix', estado: 'encerrada', criadoEm: diasAtras(0, 14) },
      { tipo: 'mix', estado: 'encerrada', criadoEm: diasAtras(4) },
      { tipo: 'mix', estado: 'cancelada', criadoEm: diasAtras(1) },
    ]);
    const numeros = await numerosDoDash(bd, AGORA);
    expect(numeros.convitesUsados7Dias).toBe(1);
    expect(numeros.partidas).toEqual({ hoje: 1, semana: 2 });
  });

  test('os gráficos têm 14 dias, do mais antigo para hoje, com zero nos dias vazios', async () => {
    await criarUsuario(bd, { estado: 'ativo', criadoEm: diasAtras(0, 14) });
    await criarUsuario(bd, { estado: 'ativo', criadoEm: diasAtras(0, 14) });
    await criarUsuario(bd, { estado: 'ativo', criadoEm: diasAtras(13) });
    const numeros = await numerosDoDash(bd, AGORA);
    expect(numeros.cadastrosPorDia).toHaveLength(14);
    expect(numeros.cadastrosPorDia[13]).toEqual({ dia: '13/11', total: 2 });
    expect(numeros.cadastrosPorDia[0]).toEqual({ dia: '31/10', total: 1 });
    expect(numeros.cadastrosPorDia[5].total).toBe(0);
  });
});

test('serieDeDias usa o dia de Brasília: 1h da manhã UTC ainda é o dia anterior', () => {
  const serie = serieDeDias([new Date('2026-11-13T01:00:00Z')], new Date('2026-11-13T15:00:00Z'), 2);
  expect(serie).toEqual([
    { dia: '12/11', total: 1 },
    { dia: '13/11', total: 0 },
  ]);
});

describe('buscarUsuarios', () => {
  test('acha pelo apelido ou pelo SteamID e filtra por situação e cargo', async () => {
    await criarUsuario(bd, { apelido: 'DraGonZit0', estado: 'ativo', papel: 'adm', steamid64: '76561198059579263' });
    await criarUsuario(bd, { apelido: 'Marfioso', estado: 'ativo' });
    await criarUsuario(bd, { apelido: 'dragao_novo', estado: 'suspenso' });
    expect((await buscarUsuarios(bd, { termo: 'drag' })).map((conta) => conta.apelido).sort()).toEqual(['DraGonZit0', 'dragao_novo']);
    expect((await buscarUsuarios(bd, { termo: '76561198059579263' })).map((conta) => conta.apelido)).toEqual(['DraGonZit0']);
    expect((await buscarUsuarios(bd, { estado: 'suspenso' })).map((conta) => conta.apelido)).toEqual(['dragao_novo']);
    expect((await buscarUsuarios(bd, { papel: 'adm' })).map((conta) => conta.apelido)).toEqual(['DraGonZit0']);
  });

  test('o termo vira texto, nunca padrão: % e _ não pegam todo mundo', async () => {
    await criarUsuario(bd, { apelido: 'alguem', estado: 'ativo' });
    expect(await buscarUsuarios(bd, { termo: '%' })).toEqual([]);
  });

  test('Premium: só quem tem assinatura premium ativa e paga', async () => {
    const pagante = await criarUsuario(bd, { apelido: 'pagante', estado: 'ativo' });
    const vencido = await criarUsuario(bd, { apelido: 'vencido', estado: 'ativo' });
    await bd.insert(assinaturas).values([
      { usuarioId: pagante.id, nivel: 'premium', email: 'a@a.com', estado: 'ativa', pagoAte: new Date('2026-12-01T00:00:00Z') },
      { usuarioId: vencido.id, nivel: 'premium', email: 'b@b.com', estado: 'ativa', pagoAte: new Date('2026-11-01T00:00:00Z') },
    ]);
    expect((await buscarUsuarios(bd, { premium: true }, AGORA)).map((conta) => conta.apelido)).toEqual(['pagante']);
  });
});

describe('fichaDoUsuario', () => {
  test('junta quem convidou, quem ele convidou, assinatura e o histórico da equipe com a conta', async () => {
    const adm = await criarUsuario(bd, { apelido: 'Adm', estado: 'ativo', papel: 'adm' });
    const conta = await criarUsuario(bd, { apelido: 'Fulano', estado: 'ativo', convidadoPor: adm.id });
    await criarUsuario(bd, { apelido: 'Amigo', estado: 'ativo', convidadoPor: conta.id });
    await bd.insert(auditoria).values({ atorId: adm.id, alvoId: conta.id, acao: 'ajustar_grana', detalhes: { quantidade: 100 } });
    const ficha = await fichaDoUsuario(bd, conta.id, AGORA);
    expect(ficha?.usuario.apelido).toBe('Fulano');
    expect(ficha?.convidadoPor?.apelido).toBe('Adm');
    expect(ficha?.convidados.map((amigo) => amigo.apelido)).toEqual(['Amigo']);
    expect(ficha?.assinatura).toBeNull();
    expect(ficha?.historico).toHaveLength(1);
    expect(ficha?.historico[0]).toMatchObject({ acao: 'ajustar_grana', atorApelido: 'Adm' });
  });

  test('conta que não existe vira null', async () => {
    expect(await fichaDoUsuario(bd, '00000000-0000-0000-0000-000000000000', AGORA)).toBeNull();
  });
});

test('partidasRolando: só as em andamento, com o servidor e há quanto tempo', async () => {
  const [servidor] = await bd.insert(servidores).values({ nome: 'Servidor 1', host: '1.2.3.4', porta: 27015 }).returning();
  await bd.insert(partidas).values([
    { tipo: 'mix', estado: 'ao_vivo', servidorId: servidor.id, mapa: 'de_mirage', placar1: 7, placar2: 5, criadoEm: diasAtras(0, 14) },
    { tipo: 'desafio', estado: 'vetando', criadoEm: diasAtras(0, 14) },
    { tipo: 'mix', estado: 'encerrada', criadoEm: diasAtras(0, 13) },
    { tipo: 'mix', estado: 'cancelada', criadoEm: diasAtras(0, 13) },
  ]);
  const rolando = await partidasRolando(bd);
  expect(rolando.map((linha) => linha.partida.estado).sort()).toEqual(['ao_vivo', 'vetando']);
  expect(rolando.find((linha) => linha.partida.estado === 'ao_vivo')?.servidorNome).toBe('Servidor 1');
});

test('registroDaEquipe: o mais novo primeiro, com o nome de quem fez e de quem recebeu', async () => {
  const adm = await criarUsuario(bd, { apelido: 'Adm', estado: 'ativo', papel: 'adm' });
  const alvo = await criarUsuario(bd, { apelido: 'Alvo', estado: 'ativo' });
  await bd.insert(auditoria).values([
    { atorId: adm.id, alvoId: alvo.id, acao: 'mudar_papel', criadoEm: diasAtras(2) },
    { atorId: adm.id, acao: 'cancelar_partida', criadoEm: diasAtras(1) },
  ]);
  const registro = await registroDaEquipe(bd, 10);
  expect(registro.map((linha) => linha.acao)).toEqual(['cancelar_partida', 'mudar_papel']);
  expect(registro[1]).toMatchObject({ atorApelido: 'Adm', alvoApelido: 'Alvo' });
});
