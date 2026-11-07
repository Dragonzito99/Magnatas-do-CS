CREATE TYPE "public"."estado_da_diversao" AS ENUM('desligado', 'ligando', 'ligado');--> statement-breakpoint
CREATE TABLE "estados_da_diversao" (
	"servidor_id" uuid PRIMARY KEY NOT NULL,
	"estado" "estado_da_diversao" DEFAULT 'desligado' NOT NULL,
	"desde" timestamp with time zone DEFAULT now() NOT NULL,
	"vazio_desde" timestamp with time zone,
	"pedido_por" uuid,
	"erro" text
);
--> statement-breakpoint
ALTER TABLE "servidores_diversao" ADD COLUMN "nome_no_servidor" text;--> statement-breakpoint
ALTER TABLE "servidores_diversao" ADD COLUMN "sob_demanda" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "estados_da_diversao" ADD CONSTRAINT "estados_da_diversao_servidor_id_servidores_diversao_id_fk" FOREIGN KEY ("servidor_id") REFERENCES "public"."servidores_diversao"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "estados_da_diversao" ADD CONSTRAINT "estados_da_diversao_pedido_por_usuarios_id_fk" FOREIGN KEY ("pedido_por") REFERENCES "public"."usuarios"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
UPDATE "servidores_diversao" SET "nome_no_servidor" = 'ak-desert' WHERE "porta" = 27016;
--> statement-breakpoint
UPDATE "servidores_diversao" SET "nome_no_servidor" = 'pistola' WHERE "porta" = 27017;
--> statement-breakpoint
UPDATE "servidores_diversao" SET "nome_no_servidor" = 'awp' WHERE "porta" = 27018;
--> statement-breakpoint
UPDATE "servidores_diversao" SET "nome_no_servidor" = 'equipe' WHERE "porta" = 27019;
--> statement-breakpoint
UPDATE "servidores_diversao" SET "nome_no_servidor" = 'mutacao' WHERE "porta" = 27020;
--> statement-breakpoint
UPDATE "servidores_diversao" SET "nome_no_servidor" = 'fantasma' WHERE "porta" = 27021;