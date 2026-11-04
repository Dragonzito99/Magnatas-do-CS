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

export const tipoPartida = pgEnum('tipo_partida', ['desafio', 'mix']);
export const estadoPartida = pgEnum('estado_partida', [
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
  mapa: text('mapa').notNull(),
  servidorId: uuid('servidor_id').references(() => servidores.id),
  vencedor: integer('vencedor'),
  placar1: integer('placar1').notNull().default(0),
  placar2: integer('placar2').notNull().default(0),
  criadoEm: criadoEm(),
  estadoDesde: timestamp('estado_desde', { withTimezone: true }).notNull().defaultNow(),
  ultimoEventoEm: timestamp('ultimo_evento_em', { withTimezone: true }),
  iniciadaEm: timestamp('iniciada_em', { withTimezone: true }),
  encerradaEm: timestamp('encerrada_em', { withTimezone: true }),
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

export const estadoDesafio = pgEnum('estado_desafio', ['pendente', 'aceito', 'recusado', 'cancelado', 'expirado']);

export const desafios = pgTable('desafios', {
  id: uuid('id').primaryKey().defaultRandom(),
  // Sem chave estrangeira: o desafio encerrado continua no histórico depois que a sala acaba.
  salaOrigemId: uuid('sala_origem_id').notNull(),
  salaAlvoId: uuid('sala_alvo_id').notNull(),
  estado: estadoDesafio('estado').notNull().default('pendente'),
  expiraEm: timestamp('expira_em', { withTimezone: true }).notNull(),
  criadoEm: criadoEm(),
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
  propostoPor: uuid('proposto_por')
    .notNull()
    .references(() => usuarios.id),
  confirmadoPor: uuid('confirmado_por').references(() => usuarios.id),
  revertidoPor: uuid('revertido_por').references(() => usuarios.id),
  motivoReversao: text('motivo_reversao'),
  criadoEm: criadoEm(),
  decididoEm: timestamp('decidido_em', { withTimezone: true }),
});

export type Usuario = typeof usuarios.$inferSelect;
export type Banimento = typeof banimentos.$inferSelect;
export type Denuncia = typeof denuncias.$inferSelect;
export type Chamado = typeof chamados.$inferSelect;
export type Gravacao = typeof gravacoes.$inferSelect;
export type Desafio = typeof desafios.$inferSelect;
export type Sala = typeof salas.$inferSelect;
export type Partida = typeof partidas.$inferSelect;
export type Servidor = typeof servidores.$inferSelect;
export type ServidorDiversao = typeof servidoresDiversao.$inferSelect;
export type Convite = typeof convites.$inferSelect;
export type Papel = Usuario['papel'];
export type EstadoUsuario = Usuario['estado'];
