CREATE TABLE "quedas_do_jogo" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"quando" timestamp with time zone NOT NULL,
	"motivo" text NOT NULL,
	"onde" text NOT NULL,
	"observacao" text,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
-- As quedas do CS2 do dono no teste da Mutação. Os arquivos de diagnóstico (5 a 10 GB cada) foram apagados do PC.
INSERT INTO "quedas_do_jogo" ("quando", "motivo", "onde", "observacao") VALUES
  ('2026-11-07T06:16:01-03:00', 'O CS2 fechou sozinho (OnPreserveEntity: missing client entity)', 'Teste na Dust 2', 'Arquivo de 7,7 GB apagado.'),
  ('2026-11-08T17:29:46-03:00', 'O CS2 fechou sozinho (OnPreserveEntity: missing client entity)', 'Mutação com bots, na Dust 2', 'Antes da correção das 19:11. Arquivo de 5,3 GB apagado.'),
  ('2026-11-08T17:35:12-03:00', 'O CS2 fechou sozinho (OnPreserveEntity: missing client entity 225)', 'Mutação com bots, na Dust 2', 'Antes da correção das 19:11. Arquivo de 9,7 GB apagado.'),
  ('2026-11-08T17:50:05-03:00', 'O CS2 fechou sozinho (OnPreserveEntity: missing client entity)', 'Mutação com bots, na Dust 2', 'Antes da correção das 19:11. Arquivo de 9,3 GB apagado.'),
  ('2026-11-08T19:06:02-03:00', 'O CS2 fechou sozinho (OnPreserveEntity: missing client entity)', 'Mutação, teste com 2 jogadores', 'Antes da correção das 19:11 (mutante sem trocar de boneco). Arquivo de 9,9 GB apagado.');
