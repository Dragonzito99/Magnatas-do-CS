ALTER TYPE "public"."tipo_grana" ADD VALUE 'insignia';--> statement-breakpoint
CREATE TABLE "insignias_do_jogador" (
	"usuario_id" uuid NOT NULL,
	"familia" text NOT NULL,
	"nivel" integer NOT NULL,
	"conquistada_em" timestamp with time zone DEFAULT now() NOT NULL,
	"vista_em" timestamp with time zone,
	"grana" integer NOT NULL,
	"xp" integer NOT NULL,
	"mutante_id" text,
	"mutante_dias" integer,
	CONSTRAINT "insignias_do_jogador_usuario_id_familia_nivel_pk" PRIMARY KEY("usuario_id","familia","nivel")
);
--> statement-breakpoint
ALTER TABLE "usuarios" ADD COLUMN "insignia_principal" text;--> statement-breakpoint
ALTER TABLE "insignias_do_jogador" ADD CONSTRAINT "insignias_do_jogador_usuario_id_usuarios_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;