# Tela principal: portal do clube — Plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Nova página `/inicio` (layout B): "Bombando agora", notícias do clube, MVP do dia/mês, atualizações do CS2 traduzidas e Tier S com os times brasileiros.

**Architecture:** A página só lê do banco. Duas tarefas no servidor alimentam o banco: Steam a cada 30 min (com tradução pela API da Anthropic, uma vez por notícia) e Liquipedia a cada 10 min (respeitando os limites deles). Cada fonte externa fica num arquivo de domínio que recebe a função de rede por parâmetro, para os testes usarem as amostras gravadas em `site/src/dominio/exemplos/`.

**Tech Stack:** Next.js 16 (ler `site/AGENTS.md`), Drizzle + PostgreSQL, Vitest com PGlite, zod, `@anthropic-ai/sdk` (novo), `node-html-parser` (novo, para ler o HTML que a API da Liquipedia devolve).

**Spec:** `docs/superpowers/specs/2026-11-07-tela-principal-portal-design.md`

## Global Constraints

- Rota `/inicio`; `destinoPara` manda `/`, `/verificacao`, `/banido`, `/suspenso` (de quem está ativo) e jogador fora da equipe para `/inicio`; ícone de casa do menu e logo do banner apontam para `/inicio`.
- Layout B: "Bombando agora" no topo; abaixo, coluna larga com notícias do clube e coluna estreita com MVPs, CS2 e Tier S; uma coluna só em telas estreitas.
- Notícias do clube: só adm; título até 120, texto até 5.000, sem HTML; 5 na tela (fixadas primeiro); página `/noticias/<id>`; autor nulo aparece como "Equipe Magnatas".
- MVP: soma de `partida_jogadores.mvps` em partidas `encerrada`, por `encerradaEm` no dia/mês de `America/Sao_Paulo`; empate → kills, depois apelido; top 5 do mês.
- Steam: `ISteamNews/GetNewsForApp/v2/?appid=730&feeds=steam_community_announcements`; 4 na tela; busca no máximo a cada 30 min; tradução uma vez por `gid` e guardada; sem chave ou com falha mostra o original.
- Tradução: `claude-opus-5-5` (padrão da Anthropic), `output_config.effort: 'low'`, saída estruturada com zod (`{ titulo, resumo }`), `fallbacks: 'default'` com beta `server-side-fallback-2026-07-01`; conferir `stop_reason === 'refusal'` antes de ler.
- Liquipedia: só `api.php`; ≤ 1 pedido / 2 s e `action=parse` ≤ 1 / 30 s; `User-Agent: MagnatasDoCS/1.0 (https://magnatasdocs.com.br; ${LIQUIPEDIA_CONTATO})`; gzip; sem `LIQUIPEDIA_CONTATO` não busca; a cada 10 min; "Fonte: Liquipedia" com link.
- Times brasileiros (constante): FURIA, MIBR, paiN, Imperial, Legacy, Fluxo, RED Canids, ODDIK.
- Nada de chamada externa ao renderizar página; testes nunca chamam a rede.
- Segredos (`ANTHROPIC_API_KEY`, `LIQUIPEDIA_CONTATO`) só no `.env.local` da VPS, postos pelo dono via script.
- Rodar `npx tsc --noEmit -p .`, `npx eslint src scripts` e `npx vitest run` antes de cada commit (Node em `G:/Magnatas-ferramentas/node`, `npm_config_cache=G:/Magnatas-ferramentas/npm-cache`, `TEMP`/`TMP=G:/Magnatas-ferramentas/tmp`).

## Review Focus

1. A Liquipedia muda o HTML ou responde erro/429: o quadro Tier S guarda o último dado bom e não quebra a página; nenhum pedido sai antes dos intervalos. Teste em Task 5.
2. Notícia da Steam com BBCode/HTML enorme ou vazio: o texto enviado à tradução é limpo e cortado (≤ 4.000 caracteres); a tradução falha → título original. Teste em Task 4.
3. Virada do dia/mês no horário de Brasília (partida encerrada 23:30 de 31/10 em Brasília é de outubro). Teste em Task 3.
4. Texto de notícia com `<script>` ou HTML: aparece como texto, nunca como HTML. Teste em Task 2 (renderização com React escapa; o teste confere que o domínio guarda o texto cru e a página usa texto).
5. Servidor da Diversão fora do ar ao montar "Bombando agora": o cartão some, a página não espera mais que o prazo de 3 s que `situacaoDoServidor` já usa. Teste em Task 6.

