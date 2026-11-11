# Insígnias e perfil novo: plano de construção

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 30 insígnias (6 famílias × 5 níveis) com prêmio, uma insígnia principal ao lado do nome e o perfil do jogador
refeito em 4 abas.

**Architecture:** Uma tabela guarda cada insígnia conquistada com o prêmio entregue. As regras (metas, prêmios, níveis
alcançados) são funções puras em `src/dominio/insignias.ts`; a contagem lê `xp_partidas` e `partida_jogadores`; a
entrega roda na mesma transação do XP de cada partida e uma vez para todos na estreia. O perfil vira uma página com
topo fixo e abas por `?aba=`.

**Tech Stack:** Next.js 16 (App Router, server components), Drizzle + Postgres (PGlite nos testes), Vitest.

**Spec:** `docs/superpowers/specs/2026-11-11-insignias-e-perfil-novo-design.md`

## Global Constraints

- Tudo em português: nomes de arquivo, funções, variáveis, textos e comentários (padrão do projeto).
- Metas por família, exatamente: Mira (headshots) 50/250/1.000/3.000/10.000; Ace (rodadas de 5 abates) 1/5/20/50/100;
  Estrela (MVPs) 10/50/200/500/1.000; Vencedor (vitórias competitivo+mix) 5/25/100/300/1.000; Mutação (partidas ganhas na
  Mutação) 5/25/100/300/1.000; Veterano (partidas jogadas, qualquer modo) 10/50/200/500/1.500.
- Níveis: Bronze, Prata, Ouro, Platina, Lendária.
- Prêmios: Bronze 50 Grana + 200 XP; Prata 100 + 500 + mutante 1 dia; Ouro 200 + 1.000 + 3 dias; Platina 400 + 2.000 +
  5 dias; Lendária 800 + 5.000 + mutante para sempre (já tendo todos para sempre: +1.000 Grana no lugar).
- Insígnias das partidas antigas também dão prêmio (decisão do dono).
- Só partidas que valem XP contam (as que têm linha em `xp_partidas`; teste e treino não têm).
- Checagens do site: `npx tsc --noEmit -p .`, `npx eslint src scripts`, `npx vitest run` (3 falhas conhecidas do
  tier-s são esperadas; o teste de contraste falha se uma classe usada não tiver CSS). Nunca rodar prettier.
