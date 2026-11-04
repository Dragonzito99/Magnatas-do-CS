# Diversão, etapa 1: tela e os três Cada um por si — Plano de implementação

> **Para quem executa:** SUB-SKILL OBRIGATÓRIA: use superpowers:subagent-driven-development ou superpowers:executing-plans para seguir este plano, tarefa por tarefa. Os passos usam caixas (`- [ ]`) para acompanhamento.

**Objetivo:** a aba Diversão vira uma lista de servidores por modo, guardada no banco, com três servidores de Cada um por si funcionando e os outros modos como "Em breve".

**Arquitetura:** uma tabela `servidores_diversao` guarda os cartões. `dominio/diversao.ts` substitui `dominio/mata-mata.ts` e trata vários servidores, cada um com a própria situação guardada e fiscalização independente. Um plugin `MagnatasDiversao` lê a arma principal de um arquivo de configuração por servidor, e `iniciar_diversao.sh <nome>` sobe cada servidor na própria pasta e porta.

**Tecnologia:** Next.js 16, React 19, TypeScript, Drizzle, PostgreSQL, PGlite nos testes, Vitest, Bash, pytest, CounterStrikeSharp (C#, .NET 10).

**Design:** `docs/superpowers/specs/2026-11-04-modos-de-diversao-design.md`

## Regras gerais

- Trabalhar na branch `etapa-diversao/tela-e-cada-um`, criada a partir da `main`. O primeiro commit leva o design e este plano.
- Toda mensagem de commit termina com `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Textos da tela em português do Brasil. Sem fundo claro em nenhuma página.
- Antes de escrever código de página, ler `site/node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/page.md`, como pede `site/AGENTS.md`.
- Segredos ficam em `site/.env.local` e `/home/cs2/cs2.env`. Nunca aparecem em saída de comando, no chat ou no repositório.
- Node, cache do npm e temporários ficam em `G:\Magnatas-ferramentas`. Preparo do terminal: `F=/g/Magnatas-ferramentas; export PATH="$F/node:$PATH" npm_config_cache="G:/Magnatas-ferramentas/npm-cache" TEMP="G:/Magnatas-ferramentas/tmp" TMP="G:/Magnatas-ferramentas/tmp" NEXT_TELEMETRY_DISABLED=1`.
- Comandos no Linux: `export MSYS2_ARG_CONV_EXCL="*" WSL_UTF8=1; wsl.exe -d Ubuntu-24.04 -u root -- bash -s <<'EOF'`. A pasta do projeto não está montada no Linux: copiar arquivos com `tar` ou `sed 's/\r$//' arq | wsl.exe ... "cat > destino"`.
- No CS2, `game_type 1` com `game_mode 2` espalha quem renasce e ignora a arma principal. `sv_cheats` fica em 0 nos servidores reais. Bots só em teste.
- Nenhum Cada um por si pode depender do fim de partida do CS2, porque nesse modo ele deixa todo mundo sem time. Quem zera o placar é o plugin.
- O servidor `207.244.232.183` não recebe nada.

## Foco da revisão

Cada item tem teste na tarefa dona do código.

1. Um servidor travado ou desligado não pode prender a página, nem a fiscalização dos outros (Tarefa 2).
2. A situação guardada de um servidor não pode aparecer no cartão de outro de mesmo host e porta diferente (Tarefa 2).
3. Servidor com `ativo` falso nunca recebe pergunta do site (Tarefa 2).
4. Senha com aspas ou ponto e vírgula não pode gerar um comando de conexão quebrado ou perigoso (Tarefa 2).
5. `?modo=` com valor desconhecido mostra Todos, sem erro (Tarefa 2).

---

### Task 1: Tabela dos servidores

**Arquivos:**
- Modificar: `site/src/bd/esquema.ts`
- Criar: duas migrações em `site/drizzle/`, geradas pelo drizzle-kit
- Criar: `site/src/bd/servidores-diversao.test.ts`

**Interfaces:**
- Produz: enum `modoDiversao` (`cada_um`, `equipe`, `mutacao`, `fantasma`), tabela `servidoresDiversao` e o tipo `ServidorDiversao` (`typeof servidoresDiversao.$inferSelect`).

- [ ] **Passo 1: Criar a branch e salvar os documentos**

```bash
git switch -c etapa-diversao/tela-e-cada-um
git add docs/superpowers/specs/2026-11-04-modos-de-diversao-design.md docs/superpowers/plans/2026-11-04-diversao-etapa-1.md
git commit -m "docs: design e plano da aba diversao"
```

- [ ] **Passo 2: Escrever o teste que falha**

`servidores-diversao.test.ts`, com `criarBancoDeTeste`:
- `os seis servidores já vêm cadastrados, em ordem`: seleciona ordenando por `ordem` e confere exatamente:

| ordem | modo | armas | mapa | foto | porta | ativo |
|---|---|---|---|---|---|---|
| 1 | cada_um | AK e Desert | Dust 2 | /mapas/dust2.webp | 27016 | true |
| 2 | cada_um | Só pistola, à sua escolha | Mirage | /mapas/mirage.webp | 27017 | true |
| 3 | cada_um | Só AWP | Mirage | /mapas/mirage.webp | 27018 | true |
| 4 | equipe | Renasce na base | Transport Ship | /mapas/transport-ship.webp | 27019 | false |
| 5 | mutacao | Quem é pego vira mutante | Biochemical Hotel | /mapas/biochemical-hotel.webp | 27020 | false |
| 6 | fantasma | Invisíveis contra armados | Laboratory | /mapas/laboratory.webp | 27021 | false |

  Todos com `vagas` 16 e `host` nulo.
- `dois servidores não dividem o mesmo endereço`: inserir outra linha com `host` nulo e porta 27016 precisa falhar. Inserir com `host` `10.0.0.1` e porta 27016 precisa funcionar, porque é outra máquina.

- [ ] **Passo 3: Rodar e ver falhar**

Rodar: `npx vitest run src/bd/servidores-diversao.test.ts`
Esperado: FALHA, porque `servidoresDiversao` não existe.

- [ ] **Passo 4: Criar a tabela**

Em `esquema.ts`: `id` uuid, `modo`, `armas` texto, `mapa` texto, `foto` texto, `host` texto que aceita nulo (nulo significa o `DIVERSAO_HOST`), `porta` inteiro, `vagas` inteiro com padrão 16, `ativo` booleano com padrão falso, `ordem` inteiro, `criadoEm`. Índice único em `(coalesce(host, ''), porta)`. Comentário curto: `// A futura tela de Adm cria e edita estas linhas.`

Rodar `npm run db:gerar`, e depois `npx drizzle-kit generate --custom --name=servidores_da_diversao` para a migração dos seis `INSERT`.

- [ ] **Passo 5: Rodar e ver passar**

Rodar: `npx vitest run src/bd/servidores-diversao.test.ts`
Esperado: PASSA.

- [ ] **Passo 6: Salvar**

```bash
git add site/src/bd site/drizzle
git commit -m "feat: tabela dos servidores da diversao"
```

---

### Task 2: Regras dos vários servidores

**Arquivos:**
- Criar: `site/src/dominio/diversao.ts`, `site/src/dominio/diversao.test.ts`
- Apagar: `site/src/dominio/mata-mata.ts`, `site/src/dominio/mata-mata.test.ts`
- Modificar: `site/src/dominio/varredura.ts`, `site/src/dominio/varredura.test.ts`, `site/src/instrumentation.ts`, `site/.env.example`

**Interfaces:**
- Consome: `servidoresDiversao` da Tarefa 1.
- Produz, em `dominio/diversao.ts`:

```ts
export const MODOS_DE_DIVERSAO: readonly { valor: ModoDeDiversao; nome: string }[]; // Cada um por si, Equipe x Equipe, Mutação, Fantasma
export function lerModo(valor: string | undefined): ModoDeDiversao | null; // null significa Todos
export async function listarServidoresDaDiversao(bd: Bd): Promise<ServidorDiversao[]>; // por ordem
export function alvoDoServidor(servidor: { host: string | null; porta: number }, hostPadrao: string | undefined): ServidorAlvo | null;
export function linkDeEntrar(alvo: ServidorAlvo, senha: string): string; // steam://connect/host:porta/senha
export function comandoDeConectar(alvo: ServidorAlvo, senha: string): string | null; // password "x"; connect host:porta
export async function fiscalizarServidor(bd: Bd, controlador: ControladorServidor, alvo: ServidorAlvo): Promise<void>;
export async function fiscalizarDiversao(bd: Bd, controlador: ControladorServidor, hostPadrao: string | undefined, prazoMs?: number): Promise<void>;
export type SituacaoDoServidor = { ligado: boolean; jogando: number };
export async function situacaoDoServidor(controlador: ControladorServidor, alvo: ServidorAlvo | null, agora?: Date, prazoMs?: number): Promise<SituacaoDoServidor>;
export function zerarSituacoesGuardadas(): void;
export type EstadoDoCartao = 'em_breve' | 'fora_do_ar' | 'cheio' | 'aberto';
export function estadoDoCartao(servidor: { ativo: boolean; vagas: number }, situacao: SituacaoDoServidor): EstadoDoCartao;
```

Os prazos seguem os atuais: 3 segundos para a página, 10 segundos de situação guardada. `fiscalizarDiversao` usa 15 segundos por servidor como padrão.

- [ ] **Passo 1: Escrever os testes que falham**

Levar os testes de `mata-mata.test.ts` para `diversao.test.ts`, trocando os nomes das funções, e acrescentar:
- `lerModo`: aceita os quatro valores. Para `undefined`, `''` e `'xyz'`, devolve `null`.
- `alvoDoServidor`: `host` da linha vence o padrão; `host` nulo usa o padrão; sem nenhum dos dois, ou só espaços, devolve `null`.
- `comandoDeConectar`: `{ host: '10.0.0.7', porta: 27017 }` com `abc` dá `password "abc"; connect 10.0.0.7:27017`. Senha com `"` ou `;` dá `null`.
- `estadoDoCartao`: inativo é `em_breve`, mesmo que a situação diga ligado; ativo e desligado é `fora_do_ar`; `jogando` igual ou acima de `vagas` é `cheio`; o resto é `aberto`.
- `a situação de um servidor não aparece em outro de mesmo host`: um controlador feito à mão responde conforme a porta. As portas 27016 e 27017, consultadas no mesmo instante, devolvem contagens diferentes.
- `fiscalizarDiversao só pergunta aos servidores ativos`: define `host` distinto em cada linha da migração e confere que só os hosts das três linhas ativas aparecem em `controlador.chamadas`.
- `um servidor travado não prende os outros`: o controlador nunca responde para um host. Com `prazoMs` 10, a conta de fora conectada em outro host ainda é derrubada, e a chamada termina.
- `sem endereço, fiscalizarDiversao não pergunta nada`: `hostPadrao` indefinido, linhas com `host` nulo, e `chamadas` vazio.

Em `varredura.test.ts`, trocar o 5º argumento de `modo` por `'10.0.0.7'`. O teste "sem o modo configurado" continua sem o argumento.

- [ ] **Passo 2: Rodar e ver falhar**

Rodar: `npx vitest run src/dominio/diversao.test.ts src/dominio/varredura.test.ts`
Esperado: FALHA, porque `./diversao` não existe.

- [ ] **Passo 3: Implementar**

Criar `diversao.ts` a partir de `mata-mata.ts`. A situação guardada vira um `Map` com a chave `host:porta`. `fiscalizarDiversao` lê as linhas ativas e roda `fiscalizarServidor` de todas ao mesmo tempo, cada uma correndo contra o prazo, com `Promise.all`. Apagar `mata-mata.ts` e o teste antigo.

Em `varrer`, o 5º parâmetro vira `hostDaDiversao: string | undefined = undefined`, e a etapa chama `fiscalizarDiversao(bd, controlador, hostDaDiversao)`. A etapa sempre roda, e a própria função decide não perguntar nada. Em `instrumentation.ts`, passar `process.env.DIVERSAO_HOST`.

Em `.env.example`, acrescentar, com comentários no mesmo estilo: `RCON_SENHA=`, `SERVIDOR_SENHA=` e `DIVERSAO_HOST=` (endereço da máquina dos servidores da aba Diversão; sem ele, os cartões aparecem fora do ar).

Na máquina de testes, tirar a linha `DIVERSAO_PORTA` de `site/.env.local`, que deixa de existir.

- [ ] **Passo 4: Rodar e ver passar**

Rodar: `npx vitest run src/dominio/diversao.test.ts src/dominio/varredura.test.ts`
Esperado: PASSA. A página ainda importa `mata-mata`, então o `tsc` só fica limpo na Tarefa 3.

- [ ] **Passo 5: Salvar**

```bash
git add site/src/dominio site/src/instrumentation.ts site/.env.example
git commit -m "feat: regras dos varios servidores da diversao"
```

---

### Task 3: Tela da aba Diversão

**Arquivos:**
- Modificar: `site/src/app/(membros)/diversao/page.tsx`, `site/src/estilos/global.css`
- Mover: `site/src/app/(membros)/convites/botao-copiar.tsx` para `site/src/app/(membros)/botao-copiar.tsx`, e corrigir o import em `convites/`
- Criar: `site/public/mapas/{dust2,mirage,transport-ship,biochemical-hotel,laboratory}.webp`

**Interfaces:**
- Consome: as funções da Tarefa 2.

- [ ] **Passo 1: Gerar as fotos dos mapas**

Dust 2 e Mirage: ler `panorama/images/map_icons/screenshots/360p/de_dust2_png.vtex_c` e `de_mirage_png.vtex_c` de `pak01` no Linux. Cada um traz um PNG dentro: procurar a assinatura `\x89PNG` e copiar daí até o fim.

Os outros três: pegar `preview_url` em `GetPublishedFileDetails` para os ids `3122345065`, `3223106683` e `3582464448`, e baixar a imagem.

Com `sharp` (já vem com o `next`), converter tudo para WebP de 480x270, com corte central, em `site/public/mapas/`. Os scripts ficam em `G:\Magnatas-ferramentas\tmp`, fora do repositório.

Esperado: 5 arquivos, cada um com menos de 60 KB.

- [ ] **Passo 2: Escrever a página**

`page.tsx` lê `searchParams` (é uma `Promise`, como em `ranking/page.tsx`), chama `exigirAcesso('/diversao')`, lista os servidores e busca a situação só dos ativos, com `Promise.all`. Os inativos não recebem pergunta.

Estrutura:
- `<h1>Diversão</h1>`;
- abas como `next/link`: Todos (`/diversao`) e uma por modo (`/diversao?modo=cada_um`), com `aria-current="page"` na atual e a classe `aba-diversao`;
- grade `lista-servidores` com um `<article className="cartao-servidor">` por servidor, contendo `next/image` com `alt` igual ao nome do mapa, o nome do modo, `armas`, `mapa` e o rodapé abaixo.

| `estadoDoCartao` | Rodapé |
|---|---|
| `em_breve` | etiqueta "Em breve" |
| `fora_do_ar` | etiqueta "Fora do ar" |
| `cheio` | `16/16` e etiqueta "Servidor cheio" |
| `aberto` | `3/16`, `BotaoCopiar` com `comandoDeConectar` e `<a className="botao ouro">Entrar</a>` com `linkDeEntrar` |

A senha vem de `process.env.SERVIDOR_SENHA ?? ''`, e o host padrão, de `process.env.DIVERSAO_HOST`. Se `comandoDeConectar` devolver `null`, o botão de copiar não aparece.

- [ ] **Passo 3: Escrever os estilos**

Apagar de `global.css` os blocos `.modos`, `.modo`, `.modo .arte`, `.modo.mata-mata`, `.mata-mata-texto`, `.modo.fantasma`, `.modo.mutacao` e `.proximo-modo`. Manter `.ao-vivo`, se ainda for usada em outra página (conferir com busca).

Acrescentar: `.abas-diversao` com quebra de linha; `.aba-diversao` com borda ouro em `[aria-current="page"]`; `.lista-servidores` com `grid-template-columns: repeat(auto-fill, minmax(230px, 1fr))`; `.cartao-servidor`; e uma coluna só abaixo de 480px. Usar os tokens existentes (`--painel`, `--linha-forte`, `--tinta`, `--tinta-2`, `--ouro`, `--sobre-ouro`).

- [ ] **Passo 4: Conferir tipos, testes e estilos**

Rodar: `npx tsc --noEmit` e `npx vitest run`
Esperado: `tsc` sem erros e toda a suíte passando, incluindo `estilos/contraste.test.ts`, que confere se toda classe tem estilo.

- [ ] **Passo 5: Conferir no navegador**

Com o site reiniciado (variável de ambiente e `instrumentation.ts` mudaram; fechar também o processo na porta 3000), abrir `/diversao` no painel do navegador com uma sessão fictícia de `scripts/dev-sessao.ts`, em 1366 e 375 de largura.

Esperado: 6 cartões, sem rolagem horizontal, com "Em breve" nos três modos não prontos. As abas filtram, e `?modo=xyz` mostra Todos. Apagar o cookie fictício ao terminar.

- [ ] **Passo 6: Salvar**

```bash
git add site/src site/public/mapas
git commit -m "feat: lista de servidores na aba diversao"
```

---

### Task 4: Plugin com a arma de cada servidor

**Arquivos:**
- Mover: `servidor/plugins/MagnatasMataMata/` para `servidor/plugins/MagnatasDiversao/`, com os arquivos `MagnatasDiversao.cs` e `MagnatasDiversao.csproj`
- Modificar: `servidor/scripts/compilar_plugin.sh`
- Modificar: `servidor/tests/test_mata_mata.py`

**Interfaces:**
- Produz: `MagnatasDiversao.dll`, que lê `ArmaPrincipal` de `addons/counterstrikesharp/configs/plugins/MagnatasDiversao/MagnatasDiversao.json`. Texto vazio significa não entregar arma principal.

- [ ] **Passo 1: Atualizar os testes de texto**

Em `test_mata_mata.py`: `PASTA_DO_PLUGIN` passa para `MagnatasDiversao`. Trocar `test_o_plugin_entrega_a_ak_a_cada_renascimento` por `test_o_plugin_entrega_a_arma_definida_na_configuracao`, que confere `ArmaPrincipal`, `IPluginConfig`, `EventPlayerSpawn` e `GiveNamedItem`, e que `"weapon_ak47"` não aparece mais no código. Em `compilar_plugin.sh`, conferir `MagnatasDiversao.dll`.

- [ ] **Passo 2: Rodar e ver falhar**

Rodar: `python -m pytest tests/test_mata_mata.py -q`, a partir de `servidor/`
Esperado: FALHA, porque a pasta nova não existe.

- [ ] **Passo 3: Implementar**

Fazer o `git mv`. A classe implementa `IPluginConfig<ConfiguracaoDoModo>` e guarda a configuração em `OnConfigParsed`. `EntregarArma` faz o que `EntregarAk` faz hoje com `Config.ArmaPrincipal`, e sai cedo se o texto estiver vazio. O reinício de 20 minutos e `magnatas_jogadores` continuam iguais.

- [ ] **Passo 4: Compilar no Linux**

Copiar `plugins` e `scripts/compilar_plugin.sh` para `/var/tmp/magnatas-servidor` com `tar`, corrigir o fim de linha do script e rodar.
Esperado: `0 Error(s)` e `Plugin compilado em /home/cs2/bin/MagnatasDiversao.dll.`

- [ ] **Passo 5: Rodar e ver passar, e salvar**

Rodar: `python -m pytest tests/test_mata_mata.py -q`
Esperado: os testes do plugin passam.

```bash
git add servidor
git commit -m "feat: plugin le a arma de cada servidor"
```

---

### Task 5: Os três servidores

**Arquivos:**
- Criar: `servidor/config/diversao/cada_um_por_si.cfg` (a partir de `servidor/config/mata_mata.cfg`)
- Criar: `servidor/config/diversao/{ak-desert,pistola,awp}.conf` e `.cfg`
- Criar: `servidor/scripts/iniciar_diversao.sh` (a partir de `iniciar_mata_mata.sh`)
- Apagar: `servidor/config/mata_mata.cfg`, `servidor/scripts/iniciar_mata_mata.sh`
- Mover: `servidor/tests/test_mata_mata.py` para `servidor/tests/test_diversao.py`
- Modificar: `servidor/scripts/instalar_cs2.sh`, `docs/pendencias-antes-de-abrir.md`

**Interfaces:**
- Consome: `MagnatasDiversao.dll` da Tarefa 4.
- Produz: `bash /home/cs2/bin/iniciar_diversao.sh <nome|todos>`, em `tmux` `diversao-<nome>`, na pasta `/home/cs2/diversao/<nome>/game`.

- [ ] **Passo 1: Escrever os testes que falham**

Em `test_diversao.py`, `valor(comando, servidor)` lê a junção de `cada_um_por_si.cfg` com `<servidor>.cfg`, e a última linha vence. Manter os testes atuais para `ak-desert` e acrescentar:

| Servidor | `.conf` | Regras |
|---|---|---|
| `ak-desert` | `PORTA=27016`, `MAPA=de_dust2`, `ARMA_PRINCIPAL=weapon_ak47` | secundária `weapon_deagle` e `sv_buy_status_override 3` |
| `pistola` | `PORTA=27017`, `MAPA=de_mirage`, `ARMA_PRINCIPAL=` | `mp_buy_allow_guns 1`, `sv_buy_status_override -1`, `mp_buy_anywhere 1`, `mp_buy_during_immunity 1` |
| `awp` | `PORTA=27018`, `MAPA=de_mirage`, `ARMA_PRINCIPAL=weapon_awp` | secundária vazia nos dois times e `sv_buy_status_override 3` |

Testes do script: recusa nome que não tenha `.conf`; aceita `todos`; usa `+game_type 1 +game_mode 2`; grava `gamemode_deathmatch_server.cfg` e `MagnatasDiversao.json`; apaga `plugins/MatchZy`; continua recusando subir sem o plugin; usa `GSLT_` com o nome do servidor. O instalador leva a pasta `config/diversao` e `iniciar_diversao.sh`.

- [ ] **Passo 2: Rodar e ver falhar**

Rodar: `python -m pytest tests/test_diversao.py -q`
Esperado: FALHA, porque os arquivos não existem.

- [ ] **Passo 3: Implementar**

`cada_um_por_si.cfg` é o `mata_mata.cfg` atual, sem as secundárias e sem o `hostname`. Cada `<nome>.cfg` traz o `hostname` e as regras da tabela.

`iniciar_diversao.sh` carrega `<nome>.conf`, monta a pasta do servidor como o script atual faz, usando `cp -al` em `bin`, e une as duas configurações em `gamemode_deathmatch_server.cfg`. Grava o JSON do plugin com a arma e a versão de configuração que a API pedir. A sessão `tmux` é `diversao-<nome>`, e `todos` sobe os três. O token vem de `GSLT_<NOME>`, com letras maiúsculas e `-` trocado por `_`.

Em `pendencias-antes-de-abrir.md`, atualizar a seção do modo: portas `27016` a `27018`, um token por servidor, `DIVERSAO_HOST` sem `DIVERSAO_PORTA`, e o aviso de que imagens e mapas entram na conversa com o advogado.

- [ ] **Passo 4: Rodar e ver passar**

Rodar: `python -m pytest -q`, a partir de `servidor/`
Esperado: toda a suíte do servidor passa.

- [ ] **Passo 5: Salvar**

```bash
git add servidor docs/pendencias-antes-de-abrir.md
git commit -m "feat: tres servidores de cada um por si"
```

---

### Task 6: Colocar no ar e testar com o dono

**Arquivos:** nenhum, salvo correções que o teste exigir, cada uma com teste antes.

- [ ] **Passo 1: Trocar os servidores no Linux**

Copiar `scripts/iniciar_diversao.sh` e `config/diversao` para `/home/cs2/bin`. Fechar as sessões `mata-mata`, se existir, e subir `todos`. Conferir pasta antes de apagar, e só então remover `/home/cs2/mata-mata` e `/home/cs2/teste-fantasma`, que foram criadas nos testes. Manter `/var/tmp/fantasma-corte`, que a etapa do Fantasma vai reaproveitar.

Esperado: três sessões `diversao-*`. Para cada porta, `css_plugins list` mostra só o plugin da Diversão, `magnatas_jogadores` responde, `game_type` é 1 e o mapa é o da tabela.

- [ ] **Passo 2: Rodar as migrações e religar o site**

Rodar `npm run db:migrar`, fechar o processo da porta 3000 e iniciar `next dev -p 3000` em segundo plano. Esperado: `/diversao` responde e mostra os três cartões ativos com `0/16`.

Desligar `diversao-awp` por um instante. Esperado: em até 10 segundos, só esse cartão mostra "Fora do ar", a página continua abrindo em menos de 4 segundos e os outros dois não mudam. Religar em seguida.

- [ ] **Passo 3: Pedir o teste ao dono**

Com `bot_quota 3` em cada servidor só durante o teste, o dono entra pelo botão Entrar e confere:
- AK e Desert: como hoje.
- Pistola: escolhe a pistola pelo menu, não consegue comprar outra classe de arma, e a pistola escolhida volta ao renascer.
- AWP: nasce só com AWP e faca.
- Em todos: renascimento espalhado, cartão com a contagem certa, botão Copiar colado no console do CS2 conecta.

Se a pistola escolhida não voltar ao renascer, o plugin passa a lembrar a escolha. Isso é uma correção desta tarefa, com teste antes.

- [ ] **Passo 4: Encerrar**

Voltar `bot_quota 0`. Rodar `npx vitest run`, `npx tsc --noEmit`, `npm run lint`, `python -m pytest -q` e `conferir-segredos.cjs`.
Esperado: tudo limpo, e nenhum segredo no histórico.

Seguir com a revisão final do método de execução e com superpowers:finishing-a-development-branch.
