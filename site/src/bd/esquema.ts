import { sql } from 'drizzle-orm';
import { bigint, boolean, check, index, integer, jsonb, pgEnum, pgTable, primaryKey, serial, text, timestamp, unique, uniqueIndex, uuid } from 'drizzle-orm/pg-core';

export const papel = pgEnum('papel', ['jogador', 'gm', 'adm']);
export const estadoUsuario = pgEnum('estado_usuario', ['aguardando_verificacao', 'ativo', 'suspenso', 'banido']);
export const estadoVerificacao = pgEnum('estado_verificacao', ['pendente', 'aprovada', 'reprovada', 'banido']);

const criadoEm = () => timestamp('criado_em', { withTimezone: true }).notNull().defaultNow();

export const usuarios = pgTable('usuarios', {
  id: uuid('id').primaryKey().defaultRandom(),
  steamid64: text('steamid64').notNull().unique(),
  apelido: text('apelido').notNull(),
  avatarUrl: text('avatar_url'),
  papel: papel('papel').notNull().default('jogador'),
  estado: estadoUsuario('estado').notNull().default('aguardando_verificacao'),
  cpfHmac: text('cpf_hmac').unique(),
  convitesRestantes: integer('convites_restantes').notNull().default(0),
  convidadoPor: uuid('convidado_por'),
  vistoEm: timestamp('visto_em', { withTimezone: true }),
  xpTotal: integer('xp_total').notNull().default(0),
  // Quem sai de um clã espera 24 horas para entrar em outro, para ninguém "emprestar" jogador entre desafios.
  saiuDeClaEm: timestamp('saiu_de_cla_em', { withTimezone: true }),
  // A patente mais alta que a pessoa já viu no perfil, para o sino avisar só da nova.
  patenteVista: integer('patente_vista').notNull().default(1),
  // A Grana é a soma do livro-caixa (lancamentos_de_grana), guardada aqui para ler rápido; muda só junto de uma linha nova.
  grana: integer('grana').notNull().default(0),
  // MagCoin: comprada com dinheiro de verdade. Mesmo livro-caixa da Grana, coluna `moeda`.
  magcoin: integer('magcoin').notNull().default(0),
  // Personagem feito só para essa conta (caminho do .vmdl no pacote da Oficina): o servidor veste ao nascer.
  boneco: text('boneco'),
  // A insígnia escolhida para aparecer ao lado do nome, como "estrela:2" (dono, 11/11/2026).
  insigniaPrincipal: text('insignia_principal'),
  criadoEm: criadoEm(),
}, (tabela) => [
  check('usuarios_grana_nao_negativa', sql`${tabela.grana} >= 0`),
  check('usuarios_magcoin_nao_negativa', sql`${tabela.magcoin} >= 0`),
]);

export const origemXp = pgEnum('origem_xp', ['partida', 'diversao']);
export const resultadoXp = pgEnum('resultado_xp', ['vitoria', 'empate', 'derrota']);

export const xpPartidas = pgTable(
  'xp_partidas',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    usuarioId: uuid('usuario_id')
      .notNull()
      .references(() => usuarios.id),
    origem: origemXp('origem').notNull(),
    // Sem chave estrangeira: pode ser uma partida do site ou uma partida de um servidor da Diversão.
    referencia: text('referencia').notNull(),
    abates: integer('abates').notNull(),
    resultado: resultadoXp('resultado').notNull(),
    xp: integer('xp').notNull(),
    // Para a tabela do perfil. Partida antiga ou da Diversão sem estes dados fica sem.
    mapa: text('mapa'),
    mortes: integer('mortes'),
    placar: text('placar'),
    criadoEm: criadoEm(),
  },
  (tabela) => [unique('xp_partidas_conta_referencia').on(tabela.usuarioId, tabela.referencia), index('xp_partidas_conta_data_idx').on(tabela.usuarioId, tabela.criadoEm)],
);

// venda: saque vendido no mercado da Ilha Lemnos; lemnos: dinheiro solto trazido numa extração (15/11/2026).
export const tipoGrana = pgEnum('tipo_grana', ['partida', 'abertura', 'compra', 'ajuste', 'pagamento', 'mensalidade', 'estorno', 'insignia', 'presente', 'venda', 'lemnos']);
export const moeda = pgEnum('moeda', ['grana', 'magcoin']);

/**
 * O livro-caixa da Grana: uma linha por ganho ou gasto, nunca editada nem apagada. A referência (a partida, o código
 * da compra) não se repete na mesma conta e no mesmo tipo, então nada paga nem cobra duas vezes.
 */
export const lancamentosDeGrana = pgTable(
  'lancamentos_de_grana',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    usuarioId: uuid('usuario_id')
      .notNull()
      .references(() => usuarios.id),
    moeda: moeda('moeda').notNull().default('grana'),
    tipo: tipoGrana('tipo').notNull(),
    quantidade: integer('quantidade').notNull(),
    referencia: text('referencia').notNull(),
    // Compra: item, dias e preço pago. Ajuste: o motivo.
    detalhes: jsonb('detalhes'),
    // Quem fez o ajuste no Painel ADM.
    atorId: uuid('ator_id').references(() => usuarios.id),
    criadoEm: criadoEm(),
  },
  (tabela) => [
    unique('lancamentos_conta_moeda_tipo_referencia').on(tabela.usuarioId, tabela.moeda, tabela.tipo, tabela.referencia),
    index('lancamentos_de_grana_conta_data_idx').on(tabela.usuarioId, tabela.criadoEm),
    check('lancamentos_de_grana_quantidade_nao_zero', sql`${tabela.quantidade} <> 0`),
  ],
);

/** O baú: cada item que a conta tem, até quando vale (vazio é para sempre) e se está em uso. */
export const itensDoJogador = pgTable(
  'itens_do_jogador',
  {
    usuarioId: uuid('usuario_id')
      .notNull()
      .references(() => usuarios.id),
    itemId: text('item_id').notNull(),
    expiraEm: timestamp('expira_em', { withTimezone: true }),
    usando: boolean('usando').notNull().default(false),
    atualizadoEm: timestamp('atualizado_em', { withTimezone: true }).notNull().defaultNow(),
  },
  (tabela) => [primaryKey({ columns: [tabela.usuarioId, tabela.itemId] })],
);

