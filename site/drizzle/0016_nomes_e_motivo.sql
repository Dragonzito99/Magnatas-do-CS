CREATE TYPE "public"."motivo_do_cancelamento" AS ENUM('aceite', 'equipe', 'abandono');--> statement-breakpoint
ALTER TABLE "partidas" ADD COLUMN "nome_time1" text;--> statement-breakpoint
ALTER TABLE "partidas" ADD COLUMN "nome_time2" text;--> statement-breakpoint
ALTER TABLE "partidas" ADD COLUMN "motivo_do_cancelamento" "motivo_do_cancelamento";