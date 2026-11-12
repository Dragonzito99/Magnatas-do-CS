import { eq } from 'drizzle-orm';
import { beforeEach, expect, test } from 'vitest';
import type { Bd } from '@/bd/conexao';
import { auditoria, banimentos, chamados, denuncias, denunciasDeMensagem, denunciasDiversao, gravacoes, partidaJogadores, partidas, usuarios, xpPartidas, type Partida, type Usuario } from '@/bd/esquema';
import { criarBancoDeTeste, criarUsuario } from '@/bd/teste';
import { ConclusaoInvalida, contagemDeCasos, denunciar, DenunciaIndisponivel } from './denuncias';
import { SemPermissao } from './equipe';
import { casoEscolhido, chamadosEmAndamento, encerrarCaso, encerrarDenunciaDaDiversao, listarCasosDeDenuncia, listarDenunciasDaDiversao, listarDenunciasDeMensagem, motivoDaProposta, resolverDenunciaDeMensagem } from './olho-de-aguia';
import { pedirAmizade, responderAmizade } from './amigos';
import { conversaDiretaCom, denunciarMensagem, enviarMensagem, mensagensDe } from './mensagens';

let bd: Bd;
let gm: Usuario;
let membro: Usuario;
let acusado: Usuario;
let denunciante: Usuario;
let outroDenunciante: Usuario;
let partida: Partida;
const AGORA = new Date('2026-11-03T12:00:00Z');
const minutos = (m: number) => new Date(AGORA.getTime() - m * 60_000);

async function criarPartidaCom(jogadores: Usuario[], valores: Partial<typeof partidas.$inferInsert> = {}): Promise<Partida> {
  const [criada] = await bd
    .insert(partidas)
    .values({ tipo: 'mix', estado: 'encerrada', mapa: 'de_mirage', vencedor: 1, encerradaEm: minutos(30), ...valores })
    .returning();
  await bd.insert(partidaJogadores).values(jogadores.map((conta, indice) => ({ partidaId: criada.id, usuarioId: conta.id, time: (indice % 2) + 1 })));
  return criada;
}

async function semAcusado(denuncianteId: string, partidaId: string = partida.id) {
  await bd.insert(denuncias).values({ partidaId, denuncianteId, motivo: 'Chamado durante a partida, sem equipe online.' });
}

const denunciaContra = (conta: Usuario, por: Usuario, partidaId: string = partida.id, motivo = 'Mira na parede.') =>
  denunciar(bd, por, { partidaId, acusadoId: conta.id, motivo });

beforeEach(async () => {
  bd = await criarBancoDeTeste();
  gm = await criarUsuario(bd, { estado: 'ativo', papel: 'gm' });
  membro = await criarUsuario(bd, { estado: 'ativo' });
  acusado = await criarUsuario(bd, { estado: 'ativo', apelido: 'acusado' });
  denunciante = await criarUsuario(bd, { estado: 'ativo', apelido: 'quem_denunciou' });
  outroDenunciante = await criarUsuario(bd, { estado: 'ativo', apelido: 'outro_denunciante' });
  partida = await criarPartidaCom([acusado, denunciante, outroDenunciante]);
});

test('jogador comum não lista, não encerra e não vê chamados', async () => {
  await expect(listarCasosDeDenuncia(bd, membro)).rejects.toBeInstanceOf(SemPermissao);
  await expect(encerrarCaso(bd, membro, { partidaId: partida.id, acusadoId: acusado.id }, 'x')).rejects.toBeInstanceOf(SemPermissao);
  await expect(chamadosEmAndamento(bd, membro)).rejects.toBeInstanceOf(SemPermissao);
});

test('denúncias da mesma partida contra a mesma pessoa viram um caso só', async () => {
  await denunciaContra(acusado, denunciante);
  await denunciaContra(acusado, outroDenunciante);
  const casos = await listarCasosDeDenuncia(bd, gm, AGORA);
  expect(casos).toHaveLength(1);
  expect(casos[0].chave).toBe(`${partida.id}:${acusado.id}`);
  expect(casos[0].acusado?.apelido).toBe('acusado');
  expect(casos[0].denuncias.map((d) => d.denuncianteApelido).sort()).toEqual(['outro_denunciante', 'quem_denunciou']);
});