/**
 * Cada insígnia conquistada, com o prêmio entregue junto (dono, 11/11/2026). A chave garante que a mesma insígnia, e o
 * prêmio dela, saem uma vez só. nivel: 0 = Bronze ... 4 = Lendária. mutanteDias null com mutanteId = para sempre.
 */
export const insigniasDoJogador = pgTable(
  'insignias_do_jogador',
  {
    usuarioId: uuid('usuario_id')
      .notNull()
      .references(() => usuarios.id),
    familia: text('familia').notNull(),
    nivel: integer('nivel').notNull(),
    conquistadaEm: timestamp('conquistada_em', { withTimezone: true }).notNull().defaultNow(),
    vistaEm: timestamp('vista_em', { withTimezone: true }),
    grana: integer('grana').notNull(),
    xp: integer('xp').notNull(),
    mutanteId: text('mutante_id'),
    mutanteDias: integer('mutante_dias'),
  },
  (tabela) => [primaryKey({ columns: [tabela.usuarioId, tabela.familia, tabela.nivel] })],
);

export const pacoteDeMagcoin = pgEnum('pacote_de_magcoin', ['pequeno', 'medio', 'grande', 'teste']);
export const estadoDoPedido = pgEnum('estado_do_pedido', ['aberto', 'pago', 'estornado']);

/** Uma compra de MagCoin pelo Mercado Pago. O crédito só sai quando a API do Mercado Pago diz que foi aprovado. */
export const pedidos = pgTable('pedidos', {
  id: uuid('id').primaryKey().defaultRandom(),
  usuarioId: uuid('usuario_id')
    .notNull()
    .references(() => usuarios.id),
  pacote: pacoteDeMagcoin('pacote').notNull(),
  valorCentavos: integer('valor_centavos').notNull(),
  magcoins: integer('magcoins').notNull(),
  estado: estadoDoPedido('estado').notNull().default('aberto'),
  // Um pagamento do Mercado Pago só paga um pedido.
  mpPagamentoId: text('mp_pagamento_id').unique(),
  pagoEm: timestamp('pago_em', { withTimezone: true }),
  criadoEm: criadoEm(),
});

export const nivelDeMembro = pgEnum('nivel_de_membro', ['bronze', 'prata', 'ouro', 'premium']);
export const estadoDaAssinatura = pgEnum('estado_da_assinatura', ['pendente', 'ativa', 'cancelada']);

/** Membro ou Premium: cobrança mensal no Mercado Pago. As vantagens valem até `pago_ate`. */
export const assinaturas = pgTable('assinaturas', {
  id: uuid('id').primaryKey().defaultRandom(),
  usuarioId: uuid('usuario_id')
    .notNull()
    .references(() => usuarios.id),
  nivel: nivelDeMembro('nivel').notNull(),
  // A API de assinatura do Mercado Pago pede o e-mail da conta de quem paga.
  email: text('email').notNull(),
  mpAssinaturaId: text('mp_assinatura_id').unique(),
  estado: estadoDaAssinatura('estado').notNull().default('pendente'),
  pagoAte: timestamp('pago_ate', { withTimezone: true }),
  mensalidadesPagas: integer('mensalidades_pagas').notNull().default(0),
  canceladaEm: timestamp('cancelada_em', { withTimezone: true }),
  criadoEm: criadoEm(),
});

/** Cada mensalidade aprovada, uma linha por pagamento do Mercado Pago. */
export const mensalidades = pgTable('mensalidades', {
  id: uuid('id').primaryKey().defaultRandom(),
  assinaturaId: uuid('assinatura_id')
    .notNull()
    .references(() => assinaturas.id),
  mpPagamentoId: text('mp_pagamento_id').notNull().unique(),
  valorCentavos: integer('valor_centavos').notNull(),
  pagoEm: timestamp('pago_em', { withTimezone: true }).notNull(),
  criadoEm: criadoEm(),
});

/** Endereço do Premium para os produtos em casa. Só a pessoa e o Adm veem; apagado 90 dias depois do fim. */
export const enderecos = pgTable('enderecos', {
  usuarioId: uuid('usuario_id')
    .primaryKey()
    .references(() => usuarios.id),
  nome: text('nome').notNull(),
  cep: text('cep').notNull(),
  rua: text('rua').notNull(),
  numero: text('numero').notNull(),
  complemento: text('complemento'),
  bairro: text('bairro').notNull(),
  cidade: text('cidade').notNull(),
  uf: text('uf').notNull(),
  telefone: text('telefone').notNull(),
  atualizadoEm: timestamp('atualizado_em', { withTimezone: true }).notNull().defaultNow(),
});

export const estadoDoEnvio = pgEnum('estado_do_envio', ['pendente', 'enviado']);

/** Um pacote do clube para um assinante Premium: nasce com a mensalidade e o Adm marca como enviado. */
export const envios = pgTable('envios', {
  id: uuid('id').primaryKey().defaultRandom(),
  usuarioId: uuid('usuario_id')
    .notNull()
    .references(() => usuarios.id),
  mensalidadeId: uuid('mensalidade_id')
    .notNull()
    .unique()
    .references(() => mensalidades.id),
  estado: estadoDoEnvio('estado').notNull().default('pendente'),
  rastreio: text('rastreio'),
  enviadoEm: timestamp('enviado_em', { withTimezone: true }),
  criadoEm: criadoEm(),
});

/** Quanto o clube gasta no mês (máquina, servidores), para a meta do Apoie o clube. Vale até o Adm mudar de novo. */
export const custosDoMes = pgTable('custos_do_mes', {
  // Mês de Brasília, "2026-11".
  mes: text('mes').primaryKey(),
  custoCentavos: integer('custo_centavos').notNull(),
  atorId: uuid('ator_id').references(() => usuarios.id),
  atualizadoEm: timestamp('atualizado_em', { withTimezone: true }).notNull().defaultNow(),
});

export const convites = pgTable('convites', {
  id: uuid('id').primaryKey().defaultRandom(),
  codigo: text('codigo').notNull().unique(),
  criadoPor: uuid('criado_por').references(() => usuarios.id),
  usadoPor: uuid('usado_por').references(() => usuarios.id),
  usadoEm: timestamp('usado_em', { withTimezone: true }),
  revogadoEm: timestamp('revogado_em', { withTimezone: true }),
  criadoEm: criadoEm(),
  /** Convite com presente (só o Adm cria): o que vai fechado para o baú de quem entrar. */
  presente: jsonb('presente').$type<ConteudoDoPresente>(),
  /** Depois disso o convite não vale mais. Vazio: não vence. */
  venceEm: timestamp('vence_em', { withTimezone: true }),
});

