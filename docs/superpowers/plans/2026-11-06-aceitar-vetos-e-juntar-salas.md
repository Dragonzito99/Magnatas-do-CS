# Aceitar partida, vetos, juntar salas e pós-partida — Plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Partida competitiva no estilo da Gamers Club: 30 s para aceitar, punição progressiva, vetos pelos líderes com cara ou coroa, juntar salas, aviso ao vivo, voltar para a partida e tela pós-partida no estilo HLTV com MVP e elogios.

**Architecture:** A partida ganha dois estados antes do servidor (`aguardando_aceite`, `vetando`). Os prazos são conferidos no servidor: cada ação confere o prazo, e a varredura (`varrer`, que já roda sozinha em `instrumentation.ts`) resolve o que venceu. Regras novas ficam em arquivos de domínio próprios (`aceites.ts`, `faltas.ts`, `vetos.ts`, `juncoes.ts`, `elogios.ts`, `desempenho.ts`); as páginas só chamam o domínio. O aviso ao vivo é um Route Handler de Server-Sent Events que o navegador mantém aberto mesmo com a aba escondida.

**Tech Stack:** Next.js 16 (ler `site/AGENTS.md` e o guia em `node_modules/next/dist/docs/` antes de mexer em rota ou página), Drizzle 0.45 + PostgreSQL, Vitest com PGlite (`criarBancoDeTeste` aplica a pasta `drizzle/`), zod.

**Spec:** `docs/superpowers/specs/2026-11-06-aceitar-vetos-e-juntar-salas-design.md`

## Global Constraints

- Prazos: aceitar **30 s**; cada veto **20 s**; pedido de junção expira em **60 s** (o mesmo do desafio).
- Mapas dos vetos: os 7 de `MAPAS` em `site/src/dominio/partidas.ts`, na ordem de lá.
- Punição por falta (só desafio), contando faltas dos últimos **30 dias** e não anuladas: 1ª **3 min**, 2ª **15 min**, 3ª **30 min**, 4ª **1 dia** (com aviso de que a próxima é banimento), 5ª **banimento permanente** (conta `banido`, sessões apagadas, CPF em `cpfs_banidos`, motivo e data gravados).
- Reverter um banimento anula as faltas da pessoa; a escada recomeça do 1º.
- Mix: aceitar também, **sem punição**; quem não aceitou sai da fila; quem aceitou volta para a fila com o `entrouEm` de antes. Mapa do Mix continua sorteado.
- Partida cancelada pela equipe, ou por suspensão/banimento, antes de todos aceitarem: ninguém leva falta.
- Elogios: tipos `bom_de_mira`, `gente_boa`, `lider`, `bom_de_equipe` (rótulos: Bom de mira, Gente boa, Líder, Bom de equipe). Um por elogiado por partida, nunca a si mesmo, só quem jogou, só partida `encerrada`. Elogio não dá XP.
- Rating = HLTV Rating 1.0: `(K/R/0.679 + 0.7·((R−D)/R/0.317) + (1k+4·2k+9·3k+16·4k+25·5k)/R/1.277) / 2.7`, duas casas.
- MVP = mais estrelas de MVP; empate → mais kills; empate → menor apelido.
- Textos em português do Brasil, como o resto do site. Código e nomes em português, como o resto do site.
- Rodar `npx tsc --noEmit -p .`, `npx eslint src scripts` e `npx vitest run` antes de cada commit (usar o Node em `G:/Magnatas-ferramentas/node` e `npm_config_cache=G:/Magnatas-ferramentas/npm-cache`, `TEMP`/`TMP=G:/Magnatas-ferramentas/tmp`).

## Review Focus

1. Duas pessoas aceitando ao mesmo tempo o último aceite, ou aceitar no exato fim do prazo enquanto a varredura cancela: a partida tem de sair num estado só (travar a linha da partida com `for('update')`, como `aplicarEvento`). Teste em Task 2.
2. Líder que sai da sala (pela varredura de 5 min) no meio dos vetos: a sala está em partida e não perde ninguém (`fecharSalasAbandonadas` já pula sala em partida), mas o veto passa a quem é líder agora — conferir pelo `liderId` atual da sala ligada à partida. Teste em Task 4.
3. Evento do MatchZy sem os campos novos (`mvp`, `kast`, `1k`…`5k`): o evento continua valendo, os campos ficam 0. Teste em Task 6.
4. Pessoa bloqueada tentando criar sala, entrar em sala ou no Mix por qualquer caminho: todos passam por `exigirLivre`. Teste em Task 3.
5. Junção aceita quando uma das salas mudou de tamanho depois do pedido e a soma passou de 5: recusar com erro, sem mover ninguém. Teste em Task 5.

