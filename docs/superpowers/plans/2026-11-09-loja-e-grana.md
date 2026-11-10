# Magnata Shop e Grana: plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Grana ganha jogando, Magnata Shop com 4 itens de aparência por tempo, Baú, e o plugin que aplica cor/etiqueta/aviso no chat dos servidores.

**Architecture:** Livro-caixa `lancamentos_de_grana` (só insere) + saldo em `usuarios.grana` com `CHECK >= 0`, sempre atualizados na mesma transação. Catálogo fixo no código. Os servidores perguntam ao site o visual pronto por `GET /api/servidor/visuais`; um plugin novo `MagnatasVisual` reescreve o chat.

**Tech Stack:** Next.js 16, Drizzle + Postgres (PGlite nos testes), Vitest, CounterStrikeSharp (C#), pytest nos testes de texto dos plugins.

**Spec:** `docs/superpowers/specs/2026-11-09-loja-e-grana-design.md`

## Global Constraints

- 1 Grana a cada 10 XP, `Math.floor(xp / 10)`, na mesma transação do XP.
- Dias à venda: exatamente 1, 3, 5, 9. Preços (Grana): cor 80/200/300/480; etiqueta 100/250/380/600; aviso 60/150/230/370; moldura 80/200/300/480.
- Linha do livro-caixa nunca é editada nem apagada. Único por (`usuario_id`, `tipo`, `referencia`).
- Nenhum item imita skin/arma/faca/luva/patente da Valve. Etiqueta nunca contém ADM, GM, STAFF, EQUIPE, MOD.
- Sem transferência entre jogadores.
- Loja escondida (menu "em breve", páginas só para Adm) até `LOJA_ABERTA=sim` no ambiente.
- Textos em português, como o resto do site. Nunca rodar prettier.
- Testes do site: `cd site && npx vitest run <arquivo>`; dos plugins: `cd servidor && python -m pytest -q tests`.

## Review Focus

1. Clique duplo / reenvio do formulário de compra: tem que cobrar uma vez (código de compra gerado na renderização).
2. Partida que chega depois da abertura não pode ser contada duas vezes (abertura só soma XP de linhas sem Grana).
3. Item vencido não pode aparecer para o servidor nem como "usando" no Baú.
4. Site fora do ar não pode travar o chat nem o servidor (timeout curto, mensagem passa normal).
5. Comandos de chat (`.ready`, `!algo`) não podem ser engolidos pelo plugin.

---

### Task 1: Banco

**Files:**
- Modify: `site/src/bd/esquema.ts`
- Create: `site/drizzle/0026_grana_e_loja.sql` (via `npm run db:gerar`, renomear e acrescentar o CHECK à mão se o drizzle não gerar)
- Test: `site/src/bd/esquema-loja.test.ts`

**Produces:**
- `usuarios.grana: integer not null default 0` com `CHECK (grana >= 0)` (`usuarios_grana_nao_negativa`).
- `tipoGrana = pgEnum('tipo_grana', ['partida','abertura','compra','ajuste'])`.
- `lancamentosDeGrana` (`lancamentos_de_grana`): id uuid, usuarioId fk, tipo, quantidade integer (≠ 0), referencia text, detalhes jsonb null, atorId uuid null fk, criadoEm. Único `(usuario_id, tipo, referencia)`; índice `(usuario_id, criado_em)`.
- `itensDoJogador` (`itens_do_jogador`): usuarioId fk, itemId text, expiraEm timestamptz null (null = para sempre), usando boolean default false, atualizadoEm. PK `(usuario_id, item_id)`.

- [ ] Teste: inserir saldo negativo em `usuarios.grana` falha; duas linhas com mesmo (conta, tipo, referência) falham; mesma referência com tipos diferentes passa.
- [ ] Rodar, ver falhar; escrever esquema + migração; rodar, ver passar.
- [ ] Commit `feat: tabelas da Grana e do baú`.

### Task 2: Livro-caixa e ganho por partida

**Files:**
- Create: `site/src/dominio/grana.ts`, `site/src/dominio/grana.test.ts`
- Modify: `site/src/dominio/xp.ts` (`lancarXp` chama `lancarGrana` para cada linha nova)

**Produces (`grana.ts`):**
- `GRANA_POR_XP = 10`; `granaDoXp(xp: number): number`.
- `lancarGrana(tx, { usuarioId, tipo, quantidade, referencia, detalhes?, atorId? }): Promise<{ lancado: boolean; saldo: number }>` — insere com `onConflictDoNothing`; se inseriu, `update usuarios set grana = grana + quantidade returning grana`. Quantidade 0 não grava. Saldo insuficiente estoura o CHECK → a transação inteira cai (deixar o erro subir como `SaldoInsuficiente`, traduzindo o código `23514`).
- `class SaldoInsuficiente extends Error`.
- `abrirGrana(bd): Promise<number>` — por conta: soma o `xp` das linhas de `xp_partidas` que **não** têm linha `partida` na Grana com a mesma referência; lança `abertura` com `granaDoXp(soma)`; devolve quantas contas receberam. Rodar duas vezes não paga de novo.
- `extrato(bd, usuarioId, limite = 100)` — linhas mais novas primeiro, com saldo corrente.
- `divergencias(bd): Promise<{ usuarioId, apelido, saldo, soma }[]>` — contas onde `usuarios.grana ≠ sum(quantidade)`.
- `ajustarGrana(bd, ator, alvoId, quantidade, motivo)` — exige permissão nova `ajustar_grana` (só `adm`, em `permissoes.ts`), motivo com 3+ caracteres, referência `randomUUID()`, grava auditoria `ajustar_grana` com quantidade e motivo, tudo numa transação.

- [ ] Testes: `granaDoXp(1100) === 110`, `granaDoXp(19) === 1`; `lancarXp` da mesma partida duas vezes credita uma vez; partida com 0 XP não cria linha; abertura duas vezes paga uma; abertura não conta partida que já pagou Grana; saldo insuficiente não grava linha; divergência aparece ao mexer no saldo direto; jogador comum não ajusta; ajuste sem motivo é recusado; ajuste vai para a auditoria.
- [ ] Vermelho → implementação → verde; `npx vitest run src/dominio/xp.test.ts src/dominio/partidas-xp.test.ts src/dominio/xp-diversao.test.ts` continuam verdes.
- [ ] Commit `feat: livro-caixa da Grana e Grana por partida`.

### Task 3: Catálogo, compra e Baú

**Files:**
- Create: `site/src/dominio/loja.ts`, `site/src/dominio/loja.test.ts`

**Produces:**
- `type TipoDeItem = 'cor' | 'etiqueta' | 'aviso' | 'moldura'`; `DIAS_A_VENDA = [1,3,5,9] as const`.
- `PRECOS: Record<TipoDeItem, Record<1|3|5|9, number>>` com os valores das Global Constraints.
- `CATALOGO: ItemDaLoja[]` com `{ id, tipo, nome, valor }`:
  - cores (valor = nome da cor do chat do CounterStrikeSharp): `cor-vermelha` Red, `cor-verde` Green, `cor-azul` Blue, `cor-roxa` Purple, `cor-dourada` Gold, `cor-laranja` Orange, `cor-rosa` Magenta, `cor-azul-claro` LightBlue; também a cor CSS para a prévia no site.
  - etiquetas: `etiqueta-magnata` [MAGNATA], `etiqueta-chefao` [CHEFÃO], `etiqueta-don` [DON], `etiqueta-patrao` [PATRÃO], `etiqueta-lenda` [LENDA].
  - aviso: `aviso-entrada` (texto "★ {apelido} chegou").
  - molduras: `moldura-dourada`, `moldura-neon`, `moldura-fogo`, `moldura-gelo`.
- `comprarItem(bd, usuario, { itemId, dias, codigo }): Promise<'comprado' | 'repetido'>` — numa transação: `select ... for update` na conta; se já existe linha `compra` com `referencia = codigo` → `'repetido'` sem cobrar; senão `lancarGrana(-preço, detalhes { itemId, dias, preco })`, depois upsert em `itens_do_jogador`: `expira_em = greatest(coalesce(expira_em, agora), agora) + dias` (null fica null). Item ou dias inválidos → `ItemInvalido`. Conta não ativa → `ContaSemAcesso`.
- `usarItem(bd, usuario, itemId)` — só item valendo; tira o `usando` dos outros do mesmo tipo e marca este. `tirarItem(bd, usuario, itemId)`.
- `bauDe(bd, usuarioId, agora = new Date())` — itens com dias restantes; vencido aparece como vencido e `usando: false`.
- `visuaisDe(bd, steamids: string[], agora)` — `Record<steamid, { cor?: string; etiqueta?: string; aviso?: boolean; moldura?: string }>` só com itens valendo e `usando`.

- [ ] Testes: preços batem com a tabela; nenhuma etiqueta contém ADM/GM/STAFF/EQUIPE/MOD; compra sem saldo → `SaldoInsuficiente` e nada gravado; mesmo `codigo` duas vezes cobra uma; dias somam (novo, valendo, vencido) com `agora` fixo; usar troca o anterior do mesmo tipo; item vencido some de `visuaisDe` e do "usando"; dias fora de 1/3/5/9 recusados; `Promise.all` de duas compras com saldo para uma deixa saldo ≥ 0 e só uma linha.
- [ ] Vermelho → verde. Commit `feat: catálogo, compra e baú da Magnata Shop`.

### Task 4: API dos servidores

**Files:**
- Create: `site/src/app/api/servidor/visuais/route.ts`, `site/src/dominio/visuais-servidor.ts`, `site/src/dominio/visuais-servidor.test.ts`

**Produces:** `respostaDosVisuais(bd, cabecalho, token, url)` — `?steamids=a,b,c` (até 64, só dígitos), token igual ao de `lista.ts`; 401 sem token; JSON `{ "<steamid>": { "cor": "Gold", "etiqueta": "[DON]", "aviso": true } }`, `Cache-Control: no-store`. Só conta ativa.

- [ ] Testes: 401 sem token; steamid inválido ignorado; conta sem item não aparece; conta banida não aparece. Commit `feat: visuais dos jogadores para os servidores`.

### Task 5: Telas do jogador

**Files:**
- Create: `site/src/app/(membros)/loja/page.tsx`, `loja/acoes.ts`, `site/src/app/(membros)/bau/page.tsx`, `bau/acoes.ts`
- Modify: `site/src/dominio/navegacao.ts` (Magnata Shop → `/loja`, filhos Loja e Baú; `emBreve` enquanto `LOJA_ABERTA !== 'sim'`), `site/src/app/(membros)/cabecalho.tsx` (saldo), `site/src/app/(membros)/avatar.tsx` (prop `moldura?: string` → classe `moldura-<nome>`), perfil (`jogadores/[id]`) e ranking passam a moldura, `site/src/estilos/global.css` (loja, baú, molduras).

- Página aberta só para Adm enquanto `LOJA_ABERTA !== 'sim'` (função `lojaAberta(usuario)` em `loja.ts`, testada).
- Loja: abas por tipo, prévia, os 4 preços, confirmação com item/dias/preço; o formulário leva `codigo` = `randomUUID()` gerado na renderização; erros voltam com `?erro=saldo|item`.
- Baú: itens, dias restantes, Usar/Tirar, e extrato (data, motivo legível, +/−, saldo).

- [ ] Teste de `lojaAberta` e da navegação; `npx tsc --noEmit` e `npm run lint` sem erro; conferir no navegador local (comprar, clique duplo, usar, moldura no perfil). Commit `feat: telas da Magnata Shop e do Baú`.

### Task 6: Painel ADM — Grana

**Files:**
- Create: `site/src/app/(membros)/painel/grana/page.tsx`, `painel/grana/acoes.ts`
- Modify: `painel/lateral-do-painel.tsx` (item "Grana" para quem tem `ajustar_grana`; `ParteDoPainel` ganha `'grana'`)

- Busca por apelido, extrato da conta, formulário de ajuste (quantidade com sinal + motivo), e caixa vermelha com `divergencias()` quando houver.
- [ ] `tsc`/lint; conferir no navegador. Commit `feat: Grana no Painel ADM`.

### Task 7: Plugin MagnatasVisual

**Files:**
- Create: `servidor/plugins/MagnatasVisual/MagnatasVisual.cs`, `MagnatasVisual.csproj` (copiar do MagnatasLista), `servidor/tests/test_visual.py`
- Modify: `servidor/scripts/compilar_plugin.sh` (compila e instala em `server/.../plugins/MagnatasVisual/`; escreve `configs/plugins/MagnatasVisual/MagnatasVisual.json` com `SiteUrl` e `Token` do `cs2.env`, chmod 600). A diversão copia `addons` do competitivo a cada início, então o plugin chega lá sozinho.

**Comportamento:**
- Config `{ SiteUrl, Token }`; vazio → plugin não faz nada.
- `EventPlayerConnectFull` e `EventRoundStart`: busca `/api/servidor/visuais` dos humanos conectados (HttpClient, timeout 3 s, fora da thread do jogo; aplica com `Server.NextFrame`). Guarda por steamid.
- Aviso de entrada: no `PlayerConnectFull`, se `aviso`, `PrintToChatAll(" {Gold}★ {nome} chegou")` uma vez por conexão.
- `AddCommandListener("say"/"say_team", Pre)`: se a mensagem começa com `.`/`!`/`/` ou o jogador não tem cor nem etiqueta → `HookResult.Continue`. Senão monta `[etiqueta] nome: texto` (etiqueta em Gold, nome na cor), prefixo `*MORTO*` se morto, `(Time)` no say_team; say_team só para o mesmo time; morto só para mortos/espectadores; retorna `HookResult.Handled`.
- Erros de rede só no log; nunca exceção para o jogo.

- [ ] `test_visual.py` (texto do C#): comandos passam; timeout ≤ 3 s; `Handled` só depois de montar a mensagem; say_team filtra o time; config vazia desliga; `compilar_plugin.sh` instala MagnatasVisual e grava o json com chmod 600.
- [ ] Vermelho → código → verde; compilar no WSL (comando do MagnatasDiversao trocando a pasta). Commit `feat: plugin MagnatasVisual aplica cor, etiqueta e aviso no chat`.

### Task 8: Abertura

**Files:**
- Create: `site/scripts/abrir-grana.ts` (`npm run grana:abrir`) chama `abrirGrana` e imprime contas e total.

- [ ] Teste já coberto em Task 2; rodar no banco local e conferir `divergencias()` vazio. Commit `feat: script de abertura da Grana`.

### Ida ao ar (com OK do dono a cada passo)

1. Publicar site (migração roda) e plugin.
2. `npm run grana:abrir` no VPS; conferir divergências vazias.
3. Testar com o dono (Adm vê a loja antes).
4. `LOJA_ABERTA=sim` e reiniciar o site.