export const sessoes = pgTable('sessoes', {
  id: uuid('id').primaryKey().defaultRandom(),
  tokenHash: text('token_hash').notNull().unique(),
  usuarioId: uuid('usuario_id')
    .notNull()
    .references(() => usuarios.id),
  expiraEm: timestamp('expira_em', { withTimezone: true }).notNull(),
  criadoEm: criadoEm(),
});

// Fica em tabela própria para o bloqueio continuar valendo mesmo se a conta deixar de existir.
export const cpfsBanidos = pgTable('cpfs_banidos', {
  cpfHmac: text('cpf_hmac').primaryKey(),
  banidoEm: timestamp('banido_em', { withTimezone: true }).notNull().defaultNow(),
});

export const verificacoes = pgTable('verificacoes', {
  id: uuid('id').primaryKey().defaultRandom(),
  usuarioId: uuid('usuario_id')
    .notNull()
    .references(() => usuarios.id),
  provedor: text('provedor').notNull(),
  referencia: text('referencia').notNull().unique(),
  estado: estadoVerificacao('estado').notNull().default('pendente'),
  motivo: text('motivo'),
  criadoEm: criadoEm(),
  concluidoEm: timestamp('concluido_em', { withTimezone: true }),
});

export const auditoria = pgTable('auditoria', {
  id: uuid('id').primaryKey().defaultRandom(),
  atorId: uuid('ator_id').references(() => usuarios.id),
  acao: text('acao').notNull(),
  alvoId: uuid('alvo_id').references(() => usuarios.id),
  detalhes: jsonb('detalhes'),
  criadoEm: criadoEm(),
});

/** As quedas do CS2 dos membros, em resumo: o arquivo de diagnóstico que o jogo deixa tem 5 a 10 GB e é apagado. */
export const quedasDoJogo = pgTable('quedas_do_jogo', {
  id: uuid('id').primaryKey().defaultRandom(),
  quando: timestamp('quando', { withTimezone: true }).notNull(),
  motivo: text('motivo').notNull(),
  onde: text('onde').notNull(),
  observacao: text('observacao'),
  criadoEm: criadoEm(),
});

export type QuedaDoJogo = typeof quedasDoJogo.$inferSelect;

export const tipoPartida = pgEnum('tipo_partida', ['desafio', 'mix', 'cla', 'treino', 'teste']);
export const motivoDoCancelamento = pgEnum('motivo_do_cancelamento', ['aceite', 'equipe', 'abandono']);
export const estadoPartida = pgEnum('estado_partida', [
  'aguardando_aceite',
  'vetando',
  'aguardando_servidor',
  'carregando',
  'aguardando_jogadores',
  'ao_vivo',
  'encerrada',
  'cancelada',
]);

export const servidores = pgTable('servidores', {
  id: uuid('id').primaryKey().defaultRandom(),
  nome: text('nome').notNull(),
  host: text('host').notNull(),
  porta: integer('porta').notNull().default(27015),
  ativo: boolean('ativo').notNull().default(true),
  partidaId: uuid('partida_id'),
  criadoEm: criadoEm(),
});

export const modoDiversao = pgEnum('modo_diversao', ['cada_um', 'equipe', 'mutacao', 'fantasma', 'lemnos']);

// A futura tela de Adm cria e edita estas linhas.
export const servidoresDiversao = pgTable(
  'servidores_diversao',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    modo: modoDiversao('modo').notNull(),
    armas: text('armas').notNull(),
    mapa: text('mapa').notNull(),
    foto: text('foto').notNull(),
    // Sem host, vale o endereço de DIVERSAO_HOST.
    host: text('host'),
    porta: integer('porta').notNull(),
    vagas: integer('vagas').notNull().default(16),
    ativo: boolean('ativo').notNull().default(false),
    ordem: integer('ordem').notNull(),
    // Nome da sessão na VPS (diversao-<nome>) e do arquivo /home/cs2/bin/diversao/<nome>.conf.
    nomeNoServidor: text('nome_no_servidor'),
    // Desligado sozinho depois de 5 minutos vazio; com false, o site nunca desliga.
    sobDemanda: boolean('sob_demanda').notNull().default(true),
    criadoEm: criadoEm(),
  },
  (tabela) => [uniqueIndex('servidores_diversao_endereco_idx').on(sql`coalesce(${tabela.host}, '')`, tabela.porta)],
);

export const partidas = pgTable('partidas', {
  id: uuid('id').primaryKey().defaultRandom(),
  // É o matchid do MatchZy, que precisa ser um número.
  numero: serial('numero').notNull().unique(),
  tipo: tipoPartida('tipo').notNull(),
  estado: estadoPartida('estado').notNull().default('aguardando_servidor'),
  // Fica vazio até os vetos (desafio) ou o sorteio (mix) definirem o mapa.
  mapa: text('mapa'),
  // Prazo dos 30 segundos para todos aceitarem.
  aceiteAte: timestamp('aceite_ate', { withTimezone: true }),
  // Time que ganhou o cara ou coroa e veta primeiro (1 ou 2), e o prazo do veto da vez.
  primeiroAVetar: integer('primeiro_a_vetar'),
  vetoAte: timestamp('veto_ate', { withTimezone: true }),
  // Nome das salas no desafio, guardado para o placar continuar com os nomes depois que as salas se desfazem.
  nomeTime1: text('nome_time1'),
  nomeTime2: text('nome_time2'),
  motivoDoCancelamento: motivoDoCancelamento('motivo_do_cancelamento'),
  servidorId: uuid('servidor_id').references(() => servidores.id),
  vencedor: integer('vencedor'),
  placar1: integer('placar1').notNull().default(0),
  placar2: integer('placar2').notNull().default(0),
  criadoEm: criadoEm(),
  estadoDesde: timestamp('estado_desde', { withTimezone: true }).notNull().defaultNow(),
  ultimoEventoEm: timestamp('ultimo_evento_em', { withTimezone: true }),
  iniciadaEm: timestamp('iniciada_em', { withTimezone: true }),
  encerradaEm: timestamp('encerrada_em', { withTimezone: true }),
  // Clã de cada time no clã x clã e no treino. Sem chave estrangeira: o clã desfeito continua no histórico.
  claTime1Id: uuid('cla_time1_id'),
  claTime2Id: uuid('cla_time2_id'),
  // Na MD3 cada mapa é uma partida, ligadas pela série.
  serieId: uuid('serie_id'),
  mapaDaSerie: integer('mapa_da_serie'),
  mapasDaPartida: integer('mapas_da_partida').notNull().default(1),
  // O mapa seguinte da série espera o mesmo servidor, onde os jogadores já estão.
  servidorPreferidoId: uuid('servidor_preferido_id'),
}, (tabela) => [index('partidas_estado_idx').on(tabela.estado)]);

