CREATE TYPE "public"."tipo_de_conversa" AS ENUM('direta', 'grupo', 'cla');--> statement-breakpoint
CREATE TABLE "conversa_membros" (
	"conversa_id" uuid NOT NULL,
	"usuario_id" uuid NOT NULL,
	"lida_ate" timestamp with time zone DEFAULT now() NOT NULL,
	"entrou_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "conversa_membros_conversa_id_usuario_id_pk" PRIMARY KEY("conversa_id","usuario_id")
);
--> statement-breakpoint
CREATE TABLE "conversas" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tipo" "tipo_de_conversa" NOT NULL,
	"chave" text,
	"nome" text,
	"cla_id" uuid,
	"criado_por" uuid,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"ultima_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "conversas_chave_unique" UNIQUE("chave"),
	CONSTRAINT "conversas_cla_id_unique" UNIQUE("cla_id")
);
--> statement-breakpoint
CREATE TABLE "mensagens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"conversa_id" uuid NOT NULL,
	"autor_id" uuid NOT NULL,
	"texto" text NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"apagada_em" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "conversa_membros" ADD CONSTRAINT "conversa_membros_conversa_id_conversas_id_fk" FOREIGN KEY ("conversa_id") REFERENCES "public"."conversas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversa_membros" ADD CONSTRAINT "conversa_membros_usuario_id_usuarios_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversas" ADD CONSTRAINT "conversas_cla_id_clas_id_fk" FOREIGN KEY ("cla_id") REFERENCES "public"."clas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversas" ADD CONSTRAINT "conversas_criado_por_usuarios_id_fk" FOREIGN KEY ("criado_por") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mensagens" ADD CONSTRAINT "mensagens_conversa_id_conversas_id_fk" FOREIGN KEY ("conversa_id") REFERENCES "public"."conversas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mensagens" ADD CONSTRAINT "mensagens_autor_id_usuarios_id_fk" FOREIGN KEY ("autor_id") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "conversa_membros_usuario" ON "conversa_membros" USING btree ("usuario_id");--> statement-breakpoint
CREATE INDEX "mensagens_da_conversa" ON "mensagens" USING btree ("conversa_id","criado_em");