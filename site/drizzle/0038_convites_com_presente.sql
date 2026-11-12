ALTER TYPE "public"."tipo_grana" ADD VALUE 'presente';--> statement-breakpoint
ALTER TABLE "presentes" DROP CONSTRAINT "presentes_usuario_id_unique";--> statement-breakpoint
ALTER TABLE "convites" ADD COLUMN "presente" jsonb;--> statement-breakpoint
ALTER TABLE "convites" ADD COLUMN "vence_em" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "presentes" ADD COLUMN "origem" text DEFAULT 'premium' NOT NULL;--> statement-breakpoint
ALTER TABLE "presentes" ADD COLUMN "conteudo" jsonb;--> statement-breakpoint
ALTER TABLE "presentes" ADD COLUMN "recado" text;--> statement-breakpoint
ALTER TABLE "presentes" ADD CONSTRAINT "presentes_conta_origem" UNIQUE("usuario_id","origem");