test('a mesma pessoa em partidas diferentes vira casos diferentes', async () => {
  const outra = await criarPartidaCom([acusado, denunciante]);
  await denunciaContra(acusado, denunciante);
  await denunciaContra(acusado, denunciante, outra.id);
  expect(await listarCasosDeDenuncia(bd, gm, AGORA)).toHaveLength(2);
});

test('denúncia sem acusado vira um caso a definir, com acusado e números nulos', async () => {
  await semAcusado(denunciante.id);
  const [caso] = await listarCasosDeDenuncia(bd, gm, AGORA);
  expect(caso.chave).toBe(`${partida.id}:a-definir`);
  expect(caso.acusado).toBeNull();
  expect(caso.numeros).toBeNull();
  expect(caso.denunciasContraEle).toBe(0);
});

test('mais denúncias vêm primeiro e, no empate, a mais antiga', async () => {
  const nova = await criarPartidaCom([acusado, denunciante]);
  const cheia = await criarPartidaCom([acusado, denunciante, outroDenunciante]);
  await bd.insert(denuncias).values([
    { partidaId: partida.id, denuncianteId: denunciante.id, acusadoId: acusado.id, motivo: 'a', criadoEm: minutos(20) },
    { partidaId: nova.id, denuncianteId: denunciante.id, acusadoId: acusado.id, motivo: 'b', criadoEm: minutos(10) },
    { partidaId: cheia.id, denuncianteId: denunciante.id, acusadoId: acusado.id, motivo: 'c', criadoEm: minutos(5) },
    { partidaId: cheia.id, denuncianteId: outroDenunciante.id, acusadoId: acusado.id, motivo: 'd', criadoEm: minutos(5) },
  ]);
  const casos = await listarCasosDeDenuncia(bd, gm, AGORA);
  expect(casos.map((caso) => caso.partida.id)).toEqual([cheia.id, partida.id, nova.id]);
});

test('o caso traz K/D, porcentagem na cabeça e dano por rodada do acusado naquela partida', async () => {
  await bd
    .update(partidaJogadores)
    .set({ kills: 28, deaths: 6, headshotKills: 14, damage: 1200, rodadas: 10 })
    .where(eq(partidaJogadores.usuarioId, acusado.id));
  await denunciaContra(acusado, denunciante);
  const [caso] = await listarCasosDeDenuncia(bd, gm, AGORA);
  expect(caso.numeros).toEqual({ kills: 28, deaths: 6, kd: 4.67, hsPct: 50, adr: 120 });
});

test('o caso conta denúncias contra ele em qualquer partida, inclusive encerradas', async () => {
  const antiga = await criarPartidaCom([acusado, denunciante]);
  const fechada = await denunciaContra(acusado, denunciante, antiga.id);
  await bd.update(denuncias).set({ estado: 'encerrada', conclusao: 'Nada encontrado.' }).where(eq(denuncias.id, fechada.id));
  await denunciaContra(acusado, denunciante);
  const casos = await listarCasosDeDenuncia(bd, gm, AGORA);
  expect(casos).toHaveLength(1);
  expect(casos[0].denunciasContraEle).toBe(2);
});

test('caso encerrado não aparece na lista', async () => {
  await denunciaContra(acusado, denunciante);
  await encerrarCaso(bd, gm, { partidaId: partida.id, acusadoId: acusado.id }, 'Nada encontrado.');
  expect(await listarCasosDeDenuncia(bd, gm, AGORA)).toEqual([]);
});

test('gravação disponível vem com o id', async () => {
  const [gravacao] = await bd.insert(gravacoes).values({ partidaId: partida.id, arquivo: '1.dem', bytes: 10 }).returning();
  await denunciaContra(acusado, denunciante);
  const [caso] = await listarCasosDeDenuncia(bd, gm, AGORA);
  expect(caso.gravacao).toBe('disponivel');
  expect(caso.gravacaoId).toBe(gravacao.id);
});

test('gravação ainda chegando fica sem id', async () => {
  const recente = await criarPartidaCom([acusado, denunciante], { encerradaEm: minutos(2) });
  await denunciaContra(acusado, denunciante, recente.id);
  const [caso] = await listarCasosDeDenuncia(bd, gm, AGORA);
  expect(caso.gravacao).toBe('aguardando');
  expect(caso.gravacaoId).toBeUndefined();
});

