import { expect, test } from 'vitest';
import { eq } from 'drizzle-orm';
import { banimentos, cacheExterno, denunciasDiversao, elogios, elogiosDiversao, estadosDaDiversao, servidoresDiversao, faltas, insigniasDoJogador, partidasVistas, juncoes, noticias, noticiasSteam, partidaJogadores, partidas, usuarios, vetos } from './esquema';
import { criarBancoDeTeste, criarUsuario, STEAM_A, STEAM_B } from './teste';
import { readFileSync, readdirSync } from 'node:fs';

test('banco de teste aplica as migrações', async () => {
  const bd = await criarBancoDeTeste();
  const linhas = await bd.select().from(usuarios);
  expect(linhas).toEqual([]);
});

test('conta nova começa aguardando verificação, como jogador e sem convites', async () => {
  const bd = await criarBancoDeTeste();
  const [conta] = await bd.insert(usuarios).values({ steamid64: STEAM_A, apelido: 'A' }).returning();
  expect(conta).toMatchObject({ estado: 'aguardando_verificacao', papel: 'jogador', convitesRestantes: 0 });
});

test('steamid64 é único', async () => {
  const bd = await criarBancoDeTeste();
  await bd.insert(usuarios).values({ steamid64: STEAM_A, apelido: 'A' });
  await expect(bd.insert(usuarios).values({ steamid64: STEAM_A, apelido: 'B' })).rejects.toThrow();
});

test('o mesmo código de CPF não pode estar em duas contas', async () => {
  const bd = await criarBancoDeTeste();
  await bd.insert(usuarios).values({ steamid64: STEAM_A, apelido: 'A', cpfHmac: 'x' });
  await expect(
    bd.insert(usuarios).values({ steamid64: STEAM_B, apelido: 'B', cpfHmac: 'x' }),
  ).rejects.toThrow();
});

test('partida aguardando aceite, vetos, faltas, junções, elogios e banimento do sistema', async () => {
  const bd = await criarBancoDeTeste();
  const [a] = await bd.insert(usuarios).values({ steamid64: STEAM_A, apelido: 'A' }).returning();
  const [b] = await bd.insert(usuarios).values({ steamid64: STEAM_B, apelido: 'B' }).returning();
  const [partida] = await bd.insert(partidas).values({ tipo: 'desafio', estado: 'aguardando_aceite', mapa: null }).returning();
  expect(partida).toMatchObject({ estado: 'aguardando_aceite', mapa: null, aceiteAte: null, primeiroAVetar: null, vetoAte: null });
  await bd.insert(partidaJogadores).values({ partidaId: partida.id, usuarioId: a.id, time: 1 });
  const [linha] = await bd.select().from(partidaJogadores);
  expect(linha).toMatchObject({ aceitouEm: null, entrouNaFilaEm: null, mvps: 0, kast: 0, k1: 0, k2: 0, k3: 0, k4: 0, k5: 0 });
  await bd.insert(vetos).values({ partidaId: partida.id, ordem: 1, time: 2, mapa: 'de_nuke', automatico: false });
  await expect(bd.insert(vetos).values({ partidaId: partida.id, ordem: 2, time: 1, mapa: 'de_nuke', automatico: true })).rejects.toThrow();
  await bd.insert(faltas).values({ usuarioId: a.id, partidaId: partida.id, bloqueadoAte: new Date() });
  await bd.insert(juncoes).values({ salaOrigemId: partida.id, salaAlvoId: partida.id, expiraEm: new Date() });
  await bd.insert(elogios).values({ partidaId: partida.id, autorId: a.id, elogiadoId: b.id, tipo: 'bom_de_mira' });
  await expect(bd.insert(elogios).values({ partidaId: partida.id, autorId: a.id, elogiadoId: b.id, tipo: 'lider' })).rejects.toThrow();
  const [banimento] = await bd.insert(banimentos).values({ usuarioId: a.id, motivo: 'Faltas', estado: 'confirmado', propostoPor: null }).returning();
  expect(banimento.propostoPor).toBeNull();
});