---

### Task 1: Banco de dados

**Files:**
- Modify: `site/src/bd/esquema.ts`
- Modify: `site/src/dominio/disponibilidade.ts` (`ESTADOS_ATIVOS_DE_PARTIDA`)
- Modify: `site/src/dominio/textos-da-partida.ts` (textos dos estados novos)
- Create: migração gerada por `npm run db:gerar` em `site/drizzle/`
- Test: `site/src/bd/esquema.test.ts` (criar se não existir)

**Interfaces — Produces:**
- `estadoPartida` ganha `'aguardando_aceite'` e `'vetando'` (antes de `'aguardando_servidor'`). `ESTADOS_ATIVOS_DE_PARTIDA = ['aguardando_aceite', 'vetando', 'aguardando_servidor', 'carregando', 'aguardando_jogadores', 'ao_vivo']`.
- `partidas.mapa` passa a aceitar `null` (definido nos vetos/sorteio). Novas colunas em `partidas`: `aceiteAte timestamp null`, `primeiroAVetar integer null` (1 ou 2), `vetoAte timestamp null`.
- `partidaJogadores`: `aceitouEm timestamp null`, `entrouNaFilaEm timestamp null` (só Mix), `mvps`, `kast`, `k1`, `k2`, `k3`, `k4`, `k5` (integer not null default 0).
- Tabela `vetos`: `partidaId` (fk), `ordem integer`, `time integer` (1 ou 2), `mapa text`, `automatico boolean`, `criadoEm`; pk (`partidaId`, `ordem`); único (`partidaId`, `mapa`).
- Tabela `faltas`: `id`, `usuarioId` (fk), `partidaId` (fk), `criadoEm`, `bloqueadoAte timestamp null`, `anuladaEm timestamp null`; índice em `usuarioId`.
- Tabela `juncoes`: igual a `desafios` (`salaOrigemId`, `salaAlvoId` sem fk, `estado estadoDesafio`, `expiraEm`, `criadoEm`).
- Enum `tipoElogio = ['bom_de_mira', 'gente_boa', 'lider', 'bom_de_equipe']`; tabela `elogios`: `partidaId` (fk), `autorId` (fk), `elogiadoId` (fk), `tipo`, `criadoEm`; pk (`partidaId`, `autorId`, `elogiadoId`).
- `banimentos.propostoPor` passa a aceitar `null` (= o sistema). As leituras que fazem `innerJoin` no proponente (`banimentos.ts` linha ~212, `ficha.ts` linha ~64) viram `leftJoin` e mostram `'Sistema'` quando nulo.

- [ ] **Step 1: Teste que falha** — em `esquema.test.ts`: insere uma partida com `estado: 'aguardando_aceite'` e `mapa: null`; insere um `veto`, uma `falta`, uma `juncao`, um `elogio`; insere um banimento com `propostoPor: null`; tenta inserir dois `elogios` iguais e espera erro de chave.
- [ ] **Step 2: Rodar** `npx vitest run src/bd/esquema.test.ts` — Expected: FAIL (colunas/tabelas não existem).
- [ ] **Step 3: Mudar o esquema** e rodar `npm run db:gerar`. Conferir que a migração usa `ALTER TYPE ... ADD VALUE ... BEFORE 'aguardando_servidor'`. Se o PGlite recusar `ADD VALUE` dentro da transação da migração, separar os `ADD VALUE` numa migração própria (rodar `db:gerar` duas vezes).
- [ ] **Step 4: Ajustar o código que quebrou com `mapa` nulo** (`nomeDoMapa`, `configDaPartida`, ranking): `tsc` aponta cada um. `configDaPartida` devolve `null` se `mapa` for nulo.
- [ ] **Step 5: Rodar** `npx tsc --noEmit -p . && npx vitest run` — Expected: tudo passa.
- [ ] **Step 6: Commit** `feat: banco para aceite, vetos, faltas, juncoes e elogios`

