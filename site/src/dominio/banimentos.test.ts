import { eq } from 'drizzle-orm';
import { beforeEach, expect, test } from 'vitest';
import { criarSessao, lerSessao } from '@/auth/sessoes';
import type { Bd } from '@/bd/conexao';
import { auditoria, banimentos, cpfsBanidos, filaMix, partidaJogadores, partidas, salaMembros, servidores, type Usuario } from '@/bd/esquema';
import { criarBancoDeTeste, criarUsuario, recarregar } from '@/bd/teste';
import { controladorFalso } from '@/servidor-jogo/controlador';
import {
  AlvoIndisponivel,
  BanimentoIndisponivel,
  confirmarBanimento,
  liberarSuspensao,
  listarBanimentosAbertos,
  MotivoDaPunicaoInvalido,
  proporBanimento,
  PropostaJaAberta,
  QuemPropoeNaoConfirma,
  recusarBanimento,
  reverterBanimento,
  suspender,
} from './banimentos';
import { SemPermissao } from './equipe';
import { listaDeLiberados } from './lista';
import { entrarNoMix } from './mix';
import { criarSala, entrarNaSala, minhaSala } from './salas';
import { aplicarResultadoVerificacao, codigoDoCpf, iniciarVerificacao } from './verificacao';

const CHAVE = 'chave-de-teste-com-pelo-menos-32-caracteres';
const CPF = '52998224725';

let bd: Bd;
let gm: Usuario;
let adm: Usuario;
let alvo: Usuario;

beforeEach(async () => {
  bd = await criarBancoDeTeste();
  gm = await criarUsuario(bd, { estado: 'ativo', papel: 'gm' });
  adm = await criarUsuario(bd, { estado: 'ativo', papel: 'adm' });
  alvo = await criarUsuario(bd, { estado: 'ativo', cpfHmac: codigoDoCpf(CPF, CHAVE) });
});

/** Coloca a conta em uma partida ao vivo, em um servidor ocupado. */
async function emPartida(conta: Usuario) {
  const [partida] = await bd.insert(partidas).values({ tipo: 'mix', estado: 'ao_vivo', mapa: 'de_mirage' }).returning();
  await bd.insert(partidaJogadores).values({ partidaId: partida.id, usuarioId: conta.id, time: 1 });
  const [servidor] = await bd.insert(servidores).values({ nome: 'SP', host: '10.0.0.1', porta: 27015, partidaId: partida.id }).returning();
  await bd.update(partidas).set({ servidorId: servidor.id }).where(eq(partidas.id, partida.id));
  return { partida, servidor };
}

test('GM suspende: a conta fica suspensa e é expulsa do servidor', async () => {
  await emPartida(alvo);
  const controlador = controladorFalso();
  await suspender(bd, controlador, gm, alvo.id, 'Mira colando na parede');
  expect((await recarregar(bd, alvo)).estado).toBe('suspenso');
  expect(controlador.chamadas).toEqual([{ acao: 'expulsar', host: '10.0.0.1', steamid64: alvo.steamid64 }]);
  expect(await listaDeLiberados(bd)).not.toContain(alvo.steamid64);
});

test('conta suspensa sai da fila do mix e da sala', async () => {
  const naFila = await criarUsuario(bd, { estado: 'ativo' });
  await entrarNoMix(bd, naFila);
  const lider = await criarUsuario(bd, { estado: 'ativo' });
  const { id: salaId } = await criarSala(bd, lider, 'Sala');
  await entrarNaSala(bd, alvo, salaId);

  await suspender(bd, controladorFalso(), gm, naFila.id, 'x');
  await suspender(bd, controladorFalso(), gm, alvo.id, 'x');
  expect(await bd.select().from(filaMix)).toEqual([]);
  expect(await bd.select().from(salaMembros).where(eq(salaMembros.usuarioId, alvo.id))).toEqual([]);
});

test('líder suspenso passa a sala adiante', async () => {
  const membro = await criarUsuario(bd, { estado: 'ativo' });
  const { id: salaId } = await criarSala(bd, alvo, 'Sala');
  await entrarNaSala(bd, membro, salaId);
  await suspender(bd, controladorFalso(), gm, alvo.id, 'x');
  expect((await minhaSala(bd, membro.id))?.liderId).toBe(membro.id);
});

test('jogador comum não suspende nem propõe', async () => {
  const comum = await criarUsuario(bd, { estado: 'ativo' });
  await expect(suspender(bd, controladorFalso(), comum, alvo.id, 'x')).rejects.toThrow(SemPermissao);
  await expect(proporBanimento(bd, comum, alvo.id, 'x')).rejects.toThrow(SemPermissao);
  expect((await recarregar(bd, alvo)).estado).toBe('ativo');
});