---

### Task 1: Banco

**Files:** `site/src/bd/esquema.ts`, migração por `npm run db:gerar` (renomear para `0015_portal.sql` e ajustar `drizzle/meta/_journal.json`), `site/src/bd/esquema.test.ts`.

**Produces:**
- `noticias`: `id`, `titulo text`, `texto text`, `imagem text null`, `fixada boolean default false`, `autorId uuid null → usuarios`, `criadoEm`, `atualizadaEm timestamp null`; índice em `criadoEm`.
- `noticiasSteam`: `gid text pk`, `tituloOriginal text`, `url text`, `publicadaEm timestamp`, `conteudo text` (já limpo), `tituloPt text null`, `resumoPt text null`, `traduzidaEm timestamp null`, `tentativas integer default 0`.
- `cacheExterno`: `chave text pk`, `dados jsonb`, `atualizadoEm timestamp`.
- Tipos `Noticia`, `NoticiaSteam`.

- [ ] Teste que falha: inserir uma de cada; `noticias.autorId` aceita nulo; `noticiasSteam.gid` repetido falha; `cacheExterno` faz upsert por `chave`.
- [ ] `npx vitest run src/bd/esquema.test.ts` → FAIL. Esquema + `db:gerar` + renomear. → PASS; suíte inteira passa.
- [ ] Commit `feat: banco do portal`

### Task 2: Notícias do clube

**Files:** Create `site/src/dominio/noticias.ts` (+ `.test.ts`); `site/src/app/(membros)/noticias/[id]/page.tsx`; `site/src/app/(membros)/equipe/noticias/page.tsx` + `acoes.ts` (lista, criar, editar, apagar, fixar — só adm, `exigirPermissao(tx, ator, 'decidir_banimento')` ou a permissão de adm que o projeto já usa); `site/scripts/publicar-noticia.ts` + `package.json` script `noticia:publicar`.

**Produces:**
- `export const LIMITES_DA_NOTICIA = { titulo: 120, texto: 5000 }`; `export class NoticiaInvalida extends Error`.
- `criarNoticia(bd, ator: Pick<Usuario,'id'> | null, dados: { titulo; texto; imagem?; fixada? }, agora?)` — `ator` nulo = script (sem permissão a conferir); com ator, exige adm.
- `editarNoticia(bd, adm, id, dados)`, `apagarNoticia(bd, adm, id)`.
- `ultimasNoticias(bd, limite = 5): Promise<(Noticia & { autorApelido: string })[]>` — fixadas primeiro, depois mais novas; autor nulo → `'Equipe Magnatas'`.
- `noticiaPorId(bd, id)`.
- Script: `npm run noticia:publicar -- <arquivo.md>` — primeira linha é o título, o resto é o texto; roda na VPS com o `.env.local`.

- [ ] Testes que falham: criar valida limites e espaços (título vazio/121 chars → `NoticiaInvalida`); GM e jogador não criam; adm cria, edita, apaga; `ultimasNoticias` põe fixada antes e traz `'Equipe Magnatas'` sem autor; texto com `<script>` volta igual (guardado cru).
- [ ] Implementar domínio, páginas (texto em parágrafos via `split('\n\n')`, nunca `dangerouslySetInnerHTML`), script. Item "Notícias" no menu da equipe só para adm.
- [ ] Suíte → PASS. Commit `feat: noticias do clube`

### Task 3: MVPs do dia e do mês

**Files:** Create `site/src/dominio/mvps.ts` (+ `.test.ts`).

**Produces:**
- `export function periodoDeBrasilia(agora: Date, tipo: 'dia' | 'mes'): { inicio: Date; fim: Date }`.
- `export async function mvpsDoPeriodo(bd, periodo: { inicio: Date; fim: Date }, limite: number): Promise<{ id; apelido; avatarUrl; mvps: number; kills: number; partidas: number }[]>` — só `encerrada`, `encerradaEm` em `[inicio, fim)`, ordem `mvps desc, kills desc, apelido asc`, só quem tem `mvps > 0`.

