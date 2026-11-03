CREATE TYPE "public"."estado_banimento" AS ENUM('proposto', 'confirmado', 'recusado', 'revertido');--> statement-breakpoint
CREATE TABLE "banimentos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"usuario_id" uuid NOT NULL,
	"cpf_hmac" text,
	"motivo" text NOT NULL,
	"estado" "estado_banimento" DEFAULT 'proposto' NOT NULL,
	"proposto_por" uuid NOT NULL,
	"confirmado_por" uuid,
	"revertido_por" uuid,
	"motivo_reversao" text,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"decidido_em" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "banimentos" ADD CONSTRAINT "banimentos_usuario_id_usuarios_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "banimentos" ADD CONSTRAINT "banimentos_proposto_por_usuarios_id_fk" FOREIGN KEY ("proposto_por") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "banimentos" ADD CONSTRAINT "banimentos_confirmado_por_usuarios_id_fk" FOREIGN KEY ("confirmado_por") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "banimentos" ADD CONSTRAINT "banimentos_revertido_por_usuarios_id_fk" FOREIGN KEY ("revertido_por") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;