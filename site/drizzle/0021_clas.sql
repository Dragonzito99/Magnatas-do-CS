CREATE TYPE "public"."acao_veto" AS ENUM('veta', 'escolhe');--> statement-breakpoint
CREATE TYPE "public"."cargo_cla" AS ENUM('dono', 'capitao', 'membro');--> statement-breakpoint
CREATE TYPE "public"."cor_cla" AS ENUM('ouro', 'roxo', 'verde', 'vermelho', 'prata');--> statement-breakpoint
CREATE TYPE "public"."entrada_cla" AS ENUM('aberto', 'convite');--> statement-breakpoint
CREATE TYPE "public"."estado_serie" AS ENUM('em_andamento', 'encerrada', 'cancelada');--> statement-breakpoint
CREATE TYPE "public"."formato_desafio" AS ENUM('comum', 'cla', 'treino');--> statement-breakpoint
CREATE TYPE "public"."tipo_pedido_cla" AS ENUM('pedido', 'chamado');--> statement-breakpoint
ALTER TYPE "public"."tipo_partida" ADD VALUE 'cla';--> statement-breakpoint
ALTER TYPE "public"."tipo_partida" ADD VALUE 'treino';--> statement-breakpoint
CREATE TABLE "cla_membros" (
	"usuario_id" uuid PRIMARY KEY NOT NULL,
	"cla_id" uuid NOT NULL,
	"cargo" "cargo_cla" NOT NULL,
	"entrou_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cla_pedidos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"cla_id" uuid NOT NULL,
	"usuario_id" uuid NOT NULL,
	"tipo" "tipo_pedido_cla" NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "cla_pedidos_cla_usuario" UNIQUE("cla_id","usuario_id")
);
--> statement-breakpoint
CREATE TABLE "clas" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"nome" text NOT NULL,
	"sigla" text NOT NULL,
	"cor" "cor_cla" NOT NULL,
	"entrada" "entrada_cla" NOT NULL,
	"descricao" text DEFAULT '' NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"desfeito_em" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "series" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"mapas" text[] NOT NULL,
	"estado" "estado_serie" DEFAULT 'em_andamento' NOT NULL,
	"vitorias1" integer DEFAULT 0 NOT NULL,
	"vitorias2" integer DEFAULT 0 NOT NULL,
	"vencedor" integer,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "desafios" ADD COLUMN "formato" "formato_desafio" DEFAULT 'comum' NOT NULL;--> statement-breakpoint
ALTER TABLE "desafios" ADD COLUMN "mapas" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "partidas" ADD COLUMN "cla_time1_id" uuid;--> statement-breakpoint
ALTER TABLE "partidas" ADD COLUMN "cla_time2_id" uuid;--> statement-breakpoint
ALTER TABLE "partidas" ADD COLUMN "serie_id" uuid;--> statement-breakpoint
ALTER TABLE "partidas" ADD COLUMN "mapa_da_serie" integer;--> statement-breakpoint
ALTER TABLE "partidas" ADD COLUMN "mapas_da_partida" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "partidas" ADD COLUMN "servidor_preferido_id" uuid;--> statement-breakpoint
ALTER TABLE "usuarios" ADD COLUMN "saiu_de_cla_em" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "vetos" ADD COLUMN "acao" "acao_veto" DEFAULT 'veta' NOT NULL;--> statement-breakpoint
ALTER TABLE "cla_membros" ADD CONSTRAINT "cla_membros_usuario_id_usuarios_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cla_membros" ADD CONSTRAINT "cla_membros_cla_id_clas_id_fk" FOREIGN KEY ("cla_id") REFERENCES "public"."clas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cla_pedidos" ADD CONSTRAINT "cla_pedidos_cla_id_clas_id_fk" FOREIGN KEY ("cla_id") REFERENCES "public"."clas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cla_pedidos" ADD CONSTRAINT "cla_pedidos_usuario_id_usuarios_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "clas_nome_idx" ON "clas" USING btree (lower("nome")) WHERE "clas"."desfeito_em" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "clas_sigla_idx" ON "clas" USING btree (lower("sigla")) WHERE "clas"."desfeito_em" is null;