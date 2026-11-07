# Diversão sob demanda — Plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Servidores da Diversão ligam quando alguém pede ("Ligar e entrar") e desligam sozinhos com 5 minutos vazios, no máximo 3 ligados.

**Architecture:** Uma tabela guarda o estado de cada servidor (desligado, ligando, ligado). A página só lê esse estado e dispara o pedido; a varredura do site (a cada 15 s) acompanha: confirma que ligou, desliga o que ficou vazio ou não subiu. Ligar e desligar passam por uma interface `ControleDaDiversao` injetável; a real chama dois scripts pequenos como `cs2` via `sudo` restrito.

**Tech Stack:** Next.js 16 (ler `site/AGENTS.md`), Drizzle + PostgreSQL, Vitest com PGlite; bash + pytest para os scripts do servidor.

**Spec:** `docs/superpowers/specs/2026-11-07-diversao-sob-demanda-design.md`

## Global Constraints

- Desliga com **5 min** vazio; desiste de ligar em **3 min**; no máximo `DIVERSAO_MAXIMO_LIGADOS` (padrão **3**) servidores da Diversão ligados ou ligando.
- Limite cheio: desliga o ligado **vazio há mais tempo**; se nenhum vazio, recusa com a mensagem do spec.
- Servidor de partidas nunca é ligado/desligado por isto. Servidor com `sobDemanda = false` nunca é desligado pelo site.
- Nomes dos servidores na VPS: porta 27016 `ak-desert`, 27017 `pistola`, 27018 `awp`, 27019 `equipe`, 27020 `mutacao`, 27021 `fantasma`.
- O site nunca passa texto do usuário para comando: o nome vem do banco e é conferido por `^[a-z0-9-]{1,32}$`; os scripts conferem de novo contra `/home/cs2/bin/diversao/*.conf`.
- `sudoers`: o usuário `magnatas` roda só `/home/cs2/bin/ligar_diversao.sh` e `/home/cs2/bin/desligar_diversao.sh` como `cs2`, sem senha.
- Rodar `npx tsc --noEmit -p .`, `npx eslint src scripts`, `npx vitest run` (site) e `python -m pytest -q tests` (servidor) antes de cada commit.

## Review Focus

1. Dois cliques ao mesmo tempo no mesmo modo: um pedido de ligar só (trava a linha do estado). Teste em Task 2.
2. Servidor que já estava ligado antes do recurso existir (ou ligado à mão): a varredura vê que responde e adota como `ligado`, sem ligar de novo. Teste em Task 2.
3. Script de ligar que falha (sudo negado, nome inválido): estado volta a `desligado` com o erro no log, e o cartão não fica preso em "Ligando". Teste em Task 2.
4. Gente entrando no minuto 4:59 vazio: o relógio de vazio zera assim que aparece alguém. Teste em Task 2.
5. Nome de servidor com caractere estranho no banco: o controle real recusa antes de rodar qualquer coisa. Teste em Task 3.

---

### Task 1: Banco

**Files:** `site/src/bd/esquema.ts`, migração `0017_diversao_sob_demanda.sql` (gerada; renomear e ajustar o journal), `site/src/bd/esquema.test.ts`.

**Produces:**
- `servidoresDiversao` ganha `nomeNoServidor text null` e `sobDemanda boolean not null default true`. A migração preenche `nomeNoServidor` pela porta (Global Constraints).
- Enum `estadoDaDiversao = ['desligado', 'ligando', 'ligado']`; tabela `estadosDaDiversao`: `servidorId uuid pk → servidoresDiversao`, `estado` (default `desligado`), `desde timestamp`, `vazioDesde timestamp null`, `pedidoPor uuid null → usuarios`, `erro text null`.
- Tipo `EstadoDaDiversao`.

- [ ] Teste que falha: inserir servidor com `nomeNoServidor` e ler `sobDemanda = true`; inserir estado e ler `estado = 'desligado'`.
- [ ] Esquema + `db:gerar` + no SQL gerado acrescentar os `UPDATE ... SET nome_no_servidor = ... WHERE porta = ...`. Teste da migração: criar banco de teste, inserir servidor com porta 27020 **antes**? Não dá (a migração roda antes); então o teste confere só o `UPDATE` estar no arquivo SQL (texto) — aceitável.
- [ ] Suíte → PASS. Commit `feat: banco da diversao sob demanda`

### Task 2: Domínio sob demanda

**Files:** Create `site/src/dominio/sob-demanda.ts` (+ `.test.ts`).

**Produces:**
- `export type ControleDaDiversao = { ligar(nome: string): Promise<void>; desligar(nome: string): Promise<void> }`.
- `export const PRAZO_PARA_LIGAR_MS = 3 * 60_000; export const TEMPO_VAZIO_MS = 5 * 60_000;`
- `export class LimiteDeServidores extends Error` (mensagem do spec).
- `export async function pedirParaLigar(bd, controle, servidorId, ator, maximo, agora?): Promise<'ligando' | 'ligado'>` — trava o estado (`for update`); `ligado`/`ligando` → devolve como está; senão confere limite (conta `ligando` + `ligado`); cheio → desliga o `ligado` com `vazioDesde` mais antigo (e `sobDemanda`), ou lança `LimiteDeServidores`; marca `ligando` (`desde = agora`, `pedidoPor`), **depois do commit** chama `controle.ligar(nome)`; se `ligar` lançar, volta a `desligado` com `erro`.
- `export async function acompanharDiversao(bd, controle, perguntar: (servidor) => Promise<{ ligado: boolean; jogando: number }>, agora?)` — para cada servidor ativo:
  - responde e estado ≠ `ligado` → `ligado` (adota), `vazioDesde = jogando ? null : agora`;
  - `ligado` e responde: `jogando > 0` → `vazioDesde = null`; `jogando = 0` → `vazioDesde ??= agora`; se `sobDemanda` e `agora − vazioDesde ≥ 5 min` → `controle.desligar` + `desligado`;
  - `ligado` e não responde → `desligado` (caiu);
  - `ligando` e não responde há ≥ 3 min → `controle.desligar` + `desligado` com `erro = 'não respondeu'`.
