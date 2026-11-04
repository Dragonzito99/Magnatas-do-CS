CREATE INDEX "partida_jogadores_usuario_idx" ON "partida_jogadores" USING btree ("usuario_id");--> statement-breakpoint
CREATE INDEX "partidas_estado_idx" ON "partidas" USING btree ("estado");