test('notícias do clube, da Steam e cache externo', async () => {
  const bd = await criarBancoDeTeste();
  const [noticia] = await bd.insert(noticias).values({ titulo: 'Oi', texto: 'Texto', autorId: null }).returning();
  expect(noticia).toMatchObject({ fixada: false, imagem: null, autorId: null, atualizadaEm: null });
  await bd.insert(noticiasSteam).values({ gid: '1', tituloOriginal: 'CS2 Update', url: 'u', publicadaEm: new Date(), conteudo: 'c' });
  await expect(bd.insert(noticiasSteam).values({ gid: '1', tituloOriginal: 'x', url: 'u', publicadaEm: new Date(), conteudo: 'c' })).rejects.toThrow();
  const [steam] = await bd.select().from(noticiasSteam);
  expect(steam).toMatchObject({ tituloPt: null, resumoPt: null, traduzidaEm: null, tentativas: 0 });
  await bd.insert(cacheExterno).values({ chave: 'tier-s', dados: { a: 1 }, atualizadoEm: new Date() });
  await bd
    .insert(cacheExterno)
    .values({ chave: 'tier-s', dados: { a: 2 }, atualizadoEm: new Date() })
    .onConflictDoUpdate({ target: cacheExterno.chave, set: { dados: { a: 2 } } });
  expect((await bd.select().from(cacheExterno))[0].dados).toEqual({ a: 2 });
});

test('servidor da Diversão sob demanda e o estado dele', async () => {
  const bd = await criarBancoDeTeste();
  const [servidor] = await bd
    .insert(servidoresDiversao)
    .values({ modo: 'fantasma', armas: 'Facas', mapa: 'de_mirage', foto: '/f.webp', porta: 28021, ordem: 1, nomeNoServidor: 'fantasma' })
    .returning();
  expect(servidor).toMatchObject({ nomeNoServidor: 'fantasma', sobDemanda: true });
  const [estado] = await bd.insert(estadosDaDiversao).values({ servidorId: servidor.id }).returning();
  expect(estado).toMatchObject({ estado: 'desligado', vazioDesde: null, pedidoPor: null, erro: null });
  expect(estado.desde).toBeInstanceOf(Date);
});

test('a migração dá o nome de cada servidor pela porta', () => {
  const arquivo = readdirSync('drizzle').find((nome) => nome.startsWith('0017_'));
  expect(arquivo).toBe('0017_diversao_sob_demanda.sql');
  const sqlDaMigracao = readFileSync(`drizzle/${arquivo}`, 'utf8');
  for (const [porta, nome] of [[27016, 'ak-desert'], [27017, 'pistola'], [27018, 'awp'], [27019, 'equipe'], [27020, 'mutacao'], [27021, 'fantasma']]) {
    expect(sqlDaMigracao).toContain(`SET "nome_no_servidor" = '${nome}' WHERE "porta" = ${porta}`);
  }
});

test('depois das migrações, os servidores cadastrados já têm nome e são sob demanda', async () => {
  const bd = await criarBancoDeTeste();
  const linhas = await bd.select().from(servidoresDiversao);
  const porPorta = Object.fromEntries(linhas.map((linha) => [linha.porta, linha.nomeNoServidor]));
  expect(porPorta).toMatchObject({ 27016: 'ak-desert', 27017: 'pistola', 27018: 'awp', 27019: 'equipe', 27020: 'mutacao', 27021: 'fantasma' });
  expect(linhas.every((linha) => linha.sobDemanda)).toBe(true);
});

test('a mesma insígnia não entra duas vezes para a mesma conta', async () => {
  const bd = await criarBancoDeTeste();
  const conta = await criarUsuario(bd);
  const linha = { usuarioId: conta.id, familia: 'mira', nivel: 0, grana: 50, xp: 200 };
  await bd.insert(insigniasDoJogador).values(linha);
  await expect(bd.insert(insigniasDoJogador).values(linha)).rejects.toThrow();
  await bd.update(usuarios).set({ insigniaPrincipal: 'mira:0' }).where(eq(usuarios.id, conta.id));
  const [atual] = await bd.select({ principal: usuarios.insigniaPrincipal }).from(usuarios).where(eq(usuarios.id, conta.id));
  expect(atual.principal).toBe('mira:0');
});

test('elogio e denúncia da Diversão não se repetem na mesma partida', async () => {
  const bd = await criarBancoDeTeste();
  const autor = await criarUsuario(bd);
  const outro = await criarUsuario(bd);
  const elogio = { referencia: 'diversao:27020:a', autorId: autor.id, elogiadoId: outro.id, tipo: 'gente_boa' as const };
  await bd.insert(elogiosDiversao).values(elogio);
  await expect(bd.insert(elogiosDiversao).values(elogio)).rejects.toThrow();
  const denuncia = { referencia: 'diversao:27020:a', denuncianteId: autor.id, acusadoId: outro.id, motivo: 'x' };
  await bd.insert(denunciasDiversao).values(denuncia);
  await expect(bd.insert(denunciasDiversao).values(denuncia)).rejects.toThrow();
  await bd.insert(partidasVistas).values({ usuarioId: autor.id, referencia: 'diversao:27020:a' });
  await expect(bd.insert(partidasVistas).values({ usuarioId: autor.id, referencia: 'diversao:27020:a' })).rejects.toThrow();
});
