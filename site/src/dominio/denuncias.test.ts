import { eq } from 'drizzle-orm';
import { beforeEach, expect, test } from 'vitest';
import type { Bd } from '@/bd/conexao';
import { auditoria, chamados, denuncias, partidas, usuarios, type Partida, type Usuario } from '@/bd/esquema';
import { criarBancoDeTeste, criarUsuario } from '@/bd/teste';
import {
  AcusadoInvalido,
  analisarDenuncia,
  atenderChamado,
  ChamadoIndisponivel,
  chamarEquipe,
  contarCasos,
  denunciar,
  DenunciaIndisponivel,
  DenunciaRepetida,
  listarCasos,
  marcarVisto,
  membrosOnline,
  MotivoInvalido,
  NaoJogou,
  ConclusaoInvalida,
} from './denuncias';
import { ContaSemAcesso } from './disponibilidade';
import { SemPermissao } from './equipe';
import { criarPartida, dadosDeConexao } from './partidas';

let bd: Bd;
let partida: Partida;
let time1: Usuario[];
let time2: Usuario[];
const AGORA = new Date('2026-11-03T12:00:00Z');
const minutos = (m: number) => new Date(AGORA.getTime() - m * 60_000);

beforeEach(async () => {
  bd = await criarBancoDeTeste();
  time1 = [];
  time2 = [];
  for (let i = 0; i < 5; i += 1) {
    time1.push(await criarUsuario(bd, { estado: 'ativo' }));
    time2.push(await criarUsuario(bd, { estado: 'ativo' }));
  }
  partida = await bd.transaction((tx) =>
    criarPartida(tx, { tipo: 'mix', time1: time1.map((c) => c.id), time2: time2.map((c) => c.id) }),
  );
  await bd.update(partidas).set({ estado: 'ao_vivo' }).where(eq(partidas.id, partida.id));
});

const gmOnline = (visto = minutos(1)) => criarUsuario(bd, { estado: 'ativo', papel: 'gm', vistoEm: visto });

test('jogador da partida denuncia outro jogador da partida', async () => {
  const denuncia = await denunciar(bd, time1[0], { partidaId: partida.id, acusadoId: time2[0].id, motivo: '  Mira grudada  ' });
  expect(denuncia).toMatchObject({ denuncianteId: time1[0].id, acusadoId: time2[0].id, motivo: 'Mira grudada', estado: 'aberta' });
});

test('não dá para denunciar a si mesmo nem quem não jogou', async () => {
  const fora = await criarUsuario(bd, { estado: 'ativo' });
  await expect(denunciar(bd, time1[0], { partidaId: partida.id, acusadoId: time1[0].id, motivo: 'x' })).rejects.toThrow(AcusadoInvalido);
  await expect(denunciar(bd, time1[0], { partidaId: partida.id, acusadoId: fora.id, motivo: 'x' })).rejects.toThrow(AcusadoInvalido);
});

test('quem não jogou a partida não denuncia', async () => {
  const fora = await criarUsuario(bd, { estado: 'ativo' });
  await expect(denunciar(bd, fora, { partidaId: partida.id, acusadoId: time1[0].id, motivo: 'x' })).rejects.toThrow(NaoJogou);
});

test('conta suspensa não denuncia', async () => {
  await bd.update(usuarios).set({ estado: 'suspenso' }).where(eq(usuarios.id, time1[0].id));
  await expect(denunciar(bd, time1[0], { partidaId: partida.id, acusadoId: time2[0].id, motivo: 'x' })).rejects.toThrow(ContaSemAcesso);
});

test('a mesma denúncia repetida é recusada com mensagem clara', async () => {
  const dados = { partidaId: partida.id, acusadoId: time2[0].id, motivo: 'x' };
  await denunciar(bd, time1[0], dados);
  await expect(denunciar(bd, time1[0], dados)).rejects.toThrow(DenunciaRepetida);
  await expect(denunciar(bd, time1[0], dados)).rejects.toThrow(/já denunciou/i);
  await expect(denunciar(bd, time1[1], dados)).resolves.toBeDefined();
});

test.each(['', '   ', 'x'.repeat(501)])('o motivo é obrigatório, com no máximo 500 caracteres: %j', async (motivo) => {
  await expect(denunciar(bd, time1[0], { partidaId: partida.id, acusadoId: time2[0].id, motivo })).rejects.toThrow(MotivoInvalido);
});

test('chamado em partida ao vivo com GM online fica aberto', async () => {
  await gmOnline();
  const { chamado, virouDenuncia } = await chamarEquipe(bd, time1[0], partida.id, AGORA);
  expect(chamado).toMatchObject({ estado: 'aberto', chamadoPor: time1[0].id });
  expect(virouDenuncia).toBe(false);
  expect(await bd.select().from(denuncias)).toEqual([]);
});