- Ambiente: `export PATH="/g/Magnatas-ferramentas/node:$PATH" TEMP=G:/Magnatas-ferramentas/tmp`, dentro de `site/`.
- Commit termina com `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Publicar só com OK do dono.

## Review Focus

- Dois resultados de partida do mesmo jogador chegando juntos: a insígnia e o prêmio saem uma vez só.
- Rodar a conferência da estreia duas vezes: nada é pago de novo.
- Lendária com todos os mutantes já para sempre: +1.000 Grana, sem erro e sem item repetido.
- Perfil de quem nunca jogou: nenhuma aba quebra (sem mapa favorito, sem mutante, sem insígnia principal).
- Visitante abrindo o perfil de outro: não aparece o botão de escolher principal nem as partes só da equipe.

---

## Arquivos

- Create: `site/src/dominio/insignias.ts` (regras, contagem, entrega, leitura), `site/src/dominio/insignias.test.ts`
- Create: `site/src/app/(membros)/insignia.tsx` (o desenho em SVG)
- Create: `site/scripts/conferir-insignias.ts` (a estreia, para todos)
- Create: `site/src/app/(membros)/jogadores/[id]/topo-do-perfil.tsx`, `visao-geral.tsx`, `aba-insignias.tsx`,
  `aba-partidas.tsx`, `aba-bau.tsx`, `marcar-insignias-vistas.tsx`
- Modify: `site/src/bd/esquema.ts`, `site/drizzle/0033_*.sql` (gerado), `site/src/dominio/loja.ts` (extrair `darItem`),
  `site/src/dominio/partidas.ts`, `site/src/dominio/xp-diversao.ts`, `site/src/dominio/notificacoes.ts`,
  `site/src/app/(membros)/jogadores/[id]/page.tsx`, `.../acoes.ts`, `site/src/app/(membros)/ranking/page.tsx`,
  `site/src/app/(membros)/jogar/sala.tsx`, `site/src/estilos/global.css`, `site/package.json`

---

### Task 1: Banco das insígnias

**Files:** Modify `site/src/bd/esquema.ts`; gerar `site/drizzle/0033_insignias.sql`; Test `site/src/bd/esquema.test.ts`

**Interfaces:**
- Produces: tabela `insigniasDoJogador` (`insignias_do_jogador`): `usuarioId` uuid → usuarios, `familia` text, `nivel`
  integer (0 = Bronze … 4 = Lendária), `conquistadaEm` timestamptz default now, `vistaEm` timestamptz null, `grana`
  integer, `xp` integer, `mutanteId` text null, `mutanteDias` integer null (null com `mutanteId` = para sempre).
  Chave primária (`usuarioId`, `familia`, `nivel`). Coluna nova `usuarios.insigniaPrincipal` text null (formato
  `"familia:nivel"`, ex. `"estrela:2"`). `tipoGrana` ganha `'insignia'`.

- [ ] **Step 1: teste que falha** em `esquema.test.ts`:

```ts
test('a mesma insígnia não entra duas vezes para a mesma conta', async () => {
  const bd = await criarBancoDeTeste();
  const conta = await criarUsuario(bd);
  const linha = { usuarioId: conta.id, familia: 'mira', nivel: 0, grana: 50, xp: 200 };
  await bd.insert(insigniasDoJogador).values(linha);
  await expect(bd.insert(insigniasDoJogador).values(linha)).rejects.toThrow();
  await bd.update(usuarios).set({ insigniaPrincipal: 'mira:0' }).where(eq(usuarios.id, conta.id));
});
```

- [ ] **Step 2:** `npx vitest run src/bd/esquema.test.ts` → FAIL (`insigniasDoJogador` não existe).
- [ ] **Step 3:** adicionar a tabela, a coluna e o valor do enum em `esquema.ts`; `npm run db:gerar` e renomear o
  arquivo gerado para `0033_insignias.sql` (ajustar `drizzle/meta/_journal.json` junto, como nas migrações anteriores).
- [ ] **Step 4:** `npx vitest run src/bd` → PASS.
- [ ] **Step 5:** commit `feat: banco das insignias`.

### Task 2: Regras das insígnias (funções puras)

**Files:** Create `site/src/dominio/insignias.ts`, `site/src/dominio/insignias.test.ts`

**Interfaces:**
- Produces:
  - `type Familia = 'mira' | 'ace' | 'estrela' | 'vencedor' | 'mutacao' | 'veterano'`
  - `const FAMILIAS: readonly { chave: Familia; nome: string; conta: string; metas: readonly [number, number, number, number, number] }[]` (na ordem da tabela)
  - `const NOMES_DOS_NIVEIS = ['Bronze', 'Prata', 'Ouro', 'Platina', 'Lendária'] as const`
  - `const PREMIOS: readonly { grana: number; xp: number; mutanteDias: number | null | undefined }[]` (undefined = sem mutante, null = para sempre)
  - `const GRANA_NO_LUGAR_DO_MUTANTE = 1000`
  - `type Contagem = Record<Familia, number>`
  - `function niveisAlcancados(contagem: Contagem): { familia: Familia; nivel: number }[]` (todos os níveis cuja meta foi atingida, de todas as famílias)
  - `function nomeDaInsignia(familia: Familia, nivel: number): string` → `"Estrela Ouro"`
  - `function lerChaveDaInsignia(chave: string | null): { familia: Familia; nivel: number } | null`

- [ ] **Step 1: testes que falham:**

```ts
test('as metas e os prêmios são os da tabela aprovada', () => {
  expect(FAMILIAS.map((f) => [f.chave, f.metas])).toEqual([
    ['mira', [50, 250, 1000, 3000, 10000]], ['ace', [1, 5, 20, 50, 100]], ['estrela', [10, 50, 200, 500, 1000]],
    ['vencedor', [5, 25, 100, 300, 1000]], ['mutacao', [5, 25, 100, 300, 1000]], ['veterano', [10, 50, 200, 500, 1500]],
  ]);
  expect(PREMIOS).toEqual([
    { grana: 50, xp: 200, mutanteDias: undefined }, { grana: 100, xp: 500, mutanteDias: 1 }, { grana: 200, xp: 1000, mutanteDias: 3 },
    { grana: 400, xp: 2000, mutanteDias: 5 }, { grana: 800, xp: 5000, mutanteDias: null },
  ]);
});

