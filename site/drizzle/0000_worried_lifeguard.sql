CREATE TYPE "public"."estado_usuario" AS ENUM('aguardando_verificacao', 'ativo', 'suspenso', 'banido');--> statement-breakpoint
CREATE TYPE "public"."estado_verificacao" AS ENUM('pendente', 'aprovada', 'reprovada', 'banido');--> statement-breakpoint
CREATE TYPE "public"."papel" AS ENUM('jogador', 'gm', 'adm');--> statement-breakpoint
CREATE TABLE "auditoria" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ator_id" uuid,
	"acao" text NOT NULL,
	"alvo_id" uuid,
	"detalhes" jsonb,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "convites" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"codigo" text NOT NULL,
	"criado_por" uuid,
	"usado_por" uuid,
	"usado_em" timestamp with time zone,
	"revogado_em" timestamp with time zone,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "convites_codigo_unique" UNIQUE("codigo")
);
--> statement-breakpoint
CREATE TABLE "cpfs_banidos" (
	"cpf_hmac" text PRIMARY KEY NOT NULL,
	"banido_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sessoes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"token_hash" text NOT NULL,
	"usuario_id" uuid NOT NULL,
	"expira_em" timestamp with time zone NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sessoes_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "usuarios" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"steamid64" text NOT NULL,
	"apelido" text NOT NULL,
	"avatar_url" text,
	"papel" "papel" DEFAULT 'jogador' NOT NULL,
	"estado" "estado_usuario" DEFAULT 'aguardando_verificacao' NOT NULL,
	"cpf_hmac" text,
	"convites_restantes" integer DEFAULT 0 NOT NULL,
	"convidado_por" uuid,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "usuarios_steamid64_unique" UNIQUE("steamid64"),
	CONSTRAINT "usuarios_cpf_hmac_unique" UNIQUE("cpf_hmac")
);
--> statement-breakpoint
CREATE TABLE "verificacoes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"usuario_id" uuid NOT NULL,
	"provedor" text NOT NULL,
	"referencia" text NOT NULL,
	"estado" "estado_verificacao" DEFAULT 'pendente' NOT NULL,
	"motivo" text,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"concluido_em" timestamp with time zone,
	CONSTRAINT "verificacoes_referencia_unique" UNIQUE("referencia")
);
--> statement-breakpoint
ALTER TABLE "auditoria" ADD CONSTRAINT "auditoria_ator_id_usuarios_id_fk" FOREIGN KEY ("ator_id") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auditoria" ADD CONSTRAINT "auditoria_alvo_id_usuarios_id_fk" FOREIGN KEY ("alvo_id") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "convites" ADD CONSTRAINT "convites_criado_por_usuarios_id_fk" FOREIGN KEY ("criado_por") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "convites" ADD CONSTRAINT "convites_usado_por_usuarios_id_fk" FOREIGN KEY ("usado_por") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessoes" ADD CONSTRAINT "sessoes_usuario_id_usuarios_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "verificacoes" ADD CONSTRAINT "verificacoes_usuario_id_usuarios_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;