test('Adm online também conta como equipe', async () => {
  await criarUsuario(bd, { estado: 'ativo', papel: 'adm', vistoEm: minutos(1) });
  expect((await chamarEquipe(bd, time1[0], partida.id, AGORA)).virouDenuncia).toBe(false);
});

test('sem GM online há menos de 2 minutos, o chamado vira denúncia sem acusado definido', async () => {
  await gmOnline(minutos(3));
  const { chamado, virouDenuncia } = await chamarEquipe(bd, time1[0], partida.id, AGORA);
  expect(chamado.estado).toBe('virou_denuncia');
  expect(virouDenuncia).toBe(true);
  const [denuncia] = await bd.select().from(denuncias);
  expect(denuncia).toMatchObject({ denuncianteId: time1[0].id, acusadoId: null, estado: 'aberta', partidaId: partida.id });
});

test('GM que está jogando a partida não conta como equipe online', async () => {
  await bd.update(usuarios).set({ papel: 'gm', vistoEm: minutos(1) }).where(eq(usuarios.id, time2[0].id));
  expect((await chamarEquipe(bd, time1[0], partida.id, AGORA)).virouDenuncia).toBe(true);
});

test('chamado repetido na mesma partida reaproveita o aberto', async () => {
  await gmOnline();
  const primeiro = await chamarEquipe(bd, time1[0], partida.id, AGORA);
  const segundo = await chamarEquipe(bd, time2[0], partida.id, AGORA);
  expect(segundo.chamado.id).toBe(primeiro.chamado.id);
  expect(await bd.select().from(chamados)).toHaveLength(1);
});

test('chamar de novo sem equipe online não cria outra denúncia da mesma pessoa', async () => {
  await chamarEquipe(bd, time1[0], partida.id, AGORA);
  await chamarEquipe(bd, time1[0], partida.id, AGORA);
  expect(await bd.select().from(denuncias)).toHaveLength(1);
  expect(await bd.select().from(chamados)).toHaveLength(1);
});

test('quem não joga a partida não chama a equipe', async () => {
  await expect(chamarEquipe(bd, await criarUsuario(bd, { estado: 'ativo' }), partida.id, AGORA)).rejects.toThrow(NaoJogou);
});

test('partida encerrada não recebe chamado', async () => {
  await bd.update(partidas).set({ estado: 'encerrada' }).where(eq(partidas.id, partida.id));
  await expect(chamarEquipe(bd, time1[0], partida.id, AGORA)).rejects.toThrow(ChamadoIndisponivel);
});

test('GM que está jogando a partida não atende o chamado', async () => {
  await gmOnline();
  const { chamado } = await chamarEquipe(bd, time1[0], partida.id, AGORA);
  await bd.update(usuarios).set({ papel: 'gm' }).where(eq(usuarios.id, time2[0].id));
  const [jogadorGm] = await bd.select().from(usuarios).where(eq(usuarios.id, time2[0].id));
  await expect(atenderChamado(bd, jogadorGm, chamado.id)).rejects.toThrow(SemPermissao);
});

test('atender registra quem atendeu e libera os dados de conexão', async () => {
  const gm = await gmOnline();
  const { chamado } = await chamarEquipe(bd, time1[0], partida.id, AGORA);
  const atendido = await atenderChamado(bd, gm, chamado.id);
  expect(atendido).toMatchObject({ estado: 'atendido', atendidoPor: gm.id, partidaId: partida.id });
  const servidor = { host: '10.0.0.1', porta: 27015 };
  expect(dadosDeConexao({ estado: 'ao_vivo' }, servidor, { papel: gm.papel, jogaNaPartida: false }, 'senha')).not.toBeNull();
  const [registro] = await bd.select().from(auditoria).where(eq(auditoria.acao, 'atender_chamado'));
  expect(registro).toMatchObject({ atorId: gm.id });
});

test('dois GMs atendendo: só o primeiro fica', async () => {
  const [a, b] = [await gmOnline(), await gmOnline()];
  const { chamado } = await chamarEquipe(bd, time1[0], partida.id, AGORA);
  await atenderChamado(bd, a, chamado.id);
  await expect(atenderChamado(bd, b, chamado.id)).rejects.toThrow(ChamadoIndisponivel);
  const [linha] = await bd.select().from(chamados);
  expect(linha.atendidoPor).toBe(a.id);
});

test('jogador comum não vê casos nem conclui denúncia', async () => {
  const denuncia = await denunciar(bd, time1[0], { partidaId: partida.id, acusadoId: time2[0].id, motivo: 'x' });
  const { chamado } = await chamarEquipe(bd, time1[1], partida.id, AGORA);
  await expect(listarCasos(bd, time1[0])).rejects.toThrow(SemPermissao);
  await expect(contarCasos(bd, time1[0])).rejects.toThrow(SemPermissao);
  await expect(analisarDenuncia(bd, time1[0], denuncia.id, 'Nada')).rejects.toThrow(SemPermissao);
  await expect(atenderChamado(bd, time1[0], chamado.id)).rejects.toThrow(SemPermissao);
});