test('alcançar uma meta dá todos os níveis até ela', () => {
  const zero = { mira: 0, ace: 0, estrela: 0, vencedor: 0, mutacao: 0, veterano: 0 };
  expect(niveisAlcancados({ ...zero, estrela: 231 })).toEqual([{ familia: 'estrela', nivel: 0 }, { familia: 'estrela', nivel: 1 }, { familia: 'estrela', nivel: 2 }]);
  expect(niveisAlcancados({ ...zero, mira: 49 })).toEqual([]);
  expect(niveisAlcancados({ ...zero, ace: 100 })).toHaveLength(5);
});

test('o nome e a chave da insígnia', () => {
  expect(nomeDaInsignia('estrela', 2)).toBe('Estrela Ouro');
  expect(lerChaveDaInsignia('mutacao:4')).toEqual({ familia: 'mutacao', nivel: 4 });
  expect(lerChaveDaInsignia('qualquer:9')).toBeNull();
  expect(lerChaveDaInsignia(null)).toBeNull();
});
```

- [ ] **Step 2:** `npx vitest run src/dominio/insignias.test.ts` → FAIL (módulo não existe).
- [ ] **Step 3:** implementar as constantes e as três funções.
- [ ] **Step 4:** mesmo comando → PASS.
- [ ] **Step 5:** commit `feat: regras das insignias`.

### Task 3: Contagem das famílias

**Files:** Modify `site/src/dominio/insignias.ts`, `insignias.test.ts`

**Interfaces:**
- Consumes: `Contagem` (Task 2).
- Produces: `async function contarFamilias(bd: Bd | Transacao, usuarioIds: string[]): Promise<Map<string, Contagem>>`
  (toda conta pedida aparece no mapa, com zeros se não jogou).

Regras: competitivo e mix = linhas de `xp_partidas` com origem `partida` ligadas a `partida_jogadores`
(`partidaId::text = referencia` e mesmo `usuarioId`): Mira soma `headshot_kills`, Ace soma `k5`, Estrela soma `mvps`,
Vencedor conta `xp_partidas.resultado = 'vitoria'`. Mutação conta linhas de origem `diversao` com resultado `vitoria`
cuja porta (`referencia` = `diversao:<porta>:<partida>`) é de um servidor com `modo = 'mutacao'`. Veterano conta todas as
linhas de `xp_partidas` da conta. Uma consulta agrupada por conta para cada fonte, não uma por jogador.

- [ ] **Step 1: teste que falha:** montar com `criarBancoDeTeste` uma conta com 2 partidas de competitivo (uma vitória,
  `headshot_kills` 30 e 25, `k5` 1 e 0, `mvps` 4 e 7), 1 partida de teste (tipo `teste`, com `partida_jogadores` mas sem
  `xp_partidas`, `headshot_kills` 99), 2 linhas de Diversão numa porta de Mutação (uma `vitoria`) e 1 numa porta de
  Fantasma (`vitoria`); e uma segunda conta sem nada. Esperar:

```ts
expect(contagem.get(conta.id)).toEqual({ mira: 55, ace: 1, estrela: 11, vencedor: 1, mutacao: 1, veterano: 5 });
expect(contagem.get(vazia.id)).toEqual({ mira: 0, ace: 0, estrela: 0, vencedor: 0, mutacao: 0, veterano: 0 });
```

- [ ] **Step 2:** rodar o teste → FAIL.
- [ ] **Step 3:** implementar `contarFamilias`.
- [ ] **Step 4:** rodar → PASS.
- [ ] **Step 5:** commit `feat: contagem das insignias`.

### Task 4: Entrega das insígnias e dos prêmios

**Files:** Modify `site/src/dominio/loja.ts` (extrair), `site/src/dominio/insignias.ts`, `insignias.test.ts`, `loja.test.ts`

**Interfaces:**
- Consumes: `contarFamilias`, `niveisAlcancados`, `PREMIOS`, `GRANA_NO_LUGAR_DO_MUTANTE` (Tasks 2–3); `lancarGrana` (`dominio/grana.ts`).
- Produces:
  - em `loja.ts`: `async function darItem(tx: Transacao, usuarioId: string, itemId: string, dias: number | null, agora: Date): Promise<void>`
    (null = para sempre; por tempo soma ao que ainda vale, como `comprarItem`; para sempre não desce para tempo).
    `comprarItem` e `comprarParaSempre` passam a usar `darItem`.
  - em `insignias.ts`: `async function conferirInsignias(tx: Transacao, usuarioIds: string[], agora?: Date, sortear?: (quantos: number) => number): Promise<{ usuarioId: string; familia: Familia; nivel: number }[]>`
    devolve só as insígnias novas.

Algoritmo de `conferirInsignias`, por conta: para cada nível alcançado, `insert ... onConflictDoNothing().returning()`
na `insigniasDoJogador`; só o que voltou é novo e recebe prêmio. Grana: `lancarGrana(tx, { tipo: 'insignia',
quantidade, referencia: 'insignia:<familia>:<nivel>', detalhes: { nome } })`. XP: `update usuarios set xp_total =
xp_total + xp`. Mutante: candidatos = mutantes de `ITENS_A_VENDA()` que a conta não tem para sempre; sorteio
`candidatos[sortear(candidatos.length)]` (padrão `Math.floor(Math.random() * n)`); `darItem` com os dias do nível; na
Lendária sem candidato, soma `GRANA_NO_LUGAR_DO_MUTANTE` à Grana do prêmio. Grava na linha `grana`, `xp`, `mutanteId`,
`mutanteDias`. Se `usuarios.insigniaPrincipal` é null, vira a nova de nível mais alto.

- [ ] **Step 1: testes que falham:**
  - `conferirInsignias` numa conta com 231 MVPs e 0 do resto cria Estrela Bronze, Prata e Ouro; a Grana sobe
    50+100+200 = 350; o `xpTotal` sobe 200+500+1.000 = 1.700; o Baú tem um mutante com 1+3 = 4 dias se o sorteio
    (`() => 0`) cair duas vezes no mesmo; `insigniaPrincipal` = `'estrela:2'`.
  - Chamar `conferirInsignias` de novo: devolve `[]`, Grana e XP iguais.
  - Duas chamadas em paralelo (`Promise.all` de duas transações) para a mesma conta: no fim, 3 linhas e Grana 350.
  - Lendária de Ace com a conta já tendo todos os mutantes à venda para sempre: Grana do prêmio = 800 + 1.000,
    `mutanteId` null.
  - Em `loja.test.ts`: `darItem` por 3 dias num item que ainda vale 2 dias deixa 5; `darItem` por tempo num item para
    sempre não muda nada; os testes de compra existentes continuam passando.
- [ ] **Step 2:** `npx vitest run src/dominio/insignias.test.ts src/dominio/loja.test.ts` → FAIL.
- [ ] **Step 3:** extrair `darItem`, implementar `conferirInsignias`; no extrato (`compras/page.tsx`), o tipo
  `insignia` ganha símbolo (`★`) e mostra o nome guardado em `detalhes.nome`.
- [ ] **Step 4:** mesmo comando → PASS.
- [ ] **Step 5:** commit `feat: entrega das insignias com premio`.

### Task 5: Conferir depois de cada partida e na estreia

**Files:** Modify `site/src/dominio/partidas.ts`, `site/src/dominio/xp-diversao.ts`; Create `site/scripts/conferir-insignias.ts`; Modify `site/package.json`; Tests nos arquivos de teste de partidas e xp-diversao

**Interfaces:**
- Consumes: `conferirInsignias` (Task 4).
- Produces: `npm run insignias:conferir` (roda `tsx scripts/conferir-insignias.ts`): confere todas as contas ativas,
  em lotes de 100, e imprime quantas insígnias novas saíram.

- [ ] **Step 1: testes que falham:** no teste que encerra uma partida de mix (onde `lancarXp` já é testado), uma conta
  que chega a 5 vitórias ganha Vencedor Bronze; no teste de `xp-diversao`, uma vitória na Mutação que completa 5 dá
  Mutação Bronze; uma partida de `teste` não cria insígnia.
- [ ] **Step 2:** rodar os dois arquivos → FAIL.
- [ ] **Step 3:** chamar `conferirInsignias(tx, ids)` logo depois de `lancarXp` nos dois lugares, com os ids das contas
  que receberam XP; criar o script e a entrada no `package.json`, no mesmo estilo de `scripts/migrar.ts`.
- [ ] **Step 4:** rodar → PASS; `npx tsc --noEmit -p .` limpo.
- [ ] **Step 5:** commit `feat: insignias conferidas a cada partida e script da estreia`.

### Task 6: Leitura, principal e aviso no sino

**Files:** Modify `site/src/dominio/insignias.ts`, `insignias.test.ts`, `site/src/dominio/notificacoes.ts`, `site/src/app/(membros)/jogadores/[id]/acoes.ts`; Create `marcar-insignias-vistas.tsx`

**Interfaces:**
- Produces:
  - `type InsigniaDaFamilia = { familia: Familia; nome: string; conta: string; contagem: number; nivel: number /* -1 = nenhum */; proximaMeta: number | null; conquistadas: { nivel: number; conquistadaEm: Date; grana: number; xp: number; mutanteId: string | null; mutanteDias: number | null }[] }`
  - `async function insigniasDe(bd: Bd, usuarioId: string): Promise<{ familias: InsigniaDaFamilia[]; principal: { familia: Familia; nivel: number } | null; total: number }>`
  - `async function principaisDe(bd: Bd, usuarioIds: string[]): Promise<Map<string, { familia: Familia; nivel: number }>>` (só principal que a conta tem de fato)
  - `async function escolherPrincipal(bd: Bd, usuarioId: string, familia: Familia, nivel: number): Promise<void>` (lança `InsigniaQueNaoTem` se não tiver)
  - `async function insigniasNaoVistas(bd: Bd, usuarioId: string): Promise<{ nome: string }[]>`, `async function marcarInsigniasVistas(bd: Bd, usuarioId: string): Promise<void>`
  - Notificação nova `tipo: 'insignia'`: 1 nova → `Nova insígnia: Estrela Ouro`; várias (como na estreia) → um aviso
    só com a soma dos prêmios, `3 novas insígnias: +350 Grana e +1.700 XP`; href `/jogadores/<id>?aba=insignias`.
  - Ação de servidor `escolherInsignia(form)` em `acoes.ts` (só para a própria conta).

- [ ] **Step 1: testes que falham:** `insigniasDe` de uma conta com Estrela até Ouro mostra `nivel: 2`,
  `proximaMeta: 500`, 3 conquistadas e `total: 3`; `escolherPrincipal` de uma insígnia que não tem lança
  `InsigniaQueNaoTem`; `principaisDe` ignora uma `insigniaPrincipal` gravada que a conta não tem; `notificacoesDe`
  mostra `2 novas insígnias: +150 Grana e +700 XP` (Bronze e Prata) e, depois de `marcarInsigniasVistas`, nada.
- [ ] **Step 2:** rodar → FAIL.
- [ ] **Step 3:** implementar; `marcar-insignias-vistas.tsx` segue `marcar-patente-vista.tsx`.
- [ ] **Step 4:** rodar → PASS.
- [ ] **Step 5:** commit `feat: insignia principal e aviso de insignia nova`.

### Task 7: O desenho da insígnia

**Files:** Create `site/src/app/(membros)/insignia.tsx`; Modify `site/src/estilos/global.css`

**Interfaces:**
- Produces: `function Insignia({ familia, nivel, tamanho, apagada }: { familia: Familia; nivel: number; tamanho: number; apagada?: boolean })`
  — SVG com o escudo, o ícone da família, as cores do nível, os pontinhos, raios a partir da Platina e asas na Lendária,
  como em `site/public/rascunho/insignias-ideia.html` (copiar caminhos e cores de lá). `aria-label` com o nome. Os ids de
  gradiente usam `useId()`.

- [ ] **Step 1:** escrever o componente e a classe `.insignia-apagada` (cinza e opaca, como `.nivel.trancada svg` no rascunho).
- [ ] **Step 2:** `npx tsc --noEmit -p .` e `npx vitest run src/estilos` → PASS.
- [ ] **Step 3:** commit `feat: desenho das insignias`.

### Task 8: Perfil novo, topo e Visão geral

**Files:** Modify `site/src/app/(membros)/jogadores/[id]/page.tsx`, `global.css`; Create `topo-do-perfil.tsx`, `visao-geral.tsx`

**Interfaces:**
- Consumes: `insigniasDe`, `Insignia`, `fichaDoJogador`, `ultimasPartidasDoPerfil`, `bauDe`, `fotoDoMapa`.
- Produces: `page.tsx` lê `searchParams.aba` (`'visao' | 'insignias' | 'partidas' | 'bau'`, padrão `'visao'`), monta o
  topo e a aba. `TopoDoPerfil` e `VisaoGeral` como componentes de servidor.

Conteúdo, como no rascunho `perfil-novo-ideia.html` e na spec: topo (avatar com moldura, nome na cor em uso — `corCss`
do item `cor` com `usando` do `bauDe` —, selos de papel/membro/patente/clã/principal, barra de XP, "Na Magnatas desde",
botões com as regras de hoje, fundo = `fotoDoMapa(porMapa[0]?.mapa)` ou o fundo padrão); abas como links; Visão geral
com Números, Últimas partidas em faixas, Por mapa com foto, mutante em uso (`/loja/<id>` da imagem do mutante em uso no
Baú; sem mutante, a caixa some), 3 melhores insígnias (maior nível, desempate pela ordem das famílias), Melhor partida,
Elogios e, no fim, Dados da equipe, Punições e Denúncias só para quem já vê hoje. Nada do perfil de hoje pode sumir.

- [ ] **Step 1:** escrever os componentes e o CSS (classes novas com prefixo `perfil-`).
- [ ] **Step 2:** `npx tsc --noEmit -p .`, `npx eslint src`, `npx vitest run src/estilos` → limpo.
- [ ] **Step 3:** abrir `/jogadores/<id>` no preview (próprio perfil e o de outra conta; conta sem partidas), conferir
  sem erro no console e em largura de celular.
- [ ] **Step 4:** commit `feat: perfil novo, topo e visao geral`.

### Task 9: Abas Insígnias, Partidas e Baú

**Files:** Create `aba-insignias.tsx`, `aba-partidas.tsx`, `aba-bau.tsx`; Modify `page.tsx`, `global.css`

- Insígnias: resumo (X de 30, nível mais alto, próxima mais perto), uma linha por família com barra "Faltam N para
  Nível" e os 5 níveis (apagados os que faltam); no próprio perfil, cada conquistada é um botão (form com
  `escolherInsignia`) e a principal tem a estrela; visitante só vê. Abrir a aba no próprio perfil marca as novas como
  vistas (`MarcarInsigniasVistas`).
- Partidas: `ultimasPartidasDoPerfil(bd, id, 100)` em faixas, filtro por modo via `?aba=partidas&modo=<nome>` com os
  modos que aparecem na lista; clicar abre a partida como hoje.
- Baú: `bauDe` sem vencidos, agrupado por tipo, com a prévia de cada item (reusar a prévia da página do Baú) e "Em
  uso" marcado; aberto para qualquer visitante.

- [ ] **Step 1:** escrever as três abas e o CSS.
- [ ] **Step 2:** checagens (tsc, eslint, vitest `src/estilos`) → limpo.
- [ ] **Step 3:** preview: escolher a principal no próprio perfil e ver a estrela mudar; filtro de Partidas; Baú de
  outra conta.
- [ ] **Step 4:** commit `feat: abas insignias, partidas e bau do perfil`.

### Task 10: Principal ao lado do nome no ranking e nas salas

**Files:** Modify `site/src/app/(membros)/ranking/page.tsx`, `site/src/app/(membros)/jogar/sala.tsx`, `global.css`

- Consumes: `principaisDe`, `Insignia`.
- [ ] **Step 1:** buscar `principaisDe` para os ids da página e mostrar `<Insignia tamanho={22} />` antes do apelido no
  ranking e nas linhas de membro da sala.
- [ ] **Step 2:** checagens → limpo; preview do ranking e de uma sala.
- [ ] **Step 3:** commit `feat: insignia principal no ranking e nas salas`.

### Task 11: Checagem final

- [ ] `npx tsc --noEmit -p .`, `npx eslint src scripts`, `npx vitest run` (só as 3 falhas conhecidas do tier-s).
- [ ] Rodar `npm run insignias:conferir` no banco local duas vezes: a segunda imprime 0 novas.
- [ ] Publicar (com OK do dono): deploy do site (que aplica a migração) e depois, na VPS,
  `cd /opt/magnatas/site && sudo -u magnatas npm run insignias:conferir`.
