CREATE TYPE "public"."estado_chamado" AS ENUM('aberto', 'atendido', 'virou_denuncia');--> statement-breakpoint
CREATE TYPE "public"."estado_denuncia" AS ENUM('aberta', 'em_analise', 'encerrada');--> statement-breakpoint
CREATE TABLE "chamados" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"partida_id" uuid NOT NULL,
	"chamado_por" uuid NOT NULL,
	"estado" "estado_chamado" DEFAULT 'aberto' NOT NULL,
	"atendido_por" uuid,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "denuncias" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"partida_id" uuid NOT NULL,
	"denunciante_id" uuid NOT NULL,
	"acusado_id" uuid,
	"motivo" text NOT NULL,
	"estado" "estado_denuncia" DEFAULT 'aberta' NOT NULL,
	"analista_id" uuid,
	"conclusao" text,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "denuncias_partida_id_denunciante_id_acusado_id_unique" UNIQUE("partida_id","denunciante_id","acusado_id")
);
--> statement-breakpoint
ALTER TABLE "usuarios" ADD COLUMN "visto_em" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "chamados" ADD CONSTRAINT "chamados_partida_id_partidas_id_fk" FOREIGN KEY ("partida_id") REFERENCES "public"."partidas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chamados" ADD CONSTRAINT "chamados_chamado_por_usuarios_id_fk" FOREIGN KEY ("chamado_por") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chamados" ADD CONSTRAINT "chamados_atendido_por_usuarios_id_fk" FOREIGN KEY ("atendido_por") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "denuncias" ADD CONSTRAINT "denuncias_partida_id_partidas_id_fk" FOREIGN KEY ("partida_id") REFERENCES "public"."partidas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "denuncias" ADD CONSTRAINT "denuncias_denunciante_id_usuarios_id_fk" FOREIGN KEY ("denunciante_id") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "denuncias" ADD CONSTRAINT "denuncias_acusado_id_usuarios_id_fk" FOREIGN KEY ("acusado_id") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "denuncias" ADD CONSTRAINT "denuncias_analista_id_usuarios_id_fk" FOREIGN KEY ("analista_id") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;