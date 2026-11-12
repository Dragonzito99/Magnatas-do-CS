CREATE TABLE "denuncias_de_mensagem" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"mensagem_id" uuid NOT NULL,
	"denunciante_id" uuid NOT NULL,
	"autor_id" uuid NOT NULL,
	"estado" "estado_denuncia" DEFAULT 'aberta' NOT NULL,
	"analista_id" uuid,
	"conclusao" text,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "denuncias_de_mensagem_unica" UNIQUE("mensagem_id","denunciante_id")
);
--> statement-breakpoint
ALTER TABLE "denuncias_de_mensagem" ADD CONSTRAINT "denuncias_de_mensagem_mensagem_id_mensagens_id_fk" FOREIGN KEY ("mensagem_id") REFERENCES "public"."mensagens"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "denuncias_de_mensagem" ADD CONSTRAINT "denuncias_de_mensagem_denunciante_id_usuarios_id_fk" FOREIGN KEY ("denunciante_id") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "denuncias_de_mensagem" ADD CONSTRAINT "denuncias_de_mensagem_autor_id_usuarios_id_fk" FOREIGN KEY ("autor_id") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "denuncias_de_mensagem" ADD CONSTRAINT "denuncias_de_mensagem_analista_id_usuarios_id_fk" FOREIGN KEY ("analista_id") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
-- As denúncias feitas antes desta tabela ficaram só na auditoria: vêm para cá, abertas, se a mensagem ainda existe.
INSERT INTO "denuncias_de_mensagem" ("mensagem_id", "denunciante_id", "autor_id", "criado_em")
SELECT m."id", a."ator_id", m."autor_id", a."criado_em"
FROM "auditoria" a
JOIN "mensagens" m ON m."id"::text = a."detalhes"->>'mensagemId'
WHERE a."acao" = 'mensagem_denunciada' AND a."ator_id" IS NOT NULL AND m."apagada_em" IS NULL
ON CONFLICT DO NOTHING;