test('partida sem gravação depois da espera fica sem id', async () => {
  await denunciaContra(acusado, denunciante);
  const [caso] = await listarCasosDeDenuncia(bd, gm, AGORA);
  expect(caso.gravacao).toBe('sem');
  expect(caso.gravacaoId).toBeUndefined();
});

test('gravação apagada fica sem id', async () => {
  await bd.insert(gravacoes).values({ partidaId: partida.id, arquivo: '1.dem', bytes: 10, apagadaEm: minutos(1) });
  await denunciaContra(acusado, denunciante);
  const [caso] = await listarCasosDeDenuncia(bd, gm, AGORA);
  expect(caso.gravacao).toBe('apagada');
  expect(caso.gravacaoId).toBeUndefined();
});

test('podeEncerrar é falso para quem denunciou e para o acusado', async () => {
  const gmDenunciante = await criarUsuario(bd, { estado: 'ativo', papel: 'gm' });
  const gmAcusado = await criarUsuario(bd, { estado: 'ativo', papel: 'gm' });
  const comEquipe = await criarPartidaCom([gmDenunciante, gmAcusado]);
  await denunciaContra(gmAcusado, gmDenunciante, comEquipe.id);
  expect((await listarCasosDeDenuncia(bd, gm, AGORA))[0].podeEncerrar).toBe(true);
  expect((await listarCasosDeDenuncia(bd, gmDenunciante, AGORA))[0].podeEncerrar).toBe(false);
  expect((await listarCasosDeDenuncia(bd, gmAcusado, AGORA))[0].podeEncerrar).toBe(false);
});

test('em caso a definir, podeEncerrar é falso para quem jogou a partida', async () => {
  const gmJogador = await criarUsuario(bd, { estado: 'ativo', papel: 'gm' });
  const comEquipe = await criarPartidaCom([gmJogador, denunciante]);
  await semAcusado(denunciante.id, comEquipe.id);
  expect((await listarCasosDeDenuncia(bd, gm, AGORA))[0].podeEncerrar).toBe(true);
  expect((await listarCasosDeDenuncia(bd, gmJogador, AGORA))[0].podeEncerrar).toBe(false);
});

test('temPropostaAberta reflete proposta aberta do acusado', async () => {
  await denunciaContra(acusado, denunciante);
  expect((await listarCasosDeDenuncia(bd, gm, AGORA))[0].temPropostaAberta).toBe(false);
  await bd.insert(banimentos).values({ usuarioId: acusado.id, motivo: 'x', propostoPor: gm.id });
  expect((await listarCasosDeDenuncia(bd, gm, AGORA))[0].temPropostaAberta).toBe(true);
});

test('o caso traz a situação da conta do acusado', async () => {
  await denunciaContra(acusado, denunciante);
  expect((await listarCasosDeDenuncia(bd, gm, AGORA))[0].acusado?.estado).toBe('ativo');
});

test('encerrar fecha todas as denúncias do caso, com a conclusão, e registra na auditoria', async () => {
  const primeira = await denunciaContra(acusado, denunciante);
  const segunda = await denunciaContra(acusado, outroDenunciante);
  await encerrarCaso(bd, gm, { partidaId: partida.id, acusadoId: acusado.id }, '  Nada encontrado.  ');
  const linhas = await bd.select().from(denuncias);
  expect(linhas.map((d) => [d.estado, d.conclusao, d.analistaId])).toEqual([
    ['encerrada', 'Nada encontrado.', gm.id],
    ['encerrada', 'Nada encontrado.', gm.id],
  ]);
  const [registro] = await bd.select().from(auditoria).where(eq(auditoria.acao, 'encerrar_caso'));
  expect(registro).toMatchObject({ atorId: gm.id, alvoId: acusado.id });
  expect(registro.detalhes).toMatchObject({ partidaId: partida.id, denuncias: expect.arrayContaining([primeira.id, segunda.id]) });
});

