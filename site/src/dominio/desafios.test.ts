import { eq } from 'drizzle-orm';
import { beforeEach, expect, test } from 'vitest';
import type { Bd } from '@/bd/conexao';
import { claMembros, clas, desafios, partidaJogadores, partidas, salas, usuarios, type Usuario } from '@/bd/esquema';
import { criarBancoDeTeste, criarUsuario } from '@/bd/teste';
import {
  aceitarDesafio,
  cancelarDesafio,
  DesafioIndisponivel,
  desafiar,
  desafiosDaSala,
  opcoesDeDesafio,
  recusarDesafio,
  SalaIncompleta,
} from './desafios';
import { criarSala, entrarNaSala, expulsarDaSala, SemPermissaoNaSala, sairDaSala } from './salas';

let bd: Bd;
const AGORA = new Date('2026-11-03T12:00:00Z');

beforeEach(async () => {
  bd = await criarBancoDeTeste();
});

const membro = () => criarUsuario(bd, { estado: 'ativo' });

async function salaCom(total = 5): Promise<{ id: string; contas: Usuario[] }> {
  const lider = await membro();
  const { id } = await criarSala(bd, lider);
  const contas = [lider];
  for (let i = 1; i < total; i += 1) {
    const conta = await membro();
    await entrarNaSala(bd, conta, id);
    contas.push(conta);
  }
  return { id, contas };
}

async function estadoDe(id: string) {
  const [linha] = await bd.select().from(desafios).where(eq(desafios.id, id));
  return linha.estado;
}

test('líder de sala completa desafia outra sala completa, com prazo de 60 segundos', async () => {
  const [a, b] = [await salaCom(), await salaCom()];
  const desafio = await desafiar(bd, a.contas[0], b.id, AGORA);
  expect(desafio).toMatchObject({ salaOrigemId: a.id, salaAlvoId: b.id, estado: 'pendente' });
  expect(desafio.expiraEm.getTime() - AGORA.getTime()).toBe(60_000);
});

test('sala com menos de 5 não desafia nem é desafiada', async () => {
  const [completa, pequena] = [await salaCom(), await salaCom(4)];
  await expect(desafiar(bd, pequena.contas[0], completa.id, AGORA)).rejects.toThrow(SalaIncompleta);
  await expect(desafiar(bd, completa.contas[0], pequena.id, AGORA)).rejects.toThrow(SalaIncompleta);
});

test('só o líder desafia, aceita, recusa ou cancela', async () => {
  const [a, b] = [await salaCom(), await salaCom()];
  await expect(desafiar(bd, a.contas[1], b.id, AGORA)).rejects.toThrow(SemPermissaoNaSala);
  const desafio = await desafiar(bd, a.contas[0], b.id, AGORA);
  await expect(aceitarDesafio(bd, a.contas[0], desafio.id, AGORA)).rejects.toThrow(SemPermissaoNaSala);
  await expect(aceitarDesafio(bd, b.contas[1], desafio.id, AGORA)).rejects.toThrow(SemPermissaoNaSala);
  await expect(recusarDesafio(bd, a.contas[0], desafio.id)).rejects.toThrow(SemPermissaoNaSala);
  await expect(cancelarDesafio(bd, b.contas[0], desafio.id)).rejects.toThrow(SemPermissaoNaSala);
  await expect(cancelarDesafio(bd, a.contas[1], desafio.id)).rejects.toThrow(SemPermissaoNaSala);
  expect(await estadoDe(desafio.id)).toBe('pendente');
});

test('quem não tem sala não desafia', async () => {
  const b = await salaCom();
  await expect(desafiar(bd, await membro(), b.id, AGORA)).rejects.toThrow(SemPermissaoNaSala);
});

test('uma sala não desafia a si mesma', async () => {
  const a = await salaCom();
  await expect(desafiar(bd, a.contas[0], a.id, AGORA)).rejects.toThrow(DesafioIndisponivel);
});