- [ ] Testes que falham: `periodoDeBrasilia(new Date('2026-11-01T02:30:00Z'), 'mes')` = outubro (`inicio 2026-10-01T03:00Z`, `fim 2026-11-01T03:00Z`); dia de `2026-11-07T01:00Z` começa `2026-11-06T03:00Z`; soma entre partidas; desempate kills e apelido; partida cancelada não conta; partida de ontem não entra no dia.
- [ ] Implementar; suíte → PASS. Commit `feat: mvp do dia e do mes`

### Task 4: Atualizações do CS2 (Steam + tradução)

**Files:** Create `site/src/dominio/noticias-steam.ts` (+ `.test.ts`, usa `exemplos/steam-noticias.json`); `site/src/servidor-jogo/tradutor.ts` (cliente Anthropic); `npm install @anthropic-ai/sdk`.

**Produces:**
- `export function limparConteudo(bbcode: string): string` — tira `[tags]`, HTML e espaços repetidos; corta em 4.000.
- `export type Traduzir = (entrada: { titulo: string; conteudo: string }) => Promise<{ titulo: string; resumo: string } | null>`.
- `export async function atualizarNoticiasSteam(bd, buscar: (url: string) => Promise<unknown>, traduzir: Traduzir | null, agora?)` — busca (se `cacheExterno['steam:ultima-busca']` tem menos de 30 min, não busca), guarda novas por `gid`, traduz as sem tradução com `tentativas < 3` (incrementa em falha).
- `export async function noticiasSteamDaTela(bd, limite = 4)` — `{ gid, titulo (pt ou original), resumo (pt ou null), url, publicadaEm }`.
- `tradutor.ts`: `export function criarTradutor(chave: string | undefined): Traduzir | null` — `new Anthropic({ apiKey })`, `client.beta.messages.parse` (ou `messages.parse` se `fallbacks` não pedir beta — conferir no SDK instalado) com `model: 'claude-opus-5-5'`, `max_tokens: 1024`, `output_config: { effort: 'low', format: zodOutputFormat(z.object({ titulo: z.string(), resumo: z.string() })) }`, `fallbacks: 'default'`, beta `server-side-fallback-2026-07-01`; instrução: traduzir para português do Brasil, título curto e informativo (não "Atualização do CS2" genérico se o conteúdo disser o que mudou), resumo de 1–2 frases; `stop_reason === 'refusal'` ou erro → `null` (erros pelas classes do SDK).

- [ ] Testes que falham (sem rede): a amostra gera 6 itens só do feed oficial; segunda chamada em 10 min não busca; tradutor falso grava `tituloPt`/`resumoPt`; tradutor que devolve `null` 3 vezes para de tentar e a tela mostra o original; `limparConteudo` de `[p]\[ GAMEPLAY ][/p][list][*][p]Bomb...` sai sem colchetes; conteúdo de 10.000 caracteres sai com 4.000.
- [ ] Implementar; `tradutor.ts` não tem teste de rede — conferir com `tsc`. Suíte → PASS. Commit `feat: atualizacoes do cs2 traduzidas`

### Task 5: Tier S (Liquipedia)

**Files:** Create `site/src/dominio/tier-s.ts` (+ `.test.ts`, usa `exemplos/liquipedia-s-tier.json` e `exemplos/liquipedia-matches.json`); `site/src/servidor-jogo/liquipedia.ts` (cliente com limites); `npm install node-html-parser`.

**Produces:**
- `export const TIMES_BRASILEIROS = ['FURIA', 'MIBR', 'paiN', 'Imperial', 'Legacy', 'Fluxo', 'RED Canids', 'ODDIK'] as const`.
- `export function lerTorneiosSTier(html: string, agora: Date): { nome; pagina; inicio: string; fim: string; premiacao: string | null }[]` — linhas da tabela `tournaments-listing`; devolve só os em andamento (`inicio <= hoje <= fim`, datas como na tabela, comparadas no dia).
- `export function lerJogos(html: string): { pagina: string; torneio: string; time1: string; time2: string; placar: string | null; quando: Date | null }[]` — cada `.match-info`: times de `.block-team .name`, torneio do link em `.match-info-tournament` (`pagina` = caminho sem `#...`), hora de `.timer-object[data-timestamp]`, placar se houver.
- `export function jogosBrasileiros(jogos, torneios)` — jogo cujo `pagina` começa com a página de um torneio em andamento e tem um time da lista.
- `export async function atualizarTierS(bd, pedir: (params: Record<string,string>) => Promise<unknown>, agora?)` — se `cacheExterno['tier-s']` tem menos de 10 min, não faz nada; pede `S-Tier_Tournaments` e `Liquipedia:Matches` (`action=parse`, `prop=text`), grava `{ torneios, jogos, atualizadoEm }`; em erro, mantém o dado anterior.
- `export async function tierSDaTela(bd)`.
- `liquipedia.ts`: `export function criarClienteLiquipedia(contato: string | undefined): ((params) => Promise<unknown>) | null` — `fetch` com `User-Agent` da Global Constraint, `Accept-Encoding: gzip`, fila que espera 2 s entre pedidos e 30 s entre `parse`; sem contato → `null`.

