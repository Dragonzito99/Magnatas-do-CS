CREATE TABLE "custos_do_mes" (
	"mes" text PRIMARY KEY NOT NULL,
	"custo_centavos" integer NOT NULL,
	"ator_id" uuid,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "custos_do_mes" ADD CONSTRAINT "custos_do_mes_ator_id_usuarios_id_fk" FOREIGN KEY ("ator_id") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;