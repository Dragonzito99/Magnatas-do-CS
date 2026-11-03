CREATE TYPE "public"."estado_desafio" AS ENUM('pendente', 'aceito', 'recusado', 'cancelado', 'expirado');--> statement-breakpoint
CREATE TABLE "desafios" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"sala_origem_id" uuid NOT NULL,
	"sala_alvo_id" uuid NOT NULL,
	"estado" "estado_desafio" DEFAULT 'pendente' NOT NULL,
	"expira_em" timestamp with time zone NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