test('ninguém suspende ou bane a si mesmo', async () => {
  await expect(suspender(bd, controladorFalso(), gm, gm.id, 'x')).rejects.toThrow(SemPermissao);
  await expect(proporBanimento(bd, gm, gm.id, 'x')).rejects.toThrow(SemPermissao);
  await expect(proporBanimento(bd, adm, adm.id, 'x')).rejects.toThrow(SemPermissao);
});

test('GM não suspende nem bane Adm', async () => {
  await expect(suspender(bd, controladorFalso(), gm, adm.id, 'x')).rejects.toThrow(SemPermissao);
  await expect(proporBanimento(bd, gm, adm.id, 'x')).rejects.toThrow(SemPermissao);
});

test('Adm suspende GM', async () => {
  await suspender(bd, controladorFalso(), adm, gm.id, 'x');
  expect((await recarregar(bd, gm)).estado).toBe('suspenso');
});

test('Adm libera a suspensão, e fica registrado', async () => {
  await suspender(bd, controladorFalso(), gm, alvo.id, 'x');
  await expect(liberarSuspensao(bd, gm, alvo.id, 'Engano')).rejects.toThrow(SemPermissao);
  await expect(liberarSuspensao(bd, adm, alvo.id, '  ')).rejects.toThrow(MotivoDaPunicaoInvalido);
  await liberarSuspensao(bd, adm, alvo.id, 'Engano');
  expect((await recarregar(bd, alvo)).estado).toBe('ativo');
  const [registro] = await bd.select().from(auditoria).where(eq(auditoria.acao, 'liberar_suspensao'));
  expect(registro).toMatchObject({ atorId: adm.id, alvoId: alvo.id, detalhes: { motivo: 'Engano' } });
  await expect(liberarSuspensao(bd, adm, alvo.id, 'De novo')).rejects.toThrow(AlvoIndisponivel);
});

test('suspender conta já suspensa ou banida é recusado', async () => {
  await suspender(bd, controladorFalso(), gm, alvo.id, 'x');
  await expect(suspender(bd, controladorFalso(), gm, alvo.id, 'x')).rejects.toThrow(AlvoIndisponivel);
});

test.each(['', '   ', 'x'.repeat(501)])('proposta sem motivo é recusada: %j', async (motivo) => {
  await expect(proporBanimento(bd, gm, alvo.id, motivo)).rejects.toThrow(MotivoDaPunicaoInvalido);
  await expect(suspender(bd, controladorFalso(), gm, alvo.id, motivo)).rejects.toThrow(MotivoDaPunicaoInvalido);
});

test('GM não confirma banimento', async () => {
  const proposta = await proporBanimento(bd, gm, alvo.id, 'Várias partidas');
  await expect(confirmarBanimento(bd, controladorFalso(), gm, proposta.id)).rejects.toThrow(SemPermissao);
  await expect(recusarBanimento(bd, gm, proposta.id, 'Não')).rejects.toThrow(SemPermissao);
  expect((await recarregar(bd, alvo)).estado).toBe('ativo');
});

test('com um único Adm, ele propõe e confirma sozinho', async () => {
  const proposta = await proporBanimento(bd, adm, alvo.id, 'Várias partidas');
  await confirmarBanimento(bd, controladorFalso(), adm, proposta.id);
  expect((await recarregar(bd, alvo)).estado).toBe('banido');
});

test('com dois Adms, quem propôs não confirma, e o outro confirma', async () => {
  const segundo = await criarUsuario(bd, { estado: 'ativo', papel: 'adm' });
  const proposta = await proporBanimento(bd, adm, alvo.id, 'Várias partidas');
  await expect(confirmarBanimento(bd, controladorFalso(), adm, proposta.id)).rejects.toThrow(QuemPropoeNaoConfirma);
  await confirmarBanimento(bd, controladorFalso(), segundo, proposta.id);
  const [linha] = await bd.select().from(banimentos).where(eq(banimentos.id, proposta.id));
  expect(linha).toMatchObject({ estado: 'confirmado', confirmadoPor: segundo.id, propostoPor: adm.id });
});

test('Adm suspenso não conta como segundo Adm', async () => {
  await criarUsuario(bd, { estado: 'suspenso', papel: 'adm' });
  const proposta = await proporBanimento(bd, adm, alvo.id, 'Várias partidas');
  await confirmarBanimento(bd, controladorFalso(), adm, proposta.id);
  expect((await recarregar(bd, alvo)).estado).toBe('banido');
});