test('analisar encerra a denúncia, registra quem analisou e grava na auditoria', async () => {
  const gm = await gmOnline();
  const denuncia = await denunciar(bd, time1[0], { partidaId: partida.id, acusadoId: time2[0].id, motivo: 'x' });
  await analisarDenuncia(bd, gm, denuncia.id, '  Sem indício na gravação  ');
  const [linha] = await bd.select().from(denuncias);
  expect(linha).toMatchObject({ estado: 'encerrada', analistaId: gm.id, conclusao: 'Sem indício na gravação' });
  const [registro] = await bd.select().from(auditoria).where(eq(auditoria.acao, 'analisar_denuncia'));
  expect(registro).toMatchObject({ atorId: gm.id, alvoId: time2[0].id });
  await expect(analisarDenuncia(bd, gm, denuncia.id, 'De novo')).rejects.toThrow(DenunciaIndisponivel);
});

test('a conclusão é obrigatória', async () => {
  const gm = await gmOnline();
  const denuncia = await denunciar(bd, time1[0], { partidaId: partida.id, acusadoId: time2[0].id, motivo: 'x' });
  await expect(analisarDenuncia(bd, gm, denuncia.id, '  ')).rejects.toThrow(ConclusaoInvalida);
});

test('quem denunciou ou foi acusado não analisa a própria denúncia', async () => {
  await bd.update(usuarios).set({ papel: 'gm' }).where(eq(usuarios.id, time1[0].id));
  await bd.update(usuarios).set({ papel: 'gm' }).where(eq(usuarios.id, time2[0].id));
  const [denunciante] = await bd.select().from(usuarios).where(eq(usuarios.id, time1[0].id));
  const [acusado] = await bd.select().from(usuarios).where(eq(usuarios.id, time2[0].id));
  const denuncia = await denunciar(bd, denunciante, { partidaId: partida.id, acusadoId: acusado.id, motivo: 'x' });
  await expect(analisarDenuncia(bd, denunciante, denuncia.id, 'Culpado')).rejects.toThrow(SemPermissao);
  await expect(analisarDenuncia(bd, acusado, denuncia.id, 'Inocente')).rejects.toThrow(SemPermissao);
});

test('casos trazem chamados abertos e denúncias não encerradas, com os nomes', async () => {
  const gm = await gmOnline();
  const denuncia = await denunciar(bd, time1[0], { partidaId: partida.id, acusadoId: time2[0].id, motivo: 'Mira grudada' });
  const encerrada = await denunciar(bd, time1[1], { partidaId: partida.id, acusadoId: time2[1].id, motivo: 'y' });
  await analisarDenuncia(bd, gm, encerrada.id, 'Nada');
  const { chamado } = await chamarEquipe(bd, time1[2], partida.id, AGORA);

  const casos = await listarCasos(bd, gm);
  expect(casos.chamados.map((c) => c.id)).toEqual([chamado.id]);
  expect(casos.chamados[0]).toMatchObject({ chamadoPorApelido: time1[2].apelido, partidaNumero: partida.numero, partidaId: partida.id });
  expect(casos.denuncias.map((d) => d.id)).toEqual([denuncia.id]);
  expect(casos.denuncias[0]).toMatchObject({
    denunciantePorApelido: time1[0].apelido,
    acusadoApelido: time2[0].apelido,
    acusadoId: time2[0].id,
    motivo: 'Mira grudada',
  });
  expect(await contarCasos(bd, gm)).toBe(2);
});

test('marcarVisto registra a hora, sem escrever de novo a cada instante', async () => {
  const conta = time1[0];
  await marcarVisto(bd, conta.id, AGORA);
  const depois = new Date(AGORA.getTime() + 10_000);
  await marcarVisto(bd, conta.id, depois);
  const [linha] = await bd.select().from(usuarios).where(eq(usuarios.id, conta.id));
  expect(linha.vistoEm).toEqual(AGORA);
  const bemDepois = new Date(AGORA.getTime() + 31_000);
  await marcarVisto(bd, conta.id, bemDepois);
  const [nova] = await bd.select().from(usuarios).where(eq(usuarios.id, conta.id));
  expect(nova.vistoEm).toEqual(bemDepois);
});

test('membrosOnline traz só contas ativas vistas há menos de 2 minutos, sem dados privados', async () => {
  const online = await criarUsuario(bd, { estado: 'ativo', vistoEm: minutos(1) });
  await criarUsuario(bd, { estado: 'ativo', vistoEm: minutos(3) });
  await criarUsuario(bd, { estado: 'suspenso', vistoEm: minutos(1) });
  const lista = await membrosOnline(bd, AGORA);
  expect(lista.map((m) => m.id)).toEqual([online.id]);
  expect(lista[0]).not.toHaveProperty('cpfHmac');
  expect(lista[0]).not.toHaveProperty('steamid64');
});