### Task 2: Aceitar a partida

**Files:**
- Create: `site/src/dominio/aceites.ts`, `site/src/dominio/aceites.test.ts`
- Modify: `site/src/dominio/partidas.ts` (`criarPartida`), `desafios.ts` (`aceitarDesafio`), `mix.ts` (`entrarNoMix`), `varredura.ts` (`varrer`)

**Interfaces:**
- Consumes: Task 1; `registrarFalta` de Task 3 (escrever Task 3 antes se preferir; aqui pode começar com a chamada e o teste de punição fica na Task 3).
- Produces:
  - `export const PRAZO_DO_ACEITE_MS = 30_000`
  - `criarPartida(tx, { tipo, time1, time2, agora?, filaDoMix? })`: cria em `aguardando_aceite`, `mapa: null`, `aceiteAte = agora + 30 s`; `filaDoMix?: Map<usuarioId, Date>` grava `entrouNaFilaEm`.
  - `export async function aceitarPartida(bd: Bd, ator: Pick<Usuario,'id'>, partidaId: string, agora = new Date()): Promise<void>` — marca `aceitouEm`; se for o 10º, chama `seguirDepoisDoAceite`. Erros: `AceiteIndisponivel` (fora do prazo, estado errado, não joga a partida).
  - `export async function resolverAceitesVencidos(bd: Bd, agora = new Date()): Promise<void>` — para cada partida `aguardando_aceite` com `aceiteAte <= agora`, chama `cancelarPorFaltaDeAceite`.
  - `seguirDepoisDoAceite(tx, partida, agora)`: desafio → `vetando`, `primeiroAVetar = randomInt(1, 3)`, `vetoAte = agora + 20 s`; Mix → `mapa` sorteado de `MAPAS`, `aguardando_servidor`, `estadoDesde = agora`.
  - `cancelarPorFaltaDeAceite(tx, partida, agora)`: `finalizarPartida(tx, id, { estado: 'cancelada', vencedor: null })`; desafio → para cada um sem `aceitouEm`: `tirarDaSala` + `registrarFalta(tx, usuarioId, partidaId, agora)`; Mix → quem aceitou volta para `filaMix` com `entrouEm = entrouNaFilaEm`, quem não aceitou não volta.
  - `export async function aceitesDaPartida(bd, partidaId): Promise<{ usuarioId: string; aceitou: boolean }[]>`
- `varrer` ganha a etapa `() => resolverAceitesVencidos(bd, agora)` antes de `alocarServidores`.

- [ ] **Step 1: Testes que falham** em `aceites.test.ts` (usar `AGORA` fixo e os auxiliares de `desafios.test.ts`/`mix.test.ts` como modelo):
  - `aceitar desafio cria a partida aguardando aceite, sem mapa e com 30 s` → `estado 'aguardando_aceite'`, `mapa null`, `aceiteAte = AGORA + 30000`.
  - `os 10 aceitando, o desafio vai para os vetos com o cara ou coroa feito` → `estado 'vetando'`, `primeiroAVetar` em `[1, 2]`, `vetoAte = AGORA + 20000`.
  - `os 10 aceitando, o mix sorteia o mapa e espera servidor` → `estado 'aguardando_servidor'`, `MAPAS` contém `mapa`.
  - `aceitar depois dos 30 s é recusado` → `rejects.toThrow(AceiteIndisponivel)`.
  - `quem não joga a partida não aceita` → `AceiteIndisponivel`.
  - `vencido no desafio: partida cancelada, quem não aceitou sai da sala, as salas ficam livres com o resto` → `estado 'cancelada'`, `salas.partidaId null`, membro faltoso fora de `sala_membros`, demais continuam.
  - `vencido no mix: quem aceitou volta para a fila na ordem de antes, quem não aceitou não volta` → `filaMix` com 9 linhas e `entrouEm` iguais aos de antes.
  - `alguém suspenso ou banido durante o aceite: a partida cai sem falta para ninguém` → suspender uma conta (estado `'suspenso'`), vencer o prazo; `faltas` vazia. Regra em `cancelarPorFaltaDeAceite`: se algum jogador da partida não está `'ativo'`, ninguém leva falta (os faltosos ativos ainda saem da sala).
  - `aceite simultâneo do último jogador e varredura no fim do prazo deixam um estado só` → `Promise.allSettled([aceitarPartida(..., AGORA+29_999), resolverAceitesVencidos(bd, AGORA+30_000)])`; estado final é `'vetando'` ou `'cancelada'`, nunca os dois efeitos (nenhuma falta se ficou `'vetando'`).