test('confirmar: conta banida, CPF em cpfs_banidos, sessões apagadas, expulsa do servidor e fora da lista de liberados', async () => {
  await emPartida(alvo);
  const token = await criarSessao(bd, alvo.id);
  const proposta = await proporBanimento(bd, gm, alvo.id, 'Várias partidas');
  const controlador = controladorFalso();
  await confirmarBanimento(bd, controlador, adm, proposta.id);

  const atual = await recarregar(bd, alvo);
  expect(atual.estado).toBe('banido');
  expect(await bd.select().from(cpfsBanidos).where(eq(cpfsBanidos.cpfHmac, alvo.cpfHmac!))).toHaveLength(1);
  expect(await lerSessao(bd, token)).toBeNull();
  expect(controlador.chamadas).toEqual([{ acao: 'expulsar', host: '10.0.0.1', steamid64: alvo.steamid64 }]);
  expect(await listaDeLiberados(bd)).not.toContain(alvo.steamid64);
});

test('banimento de conta sem CPF ainda bloqueia a conta Steam', async () => {
  const semCpf = await criarUsuario(bd, { estado: 'ativo' });
  const proposta = await proporBanimento(bd, gm, semCpf.id, 'Várias partidas');
  await confirmarBanimento(bd, controladorFalso(), adm, proposta.id);
  expect((await recarregar(bd, semCpf)).estado).toBe('banido');
  expect(await bd.select().from(cpfsBanidos)).toEqual([]);
  expect(await listaDeLiberados(bd)).not.toContain(semCpf.steamid64);
});

test('CPF banido com outra Steam é barrado na verificação', async () => {
  const proposta = await proporBanimento(bd, gm, alvo.id, 'Várias partidas');
  await confirmarBanimento(bd, controladorFalso(), adm, proposta.id);

  const novaConta = await criarUsuario(bd);
  await iniciarVerificacao(bd, novaConta, 'simulador', 'ref-1');
  const desfecho = await aplicarResultadoVerificacao(bd, { referencia: 'ref-1', aprovado: true, cpf: CPF, nascimento: '1990-01-01' }, CHAVE);
  expect(desfecho).toBe('banido');
  expect((await recarregar(bd, novaConta)).estado).toBe('banido');
});