- [ ] Testes que falham: a amostra de S-Tier traz o IEM Beijing 2026 em andamento em `2026-11-07`; a amostra de jogos traz Legacy x FURIA do EPL e o torneio sem `#`; `jogosBrasileiros` filtra só Tier S + BR; erro na segunda chamada mantém o cache antigo; chamada dentro de 10 min não pede nada; a fila do cliente (com relógio falso) espera 30 s entre dois `parse`.
- [ ] Implementar; suíte → PASS. Commit `feat: tier s com os times brasileiros`

### Task 6: Bombando agora

**Files:** Create `site/src/dominio/bombando.ts` (+ `.test.ts`).

**Produces:**
- `export async function bombandoAgora(bd, controlador, hostDaDiversao): Promise<{ cartoes: { tipo: 'sala' | 'mix' | 'diversao'; titulo: string; ocupacao: string; jogando: number; href: string }[]; aoVivo: Partida[] }>` — salas sem partida e incompletas (mais cheias primeiro), Mix se `total > 0`, servidores da Diversão ativos com `jogando > 0` (via `situacaoDoServidor`, link `linkDeEntrar`), ordena por `jogando` desc, até 4; `aoVivo` = `partidasEmAndamento` em `ao_vivo`, até 3.

- [ ] Testes que falham: sala 4/5 vem antes de 2/5; sala completa ou em partida não entra; Mix vazio não entra; servidor fora do ar (controlador falso com host em falha) some; limite de 4.
- [ ] Implementar; suíte → PASS. Commit `feat: bombando agora`

### Task 7: Página `/inicio`, menu e tarefas do servidor

**Files:** Create `site/src/app/(membros)/inicio/page.tsx`; modify `site/src/auth/destino.ts` (+ teste existente), `menu.tsx`, `banner.tsx`, `site/src/instrumentation.ts` (duas tarefas: Steam a cada 30 min, Tier S a cada 10 min, cada uma com trava em memória como a varredura), `estilos/global.css`.

- [ ] Teste que falha em `destino.test.ts`: `/` de ativo → `/inicio`; jogador em `/equipe` → `/inicio`.
- [ ] Página no layout B lendo: `bombandoAgora`, `ultimasNoticias`, `mvpsDoPeriodo` (dia, mês, top 5), `noticiasSteamDaTela`, `tierSDaTela`. Estados vazios do spec. "Fonte: Liquipedia" com link. `Atualizar` a cada 30 s.
- [ ] Conferir no navegador (dev local com `dev-preencher`/`dev-fluxo`; notícia criada pela tela da equipe; Steam e Tier S rodando uma vez com as amostras se a chave/contato não existirem localmente). Fotografar.
- [ ] Suíte, `tsc`, `eslint` → PASS. Commit `feat: tela principal do clube`

### Task 8: Chave, publicação e primeiro patch de aviso

**Files:** Create `site/scripts/guardar-segredos-portal.sh` (pede `ANTHROPIC_API_KEY` sem mostrar e grava `LIQUIPEDIA_CONTATO` passado como argumento; troca as linhas no `.env.local`, dono `magnatas`, modo 600; reinicia `magnatas-site`; nunca imprime os valores).

- [ ] Publicar (como da última vez: arquivos, `npm ci`, `db:migrar`, `build`, reinício). Conferir 200 em `/inicio`.
- [ ] Passar ao dono o comando do script para ele colar a chave na VPS; rodar o contato junto.
- [ ] Conferir no log, depois de 10 e 30 min, que Tier S e Steam gravaram dados (sem imprimir segredos).
- [ ] Publicar o primeiro patch de aviso com `noticia:publicar`, contando o fluxo novo de partidas e a tela principal.
