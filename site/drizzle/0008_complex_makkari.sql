CREATE TYPE "public"."modo_diversao" AS ENUM('cada_um', 'equipe', 'mutacao', 'fantasma');--> statement-breakpoint
CREATE TABLE "servidores_diversao" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"modo" "modo_diversao" NOT NULL,
	"armas" text NOT NULL,
	"mapa" text NOT NULL,
	"foto" text NOT NULL,
	"host" text,
	"porta" integer NOT NULL,
	"vagas" integer DEFAULT 16 NOT NULL,
	"ativo" boolean DEFAULT false NOT NULL,
	"ordem" integer NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "servidores_diversao_endereco_idx" ON "servidores_diversao" USING btree (coalesce("host", ''),"porta");