CREATE TYPE "public"."origem_xp" AS ENUM('partida', 'diversao');--> statement-breakpoint
CREATE TYPE "public"."resultado_xp" AS ENUM('vitoria', 'empate', 'derrota');--> statement-breakpoint
CREATE TABLE "xp_partidas" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"usuario_id" uuid NOT NULL,
	"origem" "origem_xp" NOT NULL,
	"referencia" text NOT NULL,
	"abates" integer NOT NULL,
	"resultado" "resultado_xp" NOT NULL,
	"xp" integer NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "xp_partidas_conta_referencia" UNIQUE("usuario_id","referencia")
);
--> statement-breakpoint
ALTER TABLE "usuarios" ADD COLUMN "xp_total" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "usuarios" ADD COLUMN "patente_vista" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "xp_partidas" ADD CONSTRAINT "xp_partidas_usuario_id_usuarios_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "xp_partidas_conta_data_idx" ON "xp_partidas" USING btree ("usuario_id","criado_em");