export const partidaJogadores = pgTable(
  'partida_jogadores',
  {
    partidaId: uuid('partida_id')
      .notNull()
      .references(() => partidas.id),
    usuarioId: uuid('usuario_id')
      .notNull()
      .references(() => usuarios.id),
    time: integer('time').notNull(),
    kills: integer('kills').notNull().default(0),
    deaths: integer('deaths').notNull().default(0),
    assists: integer('assists').notNull().default(0),
    damage: integer('damage').notNull().default(0),
    headshotKills: integer('headshot_kills').notNull().default(0),
    rodadas: integer('rodadas').notNull().default(0),
    mvps: integer('mvps').notNull().default(0),
    // Rodadas com abate, assistência, sobrevivência ou troca, como a HLTV conta.
    kast: integer('kast').notNull().default(0),
    k1: integer('k1').notNull().default(0),
    k2: integer('k2').notNull().default(0),
    k3: integer('k3').notNull().default(0),
    k4: integer('k4').notNull().default(0),
    k5: integer('k5').notNull().default(0),
    aceitouEm: timestamp('aceitou_em', { withTimezone: true }),
    // Só no mix: a posição na fila, para quem aceitou voltar ao mesmo lugar se a partida cair.
    entrouNaFilaEm: timestamp('entrou_na_fila_em', { withTimezone: true }),
  },
  (tabela) => [primaryKey({ columns: [tabela.partidaId, tabela.usuarioId] }), index('partida_jogadores_usuario_idx').on(tabela.usuarioId)],
);

export const salas = pgTable('salas', {
  id: uuid('id').primaryKey().defaultRandom(),
  nome: text('nome').notNull(),
  liderId: uuid('lider_id')
    .notNull()
    .references(() => usuarios.id),
  partidaId: uuid('partida_id').references(() => partidas.id),
  criadoEm: criadoEm(),
});

export const salaMembros = pgTable('sala_membros', {
  // Ser chave primária garante uma sala por pessoa, mesmo com pedidos ao mesmo tempo.
  usuarioId: uuid('usuario_id')
    .primaryKey()
    .references(() => usuarios.id),
  salaId: uuid('sala_id')
    .notNull()
    .references(() => salas.id, { onDelete: 'cascade' }),
  entrouEm: timestamp('entrou_em', { withTimezone: true }).notNull().defaultNow(),
});

export const estadoDaAmizade = pgEnum('estado_da_amizade', ['pendente', 'aceita']);

/** Amizade entre dois membros: quem pediu (de) e quem recebeu (para). Um par só tem uma linha, nos dois sentidos. */
export const amizades = pgTable(
  'amizades',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    deId: uuid('de_id')
      .notNull()
      .references(() => usuarios.id),
    paraId: uuid('para_id')
      .notNull()
      .references(() => usuarios.id),
    estado: estadoDaAmizade('estado').notNull().default('pendente'),
    criadoEm: criadoEm(),
    aceitaEm: timestamp('aceita_em', { withTimezone: true }),
  },
  (tabela) => [
    uniqueIndex('amizades_um_par').on(sql`least(${tabela.deId}, ${tabela.paraId})`, sql`greatest(${tabela.deId}, ${tabela.paraId})`),
    index('amizades_para').on(tabela.paraId),
    check('amizades_nao_consigo', sql`${tabela.deId} <> ${tabela.paraId}`),
  ],
);

/** Convite de um amigo para a sala: vence sozinho e some quando a pessoa entra. Um por sala e convidado. */
export const convitesDeSala = pgTable(
  'convites_de_sala',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    salaId: uuid('sala_id')
      .notNull()
      .references(() => salas.id, { onDelete: 'cascade' }),
    deId: uuid('de_id')
      .notNull()
      .references(() => usuarios.id),
    paraId: uuid('para_id')
      .notNull()
      .references(() => usuarios.id),
    expiraEm: timestamp('expira_em', { withTimezone: true }).notNull(),
    criadoEm: criadoEm(),
  },
  (tabela) => [unique('convites_de_sala_um_por_pessoa').on(tabela.salaId, tabela.paraId), index('convites_de_sala_para').on(tabela.paraId)],
);

export const tipoDeConversa = pgEnum('tipo_de_conversa', ['direta', 'grupo', 'cla']);

/**
 * Uma conversa: direta (dois amigos, a chave é o par), grupo (criado por um membro) ou a do clã (uma por clã, quem
 * está no clã fala nela).
 */
export const conversas = pgTable('conversas', {
  id: uuid('id').primaryKey().defaultRandom(),
  tipo: tipoDeConversa('tipo').notNull(),
  // Direta: "menorId:maiorId", para nunca haver duas conversas do mesmo par.
  chave: text('chave').unique(),
  nome: text('nome'),
  claId: uuid('cla_id')
    .unique()
    .references(() => clas.id, { onDelete: 'cascade' }),
  criadoPor: uuid('criado_por').references(() => usuarios.id),
  criadoEm: criadoEm(),
  ultimaEm: timestamp('ultima_em', { withTimezone: true }).notNull().defaultNow(),
});

/** Quem está na conversa e até quando já leu. Na do clã, a linha nasce quando a pessoa abre a conversa. */
export const conversaMembros = pgTable(
  'conversa_membros',
  {
    conversaId: uuid('conversa_id')
      .notNull()
      .references(() => conversas.id, { onDelete: 'cascade' }),
    usuarioId: uuid('usuario_id')
      .notNull()
      .references(() => usuarios.id),
    lidaAte: timestamp('lida_ate', { withTimezone: true }).notNull().defaultNow(),
    entrouEm: timestamp('entrou_em', { withTimezone: true }).notNull().defaultNow(),
  },
  (tabela) => [primaryKey({ columns: [tabela.conversaId, tabela.usuarioId] }), index('conversa_membros_usuario').on(tabela.usuarioId)],
);

