CREATE TABLE "denuncias_diversao" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"referencia" text NOT NULL,
	"denunciante_id" uuid NOT NULL,
	"acusado_id" uuid NOT NULL,
	"motivo" text NOT NULL,
	"estado" "estado_denuncia" DEFAULT 'aberta' NOT NULL,
	"analista_id" uuid,
	"conclusao" text,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "denuncias_diversao_unica" UNIQUE("referencia","denunciante_id","acusado_id")
);
--> statement-breakpoint
CREATE TABLE "elogios_diversao" (
	"referencia" text NOT NULL,
	"autor_id" uuid NOT NULL,
	"elogiado_id" uuid NOT NULL,
	"tipo" "tipo_elogio" NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "elogios_diversao_referencia_autor_id_elogiado_id_pk" PRIMARY KEY("referencia","autor_id","elogiado_id")
);
--> statement-breakpoint
CREATE TABLE "partidas_vistas" (
	"usuario_id" uuid NOT NULL,
	"referencia" text NOT NULL,
	"vista_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "partidas_vistas_usuario_id_referencia_pk" PRIMARY KEY("usuario_id","referencia")
);
--> statement-breakpoint
ALTER TABLE "denuncias_diversao" ADD CONSTRAINT "denuncias_diversao_denunciante_id_usuarios_id_fk" FOREIGN KEY ("denunciante_id") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "denuncias_diversao" ADD CONSTRAINT "denuncias_diversao_acusado_id_usuarios_id_fk" FOREIGN KEY ("acusado_id") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "denuncias_diversao" ADD CONSTRAINT "denuncias_diversao_analista_id_usuarios_id_fk" FOREIGN KEY ("analista_id") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "elogios_diversao" ADD CONSTRAINT "elogios_diversao_autor_id_usuarios_id_fk" FOREIGN KEY ("autor_id") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "elogios_diversao" ADD CONSTRAINT "elogios_diversao_elogiado_id_usuarios_id_fk" FOREIGN KEY ("elogiado_id") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "partidas_vistas" ADD CONSTRAINT "partidas_vistas_usuario_id_usuarios_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "elogios_diversao_elogiado_idx" ON "elogios_diversao" USING btree ("elogiado_id");