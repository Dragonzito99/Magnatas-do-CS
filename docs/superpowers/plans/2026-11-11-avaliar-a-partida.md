# Avaliar a partida: plano de construção

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** cartão "Seu resultado" nas partidas, página da partida da Diversão com elogiar/denunciar, ida automática à
página ao terminar/sair e aviso no sino.

**Architecture:** As regras ficam em `site/src/dominio/avaliar.ts` (resultado de uma conta numa partida, a partida da
Diversão, a sessão da Diversão, elogio/denúncia da Diversão, o que falta avaliar e para onde ir). Elogio e denúncia da
Diversão ganham tabelas próprias, apontando para a referência `diversao:<porta>:<partida>` de `xp_partidas`. A ida
automática é um componente do layout que pergunta a uma rota `/api/avaliar/destino` a cada 15 s enquanto houver o que
avaliar.

**Tech Stack:** Next.js 16, Drizzle + Postgres (PGlite nos testes), Vitest.

**Spec:** `docs/superpowers/specs/2026-11-11-avaliar-a-partida-design.md` (e o rascunho
`site/public/rascunho/partida-avaliar-ideia.html`, aprovado pelo dono).

## Global Constraints

- Português em nomes, textos e comentários. Nunca rodar prettier.
- Checagens: `npx tsc --noEmit -p .`, `npx eslint src scripts`, `npx vitest run` (3 falhas conhecidas do tier-s).
- Ambiente: `export PATH="/g/Magnatas-ferramentas/node:$PATH" TEMP=G:/Magnatas-ferramentas/tmp`, dentro de `site/`.
- Elogio/denúncia só entre membros que jogaram a mesma partida, uma vez por pessoa por partida, partida já terminada.
- A ida automática não acontece em `/apoio`, `/compras`, `/loja` com janela aberta (`?item=`), nem na própria página
  de destino, e uma vez só por destino (guardado na aba).
- Sessão da Diversão: as partidas da Diversão da conta em sequência, com no máximo 30 min entre uma e outra, das
  últimas 12 h, até 10.
- Commit termina com `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Publicar só com OK do dono.

## Review Focus

- Pessoa que ainda está no servidor da Diversão não é puxada para fora do jogo/tela.
- Servidor da Diversão fora do ar (sem resposta): a rota não quebra e não manda ninguém para lugar nenhum.
- Partida da Diversão com referência estranha na URL: 404, sem erro.
- Quem não jogou a partida abrindo a página: vê a partida, mas não vê o cartão nem os botões.
- Denúncia da Diversão chega à equipe e some do contador quando encerrada.

---

### Task 1: Banco

**Files:** Modify `site/src/bd/esquema.ts`; gerar `site/drizzle/0034_avaliar_a_partida.sql`; Test `site/src/bd/esquema.test.ts`

**Interfaces — Produces:**
- `elogiosDiversao` (`elogios_diversao`): `referencia` text, `autorId`, `elogiadoId` uuid → usuarios, `tipo` tipoElogio,
  `criadoEm`; PK (`referencia`, `autorId`, `elogiadoId`); índice em `elogiadoId`.
- `denunciasDiversao` (`denuncias_diversao`): `id` uuid, `referencia` text, `denuncianteId`, `acusadoId` uuid →
  usuarios, `motivo` text, `estado` estadoDenuncia default 'aberta', `analistaId` null, `conclusao` null, `criadoEm`;
  unique (`referencia`, `denuncianteId`, `acusadoId`).
- `partidasVistas` (`partidas_vistas`): `usuarioId`, `referencia` text (id da partida do mix ou referência da
  Diversão), `vistaEm`; PK (`usuarioId`, `referencia`).

- [ ] Teste que falha: inserir o mesmo elogio da Diversão duas vezes falha; a mesma denúncia também.
- [ ] Implementar, `npm run db:gerar`, renomear para `0034_avaliar_a_partida.sql` (e o journal).
- [ ] `npx vitest run src/bd` → PASS. Commit `feat: banco de avaliar a partida`.

### Task 2: Resultado de uma conta numa partida

**Files:** Create `site/src/dominio/avaliar.ts`, `site/src/dominio/avaliar.test.ts`

**Produces:** `type ResultadoDaConta = { resultado: 'vitoria' | 'empate' | 'derrota'; xp: number; grana: number; abates: number; mortes: number | null; kd: number | null; insignias: { familia: Familia; nivel: number }[] }`;
`async function resultadoDaConta(bd: Bd, usuarioId: string, referencia: string): Promise<ResultadoDaConta | null>`
(null se a conta não tem linha em `xp_partidas` com essa referência). Grana = lançamento `tipo: 'partida'` com a mesma
referência. Mortes: `xp_partidas.mortes`, ou `partida_jogadores.deaths` no mix. Insígnias: as conquistadas pela conta
entre o `criadoEm` da linha de XP e 1 minuto depois.

- [ ] Teste: partida do mix (12 abates, 3 mortes, vitória, XP da fórmula, Grana = XP/10) → kd 4; conta que não jogou → null.
- [ ] Implementar; teste PASS; commit.

### Task 3: A partida e a sessão da Diversão

**Files:** `avaliar.ts`, `avaliar.test.ts`

**Produces:**
- `function referenciaDaDiversao(slug: string): string | null` (`"27020-abc"` → `"diversao:27020:abc"`; formato
  inválido → null) e `function slugDaDiversao(referencia: string): string`.
- `async function partidaDaDiversao(bd: Bd, referencia: string): Promise<{ referencia: string; modo: string; mapa: string | null; foto: string | null; data: Date; jogadores: { id: string; apelido: string; avatarUrl: string | null; abates: number; mortes: number | null; resultado: 'vitoria' | 'empate' | 'derrota'; xp: number }[] } | null>`
  (modo pela porta, como `ficha.ts`; null se não houver linha).
- `async function sessaoDaDiversao(bd: Bd, usuarioId: string, agora: Date): Promise<{ referencia: string; modo: string; mapa: string | null; data: Date; resultado: ...; xp: number; grana: number; abates: number; mortes: number | null }[]>`
  (regra da sessão nas Global Constraints, da mais antiga para a mais nova).

- [ ] Testes: slug ida e volta e inválido; partida com 2 membros; sessão separa por intervalo de 30 min e corta em 10.
- [ ] Implementar; PASS; commit.

### Task 4: Elogio e denúncia da Diversão

**Files:** `avaliar.ts`, `avaliar.test.ts`

**Produces:** `elogiarNaDiversao(bd, autor, { referencia, elogiadoId, tipo })`, `denunciarNaDiversao(bd, autor, { referencia, acusadoId, motivo })`,
`elogiosFeitosNaDiversao(bd, referencia, autorId): Promise<Set<string>>`, `denunciasFeitasNaDiversao(...)`. Reusam
`ElogioIndisponivel`, `ElogioRepetido`, `NaoJogou`, `AcusadoInvalido`, `DenunciaRepetida`, `MotivoInvalido` (exportar
de `denuncias.ts` o que faltar). `elogiosDoJogador` passa a somar os da Diversão.

- [ ] Testes: os dois jogaram → grava; quem não jogou → erro; repetido → erro; elogio a si mesmo → erro;
  `elogiosDoJogador` soma os dois tipos de partida.
- [ ] Implementar; PASS; commit.

### Task 5: O que falta avaliar, o sino e para onde ir

**Files:** `avaliar.ts`, `avaliar.test.ts`, Modify `site/src/dominio/notificacoes.ts`; Create `site/src/app/api/avaliar/destino/route.ts`

**Produces:**
- `async function avaliacoesPendentes(bd, usuarioId, agora): Promise<{ mix: { id: string; numero: number } | null; diversao: { referencias: string[]; modo: string } | null }>`
  — mix: a última partida encerrada nas últimas 12 h em que a conta jogou e que não está em `partidas_vistas`;
  Diversão: a sessão, se alguma dela não está vista.
- `async function marcarVistas(bd, usuarioId, referencias: string[])`.
- `async function destinoAoSair(bd, controlador, usuario, agora): Promise<string | null>` — mix pendente terminada há
  menos de 10 min → `/partidas/<id>#avaliar`; Diversão pendente e a conta fora de todos os servidores da Diversão
  ligados (via `controlador.estadoDoServidor`; servidor que não responde conta como "não está lá") →
  `/partidas/diversao/<slug da última>#avaliar`; senão null.