export const mensagens = pgTable(
  'mensagens',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    conversaId: uuid('conversa_id')
      .notNull()
      .references(() => conversas.id, { onDelete: 'cascade' }),
    autorId: uuid('autor_id')
      .notNull()
      .references(() => usuarios.id),
    texto: text('texto').notNull(),
    criadoEm: criadoEm(),
    // A equipe apaga a mensagem denunciada; ela some para todos.
    apagadaEm: timestamp('apagada_em', { withTimezone: true }),
  },
  (tabela) => [index('mensagens_da_conversa').on(tabela.conversaId, tabela.criadoEm)],
);

export const filaMix = pgTable('fila_mix', {
  usuarioId: uuid('usuario_id')
    .primaryKey()
    .references(() => usuarios.id),
  entrouEm: timestamp('entrou_em', { withTimezone: true }).notNull().defaultNow(),
});

export const estadoDaDiversao = pgEnum('estado_da_diversao', ['desligado', 'ligando', 'ligado']);

// O que o site sabe de cada servidor da Diversão: a varredura atualiza a cada 15 segundos.
export const estadosDaDiversao = pgTable('estados_da_diversao', {
  servidorId: uuid('servidor_id')
    .primaryKey()
    .references(() => servidoresDiversao.id, { onDelete: 'cascade' }),
  estado: estadoDaDiversao('estado').notNull().default('desligado'),
  desde: timestamp('desde', { withTimezone: true }).notNull().defaultNow(),
  vazioDesde: timestamp('vazio_desde', { withTimezone: true }),
  // Ligado que deixou de responder (quase sempre troca de mapa): só vira desligado depois de 45 segundos.
  semRespostaDesde: timestamp('sem_resposta_desde', { withTimezone: true }),
  pedidoPor: uuid('pedido_por').references(() => usuarios.id, { onDelete: 'set null' }),
  erro: text('erro'),
  // Teste do Adm com bots (só a Mutação): pedido até o site mandar o comando ao servidor, ativo até ele desligar.
  teste: text('teste', { enum: ['pedido', 'ativo'] }),
});

export const estadoDesafio = pgEnum('estado_desafio', ['pendente', 'aceito', 'recusado', 'cancelado', 'expirado']);

export const formatoDesafio = pgEnum('formato_desafio', ['comum', 'cla', 'treino']);

export const desafios = pgTable('desafios', {
  id: uuid('id').primaryKey().defaultRandom(),
  formato: formatoDesafio('formato').notNull().default('comum'),
  mapas: integer('mapas').notNull().default(1),
  // Sem chave estrangeira: o desafio encerrado continua no histórico depois que a sala acaba.
  salaOrigemId: uuid('sala_origem_id').notNull(),
  salaAlvoId: uuid('sala_alvo_id').notNull(),
  estado: estadoDesafio('estado').notNull().default('pendente'),
  expiraEm: timestamp('expira_em', { withTimezone: true }).notNull(),
  criadoEm: criadoEm(),
});

/** Pedido de uma sala para entrar inteira em outra. Mesma vida de um desafio. */
export const juncoes = pgTable('juncoes', {
  id: uuid('id').primaryKey().defaultRandom(),
  salaOrigemId: uuid('sala_origem_id').notNull(),
  salaAlvoId: uuid('sala_alvo_id').notNull(),
  estado: estadoDesafio('estado').notNull().default('pendente'),
  expiraEm: timestamp('expira_em', { withTimezone: true }).notNull(),
  criadoEm: criadoEm(),
});

export const acaoVeto = pgEnum('acao_veto', ['veta', 'escolhe']);

export const vetos = pgTable(
  'vetos',
  {
    // Na MD3 alguns passos escolhem o mapa em vez de vetar.
    acao: acaoVeto('acao').notNull().default('veta'),
    partidaId: uuid('partida_id')
      .notNull()
      .references(() => partidas.id),
    ordem: integer('ordem').notNull(),
    time: integer('time').notNull(),
    mapa: text('mapa').notNull(),
    // Vetado pelo site quando o líder deixou os 20 segundos passarem.
    automatico: boolean('automatico').notNull().default(false),
    criadoEm: criadoEm(),
  },
  (tabela) => [primaryKey({ columns: [tabela.partidaId, tabela.ordem] }), unique().on(tabela.partidaId, tabela.mapa)],
);

/** Quem não aceitou a partida nos 30 segundos. Anulada quando a equipe reverte um banimento. */
export const faltas = pgTable(
  'faltas',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    usuarioId: uuid('usuario_id')
      .notNull()
      .references(() => usuarios.id),
    partidaId: uuid('partida_id')
      .notNull()
      .references(() => partidas.id),
    bloqueadoAte: timestamp('bloqueado_ate', { withTimezone: true }),
    anuladaEm: timestamp('anulada_em', { withTimezone: true }),
    criadoEm: criadoEm(),
  },
  (tabela) => [index('faltas_usuario_idx').on(tabela.usuarioId)],
);

export const tipoElogio = pgEnum('tipo_elogio', ['bom_de_mira', 'gente_boa', 'lider', 'bom_de_equipe']);

export const elogios = pgTable(
  'elogios',
  {
    partidaId: uuid('partida_id')
      .notNull()
      .references(() => partidas.id),
    autorId: uuid('autor_id')
      .notNull()
      .references(() => usuarios.id),
    elogiadoId: uuid('elogiado_id')
      .notNull()
      .references(() => usuarios.id),
    tipo: tipoElogio('tipo').notNull(),
    criadoEm: criadoEm(),
  },
  (tabela) => [primaryKey({ columns: [tabela.partidaId, tabela.autorId, tabela.elogiadoId] }), index('elogios_elogiado_idx').on(tabela.elogiadoId)],
);

/** Notícias do clube, escritas por adm ou publicadas pelo script de patch de aviso (sem autor). */
export const noticias = pgTable(
  'noticias',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    titulo: text('titulo').notNull(),
    // Texto puro, em parágrafos separados por linha em branco. Nunca vira HTML.
    texto: text('texto').notNull(),
    imagem: text('imagem'),
    fixada: boolean('fixada').notNull().default(false),
    autorId: uuid('autor_id').references(() => usuarios.id),
    criadoEm: criadoEm(),
    atualizadaEm: timestamp('atualizada_em', { withTimezone: true }),
  },
  (tabela) => [index('noticias_criado_em_idx').on(tabela.criadoEm)],
);