test('encerrar um caso não mexe em outro da mesma partida', async () => {
  await denunciaContra(acusado, denunciante);
  await denunciaContra(outroDenunciante, denunciante);
  await encerrarCaso(bd, gm, { partidaId: partida.id, acusadoId: acusado.id }, 'Nada encontrado.');
  const casos = await listarCasosDeDenuncia(bd, gm, AGORA);
  expect(casos.map((caso) => caso.acusado?.id)).toEqual([outroDenunciante.id]);
});

test('encerrar caso a definir não mexe no caso com acusado', async () => {
  await denunciaContra(acusado, denunciante);
  await semAcusado(denunciante.id);
  await encerrarCaso(bd, gm, { partidaId: partida.id, acusadoId: null }, 'Sem indício.');
  const casos = await listarCasosDeDenuncia(bd, gm, AGORA);
  expect(casos.map((caso) => caso.acusado?.id)).toEqual([acusado.id]);
});

test.each([[''], ['   '], ['x'.repeat(501)]])('conclusão inválida é recusada', async (conclusao) => {
  await denunciaContra(acusado, denunciante);
  await expect(encerrarCaso(bd, gm, { partidaId: partida.id, acusadoId: acusado.id }, conclusao)).rejects.toBeInstanceOf(ConclusaoInvalida);
});

test('quem denunciou e o acusado recebem SemPermissao ao encerrar', async () => {
  const gmDenunciante = await criarUsuario(bd, { estado: 'ativo', papel: 'gm' });
  const gmAcusado = await criarUsuario(bd, { estado: 'ativo', papel: 'gm' });
  const comEquipe = await criarPartidaCom([gmDenunciante, gmAcusado]);
  await denunciaContra(gmAcusado, gmDenunciante, comEquipe.id);
  const caso = { partidaId: comEquipe.id, acusadoId: gmAcusado.id };
  await expect(encerrarCaso(bd, gmDenunciante, caso, 'x')).rejects.toBeInstanceOf(SemPermissao);
  await expect(encerrarCaso(bd, gmAcusado, caso, 'x')).rejects.toBeInstanceOf(SemPermissao);
});

test('quem jogou a partida não encerra caso a definir', async () => {
  const gmJogador = await criarUsuario(bd, { estado: 'ativo', papel: 'gm' });
  const comEquipe = await criarPartidaCom([gmJogador, denunciante]);
  await semAcusado(denunciante.id, comEquipe.id);
  await expect(encerrarCaso(bd, gmJogador, { partidaId: comEquipe.id, acusadoId: null }, 'x')).rejects.toBeInstanceOf(SemPermissao);
});

test('encerrar duas vezes dá DenunciaIndisponivel na segunda', async () => {
  await denunciaContra(acusado, denunciante);
  const caso = { partidaId: partida.id, acusadoId: acusado.id };
  await encerrarCaso(bd, gm, caso, 'Nada encontrado.');
  await expect(encerrarCaso(bd, gm, caso, 'De novo.')).rejects.toBeInstanceOf(DenunciaIndisponivel);
});

test('outra pessoa denunciando depois de encerrado abre o caso de novo', async () => {
  await denunciaContra(acusado, denunciante);
  await encerrarCaso(bd, gm, { partidaId: partida.id, acusadoId: acusado.id }, 'Nada encontrado.');
  await denunciaContra(acusado, outroDenunciante);
  const [caso] = await listarCasosDeDenuncia(bd, gm, AGORA);
  expect(caso.denuncias.map((d) => d.denuncianteId)).toEqual([outroDenunciante.id]);
});

test('chamadosEmAndamento só traz partida aguardando jogadores ou ao vivo', async () => {
  const aoVivo = await criarPartidaCom([denunciante], { estado: 'ao_vivo', encerradaEm: null, vencedor: null });
  const aguardando = await criarPartidaCom([denunciante], { estado: 'aguardando_jogadores', encerradaEm: null, vencedor: null });
  await bd.insert(chamados).values([
    { partidaId: partida.id, chamadoPor: denunciante.id },
    { partidaId: aoVivo.id, chamadoPor: denunciante.id },
    { partidaId: aguardando.id, chamadoPor: denunciante.id },
  ]);
  const lista = await chamadosEmAndamento(bd, gm);
  expect(lista.map((chamado) => chamado.partidaId).sort()).toEqual([aoVivo.id, aguardando.id].sort());
  expect(lista[0]).toMatchObject({ chamadoPorApelido: 'quem_denunciou', partidaTipo: 'mix' });
});

