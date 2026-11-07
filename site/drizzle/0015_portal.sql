CREATE TABLE "cache_externo" (
	"chave" text PRIMARY KEY NOT NULL,
	"dados" jsonb NOT NULL,
	"atualizado_em" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "noticias" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"titulo" text NOT NULL,
	"texto" text NOT NULL,
	"imagem" text,
	"fixada" boolean DEFAULT false NOT NULL,
	"autor_id" uuid,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizada_em" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "noticias_steam" (
	"gid" text PRIMARY KEY NOT NULL,
	"titulo_original" text NOT NULL,
	"url" text NOT NULL,
	"publicada_em" timestamp with time zone NOT NULL,
	"conteudo" text NOT NULL,
	"titulo_pt" text,
	"resumo_pt" text,
	"traduzida_em" timestamp with time zone,
	"tentativas" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
ALTER TABLE "noticias" ADD CONSTRAINT "noticias_autor_id_usuarios_id_fk" FOREIGN KEY ("autor_id") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "noticias_criado_em_idx" ON "noticias" USING btree ("criado_em");