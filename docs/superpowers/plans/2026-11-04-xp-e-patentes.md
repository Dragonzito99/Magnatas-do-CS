# XP, patentes e rankings — Plano de implementação

> **Para quem executa:** SUB-SKILL OBRIGATÓRIA: use superpowers:subagent-driven-development ou superpowers:executing-plans para seguir este plano, tarefa por tarefa. Os passos usam caixas (`- [ ]`) para acompanhamento.

**Objetivo:** toda partida encerrada dá XP, a patente sobe de Recruta a Magnata Supremo, e o site ganha dois rankings: Comunidade e Mix do mês. O Equipe x Equipe e o Cada um por si mostram o XP no jogo ao terminar.

**Arquitetura:** `dominio/xp.ts` guarda a fórmula e as patentes como funções puras. A tabela `xp_partidas` registra cada ganho, com índice único que impede contar duas vezes, e `usuarios.xp_total` guarda a soma. Mix e Salas lançam XP em `finalizarPartida`. A Diversão usa um endereço novo, para onde o plugin envia os números, e o site calcula o XP e devolve o resultado para o plugin mostrar.

**Tecnologia:** Next.js 16, React 19, TypeScript, Drizzle, PostgreSQL, PGlite, Vitest, CounterStrikeSharp (C#, .NET 10), Bash, pytest.

**Design:** `docs/superpowers/specs/2026-11-04-xp-e-patentes-design.md`

## Regras gerais

- Trabalhar na branch `etapa-diversao/xp`, criada a partir da `etapa-diversao/equipe`. As etapas 1 e 2 ainda não tiveram a revisão independente e não estão na `main`.
- Todo commit termina com `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Só salvar depois de ver os testes passarem.
- Antes de escrever código de página, ler o guia em `site/node_modules/next/dist/docs/`, como pede `site/AGENTS.md`. Arquivos `'use server'` só exportam funções assíncronas.
- Textos da tela em português do Brasil. Sem fundo claro.
- Segredos nunca aparecem em saída de comando, no chat ou no repositório. O token do plugin fica em arquivo com permissão 600.
- A patente é só do Magnatas. Nada imita a patente oficial do CS2, itens ou inventário.
- Preparo do terminal e comandos no Linux: os mesmos do plano da etapa 1.
- Editar scripts com a ferramenta Edit. A troca por script Python falhou na etapa 2.

## Foco da revisão

1. O mesmo resultado enviado duas vezes, ou um `series_end` repetido, não pode dar XP duas vezes (Tasks 1, 2 e 3).
2. Valores absurdos ou negativos vindos do servidor não podem passar do teto nem baixar XP (Tasks 1 e 3).
3. Porta desconhecida, servidor inativo, conta de fora e conta suspensa não ganham XP (Tasks 2 e 3).
4. Site fora do ar não pode travar nem atrapalhar os servidores da Diversão (Task 6).
5. Subir mais de uma patente de uma vez e chegar à última não podem quebrar a barra nem o aviso (Tasks 1 e 5).

---

### Task 1: Fórmula, patentes e registro de XP

**Arquivos:**
- Modificar: `site/src/bd/esquema.ts`
- Criar: migração gerada com `npm run db:gerar`
- Criar: `site/src/dominio/xp.ts`, `site/src/dominio/xp.test.ts`

**Interfaces:**
- Produz, em `esquema.ts`: enum `resultadoXp` (`vitoria`, `empate`, `derrota`), enum `origemXp` (`partida`, `diversao`), tabela `xpPartidas` (`id`, `usuarioId`, `origem`, `referencia` texto, `abates`, `resultado`, `xp`, `criadoEm`, único em `usuarioId` e `referencia`) e, em `usuarios`, `xpTotal` e `patenteVista` (inteiros, padrões 0 e 1).
- Produz, em `xp.ts`:

```ts
export const XP_MAXIMO_POR_PARTIDA = 1100;
export const PATENTES: readonly { nivel: number; nome: string; xp: number }[];
export type Patente = (typeof PATENTES)[number];
export type GanhoDePartida = { usuarioId: string; origem: 'partida' | 'diversao'; referencia: string; abates: number; resultado: 'vitoria' | 'empate' | 'derrota'; jogouAteOFim: boolean };
export type XpLancado = { usuarioId: string; xp: number; xpTotal: number; subiuPara: Patente | null };
export function xpDaPartida(dados: Pick<GanhoDePartida, 'jogouAteOFim' | 'resultado' | 'abates'>): number;
export function patenteDe(xpTotal: number): Patente;
export function progressoDe(xpTotal: number): { patente: Patente; proxima: Patente | null; faltam: number; porcentagem: number };
export async function lancarXp(tx: Transacao, ganhos: GanhoDePartida[]): Promise<XpLancado[]>;
```

- [ ] **Passo 1: Criar a branch e salvar os documentos**

```bash
git switch -c etapa-diversao/xp
git add docs/superpowers/specs/2026-11-04-xp-e-patentes-design.md docs/superpowers/plans/2026-11-04-xp-e-patentes.md
git commit -m "docs: design e plano de xp e patentes"
```

- [ ] **Passo 2: Escrever os testes que falham**

`xp.test.ts`:
- `xpDaPartida`: sem jogar até o fim dá 0, mesmo com vitória e abates. Derrota com 10 abates dá 500. Vitória com 20 dá 1.000. Vitória com 25 e com 200 dá 1.100. Empate com 0 dá 450. Abates negativos valem 0.
- `PATENTES`: confere os 10 nomes e valores da tabela do design, em ordem crescente.
- `patenteDe`: 0 é Recruta; 4.499 é Recruta; 4.500 é Magnata Jr.; 630.000 e 9.999.999 são Magnata Supremo.
- `progressoDe`: em 9.000, faltam 4.500 para Associado e `porcentagem` é 50. No topo, `proxima` é `null`, `faltam` é 0 e `porcentagem` é 100.
- `lancarXp`, com banco de teste: grava a linha e soma em `xpTotal`; repetir a mesma referência não soma de novo nem devolve a conta; `subiuPara` traz a patente nova ao cruzar o limite e `null` sem cruzar; subir duas patentes de uma vez traz a mais alta; quem não jogou até o fim fica com linha de 0 XP.

- [ ] **Passo 3: Rodar e ver falhar**

Rodar: `npx vitest run src/dominio/xp.test.ts`, a partir de `site/`
Esperado: FALHA, porque `./xp` não existe.

- [ ] **Passo 4: Implementar**

Criar as tabelas e rodar `npm run db:gerar`. Em `lancarXp`, inserir com `onConflictDoNothing` e `returning`. Só as linhas devolvidas somam, com `xp_total = xp_total + n`, e a resposta sai do `returning` dessa soma.

- [ ] **Passo 5: Rodar e ver passar, e salvar**

Rodar: `npx vitest run src/dominio/xp.test.ts`
Esperado: PASSA.

```bash
git add site/src site/drizzle
git commit -m "feat: formula de xp e patentes"
```

---

### Task 2: XP no Mix e nas Salas

**Arquivos:**
- Modificar: `site/src/dominio/partidas.ts`
- Criar: testes em `site/src/dominio/partidas-xp.test.ts`

**Interfaces:**
- Consome: `lancarXp` e `GanhoDePartida` da Task 1.
- Produz: `finalizarPartida` lança o XP quando `estado` é `encerrada`.

**Como reconhecer quem saiu:** o MatchZy só envia estatísticas de quem está conectado, e `partida_jogadores.rodadas` guarda as rodadas jogadas. Jogou até o fim quem tem `rodadas` igual ou maior que `placar1 + placar2 - 2`, e maior que 0. A folga de 2 rodadas perdoa uma queda curta de internet.

- [ ] **Passo 1: Escrever os testes que falham**

Com banco de teste, chamando `aplicarEvento` com `series_end`:
- vencedor com 12 abates recebe 840 XP; perdedor com 12 recebe 540;
- quem jogou 5 de 20 rodadas fica com 0 XP;
- quem perdeu 2 das 20 rodadas ainda ganha;
- `series_end` com `winner: none` não dá XP a ninguém;
- `series_end` repetido não soma de novo;
- conta suspensa durante a partida não ganha;
- a referência gravada é o id da partida e a origem é `partida`.

- [ ] **Passo 2: Rodar e ver falhar**

Rodar: `npx vitest run src/dominio/partidas-xp.test.ts`
Esperado: FALHA, porque nenhum XP é lançado.

- [ ] **Passo 3: Implementar**

Antes de editar, listar quem mais chama `finalizarPartida` e conferir que nenhum caminho de `encerrada` deva ficar sem XP. Ler a partida e os jogadores na mesma transação, filtrar `usuarios.estado = 'ativo'` e chamar `lancarXp`. Uma função `jogouAteOFim(rodadas, totalDeRodadas)` fica exportada e testada.

- [ ] **Passo 4: Rodar a suíte e salvar**

Rodar: `npx vitest run`
Esperado: toda a suíte passa.

```bash
git add site/src
git commit -m "feat: xp nas partidas de mix e salas"
```

---

### Task 3: Resultado vindo da Diversão

**Arquivos:**
- Criar: `site/src/dominio/xp-diversao.ts`, `site/src/dominio/xp-diversao.test.ts`
- Criar: `site/src/app/api/servidor/diversao/resultado/route.ts`
- Modificar: `site/src/dominio/eventos.ts`, para exportar `lerAte`

**Interfaces:**
- Consome: `lancarXp` e `xpDaPartida`.
- Produz: `respostaDoResultado(bd, pedido, tokenEsperado): Promise<Response>`, e o formato abaixo, que a Task 6 usa.

```json
// Pedido, com Authorization: Bearer <SERVIDOR_TOKEN>
{ "porta": 27019, "partida": "id-unico", "duracaoMinutos": 5, "vencedor": "ct",
  "jogadores": [{ "steamid64": "7656...", "abates": 12, "minutos": 5, "ateOFim": true, "time": "ct" }] }
// Resposta
{ "ganhos": [{ "steamid64": "7656...", "xp": 840, "xpTotal": 63840, "patente": "Empresário", "subiu": true }] }
```

`vencedor` é `ct`, `tr`, `empate` ou `null`. No Cada um por si vai `null`, e `time` é opcional.

**Regras do site:**
- Equipe: vitória se `time` igual a `vencedor`; empate se `vencedor` for `empate`. Ganha quem tem `ateOFim` e jogou pelo menos metade de `duracaoMinutos`.
- Cada um por si: o terço de cima por abates, arredondando para cima, vence, e só com pelo menos 1 abate; os demais perdem. Ganha quem tem `ateOFim` e pelo menos 5 minutos.
- Referência: `diversao:<porta>:<partida>`. Origem: `diversao`.

- [ ] **Passo 1: Escrever os testes que falham**

Com banco de teste e `Request` de verdade:
- token errado dá 401; corpo acima de 1 MiB dá 413; corpo inválido dá 400;
- porta sem servidor, ou com servidor inativo, dá 404 e não grava nada;
- conta de fora e conta suspensa não ganham e não aparecem em `ganhos`;
- equipe: vitória, derrota, empate, e quem jogou 2 de 5 minutos fica com 0;
- cada um por si: com 6 jogadores, os 2 de cima vencem; com 4, os 2 de cima (arredonda para cima); quem tem 0 abates nunca vence; quem jogou 4 minutos fica com 0;
- reenviar o mesmo pedido devolve o mesmo `ganhos`, sem somar de novo;
- `abates: 9999` não passa de 1.100 XP; `abates: -5` é recusado com 400;
- mais de 32 jogadores é recusado com 400; `partida` só aceita letras, números e hífen, até 64 caracteres.

- [ ] **Passo 2: Rodar e ver falhar**

Rodar: `npx vitest run src/dominio/xp-diversao.test.ts`
Esperado: FALHA, porque o módulo não existe.

- [ ] **Passo 3: Implementar**

Validar com Zod, como em `eventos.ts`, com o token conferido antes de ler o corpo. Fazer tudo em uma transação. Para a resposta do reenvio, ler o XP já gravado em `xp_partidas` e o total atual da conta, em vez de só o que `lancarXp` devolveu. O host do pedido não é conferido, porque o token já identifica os servidores.

- [ ] **Passo 4: Rodar e ver passar, e salvar**

Rodar: `npx vitest run src/dominio/xp-diversao.test.ts src/dominio/eventos.test.ts`
Esperado: PASSA.

```bash
git add site/src
git commit -m "feat: resultado da diversao vira xp"
```

---

### Task 4: Dois rankings

**Arquivos:**
- Modificar: `site/src/dominio/ranking.ts`, `site/src/dominio/ranking.test.ts`
- Modificar: `site/src/app/(membros)/ranking/page.tsx`, `site/src/estilos/global.css`

**Interfaces:**
- Produz: `rankingDaComunidade(bd: Bd, limite?: number): Promise<{ posicao: number; jogador: UsuarioPublico; patente: Patente; xp: number }[]>`, com limite padrão de 100.

- [ ] **Passo 1: Escrever os testes que falham**

Em `ranking.test.ts`:
- `partida de Sala não conta no ranking do Mix`: uma partida `desafio` fica fora de `rankingDoMes`.
- `rankingDaComunidade`: ordena por XP; empate por apelido; só contas ativas; quem tem 0 XP não aparece; traz a patente certa; respeita o limite.

- [ ] **Passo 2: Rodar e ver falhar**

Rodar: `npx vitest run src/dominio/ranking.test.ts`
Esperado: FALHA nos testes novos.

- [ ] **Passo 3: Implementar**

Em `rankingDoMes`, trocar o filtro para só `mix`. `primeiroMesComPartida` também passa a olhar só `mix`.

Na página, `?aba=mix` mostra o que existe hoje, com a navegação por mês. Sem isso, ou com valor desconhecido, mostra Comunidade, em tabela com posição, jogador, patente e XP. Título: "Ranking". As abas usam o mesmo visual das abas da Diversão: renomear `.abas-diversao` e `.aba-diversao` para `.abas-pagina` e `.aba-pagina`, nos dois lugares.

- [ ] **Passo 4: Conferir tipos, testes e navegador, e salvar**

Rodar: `npx tsc --noEmit` e `npx vitest run`
Esperado: sem erros, e toda a suíte passando.

Abrir as duas abas em 1366 e 375 de largura com sessão fictícia.
Esperado: sem rolagem horizontal. Apagar o cookie ao terminar.

```bash
git add site/src
git commit -m "feat: ranking da comunidade e do mix"
```

---

### Task 5: Patente no perfil, na partida, no sino e no banner

**Arquivos:**
- Modificar: `site/src/dominio/ficha.ts`, `site/src/dominio/notificacoes.ts`, `site/src/dominio/partidas.ts`, e os testes de cada um
- Modificar: `site/src/app/(membros)/jogadores/[id]/page.tsx`, `site/src/app/(membros)/partidas/[id]/page.tsx`, `site/src/app/(membros)/banner.tsx`, `site/src/app/(membros)/layout.tsx`, `site/src/estilos/global.css`
- Criar: `site/src/app/(membros)/jogadores/[id]/marcar-patente-vista.tsx`, `site/src/app/(membros)/jogadores/[id]/acoes.ts`

- [ ] **Passo 1: Escrever os testes que falham**

- `fichaDoJogador` traz `xpTotal`, `progresso` (de `progressoDe`) e `ultimosXp`: as 10 linhas mais recentes de `xp_partidas`.
- `notificacoesDe` traz o tipo novo `patente`, com o nome da patente e `href` para o próprio perfil, quando o nível atual é maior que `patenteVista`. Sem isso, não traz. `casosDe` não conta esse tipo.
- `detalheDaPartida` traz o `xp` de cada jogador, ou `null` quando ainda não houve lançamento.
- `marcarPatenteVista` grava o nível atual em `patenteVista` só na conta da própria sessão.

- [ ] **Passo 2: Rodar e ver falhar**

Rodar: `npx vitest run src/dominio/ficha.test.ts src/dominio/notificacoes.test.ts src/dominio/partidas.test.ts`
Esperado: FALHA nos testes novos.

- [ ] **Passo 3: Implementar**

- Perfil: bloco com coroa, nome da patente, "Nível 5 de 10", barra e "63.840 de 112.500 XP para Consigliere". No topo: "Patente máxima". Abaixo, as últimas partidas com XP.
- Na própria ficha, um componente cliente chama `marcarPatenteVista` uma vez ao abrir, se houver patente nova.
- Partida: coluna XP na tabela. Em partida em andamento, mostra `—`.
- Banner: a patente em letras pequenas, abaixo do apelido. `layout.tsx` calcula com `patenteDe` e passa por propriedade.

- [ ] **Passo 4: Conferir e salvar**

Rodar: `npx tsc --noEmit`, `npx vitest run` e `npm run lint`
Esperado: tudo limpo.

Abrir o perfil, com uma conta fictícia com XP, em 1366 e 375 de largura, inclusive no topo das patentes.
Esperado: barra certa e sem rolagem horizontal.

```bash
git add site/src
git commit -m "feat: patente no perfil, partida, sino e banner"
```

---

### Task 6: Plugin envia o resultado e mostra o XP

**Arquivos:**
- Modificar: `servidor/plugins/MagnatasDiversao/MagnatasDiversao.cs`
- Modificar: `servidor/scripts/iniciar_diversao.sh`, `servidor/tests/test_diversao.py`

**Interfaces:**
- Consome: o formato da Task 3.
- Produz: em `ConfiguracaoDoModo`, `SiteUrl` e `Token`, gravados pelo script no JSON.

- [ ] **Passo 1: Escrever os testes de texto que falham**

- O plugin contém `/api/servidor/diversao/resultado`, `HttpClient`, `PrintToCenterHtml` e `PrintToChat`.
- O XP nunca sai do plugin: o pedido não tem campo `xp`.
- Conta os abates por conta: `AoMorrer` soma por `SteamID`, nas duas regras.
- Só chama `Server.ExecuteCommand` e `PrintTo...` dentro de `Server.NextFrame`, no retorno do envio.
- Tenta de novo: contém `TentativasDeEnvio = 3`, e o mesmo id de partida é usado nas tentativas.
- `SegundosMostrandoOVencedor = 15`. No Cada um por si, o reinício passa a `mp_restartgame 15`.
- O script lê `SITE_URL` e `SERVIDOR_TOKEN` de `$SEGREDOS` e faz `chmod 600` no JSON. O JSON não aparece em nenhuma saída de `echo`.

- [ ] **Passo 2: Rodar e ver falhar**

Rodar: `python -m pytest tests/test_diversao.py -q`, a partir de `servidor/`
Esperado: FALHA nos testes novos.

- [ ] **Passo 3: Implementar**

Guardar por conta os abates e o momento de entrada. Ao fim da partida do Equipe e a cada ciclo de 20 minutos, montar a lista de quem está conectado e enviar em uma `Task` fora do jogo, com prazo de 5 segundos por tentativa e pausa entre elas. Não esperar a resposta para seguir: o fim da partida acontece igual, com ou sem site.

Com a resposta, em `Server.NextFrame`, mostrar a cada pessoa um quadro de 15 segundos: "+ 840 XP", e "Nova patente: Empresário", se subiu. Enviar o mesmo texto no chat. O nome da patente vem da resposta do site, e precisa ser escapado antes de entrar no HTML.

Sem `SiteUrl` ou `Token`, não tenta enviar. Falha de envio vai só para o registro do servidor, sem o token.

- [ ] **Passo 4: Compilar e salvar**

Compilar no Linux.
Esperado: `0 Error(s)`, `0 Warning(s)` e `python -m pytest -q` passando.

```bash
git add servidor
git commit -m "feat: plugin envia o resultado e mostra o xp"
```

---

### Task 7: Colocar no ar e testar com o dono

**Arquivos:** nenhum, salvo correções que o teste exigir, cada uma com teste antes.

- [ ] **Passo 1: Trocar tudo**

Rodar `npm run db:migrar`, reiniciar o site (ambiente e `instrumentation.ts` não mudam, mas a migração muda o que ele lê) e religar os quatro servidores com o plugin e o script novos.

Esperado: o JSON de cada servidor com permissão 600. Nas quatro portas, só o plugin da Diversão. `/ranking` e `/diversao` respondem.

- [ ] **Passo 2: Provar o envio sem jogador**

Com `curl` no Linux e o token vindo de `cs2.env`, sem imprimi-lo, enviar um resultado de teste para o site a partir da máquina dos servidores, usando uma conta fictícia.
Esperado: resposta com `ganhos`. Depois, conferir a linha no banco e apagar a conta fictícia usada.

- [ ] **Passo 3: Pedir o teste ao dono**

Com bots e partida de 2 minutos só neste teste, o dono confere:
- no Equipe x Equipe, ao fim: o quadro com o XP no centro da tela por 15 segundos, a mensagem no chat, e o valor batendo com o perfil;
- o perfil, a barra, o sino e o banner com a patente;
- a aba Comunidade do ranking;
- o Cada um por si, com o ciclo reduzido para 2 minutos: o quadro e o XP.

- [ ] **Passo 4: Prova com o site desligado**

Com o dono de acordo, parar o site durante uma partida de teste.
Esperado: a partida termina e recomeça normalmente, sem quadro de XP, e o servidor continua jogável.

- [ ] **Passo 5: Encerrar**

Voltar os tempos reais e `bot_quota 0`. Rodar `npx vitest run`, `npx tsc --noEmit`, `npm run lint`, `python -m pytest -q` e `conferir-segredos.cjs`.
Esperado: tudo limpo.

Em seguida, a revisão independente das etapas juntas, quando o dono autorizar, e superpowers:finishing-a-development-branch.
