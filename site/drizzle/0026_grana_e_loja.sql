CREATE TYPE "public"."tipo_grana" AS ENUM('partida', 'abertura', 'compra', 'ajuste');--> statement-breakpoint
CREATE TABLE "itens_do_jogador" (
	"usuario_id" uuid NOT NULL,
	"item_id" text NOT NULL,
	"expira_em" timestamp with time zone,
	"usando" boolean DEFAULT false NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "itens_do_jogador_usuario_id_item_id_pk" PRIMARY KEY("usuario_id","item_id")
);
--> statement-breakpoint
CREATE TABLE "lancamentos_de_grana" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"usuario_id" uuid NOT NULL,
	"tipo" "tipo_grana" NOT NULL,
	"quantidade" integer NOT NULL,
	"referencia" text NOT NULL,
	"detalhes" jsonb,
	"ator_id" uuid,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "lancamentos_de_grana_conta_tipo_referencia" UNIQUE("usuario_id","tipo","referencia"),
	CONSTRAINT "lancamentos_de_grana_quantidade_nao_zero" CHECK ("lancamentos_de_grana"."quantidade" <> 0)
);
--> statement-breakpoint
ALTER TABLE "usuarios" ADD COLUMN "grana" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "itens_do_jogador" ADD CONSTRAINT "itens_do_jogador_usuario_id_usuarios_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lancamentos_de_grana" ADD CONSTRAINT "lancamentos_de_grana_usuario_id_usuarios_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lancamentos_de_grana" ADD CONSTRAINT "lancamentos_de_grana_ator_id_usuarios_id_fk" FOREIGN KEY ("ator_id") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "lancamentos_de_grana_conta_data_idx" ON "lancamentos_de_grana" USING btree ("usuario_id","criado_em");--> statement-breakpoint
ALTER TABLE "usuarios" ADD CONSTRAINT "usuarios_grana_nao_negativa" CHECK ("usuarios"."grana" >= 0);