/** Atualizações oficiais do CS2 na Steam, com a tradução guardada para nunca traduzir duas vezes. */
export const noticiasSteam = pgTable('noticias_steam', {
  gid: text('gid').primaryKey(),
  tituloOriginal: text('titulo_original').notNull(),
  url: text('url').notNull(),
  publicadaEm: timestamp('publicada_em', { withTimezone: true }).notNull(),
  conteudo: text('conteudo').notNull(),
  tituloPt: text('titulo_pt'),
  resumoPt: text('resumo_pt'),
  traduzidaEm: timestamp('traduzida_em', { withTimezone: true }),
  tentativas: integer('tentativas').notNull().default(0),
});

/**
 * O aviso de "servidores em manutenção" (dono, 11/11/2026): uma linha só (id 1). Liga sozinho quando a atualização do
 * CS2 dá problema e apaga quando os servidores voltam; o Adm também liga e desliga na mão.
 */
export const manutencaoDosServidores = pgTable('manutencao_dos_servidores', {
  id: integer('id').primaryKey().default(1),
  ligada: boolean('ligada').notNull().default(false),
  automatica: boolean('automatica').notNull().default(false),
  motivo: text('motivo'),
  desde: timestamp('desde', { withTimezone: true }).notNull().defaultNow(),
  atorId: uuid('ator_id').references(() => usuarios.id),
});

/** Resultado guardado de fontes de fora (Tier S, última busca da Steam), para a página nunca esperar a rede. */
export const cacheExterno = pgTable('cache_externo', {
  chave: text('chave').primaryKey(),
  dados: jsonb('dados').notNull(),
  atualizadoEm: timestamp('atualizado_em', { withTimezone: true }).notNull(),
});

export const gravacoes = pgTable('gravacoes', {
  id: uuid('id').primaryKey().defaultRandom(),
  partidaId: uuid('partida_id')
    .notNull()
    .unique()
    .references(() => partidas.id),
  arquivo: text('arquivo').notNull(),
  // Uma gravação de partida longa pode passar de 2 GB, o limite de um integer.
  bytes: bigint('bytes', { mode: 'number' }).notNull(),
  criadoEm: criadoEm(),
  apagadaEm: timestamp('apagada_em', { withTimezone: true }),
});

export const estadoDenuncia = pgEnum('estado_denuncia', ['aberta', 'em_analise', 'encerrada']);

export const denuncias = pgTable(
  'denuncias',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    partidaId: uuid('partida_id')
      .notNull()
      .references(() => partidas.id),
    denuncianteId: uuid('denunciante_id')
      .notNull()
      .references(() => usuarios.id),
    // Fica vazio quando o chamado sem equipe online vira denúncia, e a equipe descobre quem é pela gravação.
    acusadoId: uuid('acusado_id').references(() => usuarios.id),
    motivo: text('motivo').notNull(),
    estado: estadoDenuncia('estado').notNull().default('aberta'),
    analistaId: uuid('analista_id').references(() => usuarios.id),
    conclusao: text('conclusao'),
    criadoEm: criadoEm(),
  },
  (tabela) => [unique().on(tabela.partidaId, tabela.denuncianteId, tabela.acusadoId)],
);

/**
 * Elogio e denúncia nas partidas da Diversão (dono, 11/11/2026). A partida da Diversão não tem linha em `partidas`:
 * é a referência "diversao:<porta>:<partida>" das linhas de XP de quem jogou.
 */
export const elogiosDiversao = pgTable(
  'elogios_diversao',
  {
    referencia: text('referencia').notNull(),
    autorId: uuid('autor_id')
      .notNull()
      .references(() => usuarios.id),
    elogiadoId: uuid('elogiado_id')
      .notNull()
      .references(() => usuarios.id),
    tipo: tipoElogio('tipo').notNull(),
    criadoEm: criadoEm(),
  },
  (tabela) => [primaryKey({ columns: [tabela.referencia, tabela.autorId, tabela.elogiadoId] }), index('elogios_diversao_elogiado_idx').on(tabela.elogiadoId)],
);

export const denunciasDiversao = pgTable(
  'denuncias_diversao',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    referencia: text('referencia').notNull(),
    denuncianteId: uuid('denunciante_id')
      .notNull()
      .references(() => usuarios.id),
    acusadoId: uuid('acusado_id')
      .notNull()
      .references(() => usuarios.id),
    motivo: text('motivo').notNull(),
    estado: estadoDenuncia('estado').notNull().default('aberta'),
    analistaId: uuid('analista_id').references(() => usuarios.id),
    conclusao: text('conclusao'),
    criadoEm: criadoEm(),
  },
  (tabela) => [unique('denuncias_diversao_unica').on(tabela.referencia, tabela.denuncianteId, tabela.acusadoId)],
);

/**
 * O presente de boas-vindas do Premium (dono, 12/11/2026): chega fechado no baú na primeira mensalidade, uma vez por
 * conta. Ao abrir, a pessoa escolhe o mutante que fica para sempre.
 */
export const presentes = pgTable(
  'presentes',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    usuarioId: uuid('usuario_id')
      .notNull()
      .references(() => usuarios.id),
    // premium: o de boas-vindas, com a escolha do mutante. convite: o que veio no convite com presente.
    origem: text('origem').$type<'premium' | 'convite'>().notNull().default('premium'),
    conteudo: jsonb('conteudo').$type<ConteudoDoPresente>(),
    recado: text('recado'),
    criadoEm: criadoEm(),
    abertoEm: timestamp('aberto_em', { withTimezone: true }),
    mutanteId: text('mutante_id'),
  },
  // Um de cada origem por conta: o do Premium é uma vez só, e cada conta entra por um convite só.
  (tabela) => [unique('presentes_conta_origem').on(tabela.usuarioId, tabela.origem)],
);

/** O que vai dentro de um presente de convite: itens da Shop por X dias, Grana, MagCoins e um recado. */
export type ConteudoDoPresente = { itens?: { itemId: string; dias: number }[]; grana?: number; magcoin?: number; recado?: string };

/**
 * Denúncia de uma mensagem das conversas (dono, 12/11/2026): vai para o Olho de Águia, onde a equipe apaga a mensagem
 * ou arquiva a denúncia. A conclusão diz o que foi feito.
 */
