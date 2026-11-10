CREATE TYPE "public"."estado_da_assinatura" AS ENUM('pendente', 'ativa', 'cancelada');--> statement-breakpoint
CREATE TYPE "public"."estado_do_envio" AS ENUM('pendente', 'enviado');--> statement-breakpoint
CREATE TYPE "public"."estado_do_pedido" AS ENUM('aberto', 'pago', 'estornado');--> statement-breakpoint
CREATE TYPE "public"."moeda" AS ENUM('grana', 'magcoin');--> statement-breakpoint
CREATE TYPE "public"."nivel_de_membro" AS ENUM('bronze', 'prata', 'ouro', 'premium');--> statement-breakpoint
CREATE TYPE "public"."pacote_de_magcoin" AS ENUM('pequeno', 'medio', 'grande');--> statement-breakpoint
ALTER TYPE "public"."tipo_grana" ADD VALUE 'pagamento';--> statement-breakpoint
ALTER TYPE "public"."tipo_grana" ADD VALUE 'mensalidade';--> statement-breakpoint
ALTER TYPE "public"."tipo_grana" ADD VALUE 'estorno';--> statement-breakpoint
CREATE TABLE "assinaturas" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"usuario_id" uuid NOT NULL,
	"nivel" "nivel_de_membro" NOT NULL,
	"email" text NOT NULL,
	"mp_assinatura_id" text,
	"estado" "estado_da_assinatura" DEFAULT 'pendente' NOT NULL,
	"pago_ate" timestamp with time zone,
	"mensalidades_pagas" integer DEFAULT 0 NOT NULL,
	"cancelada_em" timestamp with time zone,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "assinaturas_mp_assinatura_id_unique" UNIQUE("mp_assinatura_id")
);
--> statement-breakpoint
CREATE TABLE "enderecos" (
	"usuario_id" uuid PRIMARY KEY NOT NULL,
	"nome" text NOT NULL,
	"cep" text NOT NULL,
	"rua" text NOT NULL,
	"numero" text NOT NULL,
	"complemento" text,
	"bairro" text NOT NULL,
	"cidade" text NOT NULL,
	"uf" text NOT NULL,
	"telefone" text NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "envios" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"usuario_id" uuid NOT NULL,
	"mensalidade_id" uuid NOT NULL,
	"estado" "estado_do_envio" DEFAULT 'pendente' NOT NULL,
	"rastreio" text,
	"enviado_em" timestamp with time zone,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "envios_mensalidade_id_unique" UNIQUE("mensalidade_id")
);
--> statement-breakpoint
CREATE TABLE "mensalidades" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"assinatura_id" uuid NOT NULL,
	"mp_pagamento_id" text NOT NULL,
	"valor_centavos" integer NOT NULL,
	"pago_em" timestamp with time zone NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "mensalidades_mp_pagamento_id_unique" UNIQUE("mp_pagamento_id")
);
--> statement-breakpoint
CREATE TABLE "pedidos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"usuario_id" uuid NOT NULL,
	"pacote" "pacote_de_magcoin" NOT NULL,
	"valor_centavos" integer NOT NULL,
	"magcoins" integer NOT NULL,
	"estado" "estado_do_pedido" DEFAULT 'aberto' NOT NULL,
	"mp_pagamento_id" text,
	"pago_em" timestamp with time zone,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pedidos_mp_pagamento_id_unique" UNIQUE("mp_pagamento_id")
);
--> statement-breakpoint
ALTER TABLE "lancamentos_de_grana" DROP CONSTRAINT "lancamentos_de_grana_conta_tipo_referencia";--> statement-breakpoint
ALTER TABLE "lancamentos_de_grana" ADD COLUMN "moeda" "moeda" DEFAULT 'grana' NOT NULL;--> statement-breakpoint
ALTER TABLE "usuarios" ADD COLUMN "magcoin" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "assinaturas" ADD CONSTRAINT "assinaturas_usuario_id_usuarios_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "enderecos" ADD CONSTRAINT "enderecos_usuario_id_usuarios_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "envios" ADD CONSTRAINT "envios_usuario_id_usuarios_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "envios" ADD CONSTRAINT "envios_mensalidade_id_mensalidades_id_fk" FOREIGN KEY ("mensalidade_id") REFERENCES "public"."mensalidades"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mensalidades" ADD CONSTRAINT "mensalidades_assinatura_id_assinaturas_id_fk" FOREIGN KEY ("assinatura_id") REFERENCES "public"."assinaturas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pedidos" ADD CONSTRAINT "pedidos_usuario_id_usuarios_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lancamentos_de_grana" ADD CONSTRAINT "lancamentos_conta_moeda_tipo_referencia" UNIQUE("usuario_id","moeda","tipo","referencia");--> statement-breakpoint
ALTER TABLE "usuarios" ADD CONSTRAINT "usuarios_magcoin_nao_negativa" CHECK ("usuarios"."magcoin" >= 0);