test('com um desafio pendente, a sala não desafia nem recebe outro', async () => {
  const [a, b, c] = [await salaCom(), await salaCom(), await salaCom()];
  await desafiar(bd, a.contas[0], b.id, AGORA);
  await expect(desafiar(bd, a.contas[0], c.id, AGORA)).rejects.toThrow(DesafioIndisponivel);
  await expect(desafiar(bd, c.contas[0], b.id, AGORA)).rejects.toThrow(DesafioIndisponivel);
  await expect(desafiar(bd, b.contas[0], c.id, AGORA)).rejects.toThrow(DesafioIndisponivel);
});

test('desafio vencido não impede um novo', async () => {
  const [a, b] = [await salaCom(), await salaCom()];
  await desafiar(bd, a.contas[0], b.id, AGORA);
  const depois = new Date(AGORA.getTime() + 61_000);
  expect((await desafiar(bd, a.contas[0], b.id, depois)).estado).toBe('pendente');
});

test('aceitar cria a partida com as duas salas como times, e as salas ficam em partida', async () => {
  const [a, b] = [await salaCom(), await salaCom()];
  const desafio = await desafiar(bd, a.contas[0], b.id, AGORA);
  const partida = await aceitarDesafio(bd, b.contas[0], desafio.id, AGORA);
  expect(partida).toMatchObject({ tipo: 'desafio', estado: 'aguardando_aceite' });
  const jogadores = await bd.select().from(partidaJogadores).where(eq(partidaJogadores.partidaId, partida.id));
  expect(jogadores.filter((j) => j.time === 1).map((j) => j.usuarioId).sort()).toEqual(a.contas.map((c) => c.id).sort());
  expect(jogadores.filter((j) => j.time === 2).map((j) => j.usuarioId).sort()).toEqual(b.contas.map((c) => c.id).sort());
  const linhas = await bd.select().from(salas);
  expect(linhas.every((sala) => sala.partidaId === partida.id)).toBe(true);
  expect(await estadoDe(desafio.id)).toBe('aceito');
});