- [ ] **Step 2: Rodar** `npx vitest run src/dominio/aceites.test.ts` — Expected: FAIL.
- [ ] **Step 3: Implementar** `aceites.ts` e as mudanças em `criarPartida`, `aceitarDesafio`, `entrarNoMix`, `varrer`. Toda função que muda a partida trava a linha (`select ... for('update')`) e confere estado e prazo de novo dentro da transação. Ajustar os testes antigos que esperavam `aguardando_servidor` logo após o desafio/mix.
- [ ] **Step 4: Rodar** `npx vitest run` — Expected: tudo passa.
- [ ] **Step 5: Commit** `feat: 30 segundos para aceitar a partida`

### Task 3: Faltas e bloqueio

**Files:**
- Create: `site/src/dominio/faltas.ts`, `site/src/dominio/faltas.test.ts`
- Modify: `site/src/dominio/disponibilidade.ts` (`exigirLivre`), `site/src/dominio/banimentos.ts` (`reverterBanimento`, `tirarDaFilaEDaSala` exportado ou equivalente), `site/src/app/(membros)/salas/acoes.ts` e `mix/acoes` (mensagem do bloqueio)

**Interfaces — Produces:**
- `export const PUNICOES_EM_MINUTOS = [3, 15, 30, 1440] as const`; `export const JANELA_DAS_FALTAS_MS = 30 * 24 * 60 * 60_000`
- `export async function registrarFalta(tx: Transacao, usuarioId: string, partidaId: string, agora: Date): Promise<void>` — conta faltas não anuladas com `criadoEm > agora − 30 dias` (incluindo esta); 1ª a 4ª gravam `bloqueadoAte = agora + PUNICOES_EM_MINUTOS[n−1]`; 5ª chama `banirPorFaltas`.
- `banirPorFaltas(tx, usuarioId, agora)`: mesmo efeito de `confirmarBanimento` sem ator: `banimentos` com `propostoPor: null`, `estado 'confirmado'`, `motivo 'Não aceitou a partida 5 vezes em 30 dias.'`, `decididoEm: agora`, `cpfHmac`; conta `banido`; `cpfs_banidos`; apaga `sessoes`; `registrarAuditoria` com `atorId: null`, `acao: 'banir_por_faltas'`. A expulsão dos servidores fica de fora (a pessoa não está em servidor nenhum: a partida nem começou).
- `export async function situacaoDasFaltas(bd: Bd, usuarioId: string, agora = new Date()): Promise<{ faltas: number; bloqueadoAte: Date | null; ultimaChance: boolean }>` — `ultimaChance` é `faltas === 4`.
- `export class Bloqueado extends Error { constructor(public ate: Date) }` — `exigirLivre` lança se houver falta com `bloqueadoAte > agora` e `anuladaEm` nulo.
- `reverterBanimento` passa a gravar `anuladaEm = now` em todas as faltas da pessoa.

- [ ] **Step 1: Testes que falham** em `faltas.test.ts`:
  - `test.each([[1, 3], [2, 15], [3, 30], [4, 1440]])('a falta %i bloqueia %i minutos')` → `bloqueadoAte - AGORA = min * 60000`.
  - `a 5ª falta em 30 dias bane direto, com CPF bloqueado e motivo` → `usuarios.estado 'banido'`, linha em `cpfs_banidos`, sessões apagadas, `banimentos.propostoPor null`, motivo acima.
  - `falta com mais de 30 dias não conta` → 4 faltas antigas + 1 nova = bloqueio de 3 min.
  - `bloqueado não cria sala, não entra em sala nem no mix` → os três `rejects.toThrow(Bloqueado)`; depois de `bloqueadoAte`, passam.
  - `reverter o banimento anula as faltas e a próxima recomeça em 3 minutos`.
  - `situacaoDasFaltas avisa a última chance na 4ª falta` → `ultimaChance true`.