test('chamado já atendido não aparece', async () => {
  const aoVivo = await criarPartidaCom([denunciante], { estado: 'ao_vivo', encerradaEm: null, vencedor: null });
  await bd.insert(chamados).values({ partidaId: aoVivo.id, chamadoPor: denunciante.id, estado: 'atendido' });
  expect(await chamadosEmAndamento(bd, gm)).toEqual([]);
});

test('casoEscolhido abre o caso pedido no endereço', () => {
  const casos = [{ chave: 'a' }, { chave: 'b' }];
  expect(casoEscolhido(casos, 'b')).toEqual({ aberto: casos[1], encerrado: false });
});

test('sem caso pedido, casoEscolhido não troca de caso sozinho: devolve o primeiro para virar endereço fixo', () => {
  const casos = [{ chave: 'a' }, { chave: 'b' }];
  expect(casoEscolhido(casos, undefined)).toEqual({ aberto: casos[0], encerrado: false });
});

test('caso pedido que não existe mais fica sem detalhe, para a conclusão não ir parar em outro caso', () => {
  const casos = [{ chave: 'b' }];
  expect(casoEscolhido(casos, 'a')).toEqual({ aberto: null, encerrado: true });
});

test('sem nenhum caso, casoEscolhido fica vazio', () => {
  expect(casoEscolhido([], undefined)).toEqual({ aberto: null, encerrado: false });
});

test('motivoDaProposta junta o nome da partida e a conclusão', () => {
  expect(motivoDaProposta({ tipo: 'mix', numero: 7 }, 'Mira na parede')).toBe('Mix #7: Mira na parede');
  expect(motivoDaProposta({ tipo: 'desafio', numero: 5 }, '  Sabia onde eu estava  ')).toBe('Desafio #5: Sabia onde eu estava');
});

test('motivoDaProposta sem conclusão é recusado, porque o nome da partida sozinho não explica nada', () => {
  expect(() => motivoDaProposta({ tipo: 'mix', numero: 7 }, '   ')).toThrow(ConclusaoInvalida);
});

test('denúncia da Diversão: a equipe vê, encerra com conclusão e auditoria, e ela sai do contador', async () => {
  const referencia = 'diversao:27020:abc';
  await bd.insert(xpPartidas).values(
    [acusado, denunciante].map((conta) => ({ usuarioId: conta.id, origem: 'diversao' as const, referencia, abates: 1, mortes: 1, resultado: 'derrota' as const, xp: 100, mapa: 'zm_silent_village' })),
  );
  await bd.insert(denunciasDiversao).values({ referencia, denuncianteId: denunciante.id, acusadoId: acusado.id, motivo: 'Atravessando parede' });
  expect((await contagemDeCasos(bd, gm)).denuncias).toBe(1);
  await expect(listarDenunciasDaDiversao(bd, membro)).rejects.toBeInstanceOf(SemPermissao);

  const lista = await listarDenunciasDaDiversao(bd, gm);
  expect(lista).toHaveLength(1);
  expect(lista[0]).toMatchObject({
    endereco: '/partidas/diversao/27020-abc',
    mapa: 'Silent Village',
    motivo: 'Atravessando parede',
    acusado: { id: acusado.id, apelido: 'acusado' },
    denuncianteApelido: 'quem_denunciou',
    podeEncerrar: true,
  });

  await expect(encerrarDenunciaDaDiversao(bd, gm, lista[0].id, '   ')).rejects.toBeInstanceOf(ConclusaoInvalida);
  await bd.update(usuarios).set({ papel: 'gm' }).where(eq(usuarios.id, acusado.id));
  expect((await listarDenunciasDaDiversao(bd, acusado))[0].podeEncerrar).toBe(false);
  await expect(encerrarDenunciaDaDiversao(bd, acusado, lista[0].id, 'Sem provas')).rejects.toBeInstanceOf(SemPermissao);

  await encerrarDenunciaDaDiversao(bd, gm, lista[0].id, 'Sem provas');
  expect(await listarDenunciasDaDiversao(bd, gm)).toEqual([]);
  expect((await contagemDeCasos(bd, gm)).denuncias).toBe(0);
  const [gravada] = await bd.select().from(denunciasDiversao);
  expect(gravada).toMatchObject({ estado: 'encerrada', analistaId: gm.id, conclusao: 'Sem provas' });
  const [registro] = await bd.select().from(auditoria).where(eq(auditoria.acao, 'encerrar_denuncia_diversao'));
  expect(registro).toMatchObject({ atorId: gm.id, alvoId: acusado.id });
  await expect(encerrarDenunciaDaDiversao(bd, gm, lista[0].id, 'de novo')).rejects.toBeInstanceOf(DenunciaIndisponivel);
});