- Sino: tipo `'avaliar'`: "Avalie a partida #12" / "Avalie suas 3 partidas da Mutação" (1 partida: "Avalie sua partida
  da Mutação").
- Rota GET `/api/avaliar/destino` → `{ ir: string | null }`, só para quem está logado (401 senão).

- [ ] Testes com `controladorFalso`: ainda no servidor → null; saiu → a última; servidor sem resposta → trata como saiu
  só se ele também não estiver em outro; marcar vista tira do sino.
- [ ] Implementar; PASS; commit.

### Task 6: Página do mix com "Seu resultado"

**Files:** Modify `site/src/app/(membros)/partidas/[id]/page.tsx`; Create `site/src/app/(membros)/partidas/seu-resultado.tsx`; CSS em `global.css`

- `SeuResultado` (servidor): resultado, XP, Grana, K/D, abates e insígnias novas, como no rascunho. Aparece no topo da
  partida encerrada para quem jogou; a parte de elogiar/denunciar ganha `id="avaliar"`. Abrir a página marca a partida
  como vista.
- [ ] Implementar; checagens; preview de uma partida encerrada; commit.

### Task 7: Página da partida da Diversão

**Files:** Create `site/src/app/(membros)/partidas/diversao/[slug]/page.tsx`, `acoes.ts`; CSS

- Cabeçalho (modo, mapa com foto, data), "Suas partidas de agora" (sessão, com a atual em dourado, links para as
  outras), `SeuResultado`, "Avalie os jogadores" (lista dos membros com abates/mortes/XP e Elogiar (os 4 tipos) /
  Denunciar (motivo)), como no rascunho. Slug inválido ou partida inexistente → `notFound()`. Abrir marca a sessão como
  vista. Ações com `exigirAcesso`, voltam para a página com `?aviso=`/`?erro=` como na página do mix.
- A aba Partidas do perfil liga cada partida da Diversão à página dela (e as do mix à delas).
- [ ] Implementar; checagens; preview; commit.

### Task 8: Ida automática e denúncias da Diversão na equipe

**Files:** Create `site/src/app/(membros)/ir-para-avaliar.tsx`; Modify `layout.tsx`, `olho-de-aguia/page.tsx`, `site/src/dominio/olho-de-aguia.ts`, `denuncias.ts` (`contagemDeCasos`)

- `IrParaAvaliar` (cliente): só quando o layout diz que há pendência; a cada 15 s busca `/api/avaliar/destino`; com
  destino, respeita as exceções das Global Constraints e `sessionStorage` (uma vez por destino) e faz `router.push`.
- Olho de Águia: seção "Denúncias da Diversão" com as abertas (partida com link, acusado, denunciante, motivo) e
  encerrar com conclusão (`moderar`, auditoria). `contagemDeCasos` soma as abertas da Diversão.
- [ ] Testes de domínio para listar/encerrar a denúncia da Diversão e para a contagem.
- [ ] Implementar; checagens; commit.

### Task 9: Checagem final

- [ ] tsc, eslint, vitest completo; revisão final; publicar com OK do dono.