- `export async function estadosDaTela(bd): Promise<Map<servidorId, { estado; desde; erro }>>`.

- [ ] Testes que falham (controle falso que anota chamadas): pedir liga e marca `ligando`; dois pedidos juntos chamam `ligar` uma vez; limite 3 cheio com um vazio → desliga o vazio mais antigo e liga o novo; limite cheio sem vazio → `LimiteDeServidores` e nada chamado; `ligar` que lança volta a `desligado` com erro; acompanhar adota servidor que já responde; `ligando` que responde vira `ligado`; vazio 4:59 não desliga, 5:00 desliga; alguém entra em 4:59 → `vazioDesde` zera; `ligando` sem resposta 3 min → desligado com erro; `sobDemanda = false` nunca desliga.
- [ ] Implementar; suíte → PASS. Commit `feat: ligar e desligar a diversao sob demanda`

### Task 3: Scripts no servidor e controle real

**Files:** Create `servidor/scripts/ligar_diversao.sh`, `servidor/scripts/desligar_diversao.sh`, `servidor/config/sudoers-magnatas-diversao`; modify `servidor/scripts/instalar_cs2.sh` (instala os dois scripts em `/home/cs2/bin` e o sudoers em `/etc/sudoers.d/magnatas-diversao` com `visudo -cf`); tests em `servidor/tests/test_diversao.py`. Create `site/src/servidor-jogo/controle-da-diversao.ts` (+ `.test.ts`).

**Produces:**
- `ligar_diversao.sh <nome>`: confere `id -un = cs2`, nome em `^[a-z0-9-]{1,32}$` e arquivo `.conf` existente; se a sessão tmux já existe, sai 0; senão chama `iniciar_diversao.sh <nome>`.
- `desligar_diversao.sh <nome>`: mesmas conferências; `tmux kill-session -t diversao-<nome>` (sem sessão = sai 0).
- sudoers: `magnatas ALL=(cs2) NOPASSWD: /home/cs2/bin/ligar_diversao.sh, /home/cs2/bin/desligar_diversao.sh`.
- `controleReal(executar = execFile)`: `ligar(nome)` → `sudo -n -u cs2 /home/cs2/bin/ligar_diversao.sh <nome>` com prazo de 30 s; recusa nome fora de `^[a-z0-9-]{1,32}$` sem chamar nada.

- [ ] pytest que falham: os dois scripts conferem usuário, padrão do nome e `.conf`; o desligar usa `kill-session -t "diversao-$NOME"`; o sudoers lista só os dois scripts e só como `cs2`; o instalador valida com `visudo -cf`.
- [ ] Vitest que falha: `controleReal` com `executar` falso chama `sudo` com `['-n','-u','cs2','/home/cs2/bin/ligar_diversao.sh','fantasma']`; nome `fantasma; rm -rf /` é recusado sem chamar.
- [ ] Implementar; suítes → PASS. Commit `feat: scripts e controle para ligar a diversao`

### Task 4: Página Diversão e varredura

**Files:** `site/src/app/(membros)/diversao/page.tsx`, `diversao/acoes.ts` (novo), `diversao/esperar-e-entrar.tsx` (client), `site/src/dominio/varredura.ts` (chama `acompanharDiversao` com `situacaoDoServidor` e o controle do ambiente), `site/src/dominio/diversao.ts` (`estadoDoCartao` ganha `ligando` e `desligado_sob_demanda`), estilos.

- Cartão: `desligado` + `sobDemanda` → botão "Ligar e entrar" (ação `ligar`); `ligando` → "Ligando... cerca de 1 minuto" com relógio desde `desde`, e para quem pediu (`pedidoPor`) o componente cliente que, quando a página recarregar com o estado `ligado`, abre `steam://connect`; `erro` recente (< 2 min) → mensagem do spec; `LimiteDeServidores` → mensagem do spec via `?erro=limite`.
- Página com `Atualizar` a cada 3 s enquanto algum cartão estiver `ligando`.
- `fiscalizarDiversao` só pergunta aos servidores com estado `ligado`/`ligando` (não pergunta a quem está desligado).

- [ ] Testes que falham em `diversao.test.ts`: `estadoDoCartao` cobre `ligando` e `desligado_sob_demanda`; varredura com controle falso chama `acompanharDiversao`.
- [ ] Implementar; conferir no navegador com controle falso (variável `DIVERSAO_CONTROLE=falso` só em desenvolvimento, que simula subir em 5 s). Suíte → PASS. Commit `feat: pagina da diversao liga o servidor`

### Task 5: Publicar

- [ ] Enviar `servidor/` e `site/`; instalar scripts e sudoers na VPS (`visudo -cf` antes de mover); `db:migrar`; `build`; reiniciar.
- [ ] `.env.local`: `DIVERSAO_MAXIMO_LIGADOS=3`.
- [ ] Conferir: a varredura adota Equipe, Mutação e Fantasma que já estão ligados; desligar um pela espera de 5 min vazio; clicar "Ligar e entrar" no AK e ver subir.
- [ ] Patch de aviso nas notícias.
