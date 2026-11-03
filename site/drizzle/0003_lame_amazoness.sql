CREATE TABLE "gravacoes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"partida_id" uuid NOT NULL,
	"arquivo" text NOT NULL,
	"bytes" bigint NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"apagada_em" timestamp with time zone,
	CONSTRAINT "gravacoes_partida_id_unique" UNIQUE("partida_id")
);
--> statement-breakpoint
ALTER TABLE "gravacoes" ADD CONSTRAINT "gravacoes_partida_id_partidas_id_fk" FOREIGN KEY ("partida_id") REFERENCES "public"."partidas"("id") ON DELETE no action ON UPDATE no action;