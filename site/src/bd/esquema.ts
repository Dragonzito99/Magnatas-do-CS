import { sql } from 'drizzle-orm';
import { bigint, boolean, index, integer, jsonb, pgEnum, pgTable, primaryKey, serial, text, timestamp, unique, uniqueIndex, uuid } from 'drizzle-orm/pg-core';

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
  criadoEm: criadoEm(),
});

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

export const convites = pgTable('convites', {
  id: uuid('id').primaryKey().defaultRandom(),
  codigo: text('codigo').notNull().unique(),
  criadoPor: uuid('criado_por').references(() => usuarios.id),
  usadoPor: uuid('usado_por').references(() => usuarios.id),
  usadoEm: timestamp('usado_em', { withTimezone: true }),
  revogadoEm: timestamp('revogado_em', { withTimezone: true }),
  criadoEm: criadoEm(),
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

export const modoDiversao = pgEnum('modo_diversao', ['cada_um', 'equipe', 'mutacao', 'fantasma']);

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
export type Papel = Usuario['papel'];
export type EstadoUsuario = Usuario['estado'];
