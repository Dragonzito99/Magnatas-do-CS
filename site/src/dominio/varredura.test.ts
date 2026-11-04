import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { eq } from 'drizzle-orm';
import { beforeEach, expect, test } from 'vitest';
import type { Bd } from '@/bd/conexao';
import { banimentos, chamados, denuncias, desafios, gravacoes, partidaJogadores, partidas, salas, servidores, usuarios, type Partida, type Servidor, type Usuario } from '@/bd/esquema';
import { criarBancoDeTeste, criarUsuario } from '@/bd/teste';
import { controladorFalso } from '@/servidor-jogo/controlador';
import { fichaDoJogador } from './ficha';
import { varrer } from './varredura';

let bd: Bd;
let pasta: string;
let jogador: Usuario;
const AGORA = new Date('2026-11-03T12:00:00Z');
const atras = (minutos: number) => new Date(AGORA.getTime() - minutos * 60_000);

beforeEach(async () => {
  bd = await criarBancoDeTeste();
  pasta = await mkdtemp(path.join(tmpdir(), 'magnatas-varredura-'));
  jogador = await criarUsuario(bd, { estado: 'ativo' });
});

async function partidaComServidor(estado: Partida['estado'], estadoDesde: Date, extras: Partial<typeof partidas.$inferInsert> = {}) {
  const [partida] = await bd.insert(partidas).values({ tipo: 'mix', mapa: 'de_mirage', estado, estadoDesde, ...extras }).returning();
  const [servidor] = await bd
    .insert(servidores)
    .values({ nome: 'SP', host: `10.0.0.${partida.numero}`, porta: 27015, partidaId: partida.id })
    .returning();
  await bd.update(partidas).set({ servidorId: servidor.id }).where(eq(partidas.id, partida.id));
  await bd.insert(partidaJogadores).values({ partidaId: partida.id, usuarioId: jogador.id, time: 1, kills: 9, rodadas: 3 });
  return { partida, servidor };
}

const estadoDe = async (id: string) => (await bd.select().from(partidas).where(eq(partidas.id, id)))[0];
const servidorDe = async (servidor: Servidor) => (await bd.select().from(servidores).where(eq(servidores.id, servidor.id)))[0];

async function gravacaoAntiga(partida: Partida, dias = 31) {
  const arquivo = `${partida.numero}.dem`;
  await mkdir(pasta, { recursive: true });
  await writeFile(path.join(pasta, arquivo), 'demo');
  const criadoEm = new Date(AGORA.getTime() - dias * 24 * 60 * 60_000);
  const [gravacao] = await bd.insert(gravacoes).values({ partidaId: partida.id, arquivo, bytes: 4, criadoEm }).returning();
  return { gravacao, caminho: path.join(pasta, arquivo) };
}

async function partidaEncerrada(conta: Usuario = jogador): Promise<Partida> {
  const [partida] = await bd.insert(partidas).values({ tipo: 'mix', mapa: 'de_mirage', estado: 'encerrada' }).returning();
  await bd.insert(partidaJogadores).values({ partidaId: partida.id, usuarioId: conta.id, time: 1 });
  return partida;
}

const gravacaoAtual = async (id: string) => (await bd.select().from(gravacoes).where(eq(gravacoes.id, id)))[0];

test('desafio vencido vira expirado', async () => {
  const [vencido] = await bd.insert(desafios).values({ salaOrigemId: jogador.id, salaAlvoId: jogador.id, expiraEm: atras(1) }).returning();
  const [valendo] = await bd.insert(desafios).values({ salaOrigemId: jogador.id, salaAlvoId: jogador.id, expiraEm: new Date(AGORA.getTime() + 30_000) }).returning();
  await varrer(bd, controladorFalso(), pasta, AGORA);
  const estados = await bd.select().from(desafios);
  expect(estados.find((d) => d.id === vencido.id)?.estado).toBe('expirado');
  expect(estados.find((d) => d.id === valendo.id)?.estado).toBe('pendente');
});

test('partida carregando há mais de 2 minutos volta a aguardar servidor e libera o servidor', async () => {
  const { partida, servidor } = await partidaComServidor('carregando', atras(3));
  await bd.update(servidores).set({ ativo: false }).where(eq(servidores.id, servidor.id));
  await varrer(bd, controladorFalso(), pasta, AGORA);
  expect(await estadoDe(partida.id)).toMatchObject({ estado: 'aguardando_servidor', servidorId: null });
  expect((await servidorDe(servidor)).partidaId).toBeNull();
});

test('partida carregando há menos de 2 minutos fica como está', async () => {
  const { partida } = await partidaComServidor('carregando', atras(1));
  await varrer(bd, controladorFalso(), pasta, AGORA);
  expect((await estadoDe(partida.id)).estado).toBe('carregando');
});