test('duas confirmações do mesmo banimento têm efeito uma vez só', async () => {
  const proposta = await proporBanimento(bd, gm, alvo.id, 'Várias partidas');
  const controlador = controladorFalso();
  const resultados = await Promise.allSettled([
    confirmarBanimento(bd, controlador, adm, proposta.id),
    confirmarBanimento(bd, controlador, adm, proposta.id),
  ]);
  expect(resultados.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
  const registros = await bd.select().from(auditoria).where(eq(auditoria.acao, 'confirmar_banimento'));
  expect(registros).toHaveLength(1);
  await expect(confirmarBanimento(bd, controlador, adm, proposta.id)).rejects.toThrow(BanimentoIndisponivel);
});

test('não pode haver duas propostas abertas para a mesma pessoa', async () => {
  await proporBanimento(bd, gm, alvo.id, 'Várias partidas');
  await expect(proporBanimento(bd, adm, alvo.id, 'Outra')).rejects.toThrow(PropostaJaAberta);
});

test('quem já está banido não recebe nova proposta', async () => {
  const proposta = await proporBanimento(bd, gm, alvo.id, 'Várias partidas');
  await confirmarBanimento(bd, controladorFalso(), adm, proposta.id);
  await expect(proporBanimento(bd, gm, alvo.id, 'De novo')).rejects.toThrow(AlvoIndisponivel);
});

test('recusar encerra a proposta, a conta não muda e nova proposta volta a ser possível', async () => {
  const proposta = await proporBanimento(bd, gm, alvo.id, 'Várias partidas');
  await expect(recusarBanimento(bd, adm, proposta.id, ' ')).rejects.toThrow(MotivoDaPunicaoInvalido);
  await recusarBanimento(bd, adm, proposta.id, 'Sem prova suficiente');
  const [linha] = await bd.select().from(banimentos).where(eq(banimentos.id, proposta.id));
  expect(linha.estado).toBe('recusado');
  expect(linha.decididoEm).toBeInstanceOf(Date);
  expect((await recarregar(bd, alvo)).estado).toBe('ativo');
  await expect(proporBanimento(bd, gm, alvo.id, 'Nova prova')).resolves.toBeDefined();
});

test('reverter exige motivo e só o Adm reverte', async () => {
  const proposta = await proporBanimento(bd, gm, alvo.id, 'Várias partidas');
  await confirmarBanimento(bd, controladorFalso(), adm, proposta.id);
  await expect(reverterBanimento(bd, gm, proposta.id, 'Erro provado')).rejects.toThrow(SemPermissao);
  await expect(reverterBanimento(bd, adm, proposta.id, '   ')).rejects.toThrow(MotivoDaPunicaoInvalido);
  expect((await recarregar(bd, alvo)).estado).toBe('banido');
});

test('reverter volta a conta para ativo, tira o CPF da lista e registra a auditoria', async () => {
  const proposta = await proporBanimento(bd, gm, alvo.id, 'Várias partidas');
  await confirmarBanimento(bd, controladorFalso(), adm, proposta.id);
  await reverterBanimento(bd, adm, proposta.id, 'Erro provado');

  expect((await recarregar(bd, alvo)).estado).toBe('ativo');
  expect(await bd.select().from(cpfsBanidos)).toEqual([]);
  const [linha] = await bd.select().from(banimentos).where(eq(banimentos.id, proposta.id));
  expect(linha).toMatchObject({ estado: 'revertido', revertidoPor: adm.id, motivoReversao: 'Erro provado' });
  const [registro] = await bd.select().from(auditoria).where(eq(auditoria.acao, 'reverter_banimento'));
  expect(registro).toMatchObject({ atorId: adm.id, alvoId: alvo.id });
  await expect(reverterBanimento(bd, adm, proposta.id, 'De novo')).rejects.toThrow(BanimentoIndisponivel);
});

test('reverter proposta que não foi confirmada é recusado', async () => {
  const proposta = await proporBanimento(bd, gm, alvo.id, 'Várias partidas');
  await expect(reverterBanimento(bd, adm, proposta.id, 'Erro')).rejects.toThrow(BanimentoIndisponivel);
});

test('reverter não apaga o CPF se outra conta com o mesmo código estiver banida', async () => {
  const proposta = await proporBanimento(bd, gm, alvo.id, 'Várias partidas');
  await confirmarBanimento(bd, controladorFalso(), adm, proposta.id);
  const outra = await criarUsuario(bd, { estado: 'banido' });
  await bd.insert(banimentos).values({
    usuarioId: outra.id,
    cpfHmac: alvo.cpfHmac,
    motivo: 'Outro caso',
    estado: 'confirmado',
    propostoPor: gm.id,
    confirmadoPor: adm.id,
  });
  await reverterBanimento(bd, adm, proposta.id, 'Erro provado');
  expect((await recarregar(bd, alvo)).estado).toBe('ativo');
  expect(await bd.select().from(cpfsBanidos).where(eq(cpfsBanidos.cpfHmac, alvo.cpfHmac!))).toHaveLength(1);
});

test('toda ação grava ator, alvo e motivo na auditoria', async () => {
  await suspender(bd, controladorFalso(), gm, alvo.id, 'Motivo 1');
  await liberarSuspensao(bd, adm, alvo.id, 'Motivo 2');
  const proposta = await proporBanimento(bd, gm, alvo.id, 'Motivo 3');
  await recusarBanimento(bd, adm, proposta.id, 'Motivo 4');
  const segunda = await proporBanimento(bd, gm, alvo.id, 'Motivo 5');
  await confirmarBanimento(bd, controladorFalso(), adm, segunda.id);
  await reverterBanimento(bd, adm, segunda.id, 'Motivo 6');

  const registros = await bd.select().from(auditoria).where(eq(auditoria.alvoId, alvo.id));
  const porAcao = (acao: string) => registros.filter((r) => r.acao === acao);
  expect(porAcao('suspender')[0]).toMatchObject({ atorId: gm.id, detalhes: { motivo: 'Motivo 1' } });
  expect(porAcao('liberar_suspensao')[0]).toMatchObject({ atorId: adm.id, detalhes: { motivo: 'Motivo 2' } });
  expect(porAcao('propor_banimento')).toHaveLength(2);
  expect(porAcao('recusar_banimento')[0]).toMatchObject({ atorId: adm.id, detalhes: { motivo: 'Motivo 4' } });
  expect(porAcao('confirmar_banimento')[0]).toMatchObject({ atorId: adm.id });
  expect(porAcao('reverter_banimento')[0]).toMatchObject({ atorId: adm.id, detalhes: { motivo: 'Motivo 6' } });
});

test('falha no RCON não desfaz a suspensão nem o banimento', async () => {
  await emPartida(alvo);
  const controlador = controladorFalso({ hostsComFalha: ['10.0.0.1'] });
  await suspender(bd, controlador, gm, alvo.id, 'x');
  expect((await recarregar(bd, alvo)).estado).toBe('suspenso');
  const proposta = await proporBanimento(bd, gm, alvo.id, 'Várias partidas');
  await confirmarBanimento(bd, controlador, adm, proposta.id);
  expect((await recarregar(bd, alvo)).estado).toBe('banido');
});

test('a lista de propostas abertas traz nomes e motivo, e é só da equipe', async () => {
  const proposta = await proporBanimento(bd, gm, alvo.id, 'Várias partidas');
  const lista = await listarBanimentosAbertos(bd, adm);
  expect(lista[0]).toMatchObject({ id: proposta.id, usuarioId: alvo.id, alvoApelido: alvo.apelido, propostoPorApelido: gm.apelido, motivo: 'Várias partidas' });
  await expect(listarBanimentosAbertos(bd, alvo)).rejects.toThrow(SemPermissao);
});