async function mensagemDenunciada(texto: string): Promise<{ conversa: string; mensagem: string }> {
  await pedirAmizade(bd, acusado, denunciante.id, AGORA);
  await responderAmizade(bd, denunciante, acusado.id, true, AGORA);
  const conversa = await conversaDiretaCom(bd, acusado, denunciante.id, AGORA);
  const mensagem = await enviarMensagem(bd, acusado, conversa, texto, AGORA);
  await denunciarMensagem(bd, denunciante, mensagem, AGORA);
  return { conversa, mensagem };
}

test('denúncia de mensagem chega à equipe com o texto, conta no sino e não repete', async () => {
  const { mensagem } = await mensagemDenunciada('xingamento');
  await denunciarMensagem(bd, denunciante, mensagem, AGORA);
  expect((await contagemDeCasos(bd, gm)).denuncias).toBe(1);
  await expect(listarDenunciasDeMensagem(bd, membro)).rejects.toBeInstanceOf(SemPermissao);
  const lista = await listarDenunciasDeMensagem(bd, gm);
  expect(lista).toHaveLength(1);
  expect(lista[0]).toMatchObject({ texto: 'xingamento', autor: { id: acusado.id, apelido: 'acusado' }, denuncianteApelido: 'quem_denunciou', podeResolver: true });
});

test('apagar a mensagem denunciada some com ela para todos e fecha a denúncia, com auditoria', async () => {
  const { conversa } = await mensagemDenunciada('xingamento');
  const [denuncia] = await listarDenunciasDeMensagem(bd, gm);
  await resolverDenunciaDeMensagem(bd, gm, denuncia.id, 'apagar');
  expect(await mensagensDe(bd, denunciante, conversa, AGORA)).toEqual([]);
  expect(await listarDenunciasDeMensagem(bd, gm)).toEqual([]);
  expect((await contagemDeCasos(bd, gm)).denuncias).toBe(0);
  expect((await bd.select().from(denunciasDeMensagem))[0]).toMatchObject({ estado: 'encerrada', analistaId: gm.id, conclusao: 'Mensagem apagada' });
  const [registro] = await bd.select().from(auditoria).where(eq(auditoria.acao, 'resolver_denuncia_de_mensagem'));
  expect(registro).toMatchObject({ atorId: gm.id, alvoId: acusado.id });
  await expect(resolverDenunciaDeMensagem(bd, gm, denuncia.id, 'arquivar')).rejects.toBeInstanceOf(DenunciaIndisponivel);
});

test('arquivar deixa a mensagem, e quem escreveu ou denunciou não resolve a própria denúncia', async () => {
  const { conversa } = await mensagemDenunciada('normal');
  await bd.update(usuarios).set({ papel: 'gm' }).where(eq(usuarios.id, acusado.id));
  const [denuncia] = await listarDenunciasDeMensagem(bd, acusado);
  expect(denuncia.podeResolver).toBe(false);
  await expect(resolverDenunciaDeMensagem(bd, acusado, denuncia.id, 'apagar')).rejects.toBeInstanceOf(SemPermissao);
  await resolverDenunciaDeMensagem(bd, gm, denuncia.id, 'arquivar');
  expect(await mensagensDe(bd, denunciante, conversa, AGORA)).toHaveLength(1);
  expect((await bd.select().from(denunciasDeMensagem))[0]).toMatchObject({ estado: 'encerrada', conclusao: 'Arquivada sem apagar' });
});