test('partida aguardando jogadores há mais de 5 minutos é cancelada, encerrada no servidor e libera o servidor', async () => {
  const { partida, servidor } = await partidaComServidor('aguardando_jogadores', atras(6));
  const controlador = controladorFalso();
  await varrer(bd, controlador, pasta, AGORA);
  expect(await estadoDe(partida.id)).toMatchObject({ estado: 'cancelada', vencedor: null });
  expect((await servidorDe(servidor)).partidaId).toBeNull();
  expect(controlador.chamadas).toContainEqual({ acao: 'encerrarPartida', host: servidor.host });
});

test('partida ao vivo sem evento há 3 horas é cancelada', async () => {
  const { partida } = await partidaComServidor('ao_vivo', atras(200), { ultimoEventoEm: atras(181) });
  await varrer(bd, controladorFalso(), pasta, AGORA);
  expect((await estadoDe(partida.id)).estado).toBe('cancelada');
});

test('partida ao vivo com evento recente segue, mesmo começando há muito tempo', async () => {
  const { partida } = await partidaComServidor('ao_vivo', atras(200), { ultimoEventoEm: atras(1) });
  await varrer(bd, controladorFalso(), pasta, AGORA);
  expect((await estadoDe(partida.id)).estado).toBe('ao_vivo');
});

test('partida ao vivo que nunca mandou evento conta a partir de quando ficou ao vivo', async () => {
  const { partida } = await partidaComServidor('ao_vivo', atras(181));
  await varrer(bd, controladorFalso(), pasta, AGORA);
  expect((await estadoDe(partida.id)).estado).toBe('cancelada');
});

test('cancelar por falta de jogadores devolve as salas e não conta em estatística', async () => {
  const { partida } = await partidaComServidor('aguardando_jogadores', atras(6));
  const [sala] = await bd.insert(salas).values({ nome: 'Sala', liderId: jogador.id, partidaId: partida.id }).returning();
  await varrer(bd, controladorFalso(), pasta, AGORA);
  const [livre] = await bd.select().from(salas).where(eq(salas.id, sala.id));
  expect(livre.partidaId).toBeNull();
  const ficha = await fichaDoJogador(bd, jogador, jogador.id);
  expect(ficha?.estatisticas.partidas).toBe(0);
  expect(ficha?.estatisticas.abates).toBe(0);
});

test('varrer aloca as partidas que aguardam servidor', async () => {
  const [partida] = await bd.insert(partidas).values({ tipo: 'mix', mapa: 'de_mirage' }).returning();
  const [servidor] = await bd.insert(servidores).values({ nome: 'SP', host: '10.0.0.9', porta: 27015 }).returning();
  const controlador = controladorFalso();
  await varrer(bd, controlador, pasta, AGORA);
  expect(await estadoDe(partida.id)).toMatchObject({ estado: 'carregando', servidorId: servidor.id });
  expect(controlador.chamadas).toContainEqual({ acao: 'carregarPartida', host: '10.0.0.9', numero: partida.numero });
});

test('gravação com mais de 30 dias é apagada do disco e marcada', async () => {
  const { gravacao, caminho } = await gravacaoAntiga(await partidaEncerrada());
  await varrer(bd, controladorFalso(), pasta, AGORA);
  expect(existsSync(caminho)).toBe(false);
  expect((await gravacaoAtual(gravacao.id)).apagadaEm).toEqual(AGORA);
});

test('gravação com menos de 30 dias fica', async () => {
  const { gravacao, caminho } = await gravacaoAntiga(await partidaEncerrada(), 29);
  await varrer(bd, controladorFalso(), pasta, AGORA);
  expect(existsSync(caminho)).toBe(true);
  expect((await gravacaoAtual(gravacao.id)).apagadaEm).toBeNull();
});

test('gravação com denúncia aberta fica', async () => {
  const partida = await partidaEncerrada();
  const { gravacao, caminho } = await gravacaoAntiga(partida);
  const denunciante = await criarUsuario(bd, { estado: 'ativo' });
  const [denuncia] = await bd.insert(denuncias).values({ partidaId: partida.id, denuncianteId: denunciante.id, motivo: 'x' }).returning();
  await varrer(bd, controladorFalso(), pasta, AGORA);
  expect(existsSync(caminho)).toBe(true);

  await bd.update(denuncias).set({ estado: 'encerrada' }).where(eq(denuncias.id, denuncia.id));
  await varrer(bd, controladorFalso(), pasta, AGORA);
  expect(existsSync(caminho)).toBe(false);
  expect((await gravacaoAtual(gravacao.id)).apagadaEm).toEqual(AGORA);
});