test('dois aceites ao mesmo tempo criam uma partida só', async () => {
  const [a, b] = [await salaCom(), await salaCom()];
  const desafio = await desafiar(bd, a.contas[0], b.id, AGORA);
  const resultados = await Promise.allSettled([
    aceitarDesafio(bd, b.contas[0], desafio.id, AGORA),
    aceitarDesafio(bd, b.contas[0], desafio.id, AGORA),
  ]);
  expect(resultados.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
  expect(await bd.select().from(partidas)).toHaveLength(1);
});

test('aceitar depois de 60 segundos falha e marca expirado', async () => {
  const [a, b] = [await salaCom(), await salaCom()];
  const desafio = await desafiar(bd, a.contas[0], b.id, AGORA);
  const depois = new Date(AGORA.getTime() + 60_001);
  await expect(aceitarDesafio(bd, b.contas[0], desafio.id, depois)).rejects.toThrow(DesafioIndisponivel);
  expect(await estadoDe(desafio.id)).toBe('expirado');
  expect(await bd.select().from(partidas)).toEqual([]);
});

test('sair com desafio pendente cancela o desafio', async () => {
  const [a, b] = [await salaCom(), await salaCom()];
  const desafio = await desafiar(bd, a.contas[0], b.id, AGORA);
  await sairDaSala(bd, a.contas[4]);
  expect(await estadoDe(desafio.id)).toBe('cancelado');
});

test('aceitar com um membro que saiu falha, porque a sala não está mais completa', async () => {
  const [a, b] = [await salaCom(), await salaCom()];
  const desafio = await desafiar(bd, a.contas[0], b.id, AGORA);
  await sairDaSala(bd, a.contas[4]);
  await expect(aceitarDesafio(bd, b.contas[0], desafio.id, AGORA)).rejects.toThrow(DesafioIndisponivel);
  expect(await bd.select().from(partidas)).toEqual([]);
});

test('expulsar da sala cancela o desafio pendente', async () => {
  const [a, b] = [await salaCom(), await salaCom()];
  const desafio = await desafiar(bd, a.contas[0], b.id, AGORA);
  await expulsarDaSala(bd, b.contas[0], b.contas[1].id);
  expect(await estadoDe(desafio.id)).toBe('cancelado');
});

test('conta suspensa depois do desafio impede o aceite', async () => {
  const [a, b] = [await salaCom(), await salaCom()];
  const desafio = await desafiar(bd, a.contas[0], b.id, AGORA);
  await bd.update(usuarios).set({ estado: 'suspenso' }).where(eq(usuarios.id, a.contas[3].id));
  await expect(aceitarDesafio(bd, b.contas[0], desafio.id, AGORA)).rejects.toThrow(SalaIncompleta);
  expect(await bd.select().from(partidas)).toEqual([]);
});

test('recusar libera as duas salas para novos desafios', async () => {
  const [a, b] = [await salaCom(), await salaCom()];
  const desafio = await desafiar(bd, a.contas[0], b.id, AGORA);
  await recusarDesafio(bd, b.contas[0], desafio.id);
  expect(await estadoDe(desafio.id)).toBe('recusado');
  expect((await desafiar(bd, b.contas[0], a.id, AGORA)).estado).toBe('pendente');
});

test('quem desafiou pode cancelar', async () => {
  const [a, b] = [await salaCom(), await salaCom()];
  const desafio = await desafiar(bd, a.contas[0], b.id, AGORA);
  await cancelarDesafio(bd, a.contas[0], desafio.id);
  expect(await estadoDe(desafio.id)).toBe('cancelado');
});

test('desafio já resolvido não aceita nova resposta', async () => {
  const [a, b] = [await salaCom(), await salaCom()];
  const desafio = await desafiar(bd, a.contas[0], b.id, AGORA);
  await recusarDesafio(bd, b.contas[0], desafio.id);
  await expect(aceitarDesafio(bd, b.contas[0], desafio.id, AGORA)).rejects.toThrow(DesafioIndisponivel);
  await expect(recusarDesafio(bd, b.contas[0], desafio.id)).rejects.toThrow(DesafioIndisponivel);
});

test('desafiosDaSala mostra só os pendentes e dentro do prazo, com os nomes', async () => {
  const [a, b] = [await salaCom(), await salaCom()];
  const desafio = await desafiar(bd, a.contas[0], b.id, AGORA);
  const lista = await desafiosDaSala(bd, b.id, AGORA);
  expect(lista).toHaveLength(1);
  expect(lista[0]).toMatchObject({ id: desafio.id, recebido: true, outraSalaNome: a.contas[0].apelido });
  expect((await desafiosDaSala(bd, a.id, AGORA))[0].recebido).toBe(false);
  expect(await desafiosDaSala(bd, a.id, new Date(AGORA.getTime() + 61_000))).toEqual([]);
});

// Clã x clã e treino: a sala só vale como clã com os 5 do mesmo clã e líder Dono ou Capitão.
async function claCom(sigla: string, cargoDoLider: 'dono' | 'capitao' | 'membro' = 'dono') {
  const [novo] = await bd.insert(clas).values({ nome: `Clã ${sigla}`, sigla, cor: 'ouro', entrada: 'aberto' }).returning();
  return { cla: novo, cargoDoLider };
}

async function salaDoCla(claId: string, cargoDoLider: 'dono' | 'capitao' | 'membro' = 'capitao', deFora = 0) {
  const sala = await salaCom();
  for (const [indice, conta] of sala.contas.entries()) {
    if (indice >= sala.contas.length - deFora) continue;
    await bd.insert(claMembros).values({ usuarioId: conta.id, claId, cargo: indice === 0 ? cargoDoLider : 'membro' });
  }
  return sala;
}

test('salas de clãs diferentes podem fazer clã x clã, e a MD3 cria a partida de clã com 3 mapas', async () => {
  const [alfa, bravo] = [await claCom('ALF'), await claCom('BRV')];
  const a = await salaDoCla(alfa.cla.id, 'dono');
  const b = await salaDoCla(bravo.cla.id, 'capitao');
  expect(await opcoesDeDesafio(bd, a.id, b.id)).toEqual(['comum', 'cla']);
  const desafio = await desafiar(bd, a.contas[0], b.id, AGORA, { formato: 'cla', mapas: 3 });
  expect(desafio).toMatchObject({ formato: 'cla', mapas: 3 });
  const lista = await desafiosDaSala(bd, b.id, AGORA);
  expect(lista[0]).toMatchObject({ formato: 'cla', mapas: 3, outroClaSigla: 'ALF' });
  const partida = await aceitarDesafio(bd, b.contas[0], desafio.id, AGORA);
  expect(partida).toMatchObject({ tipo: 'cla', mapasDaPartida: 3, claTime1Id: alfa.cla.id, claTime2Id: bravo.cla.id, nomeTime1: '[ALF] Clã ALF', nomeTime2: '[BRV] Clã BRV' });
});

test('duas salas do mesmo clã só fazem treino', async () => {
  const alfa = await claCom('ALF');
  const a = await salaDoCla(alfa.cla.id, 'dono');
  const b = await salaDoCla(alfa.cla.id, 'capitao');
  expect(await opcoesDeDesafio(bd, a.id, b.id)).toEqual(['comum', 'treino']);
  await expect(desafiar(bd, a.contas[0], b.id, AGORA, { formato: 'cla', mapas: 1 })).rejects.toThrow(DesafioIndisponivel);
  const desafio = await desafiar(bd, a.contas[0], b.id, AGORA, { formato: 'treino', mapas: 1 });
  const partida = await aceitarDesafio(bd, b.contas[0], desafio.id, AGORA);
  expect(partida).toMatchObject({ tipo: 'treino', mapasDaPartida: 1, claTime1Id: alfa.cla.id, claTime2Id: alfa.cla.id });
});

test('líder que é só membro do clã não desafia pelo clã', async () => {
  const [alfa, bravo] = [await claCom('ALF'), await claCom('BRV')];
  const a = await salaDoCla(alfa.cla.id, 'membro');
  const b = await salaDoCla(bravo.cla.id, 'capitao');
  expect(await opcoesDeDesafio(bd, a.id, b.id)).toEqual(['comum']);
  await expect(desafiar(bd, a.contas[0], b.id, AGORA, { formato: 'cla', mapas: 1 })).rejects.toThrow(DesafioIndisponivel);
});

test('sala com 4 do clã e 1 de fora não vale como clã', async () => {
  const [alfa, bravo] = [await claCom('ALF'), await claCom('BRV')];
  const a = await salaDoCla(alfa.cla.id, 'dono', 1);
  const b = await salaDoCla(bravo.cla.id, 'dono');
  expect(await opcoesDeDesafio(bd, a.id, b.id)).toEqual(['comum']);
});

test('desafio comum é sempre MD1', async () => {
  const [a, b] = [await salaCom(), await salaCom()];
  await expect(desafiar(bd, a.contas[0], b.id, AGORA, { formato: 'comum', mapas: 3 })).rejects.toThrow(DesafioIndisponivel);
});

test('se alguém sai do clã depois do desafio, o aceite falha e nenhuma partida é criada', async () => {
  const [alfa, bravo] = [await claCom('ALF'), await claCom('BRV')];
  const a = await salaDoCla(alfa.cla.id, 'dono');
  const b = await salaDoCla(bravo.cla.id, 'capitao');
  const desafio = await desafiar(bd, a.contas[0], b.id, AGORA, { formato: 'cla', mapas: 1 });
  await bd.delete(claMembros).where(eq(claMembros.usuarioId, a.contas[3].id));
  await expect(aceitarDesafio(bd, b.contas[0], desafio.id, AGORA)).rejects.toThrow(DesafioIndisponivel);
  expect(await bd.select().from(partidas)).toEqual([]);
});
