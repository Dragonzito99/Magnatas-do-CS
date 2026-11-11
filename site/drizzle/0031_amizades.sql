CREATE TYPE "public"."estado_da_amizade" AS ENUM('pendente', 'aceita');--> statement-breakpoint
CREATE TABLE "amizades" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"de_id" uuid NOT NULL,
	"para_id" uuid NOT NULL,
	"estado" "estado_da_amizade" DEFAULT 'pendente' NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"aceita_em" timestamp with time zone,
	CONSTRAINT "amizades_nao_consigo" CHECK ("amizades"."de_id" <> "amizades"."para_id")
);
--> statement-breakpoint
CREATE TABLE "convites_de_sala" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"sala_id" uuid NOT NULL,
	"de_id" uuid NOT NULL,
	"para_id" uuid NOT NULL,
	"expira_em" timestamp with time zone NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "convites_de_sala_um_por_pessoa" UNIQUE("sala_id","para_id")
);
--> statement-breakpoint
ALTER TABLE "amizades" ADD CONSTRAINT "amizades_de_id_usuarios_id_fk" FOREIGN KEY ("de_id") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "amizades" ADD CONSTRAINT "amizades_para_id_usuarios_id_fk" FOREIGN KEY ("para_id") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "convites_de_sala" ADD CONSTRAINT "convites_de_sala_sala_id_salas_id_fk" FOREIGN KEY ("sala_id") REFERENCES "public"."salas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "convites_de_sala" ADD CONSTRAINT "convites_de_sala_de_id_usuarios_id_fk" FOREIGN KEY ("de_id") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "convites_de_sala" ADD CONSTRAINT "convites_de_sala_para_id_usuarios_id_fk" FOREIGN KEY ("para_id") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "amizades_um_par" ON "amizades" USING btree (least("de_id", "para_id"),greatest("de_id", "para_id"));--> statement-breakpoint
CREATE INDEX "amizades_para" ON "amizades" USING btree ("para_id");--> statement-breakpoint
CREATE INDEX "convites_de_sala_para" ON "convites_de_sala" USING btree ("para_id");