test('gravação de outra partida de jogador com denúncia aberta também fica', async () => {
  const partidaAntiga = await partidaEncerrada();
  const { caminho } = await gravacaoAntiga(partidaAntiga);
  const outraPartida = await partidaEncerrada();
  const denunciante = await criarUsuario(bd, { estado: 'ativo' });
  await bd.insert(denuncias).values({ partidaId: outraPartida.id, denuncianteId: denunciante.id, acusadoId: jogador.id, motivo: 'x' });
  await varrer(bd, controladorFalso(), pasta, AGORA);
  expect(existsSync(caminho)).toBe(true);
});

test('gravação de partida de jogador banido fica', async () => {
  const { caminho } = await gravacaoAntiga(await partidaEncerrada());
  await bd.update(usuarios).set({ estado: 'banido' }).where(eq(usuarios.id, jogador.id));
  await varrer(bd, controladorFalso(), pasta, AGORA);
  expect(existsSync(caminho)).toBe(true);
});

test('gravação vencida fica se um jogador da partida está suspenso', async () => {
  const { caminho } = await gravacaoAntiga(await partidaEncerrada());
  await bd.update(usuarios).set({ estado: 'suspenso' }).where(eq(usuarios.id, jogador.id));
  await varrer(bd, controladorFalso(), pasta, AGORA);
  expect(existsSync(caminho)).toBe(true);
});

test('gravação vencida fica se um jogador da partida tem proposta de banimento aberta', async () => {
  const { caminho } = await gravacaoAntiga(await partidaEncerrada());
  const gm = await criarUsuario(bd, { estado: 'ativo', papel: 'gm' });
  await bd.insert(banimentos).values({ usuarioId: jogador.id, motivo: 'x', propostoPor: gm.id });
  await varrer(bd, controladorFalso(), pasta, AGORA);
  expect(existsSync(caminho)).toBe(true);
});

test('gravação vencida é apagada depois que a proposta é recusada e o jogador está ativo', async () => {
  const { caminho } = await gravacaoAntiga(await partidaEncerrada());
  const gm = await criarUsuario(bd, { estado: 'ativo', papel: 'gm' });
  await bd.insert(banimentos).values({ usuarioId: jogador.id, motivo: 'x', propostoPor: gm.id, estado: 'recusado' });
  await varrer(bd, controladorFalso(), pasta, AGORA);
  expect(existsSync(caminho)).toBe(false);
});

test('varrer transforma chamado sem resposta em denúncia', async () => {
  const partida = await partidaEncerrada();
  await bd.insert(chamados).values({ partidaId: partida.id, chamadoPor: jogador.id });
  await varrer(bd, controladorFalso(), pasta, AGORA);
  const [denuncia] = await bd.select().from(denuncias);
  expect(denuncia).toMatchObject({ partidaId: partida.id, denuncianteId: jogador.id, acusadoId: null });
});

test('rodar duas vezes seguidas não muda o resultado', async () => {
  const { partida, servidor } = await partidaComServidor('aguardando_jogadores', atras(6));
  const { gravacao } = await gravacaoAntiga(await partidaEncerrada());
  const controlador = controladorFalso();
  await varrer(bd, controlador, pasta, AGORA);
  const depoisDaPrimeira = { partida: await estadoDe(partida.id), servidor: await servidorDe(servidor), gravacao: await gravacaoAtual(gravacao.id) };
  const chamadas = controlador.chamadas.length;
  await varrer(bd, controlador, pasta, new Date(AGORA.getTime() + 15_000));
  expect({ partida: await estadoDe(partida.id), servidor: await servidorDe(servidor), gravacao: await gravacaoAtual(gravacao.id) }).toEqual(depoisDaPrimeira);
  expect(controlador.chamadas).toHaveLength(chamadas);
});

test('falha em uma etapa não impede as outras', async () => {
  const { partida, servidor } = await partidaComServidor('aguardando_jogadores', atras(6));
  const { caminho } = await gravacaoAntiga(await partidaEncerrada());
  const quebrado = controladorFalso({ hostsComFalha: [servidor.host] });
  await expect(varrer(bd, quebrado, pasta, AGORA)).resolves.toBeUndefined();
  expect((await estadoDe(partida.id)).estado).toBe('cancelada');
  expect((await servidorDe(servidor)).partidaId).toBeNull();
  expect(existsSync(caminho)).toBe(false);
});

test('sem pasta de gravações configurada, o resto continua', async () => {
  const { partida } = await partidaComServidor('aguardando_jogadores', atras(6));
  await expect(varrer(bd, controladorFalso(), undefined, AGORA)).resolves.toBeUndefined();
  expect((await estadoDe(partida.id)).estado).toBe('cancelada');
});
