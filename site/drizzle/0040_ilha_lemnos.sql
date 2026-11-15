-- Ilha Lemnos, o modo extração (dono, 15/11/2026). A linha do servidor em servidores_diversao não entra aqui: o
-- Postgres não deixa usar o valor novo do enum modo_diversao na mesma transação. Ela é criada por
-- scripts/servidor-lemnos.ts (garantirServidorDaLemnos), na publicação.
CREATE TYPE "public"."fim_da_sessao_lemnos" AS ENUM('saiu', 'morreu_saindo', 'kick_afk', 'kick_acampar', 'queda');--> statement-breakpoint
CREATE TYPE "public"."motivo_punicao_lemnos" AS ENUM('afk', 'acampar');--> statement-breakpoint
CREATE TYPE "public"."origem_item_lemnos" AS ENUM('grana', 'magcoin', 'achado');--> statement-breakpoint
CREATE TYPE "public"."situacao_item_lemnos" AS ENUM('no_bau', 'em_campo', 'perdido', 'vendido', 'gasto');--> statement-breakpoint
CREATE TYPE "public"."tipo_evento_lemnos" AS ENUM('inicio', 'entrada', 'renascer', 'extracao', 'morte', 'saida');--> statement-breakpoint
CREATE TYPE "public"."tipo_item_lemnos" AS ENUM('arma', 'granada', 'mochila', 'saque');--> statement-breakpoint
ALTER TYPE "public"."modo_diversao" ADD VALUE 'lemnos';--> statement-breakpoint
ALTER TYPE "public"."tipo_grana" ADD VALUE 'venda';--> statement-breakpoint
ALTER TYPE "public"."tipo_grana" ADD VALUE 'lemnos';--> statement-breakpoint
CREATE TABLE "lemnos_eventos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"sessao_id" uuid,
	"tipo" "tipo_evento_lemnos" NOT NULL,
	"referencia" text NOT NULL,
	"detalhes" jsonb,
	"resposta" jsonb,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "lemnos_eventos_referencia_unique" UNIQUE("referencia")
);
--> statement-breakpoint
CREATE TABLE "lemnos_itens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"usuario_id" uuid NOT NULL,
	"tipo" "tipo_item_lemnos" NOT NULL,
	"item_id" text NOT NULL,
	"origem" "origem_item_lemnos" NOT NULL,
	"situacao" "situacao_item_lemnos" DEFAULT 'no_bau' NOT NULL,
	"expira_em" timestamp with time zone,
	"sessao_id" uuid,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lemnos_kits" (
	"usuario_id" uuid PRIMARY KEY NOT NULL,
	"principal" text,
	"secundaria" text,
	"granadas" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"mochila" text,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lemnos_punicoes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"usuario_id" uuid NOT NULL,
	"motivo" "motivo_punicao_lemnos" NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"banido_ate" timestamp with time zone,
	"banido_para_sempre" boolean DEFAULT false NOT NULL,
	"desfeita_em" timestamp with time zone,
	"desfeita_por" uuid
);
--> statement-breakpoint
CREATE TABLE "lemnos_sessoes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"usuario_id" uuid NOT NULL,
	"porta" integer NOT NULL,
	"iniciada_em" timestamp with time zone DEFAULT now() NOT NULL,
	"encerrada_em" timestamp with time zone,
	"fim" "fim_da_sessao_lemnos",
	"espacos" integer DEFAULT 8 NOT NULL,
	"abates" integer DEFAULT 0 NOT NULL,
	"mortes" integer DEFAULT 0 NOT NULL,
	"extracoes" integer DEFAULT 0 NOT NULL,
	"grana_ganha" integer DEFAULT 0 NOT NULL,
	"vista_em" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "lemnos_eventos" ADD CONSTRAINT "lemnos_eventos_sessao_id_lemnos_sessoes_id_fk" FOREIGN KEY ("sessao_id") REFERENCES "public"."lemnos_sessoes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lemnos_itens" ADD CONSTRAINT "lemnos_itens_usuario_id_usuarios_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lemnos_itens" ADD CONSTRAINT "lemnos_itens_sessao_id_lemnos_sessoes_id_fk" FOREIGN KEY ("sessao_id") REFERENCES "public"."lemnos_sessoes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lemnos_kits" ADD CONSTRAINT "lemnos_kits_usuario_id_usuarios_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lemnos_punicoes" ADD CONSTRAINT "lemnos_punicoes_usuario_id_usuarios_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lemnos_punicoes" ADD CONSTRAINT "lemnos_punicoes_desfeita_por_usuarios_id_fk" FOREIGN KEY ("desfeita_por") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lemnos_sessoes" ADD CONSTRAINT "lemnos_sessoes_usuario_id_usuarios_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "lemnos_eventos_tipo_data_idx" ON "lemnos_eventos" USING btree ("tipo","criado_em");--> statement-breakpoint
CREATE INDEX "lemnos_itens_conta_situacao_idx" ON "lemnos_itens" USING btree ("usuario_id","situacao");--> statement-breakpoint
CREATE INDEX "lemnos_punicoes_conta_data_idx" ON "lemnos_punicoes" USING btree ("usuario_id","criado_em");--> statement-breakpoint
CREATE INDEX "lemnos_sessoes_conta_fim_idx" ON "lemnos_sessoes" USING btree ("usuario_id","encerrada_em");