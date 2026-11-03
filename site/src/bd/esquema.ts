import { integer, jsonb, pgEnum, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

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
  criadoEm: criadoEm(),
});

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

export type Usuario = typeof usuarios.$inferSelect;
export type Convite = typeof convites.$inferSelect;
export type Papel = Usuario['papel'];
export type EstadoUsuario = Usuario['estado'];