- [ ] **Step 2: Rodar** `npx vitest run src/dominio/faltas.test.ts` — Expected: FAIL.
- [ ] **Step 3: Implementar.** `exigirLivre` recebe `agora` opcional. Nas ações de sala e Mix, `Bloqueado` vira o código de erro `bloqueado` com a hora (`?erro=bloqueado&ate=<ISO>`), e a página mostra "Você não aceitou uma partida. Pode jogar de novo às HH:MM." e, na 4ª falta, "Se não aceitar de novo, sua conta será banida.".
- [ ] **Step 4: Rodar** `npx vitest run` — Expected: tudo passa.
- [ ] **Step 5: Commit** `feat: punicao progressiva por nao aceitar partida`

### Task 4: Vetos

**Files:**
- Create: `site/src/dominio/vetos.ts`, `site/src/dominio/vetos.test.ts`
- Modify: `site/src/dominio/varredura.ts`

**Interfaces — Produces:**
- `export const PRAZO_DO_VETO_MS = 20_000`
- `export function vezDeVetar(primeiro: 1 | 2, vetosFeitos: number): 1 | 2` — alterna a partir de `primeiro`.
- `export async function vetarMapa(bd: Bd, lider: Pick<Usuario,'id'>, partidaId: string, mapa: string, agora = new Date()): Promise<void>` — só o `liderId` **atual** da sala ligada à partida (`salas.partidaId`) do time da vez; `mapa` em `MAPAS` e ainda não vetado; dentro do prazo. Erros: `VetoIndisponivel`, `SemPermissaoNaSala`.
- `export async function resolverVetosVencidos(bd: Bd, agora = new Date()): Promise<void>` — para `vetando` com `vetoAte <= agora`, veta um mapa aleatório (`automatico: true`) pelo time da vez.
- Depois de cada veto: se sobrou 1 mapa → `partidas.mapa = sobra`, `aguardando_servidor`, `estadoDesde = agora`, `vetoAte = null`; senão `vetoAte = agora + 20 s`.
- `export async function vetosDaPartida(bd, partidaId): Promise<{ primeiroAVetar: 1|2; vez: 1|2|null; vetoAte: Date|null; vetados: { mapa: string; time: 1|2; automatico: boolean }[]; restantes: string[] }>`
- `varrer` ganha `() => resolverVetosVencidos(bd, agora)` antes de `alocarServidores`.

- [ ] **Step 1: Testes que falham**:
  - `vezDeVetar alterna a partir de quem ganhou o cara ou coroa` → `vezDeVetar(2, 0) === 2`, `vezDeVetar(2, 1) === 1`.
  - `6 vetos alternados deixam o mapa da partida e chamam o servidor` → `estado 'aguardando_servidor'`, `mapa` é o que sobrou.
  - `fora da vez, mapa já vetado ou mapa fora da lista é recusado`.
  - `quem não é líder não veta`.
  - `líder que mudou durante os vetos: o novo líder veta` (trocar `salas.liderId` no meio).
  - `veto vencido vira aleatório pelo time da vez e o prazo recomeça` → `automatico true`, `vetoAte = AGORA + 40000` após resolver em `AGORA + 20000`.
- [ ] **Step 2: Rodar** `npx vitest run src/dominio/vetos.test.ts` — Expected: FAIL.
- [ ] **Step 3: Implementar** com trava da partida em toda mudança.
- [ ] **Step 4: Rodar** `npx vitest run` — Expected: tudo passa.
- [ ] **Step 5: Commit** `feat: vetos de mapa pelos lideres com cara ou coroa`

### Task 5: Juntar salas

**Files:**
- Create: `site/src/dominio/juncoes.ts`, `site/src/dominio/juncoes.test.ts`
- Modify: `site/src/dominio/varredura.ts` (expirar), `site/src/dominio/salas.ts` (`removerDaSala` cancela junções pendentes da sala, como faz com desafios)

