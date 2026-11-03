CREATE TYPE "public"."estado_partida" AS ENUM('aguardando_servidor', 'carregando', 'aguardando_jogadores', 'ao_vivo', 'encerrada', 'cancelada');--> statement-breakpoint
CREATE TYPE "public"."tipo_partida" AS ENUM('desafio', 'mix');--> statement-breakpoint
CREATE TABLE "fila_mix" (
	"usuario_id" uuid PRIMARY KEY NOT NULL,
	"entrou_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "partida_jogadores" (
	"partida_id" uuid NOT NULL,
	"usuario_id" uuid NOT NULL,
	"time" integer NOT NULL,
	"kills" integer DEFAULT 0 NOT NULL,
	"deaths" integer DEFAULT 0 NOT NULL,
	"assists" integer DEFAULT 0 NOT NULL,
	"damage" integer DEFAULT 0 NOT NULL,
	"headshot_kills" integer DEFAULT 0 NOT NULL,
	"rodadas" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "partida_jogadores_partida_id_usuario_id_pk" PRIMARY KEY("partida_id","usuario_id")
);
--> statement-breakpoint
CREATE TABLE "partidas" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"numero" serial NOT NULL,
	"tipo" "tipo_partida" NOT NULL,
	"estado" "estado_partida" DEFAULT 'aguardando_servidor' NOT NULL,
	"mapa" text NOT NULL,
	"servidor_id" uuid,
	"vencedor" integer,
	"placar1" integer DEFAULT 0 NOT NULL,
	"placar2" integer DEFAULT 0 NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"estado_desde" timestamp with time zone DEFAULT now() NOT NULL,
	"iniciada_em" timestamp with time zone,
	"encerrada_em" timestamp with time zone,
	CONSTRAINT "partidas_numero_unique" UNIQUE("numero")
);
--> statement-breakpoint
CREATE TABLE "sala_membros" (
	"usuario_id" uuid PRIMARY KEY NOT NULL,
	"sala_id" uuid NOT NULL,
	"entrou_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "salas" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"nome" text NOT NULL,
	"lider_id" uuid NOT NULL,
	"partida_id" uuid,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "servidores" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"nome" text NOT NULL,
	"host" text NOT NULL,
	"porta" integer DEFAULT 27015 NOT NULL,
	"ativo" boolean DEFAULT true NOT NULL,
	"partida_id" uuid,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "fila_mix" ADD CONSTRAINT "fila_mix_usuario_id_usuarios_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "partida_jogadores" ADD CONSTRAINT "partida_jogadores_partida_id_partidas_id_fk" FOREIGN KEY ("partida_id") REFERENCES "public"."partidas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "partida_jogadores" ADD CONSTRAINT "partida_jogadores_usuario_id_usuarios_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "partidas" ADD CONSTRAINT "partidas_servidor_id_servidores_id_fk" FOREIGN KEY ("servidor_id") REFERENCES "public"."servidores"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sala_membros" ADD CONSTRAINT "sala_membros_usuario_id_usuarios_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sala_membros" ADD CONSTRAINT "sala_membros_sala_id_salas_id_fk" FOREIGN KEY ("sala_id") REFERENCES "public"."salas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "salas" ADD CONSTRAINT "salas_lider_id_usuarios_id_fk" FOREIGN KEY ("lider_id") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "salas" ADD CONSTRAINT "salas_partida_id_partidas_id_fk" FOREIGN KEY ("partida_id") REFERENCES "public"."partidas"("id") ON DELETE no action ON UPDATE no action;