export const denunciasDeMensagem = pgTable(
  'denuncias_de_mensagem',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    mensagemId: uuid('mensagem_id')
      .notNull()
      .references(() => mensagens.id, { onDelete: 'cascade' }),
    denuncianteId: uuid('denunciante_id')
      .notNull()
      .references(() => usuarios.id),
    autorId: uuid('autor_id')
      .notNull()
      .references(() => usuarios.id),
    estado: estadoDenuncia('estado').notNull().default('aberta'),
    analistaId: uuid('analista_id').references(() => usuarios.id),
    conclusao: text('conclusao'),
    criadoEm: criadoEm(),
  },
  (tabela) => [unique('denuncias_de_mensagem_unica').on(tabela.mensagemId, tabela.denuncianteId)],
);

/** As partidas (do mix pelo id, da Diversão pela referência) que a pessoa já abriu, para o sino parar de pedir avaliação. */
export const partidasVistas = pgTable(
  'partidas_vistas',
  {
    usuarioId: uuid('usuario_id')
      .notNull()
      .references(() => usuarios.id),
    referencia: text('referencia').notNull(),
    vistaEm: timestamp('vista_em', { withTimezone: true }).notNull().defaultNow(),
  },
  (tabela) => [primaryKey({ columns: [tabela.usuarioId, tabela.referencia] })],
);

export const estadoChamado = pgEnum('estado_chamado', ['aberto', 'atendido', 'virou_denuncia']);

export const chamados = pgTable('chamados', {
  id: uuid('id').primaryKey().defaultRandom(),
  partidaId: uuid('partida_id')
    .notNull()
    .references(() => partidas.id),
  chamadoPor: uuid('chamado_por')
    .notNull()
    .references(() => usuarios.id),
  estado: estadoChamado('estado').notNull().default('aberto'),
  atendidoPor: uuid('atendido_por').references(() => usuarios.id),
  criadoEm: criadoEm(),
});

export const estadoBanimento = pgEnum('estado_banimento', ['proposto', 'confirmado', 'recusado', 'revertido']);

export const banimentos = pgTable('banimentos', {
  id: uuid('id').primaryKey().defaultRandom(),
  usuarioId: uuid('usuario_id')
    .notNull()
    .references(() => usuarios.id),
  cpfHmac: text('cpf_hmac'),
  motivo: text('motivo').notNull(),
  estado: estadoBanimento('estado').notNull().default('proposto'),
  // Vazio quando foi o próprio site que baniu, por faltas repetidas.
  propostoPor: uuid('proposto_por').references(() => usuarios.id),
  confirmadoPor: uuid('confirmado_por').references(() => usuarios.id),
  revertidoPor: uuid('revertido_por').references(() => usuarios.id),
  motivoReversao: text('motivo_reversao'),
  criadoEm: criadoEm(),
  decididoEm: timestamp('decidido_em', { withTimezone: true }),
});

export const cargoCla = pgEnum('cargo_cla', ['dono', 'capitao', 'membro']);
export const corCla = pgEnum('cor_cla', ['ouro', 'roxo', 'verde', 'vermelho', 'prata']);
export const entradaCla = pgEnum('entrada_cla', ['aberto', 'convite']);
export const tipoPedidoCla = pgEnum('tipo_pedido_cla', ['pedido', 'chamado']);

export const clas = pgTable(
  'clas',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    nome: text('nome').notNull(),
    sigla: text('sigla').notNull(),
    cor: corCla('cor').notNull(),
    entrada: entradaCla('entrada').notNull(),
    descricao: text('descricao').notNull().default(''),
    criadoEm: criadoEm(),
    // Desfeito não some: as partidas antigas continuam mostrando nome e sigla.
    desfeitoEm: timestamp('desfeito_em', { withTimezone: true }),
  },
  (tabela) => [
    uniqueIndex('clas_nome_idx').on(sql`lower(${tabela.nome})`).where(sql`${tabela.desfeitoEm} is null`),
    uniqueIndex('clas_sigla_idx').on(sql`lower(${tabela.sigla})`).where(sql`${tabela.desfeitoEm} is null`),
  ],
);

export const claMembros = pgTable('cla_membros', {
  // Ser chave primária garante um clã por pessoa.
  usuarioId: uuid('usuario_id')
    .primaryKey()
    .references(() => usuarios.id),
  claId: uuid('cla_id')
    .notNull()
    .references(() => clas.id),
  cargo: cargoCla('cargo').notNull(),
  entrouEm: timestamp('entrou_em', { withTimezone: true }).notNull().defaultNow(),
});

/** Pedido da pessoa para entrar, ou chamado do clã para a pessoa. Aceitar qualquer um resolve os dois. */
export const claPedidos = pgTable(
  'cla_pedidos',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    claId: uuid('cla_id')
      .notNull()
      .references(() => clas.id),
    usuarioId: uuid('usuario_id')
      .notNull()
      .references(() => usuarios.id),
    tipo: tipoPedidoCla('tipo').notNull(),
    criadoEm: criadoEm(),
  },
  (tabela) => [unique('cla_pedidos_cla_usuario').on(tabela.claId, tabela.usuarioId)],
);

export const estadoSerie = pgEnum('estado_serie', ['em_andamento', 'encerrada', 'cancelada']);

/** Uma MD3: os 3 mapas saídos dos vetos e quantos mapas cada time já ganhou. */
export const series = pgTable('series', {
  id: uuid('id').primaryKey().defaultRandom(),
  mapas: text('mapas').array().notNull(),
  estado: estadoSerie('estado').notNull().default('em_andamento'),
  vitorias1: integer('vitorias1').notNull().default(0),
  vitorias2: integer('vitorias2').notNull().default(0),
  vencedor: integer('vencedor'),
  criadoEm: criadoEm(),
});