**Interfaces — Produces:** mesmas formas de `desafios.ts`:
- `pedirJuncao(bd, lider, salaAlvoId, agora?)`, `aceitarJuncao(bd, lider, juncaoId, agora?)`, `recusarJuncao(bd, lider, juncaoId)`, `cancelarJuncao(bd, lider, juncaoId)`, `juncoesDaSala(bd, salaId, agora?)` → `{ id, expiraEm, recebido: boolean, outraSalaNome: string, outraSalaTamanho: number }[]`, `expirarJuncoes(bd, agora)`.
- Erros: `JuncaoIndisponivel`, `SalaCheia` (soma > 5), `SalaEmPartida`, `SemPermissaoNaSala`.
- Aceitar: trava as duas salas; confere de novo soma ≤ 5 e nenhuma em partida; move os membros da origem para a alvo (`entrouEm` = agora), apaga a sala de origem e cancela os desafios e junções pendentes dela.

- [ ] **Step 1: Testes que falham**: pedir e aceitar move todos para a sala que aceitou e a outra some; líder da alvo continua líder e a sala mantém o nome; soma maior que 5 não pede; sala que cresceu depois do pedido faz o aceite falhar sem mover ninguém (`SalaCheia`); pedido vence em 60 s; só líderes pedem e aceitam; sala em partida não pede nem aceita.
- [ ] **Step 2: Rodar** `npx vitest run src/dominio/juncoes.test.ts` — Expected: FAIL.
- [ ] **Step 3: Implementar.**
- [ ] **Step 4: Rodar** `npx vitest run` — Expected: tudo passa.
- [ ] **Step 5: Commit** `feat: juntar salas`

### Task 6: Números completos da partida, Rating e MVP

**Files:**
- Create: `site/src/dominio/desempenho.ts`, `site/src/dominio/desempenho.test.ts`
- Modify: `site/src/dominio/eventos.ts`, `site/src/dominio/eventos.test.ts`, `site/src/dominio/partidas.ts` (`detalheDaPartida`, `JogadorDaPartida`)

**Interfaces — Produces:**
- `eventos.ts`: o `stats` do jogador aceita, todos opcionais com `default(0)`: `mvp`, `kast`, `'1k'`, `'2k'`, `'3k'`, `'4k'`, `'5k'` (nomes do formato Get5 que o MatchZy usa) e grava em `mvps`, `kast`, `k1`…`k5`.
- `export function ratingHltv1(j: { kills: number; deaths: number; rodadas: number; k1..k5 }): number` (duas casas; 0 rodadas → 0).
- `export function mvpDaPartida<T extends { mvps: number; kills: number; apelido: string }>(jogadores: T[]): T | null` (null se ninguém tem rodada).
- `export function linhaHltv(j): { kd: string; saldo: number; adr: number; kast: number; hs: number; rating: number }` — `kd = "K-D"`, `saldo = K − D`, `adr = round(dano/rodadas)`, `kast = round(kast/rodadas·100)`, `hs = round(hs/kills·100)`.
- `JogadorDaPartida` ganha `headshotKills`, `mvps`, `kast`, `k1`…`k5`.

- [ ] **Step 1: Testes que falham**:
  - `ratingHltv1({ kills: 20, deaths: 15, rodadas: 24, k1: 8, k2: 3, k3: 2, k4: 0, k5: 0 }) === 1.22`
  - `ratingHltv1({ kills: 5, deaths: 20, rodadas: 20, k1: 5, k2: 0, k3: 0, k4: 0, k5: 0 }) === 0.21`
  - `mvpDaPartida` escolhe mais MVPs; empate → mais kills; empate → menor apelido.
  - `linhaHltv` com 0 kills e 0 rodadas não divide por zero (tudo 0).
  - `eventos.test.ts`: `round_end` com `mvp: 3, kast: 15, '2k': 2` grava esses números; `round_end` sem os campos novos continua gravando kills e deixa os novos em 0.
- [ ] **Step 2: Rodar** `npx vitest run src/dominio/desempenho.test.ts src/dominio/eventos.test.ts` — Expected: FAIL.
- [ ] **Step 3: Implementar.**
- [ ] **Step 4: Rodar** `npx vitest run` — Expected: tudo passa.
- [ ] **Step 5: Commit** `feat: numeros completos, rating e mvp da partida`

### Task 7: Elogios

