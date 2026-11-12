CREATE TABLE "manutencao_dos_servidores" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"ligada" boolean DEFAULT false NOT NULL,
	"automatica" boolean DEFAULT false NOT NULL,
	"motivo" text,
	"desde" timestamp with time zone DEFAULT now() NOT NULL,
	"ator_id" uuid
);
--> statement-breakpoint
ALTER TABLE "manutencao_dos_servidores" ADD CONSTRAINT "manutencao_dos_servidores_ator_id_usuarios_id_fk" FOREIGN KEY ("ator_id") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;