export type Usuario = typeof usuarios.$inferSelect;
export type Cla = typeof clas.$inferSelect;
export type ClaMembro = typeof claMembros.$inferSelect;
export type ClaPedido = typeof claPedidos.$inferSelect;
export type Serie = typeof series.$inferSelect;
export type Banimento = typeof banimentos.$inferSelect;
export type Denuncia = typeof denuncias.$inferSelect;
export type Chamado = typeof chamados.$inferSelect;
export type Gravacao = typeof gravacoes.$inferSelect;
export type Desafio = typeof desafios.$inferSelect;
export type Juncao = typeof juncoes.$inferSelect;
export type Noticia = typeof noticias.$inferSelect;
export type NoticiaSteam = typeof noticiasSteam.$inferSelect;
export type Veto = typeof vetos.$inferSelect;
export type Falta = typeof faltas.$inferSelect;
export type Elogio = typeof elogios.$inferSelect;
export type Sala = typeof salas.$inferSelect;
export type Partida = typeof partidas.$inferSelect;
export type Servidor = typeof servidores.$inferSelect;
export type ServidorDiversao = typeof servidoresDiversao.$inferSelect;
export type EstadoDaDiversao = typeof estadosDaDiversao.$inferSelect;
export type Convite = typeof convites.$inferSelect;
export type LancamentoDeGrana = typeof lancamentosDeGrana.$inferSelect;
export type ItemDoJogador = typeof itensDoJogador.$inferSelect;
export type Pedido = typeof pedidos.$inferSelect;
export type Assinatura = typeof assinaturas.$inferSelect;
export type Envio = typeof envios.$inferSelect;
export type Papel = Usuario['papel'];
export type EstadoUsuario = Usuario['estado'];

// Ilha Lemnos, o modo extração (dono, 15/11/2026). O site manda no que existe; o servidor só conta o que aconteceu.
export const tipoItemLemnos = pgEnum('tipo_item_lemnos', ['arma', 'granada', 'mochila', 'saque']);
export const origemItemLemnos = pgEnum('origem_item_lemnos', ['grana', 'magcoin', 'achado']);
export const situacaoItemLemnos = pgEnum('situacao_item_lemnos', ['no_bau', 'em_campo', 'perdido', 'vendido', 'gasto']);
export const fimDaSessaoLemnos = pgEnum('fim_da_sessao_lemnos', ['saiu', 'morreu_saindo', 'kick_afk', 'kick_acampar', 'queda']);
export const tipoEventoLemnos = pgEnum('tipo_evento_lemnos', ['inicio', 'entrada', 'renascer', 'extracao', 'morte', 'saida']);
export const motivoPunicaoLemnos = pgEnum('motivo_punicao_lemnos', ['afk', 'acampar']);

/** As sessões: do momento em que o jogador entra no servidor até sair. Os números alimentam a tela de estatísticas. */
export const lemnosSessoes = pgTable(
  'lemnos_sessoes',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    usuarioId: uuid('usuario_id')
      .notNull()
      .references(() => usuarios.id),
    porta: integer('porta').notNull(),
    iniciadaEm: timestamp('iniciada_em', { withTimezone: true }).notNull().defaultNow(),
    encerradaEm: timestamp('encerrada_em', { withTimezone: true }),
    fim: fimDaSessaoLemnos('fim'),
    // O tamanho da mochila da vida atual, para recusar extração com mais saque do que cabe.
    espacos: integer('espacos').notNull().default(8),
    abates: integer('abates').notNull().default(0),
    mortes: integer('mortes').notNull().default(0),
    extracoes: integer('extracoes').notNull().default(0),
    granaGanha: integer('grana_ganha').notNull().default(0),
    vistaEm: timestamp('vista_em', { withTimezone: true }),
  },
  (tabela) => [index('lemnos_sessoes_conta_fim_idx').on(tabela.usuarioId, tabela.encerradaEm)],
);

/** O baú da extração: uma linha por unidade (cada AK de grana é uma linha), nunca apagada; a situação conta o fim dela. */
export const lemnosItens = pgTable(
  'lemnos_itens',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    usuarioId: uuid('usuario_id')
      .notNull()
      .references(() => usuarios.id),
    tipo: tipoItemLemnos('tipo').notNull(),
    itemId: text('item_id').notNull(),
    origem: origemItemLemnos('origem').notNull(),
    situacao: situacaoItemLemnos('situacao').notNull().default('no_bau'),
    // Vazio: para sempre (Magcoin) ou de uso único (grana, achado).
    expiraEm: timestamp('expira_em', { withTimezone: true }),
    sessaoId: uuid('sessao_id').references(() => lemnosSessoes.id),
    criadoEm: criadoEm(),
    atualizadoEm: timestamp('atualizado_em', { withTimezone: true }).notNull().defaultNow(),
  },
  (tabela) => [index('lemnos_itens_conta_situacao_idx').on(tabela.usuarioId, tabela.situacao)],
);

/** O que o jogador escolheu levar. Guarda o tipo do item; a unidade sai na hora de entrar. */
export const lemnosKits = pgTable('lemnos_kits', {
  usuarioId: uuid('usuario_id')
    .primaryKey()
    .references(() => usuarios.id),
  principal: text('principal'),
  secundaria: text('secundaria'),
  granadas: jsonb('granadas').$type<string[]>().notNull().default([]),
  mochila: text('mochila'),
  atualizadoEm: timestamp('atualizado_em', { withTimezone: true }).notNull().defaultNow(),
});

/** Cada aviso do servidor, uma vez só: a referência é única e a resposta gravada volta igual num reenvio. */
export const lemnosEventos = pgTable(
  'lemnos_eventos',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    sessaoId: uuid('sessao_id').references(() => lemnosSessoes.id),
    tipo: tipoEventoLemnos('tipo').notNull(),
    referencia: text('referencia').notNull().unique(),
    detalhes: jsonb('detalhes'),
    resposta: jsonb('resposta'),
    criadoEm: criadoEm(),
  },
  (tabela) => [index('lemnos_eventos_tipo_data_idx').on(tabela.tipo, tabela.criadoEm)],
);

/** Kicks por AFK ou por acampar e o banimento que vier deles. Vale só para a Ilha Lemnos, nunca para o clube. */
export const lemnosPunicoes = pgTable(
  'lemnos_punicoes',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    usuarioId: uuid('usuario_id')
      .notNull()
      .references(() => usuarios.id),
    motivo: motivoPunicaoLemnos('motivo').notNull(),
    criadoEm: criadoEm(),
    banidoAte: timestamp('banido_ate', { withTimezone: true }),
    banidoParaSempre: boolean('banido_para_sempre').notNull().default(false),
    desfeitaEm: timestamp('desfeita_em', { withTimezone: true }),
    desfeitaPor: uuid('desfeita_por').references(() => usuarios.id),
  },
  (tabela) => [index('lemnos_punicoes_conta_data_idx').on(tabela.usuarioId, tabela.criadoEm)],
);