**Files:**
- Create: `site/src/dominio/elogios.ts`, `site/src/dominio/elogios.test.ts`

**Interfaces — Produces:**
- `export const TIPOS_DE_ELOGIO = [{ valor: 'bom_de_mira', nome: 'Bom de mira' }, { valor: 'gente_boa', nome: 'Gente boa' }, { valor: 'lider', nome: 'Líder' }, { valor: 'bom_de_equipe', nome: 'Bom de equipe' }] as const`
- `export async function elogiar(bd, autor, { partidaId, elogiadoId, tipo }): Promise<void>` — erros `ElogioIndisponivel` (partida não encerrada, autor ou elogiado não jogaram, a si mesmo), `ElogioRepetido`.
- `export async function elogiosFeitos(bd, partidaId, autorId): Promise<Set<string>>` (ids já elogiados, para a página esconder).
- `export async function elogiosDoJogador(bd, usuarioId): Promise<{ tipo: string; nome: string; total: number }[]>` (só tipos com total > 0, maior primeiro).

- [ ] **Step 1: Testes que falham**: elogiar grava; segundo elogio ao mesmo na mesma partida → `ElogioRepetido`; a si mesmo, sem ter jogado, a quem não jogou, ou partida não encerrada → `ElogioIndisponivel`; `elogiosDoJogador` soma por tipo entre partidas.
- [ ] **Step 2: Rodar** `npx vitest run src/dominio/elogios.test.ts` — Expected: FAIL.
- [ ] **Step 3: Implementar.**
- [ ] **Step 4: Rodar** `npx vitest run` — Expected: tudo passa.
- [ ] **Step 5: Commit** `feat: elogios entre jogadores`

### Task 8: Telas da partida e das salas

**Files:**
- Modify: `site/src/app/(membros)/partidas/[id]/page.tsx`, `.../partidas/[id]/acoes.ts`
- Create: `site/src/app/(membros)/partidas/[id]/cara-ou-coroa.tsx` (client, animação curta), `site/src/app/(membros)/partidas/[id]/relogio.tsx` (client, conta até um `Date` vindo do servidor)
- Modify: `site/src/app/(membros)/salas/page.tsx`, `salas/acoes.ts`, `site/src/app/(membros)/mix/page.tsx`
- Modify: `site/src/app/(membros)/jogadores/[id]/page.tsx` (elogios no perfil)
- Modify: `site/src/app/(membros)/layout.tsx` (aviso "Você está em uma partida — Voltar para a partida", usando `partidaAtualDe`)
- Modify: CSS do site (`site/src/app/globals.css` ou onde ficam as classes `painel`, `tabela`, `cartao-escuro`)

**Interfaces — Consumes:** `aceitarPartida`, `aceitesDaPartida` (T2); `situacaoDasFaltas`, `Bloqueado` (T3); `vetarMapa`, `vetosDaPartida` (T4); `pedirJuncao`… `juncoesDaSala` (T5); `linhaHltv`, `mvpDaPartida` (T6); `elogiar`, `elogiosFeitos`, `elogiosDoJogador`, `TIPOS_DE_ELOGIO` (T7).

A página da partida escolhe a tela pelo estado:
- `aguardando_aceite`: botão grande **Aceitar** (só para quem joga e ainda não aceitou), relógio até `aceiteAte`, os 10 avatares com marca de quem aceitou.
- `vetando`: resultado do cara ou coroa ("Começa: sala de X"), relógio até `vetoAte`, os 7 mapas (vetados riscados com o nome do time e "automático" quando for), botões de vetar só para o líder da vez.
- `aguardando_servidor` em diante, enquanto ativa: a tela de hoje (servidor, conectar, copiar IP), que fica até a partida acabar.
- `encerrada`: MVP em destaque; dois quadros `Jogador | K-D | +/- | ADR | KAST | HS% | Rating | XP`; formulário de elogio (escolhe jogador e tipo; some quem já foi elogiado); denúncia de hoje.
- `cancelada` por falta de aceite: "Partida cancelada: nem todos aceitaram."

Salas: botão **Juntar** nas salas onde a soma cabe (só líder); lista de pedidos de junção recebidos/enviados com aceitar/recusar/cancelar (mesmo desenho dos desafios); mensagem de bloqueio de Task 3.

