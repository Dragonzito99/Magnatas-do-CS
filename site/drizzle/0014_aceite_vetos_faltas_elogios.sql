CREATE TYPE "public"."tipo_elogio" AS ENUM('bom_de_mira', 'gente_boa', 'lider', 'bom_de_equipe');--> statement-breakpoint
ALTER TYPE "public"."estado_partida" ADD VALUE 'aguardando_aceite' BEFORE 'aguardando_servidor';--> statement-breakpoint
ALTER TYPE "public"."estado_partida" ADD VALUE 'vetando' BEFORE 'aguardando_servidor';--> statement-breakpoint
CREATE TABLE "elogios" (
	"partida_id" uuid NOT NULL,
	"autor_id" uuid NOT NULL,
	"elogiado_id" uuid NOT NULL,
	"tipo" "tipo_elogio" NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "elogios_partida_id_autor_id_elogiado_id_pk" PRIMARY KEY("partida_id","autor_id","elogiado_id")
);
--> statement-breakpoint
CREATE TABLE "faltas" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"usuario_id" uuid NOT NULL,
	"partida_id" uuid NOT NULL,
	"bloqueado_ate" timestamp with time zone,
	"anulada_em" timestamp with time zone,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "juncoes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"sala_origem_id" uuid NOT NULL,
	"sala_alvo_id" uuid NOT NULL,
	"estado" "estado_desafio" DEFAULT 'pendente' NOT NULL,
	"expira_em" timestamp with time zone NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "vetos" (
	"partida_id" uuid NOT NULL,
	"ordem" integer NOT NULL,
	"time" integer NOT NULL,
	"mapa" text NOT NULL,
	"automatico" boolean DEFAULT false NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "vetos_partida_id_ordem_pk" PRIMARY KEY("partida_id","ordem"),
	CONSTRAINT "vetos_partida_id_mapa_unique" UNIQUE("partida_id","mapa")
);
--> statement-breakpoint
ALTER TABLE "banimentos" ALTER COLUMN "proposto_por" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "partidas" ALTER COLUMN "mapa" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "partida_jogadores" ADD COLUMN "mvps" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "partida_jogadores" ADD COLUMN "kast" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "partida_jogadores" ADD COLUMN "k1" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "partida_jogadores" ADD COLUMN "k2" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "partida_jogadores" ADD COLUMN "k3" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "partida_jogadores" ADD COLUMN "k4" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "partida_jogadores" ADD COLUMN "k5" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "partida_jogadores" ADD COLUMN "aceitou_em" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "partida_jogadores" ADD COLUMN "entrou_na_fila_em" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "partidas" ADD COLUMN "aceite_ate" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "partidas" ADD COLUMN "primeiro_a_vetar" integer;--> statement-breakpoint
ALTER TABLE "partidas" ADD COLUMN "veto_ate" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "elogios" ADD CONSTRAINT "elogios_partida_id_partidas_id_fk" FOREIGN KEY ("partida_id") REFERENCES "public"."partidas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "elogios" ADD CONSTRAINT "elogios_autor_id_usuarios_id_fk" FOREIGN KEY ("autor_id") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "elogios" ADD CONSTRAINT "elogios_elogiado_id_usuarios_id_fk" FOREIGN KEY ("elogiado_id") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "faltas" ADD CONSTRAINT "faltas_usuario_id_usuarios_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "faltas" ADD CONSTRAINT "faltas_partida_id_partidas_id_fk" FOREIGN KEY ("partida_id") REFERENCES "public"."partidas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vetos" ADD CONSTRAINT "vetos_partida_id_partidas_id_fk" FOREIGN KEY ("partida_id") REFERENCES "public"."partidas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "elogios_elogiado_idx" ON "elogios" USING btree ("elogiado_id");--> statement-breakpoint
CREATE INDEX "faltas_usuario_idx" ON "faltas" USING btree ("usuario_id");