- [ ] **Step 1:** Implementar as telas. Ações novas em `acoes.ts`: `aceitar`, `vetar`, `elogiarJogador`, `juntar`, `aceitarJuncao`, `recusarJuncao`, `cancelarJuncao`, cada uma mapeando os erros do domínio para `?erro=` como as ações de hoje.
- [ ] **Step 2: Conferir no navegador** com `npm run dev` e `scripts/dev-preencher.ts` (salas fictícias): criar duas salas completas, desafiar, aceitar com as contas, vetar, ver a partida esperar servidor; deixar o prazo vencer e ver a falta e o bloqueio; juntar duas salas de 2 e 3; abrir uma partida `encerrada` com números e elogiar. Fotografar cada tela.
- [ ] **Step 3: Rodar** `npx tsc --noEmit -p . && npx eslint src scripts && npx vitest run` — Expected: tudo passa.
- [ ] **Step 4: Commit** `feat: telas de aceite, vetos, pos-partida e juntar salas`

### Task 9: Aviso ao vivo

**Files:**
- Create: `site/src/app/api/avisos/route.ts` (Route Handler, `GET`, `text/event-stream`, runtime Node)
- Create: `site/src/app/(membros)/aviso-de-partida.tsx` (client), usado no `layout.tsx`
- Create: `site/public/sons/partida-encontrada.mp3` (som curto; gerar um bipe com a biblioteca de áudio do projeto ou usar um arquivo livre de direitos — perguntar ao dono antes de baixar qualquer arquivo)
- Test: `site/src/dominio/aceites.test.ts` (função pura do aviso)

**Interfaces — Produces:**
- `export async function avisoPendente(bd, usuarioId, agora = new Date()): Promise<{ partidaId: string; aceiteAte: Date } | null>` em `aceites.ts`: partida `aguardando_aceite` da pessoa, ainda sem `aceitouEm`.
- Rota: confere a sessão (`usuarioAtual`); a cada 2 s chama `avisoPendente` e envia `event: partida` com `{ partidaId, aceiteAte }` quando mudar; comentário `: ping` a cada 20 s para o Caddy e o navegador manterem a conexão; fecha quando o pedido é abortado (`request.signal`).
- Cliente: `EventSource('/api/avisos')`; ao receber `partida`: toca o som, `new Notification('Partida encontrada!', { body: 'Você tem 30 segundos para aceitar.' })` (pede permissão com um botão "Ativar avisos" no topo, uma vez), pisca `document.title` até a aba ficar visível, e clicar na notificação abre `/partidas/<id>`. Se a aba estiver visível, vai direto para `/partidas/<id>`.

- [ ] **Step 1: Teste que falha**: `avisoPendente` devolve a partida só enquanto a pessoa não aceitou e o estado é `aguardando_aceite`.
- [ ] **Step 2: Rodar** — Expected: FAIL. **Step 3:** implementar função, rota e cliente.
- [ ] **Step 4: Conferir no navegador**: com a aba escondida, criar a partida por outra conta e ver o som, a notificação e o título piscando.
- [ ] **Step 5: Rodar** a suíte completa — Expected: passa. **Step 6: Commit** `feat: aviso ao vivo de partida encontrada`

### Task 10: Publicar e conferir na VPS

- [ ] **Step 1:** Enviar o código para `/opt/magnatas/site` (incluindo testes, porque o `next build` confere os tipos deles), `npm run db:migrar`, `npm run build`, reiniciar `magnatas-site`. Conferir `curl` 200 em `https://magnatasdocs.com.br/`.
- [ ] **Step 2:** Conferir que o Caddy entrega o `/api/avisos` sem segurar a resposta (abrir com `curl -N` e ver o `: ping` chegar). Se ficar preso, pôr `flush_interval -1` no `reverse_proxy`.
- [ ] **Step 3:** Pedir ao dono um teste com amigos: desafio, aceite, vetos, partida, pós-partida e elogio; e uma falta de propósito para ver o bloqueio de 3 min.
- [ ] **Step 4:** Conferir no primeiro evento real do MatchZy (log do site) que `mvp`, `kast` e `1k`…`5k` chegam com esses nomes; se vierem com outros nomes, corrigir o esquema de `eventos.ts` com teste.
