# Ilha Lemnos, etapa 1: plano de construção

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Pôr de pé a Ilha Lemnos, o modo extração. A etapa 1 tem:
- um servidor sempre ligado no Sirocco;
- no site: baú, kit, mercado, venda do saque, estatísticas e punições;
- no servidor: um plugin próprio, com safe zones, saque, mochila, extração e vigia de AFK e de acampar.

**Architecture:**
- **O site manda no que existe; o servidor só conta o que aconteceu.** O plugin novo `MagnatasLemnos` avisa o site por seis rotas com `SERVIDOR_TOKEN`: início, entrada, renascer, extração, morte e saída. Cada aviso tem referência única.
- **O site guarda tudo por unidade:**
  - o baú em `lemnos_itens`, uma linha por arma, granada, mochila ou saque;
  - os avisos em `lemnos_eventos`;
  - as sessões em `lemnos_sessoes`;
  - os kicks e banimentos em `lemnos_punicoes`.
- **A grana passa pelo livro-caixa que já existe**, com dois tipos novos: `venda` e `lemnos`.
- **O plugin roda só no servidor `ilha-lemnos`.** O `iniciar_diversao.sh` instala ele no lugar do MagnatasDiversao.

**Tech Stack:** Next.js e Drizzle com Postgres no site, testes com vitest (PGlite). Plugin CounterStrikeSharp em C# .NET 10, compilado na VPS. Testes Python de texto-fonte em `servidor/tests`, como o resto do servidor.

**Spec:** `docs/superpowers/specs/2026-11-15-modo-extracao-design.md`

## Global Constraints

- **Nome:** o modo se chama **Ilha Lemnos**. Os textos para o jogador são "Entrar na Ilha Lemnos", "Você extraiu da Ilha Lemnos" e "Morreu na Ilha Lemnos". No código, o prefixo é `lemnos`.
- **Grana:**
  - todo movimento entra em `lancamentos_de_grana` por `lancarGrana`/`lancarMoeda`, com referência única;
  - saldo negativo é impossível, pela regra do banco que já existe;
  - nenhuma linha é editada nem apagada.
- **Preços:** os deste plano são **proposta**. Não publicar o site sem o OK do dono na tabela da Tarefa 2.
- **Itens:** nenhum item imita skin, faca, luva, patente ou medalha da Valve. As armas são as do CS2, sem visual.
- **Plugin:** o `MagnatasLemnos` nunca registra `OnEntityDeleted`, que derrubou a Mutação em 13/11/2026.
- **Teste real:** depois de qualquer mudança no plugin, o servidor é ligado de verdade na VPS, com a troca para o mapa da Oficina, antes de dizer que está pronto.
- **Pedir o OK do dono, cada vez,** para:
  - instalar na VPS;
  - ligar ou reiniciar um servidor;
  - publicar o site.
- **O banimento por AFK ou por acampar vale só para a Ilha Lemnos,** nunca o clube.
- **Commits** terminam com `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Nunca rodar prettier.
- **Pastas de fora:** `servidor/ferramentas/estadio/`, `site/public/rascunho/`, `site/scripts/dev-partida-diversao.ts` e `sons-teste/` nunca entram em commit.
- **Comandos de teste:**
  - site: `cd site && /g/Magnatas-ferramentas/node/node.exe node_modules/vitest/vitest.mjs run <arquivo>`, mais `tsc --noEmit` e `eslint`;
  - servidor: `cd servidor && python -m pytest tests -q`, pelo Git Bash.

## Review Focus

1. **O mesmo aviso chega duas vezes** (o plugin reenviou depois de um prazo). Nada se duplica e a resposta é a mesma. Testes nas Tarefas 5 e 8.
2. **O jogador volta a conectar com uma sessão ainda aberta** (o servidor caiu, ou a saída não chegou). A sessão velha fecha como `queda`, as armas voltam ao baú, e só então a nova abre. Teste na Tarefa 5.
3. **A arma de Magcoin vence no meio da sessão.** Ela continua na mão até a sessão acabar, volta ao baú vencida e não serve para a próxima entrada. Teste na Tarefa 5.
4. **Trocar o kit com a sessão aberta.** É recusado com o erro `EmCampo`. Comprar continua liberado e vai para o baú. Teste na Tarefa 4.
5. **O site fora do ar quando o plugin avisa.** O plugin guarda os avisos numa fila em ordem e reenvia até 10 minutos. Se o servidor cair com a fila cheia, o aviso de início fecha as sessões como `queda`. Teste de texto-fonte na Tarefa 12, e na Tarefa 5 o teste de `fecharSessoesDaPorta`.

---

## Parte A: site

### Tarefa 1: tabelas, migração e o servidor no banco

**Files:**
- Modify: `site/src/bd/esquema.ts`
- Create: `site/drizzle/0040_ilha_lemnos.sql`, com o snapshot e o journal gerados por `npm run db:gerar`
- Test: `site/src/dominio/lemnos/esquema.test.ts`

**Interfaces:**
- **Produces, enums:**
  - `tipoGrana` ganha `'venda'` e `'lemnos'`;
  - `modoDiversao` ganha `'lemnos'`;
  - `tipoItemLemnos`: `'arma' | 'granada' | 'mochila' | 'saque'`;
  - `origemItemLemnos`: `'grana' | 'magcoin' | 'achado'`;
  - `situacaoItemLemnos`: `'no_bau' | 'em_campo' | 'perdido' | 'vendido' | 'gasto'`;
  - `fimDaSessaoLemnos`: `'saiu' | 'morreu_saindo' | 'kick_afk' | 'kick_acampar' | 'queda'`;
  - `tipoEventoLemnos`: `'entrada' | 'renascer' | 'extracao' | 'morte' | 'saida'`.
- **Produces, tabelas:**
  - `lemnosItens` (`lemnos_itens`), uma linha por unidade:
    - `id uuid`, `usuarioId`, `tipo`, `itemId text`, `origem`, `situacao` (padrão `no_bau`);
    - `expiraEm` (pode ser vazio: para sempre ou de uso único), `sessaoId` (pode ser vazio);
    - `criadoEm`, `atualizadoEm`;
    - índice em (`usuarioId`, `situacao`).
  - `lemnosKits` (`lemnos_kits`), chave `usuarioId`:
    - `principal text` e `secundaria text` (podem ser vazios);
    - `granadas jsonb string[]` (padrão `[]`);
    - `mochila text` (pode ser vazio);
    - `atualizadoEm`.
  - `lemnosSessoes` (`lemnos_sessoes`):
    - `id uuid`, `usuarioId`, `porta int`, `iniciadaEm`, `encerradaEm` (pode ser vazio), `fim` (pode ser vazio);
    - `espacos int` (8), `abates int` (0), `mortes int` (0), `extracoes int` (0), `granaGanha int` (0), `vistaEm` (pode ser vazio);
    - índice em (`usuarioId`, `encerradaEm`).
  - `lemnosEventos` (`lemnos_eventos`):
    - `id`, `sessaoId`, `tipo`, `referencia text` **única**, `detalhes jsonb`, `resposta jsonb`, `criadoEm`.
  - `lemnosPunicoes` (`lemnos_punicoes`):
    - `id`, `usuarioId`, `motivo` (`'afk' | 'acampar'`), `criadoEm`;
    - `banidoAte` (pode ser vazio), `banidoParaSempre bool` (false);
    - `desfeitaEm` e `desfeitaPor` (podem ser vazios).
- **Na migração, depois das tabelas,** um `INSERT` em `servidores_diversao`:
  - `modo 'lemnos'`, `armas ''`, `mapa '3649316235'`, `foto '/mapas/lemnos.webp'`;
  - `porta 27024`, `vagas 20`, `ativo false`, `ordem 99`;
  - `nome_no_servidor 'ilha-lemnos'`, `sob_demanda false`.

  Só se abre para todos com o OK do dono, trocando para `ativo = true`.

- [ ] **Step 1: Write the failing test**

  ```ts
  test('a migração cria as tabelas da Ilha Lemnos e o servidor desligado', async () => {
    const bd = await criarBancoDeTeste();
    const [servidor] = await bd.select().from(servidoresDiversao).where(eq(servidoresDiversao.modo, 'lemnos'));
    expect(servidor).toMatchObject({ porta: 27024, vagas: 20, ativo: false, sobDemanda: false, nomeNoServidor: 'ilha-lemnos' });
    expect(await bd.select().from(lemnosItens)).toEqual([]);
  });
  test('a mesma referência de evento não entra duas vezes', /* insere 2x lemnosEventos com a mesma referencia; a 2ª lança erro de unique */);
  ```

- [ ] **Step 2:** Rodar e ver falhar: as tabelas não existem.
- [ ] **Step 3:** Escrever o esquema e rodar `npm run db:gerar`. No `.sql` gerado, acrescentar o `INSERT` acima e um comentário dizendo a data e o pedido do dono.
- [ ] **Step 4:** Rodar o teste e o `tsc`: PASS. Os testes de `sob-demanda`, `diversao` e `servidores-pela-equipe` também passam. Se algum quebrar por causa do novo servidor `lemnos`, ajustar só a fixture.
- [ ] **Step 5:** Commit `feat(lemnos): tabelas e servidor da Ilha Lemnos`.

### Tarefa 2: catálogo e tabela de preços (proposta)

**Files:**
- Create: `site/src/dominio/lemnos/catalogo.ts`
- Test: `site/src/dominio/lemnos/catalogo.test.ts`

**Interfaces:**
- **Produces:**
  - `type ArmaLemnos = { id: string; nome: string; classe: string; lugar: 'principal' | 'secundaria'; precoGrana: number; precoMagcoinDias: Record<DiasAVenda, number>; precoMagcoinSempre: number }`;
  - `type GranadaLemnos = { id: string; nome: string; classe: string; precoGrana: number }`;
  - `type MochilaLemnos = { id: string; nome: string; espacos: number; precoGranaDias: Record<DiasAVenda, number> | null; precoMagcoinSempre: number | null }`;
  - `type SaqueLemnos = { id: string; nome: string; raridade: 'comum' | 'raro' | 'lendario' | 'dinheiro'; valor: number }`;
  - `ARMAS`, `GRANADAS`, `MOCHILAS`, `SAQUES` (arrays `readonly`);
  - `armaLemnos(id)`, `granadaLemnos(id)`, `mochilaLemnos(id)`, `saqueLemnos(id)`, que devolvem o item ou `undefined`;
  - `MOCHILA_BASICA = 'basica'`;
  - `PISTOLA_DE_GRACA = { classe: 'weapon_glock', nome: 'Glock-18' }`.
  - `DiasAVenda` vem de `@/dominio/loja`.
- **Valores (proposta, falta o OK do dono):**

  | Item | Grana | Magcoin 1 / 3 / 5 / 9 dias | Magcoin para sempre |
  |---|---|---|---|
  | `glock`, `usp`, `p250` | 10 | 5 / 12 / 18 / 28 | 120 |
  | `deagle` | 20 | 8 / 20 / 30 / 45 | 180 |
  | `mp9`, `mac10`, `ump45` | 25 | 10 / 25 / 38 / 60 | 220 |
  | `ak47`, `m4a1`, `m4a1_silencer`, `galilar`, `famas` | 45 | 15 / 35 / 55 / 85 | 300 |
  | `awp` | 90 | 20 / 50 / 75 / 110 | 400 |

  - Granadas, só com grana: `hegrenade` 8, `flashbang` 4, `smokegrenade` 4, `molotov` 10.
  - Mochilas:

    | Mochila | Espaços | Grana 1 / 3 / 5 / 9 dias | Magcoin para sempre |
    |---|---|---|---|
    | `basica` | 8 | grátis | — |
    | `media` | 12 | 40 / 100 / 150 / 240 | 120 |
    | `grande` | 16 | 70 / 180 / 270 / 430 | 200 |
    | `tatica` | 20 | 100 / 250 / 380 / 600 | 300 |

  - Saque (valor de venda em grana):
    - **comum:** `relogio` 3, `celular` 5, `radio` 4;
    - **raro:** `joias` 20, `notebook` 25, `documentos` 15;
    - **lendário:** `barra_de_ouro` 100, `maleta_de_diamantes` 120;
    - **dinheiro:** `maco_de_notas` 8.
  - A classe de cada arma é `weapon_<id>`, com uma exceção: `m4a1_silencer` → `weapon_m4a1_silencer`.

- [ ] **Step 1:** Escrever os testes:
  - `'os preços são a proposta da tabela'`, conferindo cada valor acima;
  - `'toda classe começa com weapon_'`;
  - `'só a básica é grátis e ela não está à venda'`;
  - `'nenhum id se repete entre os quatro catálogos'`.
- [ ] **Step 2:** Ver falhar.
- [ ] **Step 3:** Escrever `catalogo.ts`. Pôr um comentário no topo: "Proposta de 15/11/2026: só vale depois do OK do dono".
- [ ] **Step 4:** PASS.
- [ ] **Step 5:** Commit.

### Tarefa 3: mercado (comprar e vender) e baú

**Files:**
- Create: `site/src/dominio/lemnos/mercado.ts`
- Test: `site/src/dominio/lemnos/mercado.test.ts`

**Interfaces:**
- **Consumes:** o catálogo da Tarefa 2; `lancarGrana`, `lancarMoeda` e `SaldoInsuficiente` de `grana.ts`; `exigirAtivo` (como faz `loja.ts`); `DIAS_A_VENDA`.
- **Produces:**
  - `comprarComGrana(bd, usuario, { itemId: string; quantidade: number; codigo: string }, agora?) => Promise<'comprado' | 'repetido'>`:
    - arma ou granada, de 1 a 10 unidades;
    - cria N linhas `origem 'grana'`;
    - **uma** linha de livro-caixa `tipo 'compra'` com `detalhes { lemnos: true, itemId, quantidade, preco }`.
  - `comprarArmaComMagcoin(bd, usuario, { itemId: string; dias: DiasAVenda | null; codigo: string }, agora?) => Promise<'comprado' | 'repetido'>`:
    - `dias null` é para sempre;
    - se a conta já tem uma linha Magcoin dessa arma, soma os dias no fim atual ou vira para sempre, e não cria outra linha;
    - arma que já é para sempre lança `JaEhSeu`, de `loja.ts`.
  - `comprarMochila(bd, usuario, { itemId: string; dias: DiasAVenda | null; codigo: string }, agora?)`:
    - com dias, paga com grana; com `null`, paga para sempre com Magcoin;
    - soma dias como acima;
    - `basica` lança `ItemInvalido`.
  - `venderSaque(bd, usuario, { linhas: string[]; codigo: string }) => Promise<{ grana: number } | 'repetido'>`:
    - só linhas `tipo 'saque'`, `no_bau`, da conta;
    - viram `vendido`;
    - **uma** linha `tipo 'venda'` com a soma.
  - `bauDaLemnos(bd, usuarioId, agora?) => Promise<ItemDoBauLemnos[]>`, com `type ItemDoBauLemnos = { linha: string; tipo; itemId; nome: string; origem; expiraEm: Date | null; vencido: boolean; emCampo: boolean }`. Mostra só `no_bau` e `em_campo`.

- [ ] **Step 1:** Escrever os testes:
  - `'comprar 3 AKs com grana cria 3 linhas e cobra uma vez 135'`;
  - `'o mesmo código não cobra duas vezes'`;
  - `'sem grana lança SaldoInsuficiente e não cria linha'`;
  - `'Magcoin por 3 dias e depois mais 3 soma 6 dias na mesma linha'`;
  - `'arma para sempre comprada de novo lança JaEhSeu'`;
  - `'mochila média por 1 dia cobra 40 de grana'`;
  - `'mochila para sempre cobra 300 de Magcoin na tática'`;
  - `'vender joias e relógio dá 23 de grana numa linha venda'`;
  - `'vender linha de outra conta ou já vendida lança ItemInvalido'`.
- [ ] **Step 2:** Ver falhar.
- [ ] **Step 3:** Implementar seguindo o padrão de `comprarItem` e `comprarParaSempre` em `loja.ts`: transação, `for('update')` na conta e o código como referência.
- [ ] **Step 4:** PASS.
- [ ] **Step 5:** Commit.

### Tarefa 4: o kit escolhido

**Files:**
- Create: `site/src/dominio/lemnos/kit.ts`
- Test: `site/src/dominio/lemnos/kit.test.ts`

**Interfaces:**
- **Produces:**
  - `class EmCampo extends Error`.
  - `escolherKit(bd, usuario, kit: { principal: string | null; secundaria: string | null; granadas: string[]; mochila: string | null }, agora?) => Promise<void>`:
    - lança `EmCampo` se a conta tem sessão aberta;
    - lança `ItemInvalido` se escolher algo que não tem (nenhuma linha usável), arma no lugar errado ou mais granadas que o limite;
    - limite de granadas: 1 `hegrenade`, 2 `flashbang`, 1 `smokegrenade`, 1 `molotov`, no máximo 4 no total.
  - `kitDe(bd, usuarioId) => Promise<KitEscolhido>`, que devolve o salvo ou o vazio.
  - `separarKit(tx, usuarioId, sessaoId, agora) => Promise<KitDaEntrada>`, com `type KitDaEntrada = { principal: PecaDoKit | null; secundaria: PecaDoKit; granadas: PecaDoKit[]; espacos: number }` e `type PecaDoKit = { linha: string | null; classe: string; magcoin: boolean }`:
    - pega uma linha usável de cada item escolhido e marca como `em_campo` com o `sessaoId`;
    - **ordem de preferência:** Magcoin que vale primeiro, porque nunca se perde; depois a de grana ou achado mais antiga;
    - item escolhido sem linha usável fica de fora, sem erro;
    - sem secundária usável, entra a `PISTOLA_DE_GRACA` com `linha: null`;
    - `espacos` vem da mochila escolhida, se valer; senão, 8.

- [ ] **Step 1:** Escrever os testes:
  - `'trocar o kit com sessão aberta lança EmCampo'`;
  - `'escolher AK sem ter AK lança ItemInvalido'`;
  - `'separarKit prefere a AK de Magcoin à de grana'`;
  - `'sem AK sobrando, entra sem principal'`;
  - `'sem secundária, entra com a Glock de graça'`;
  - `'mochila vencida volta a 8 espaços'`;
  - `'3 flashbangs lança ItemInvalido'`.
- [ ] **Step 2:** Ver falhar.
- [ ] **Step 3:** Implementar.
- [ ] **Step 4:** PASS.
- [ ] **Step 5:** Commit.

### Tarefa 5: sessões e o que acontece em cada aviso

**Files:**
- Create: `site/src/dominio/lemnos/sessoes.ts`
- Test: `site/src/dominio/lemnos/sessoes.test.ts`

**Interfaces:**
- **Consumes:** `separarKit` (Tarefa 4); `lancarGrana`; `registrarKick` (Tarefa 6); `lancarXpDaSessao` (Tarefa 7).
- **Produces.** Toda função recebe `referencia` e roda numa transação. Se a referência já está em `lemnos_eventos`, devolve a `resposta` gravada sem fazer nada.
  - `entrarNaIlha(bd, { porta, steamid64, referencia }, agora?) => Promise<RespostaDaEntrada>`, com `RespostaDaEntrada = { ok: true; sessao: string; kit: KitDaEntrada } | { ok: false; motivo: 'nao_membro' | 'banido'; ate: Date | null }`:
    - conta não ativa é `nao_membro`;
    - banimento valendo é `banido` (Tarefa 6);
    - antes de abrir, fecha como `queda` qualquer sessão aberta da conta.
  - `renascer(bd, { sessao, referencia }, agora?) => Promise<{ kit: KitDaEntrada }>`: separa um kit novo.
  - `extrair(bd, { sessao, referencia, saque: string[]; armas: { linha: string | null; classe: string }[]; gastas: string[] }, agora?) => Promise<{ linhasNovas: { classe: string; linha: string }[]; grana: number }>`:
    - cada `saque` vira linha `no_bau`, `origem 'achado'`, exceto `maco_de_notas`, que soma grana direto numa linha `tipo 'lemnos'` com a referência do evento;
    - arma com `linha null` vira linha **`em_campo`**, `origem 'achado'` (o jogador continua com ela na mão);
    - `gastas` viram `gasto`;
    - soma `extracoes` e `granaGanha` na sessão;
    - `saque` com mais itens que os `espacos` da sessão (gravados na entrada e no renascer) lança `ItemInvalido`.
  - `morrer(bd, { sessao, referencia, matador: string | null; gastas: string[] }, agora?) => Promise<void>`:
    - as `em_campo` da sessão de origem `grana` e `achado` viram `perdido`;
    - as `magcoin` voltam a `no_bau`, mesmo vencidas;
    - soma `mortes` na sessão. Se `matador` tem sessão aberta, soma `abates` na dele.
  - `sair(bd, { sessao, referencia, motivo: 'saiu' | 'kick_afk' | 'kick_acampar'; naSafeZone: boolean; gastas: string[] }, agora?) => Promise<void>`:
    - `saiu` na safe zone: tudo `em_campo` volta a `no_bau`, e `fim 'saiu'`;
    - `saiu` fora da safe zone: aplica a regra de `morrer`, e `fim 'morreu_saindo'`;
    - kick: aplica a regra de `morrer`, `fim` igual ao motivo, e chama `registrarKick`;
    - depois de qualquer saída: `lancarXpDaSessao`.
  - `fecharSessoesDaPorta(bd, { porta, referencia }, agora?) => Promise<number>`: toda sessão aberta na porta fecha como `queda`, com tudo `em_campo` de volta a `no_bau` e o XP lançado.

- [ ] **Step 1:** Escrever os testes:
  - `'entrar abre sessão e põe o kit em campo'`;
  - `'entrar duas vezes com a mesma referência devolve a mesma sessão'` (Review Focus 1);
  - `'entrar com sessão aberta fecha a velha como queda e devolve as armas'` (Review Focus 2);
  - `'banido recebe motivo banido e nada abre'`;
  - `'extrair guarda o saque, soma o maço como grana tipo lemnos e uma vez só'`;
  - `'arma achada extraída vira linha em campo'`;
  - `'morrer perde a AK de grana e devolve a de Magcoin'`;
  - `'arma de Magcoin vencida na sessão volta ao baú vencida e separarKit não usa'` (Review Focus 3);
  - `'sair na safe zone devolve tudo; fora dela perde como morte'`;
  - `'kick perde como morte e chama registrarKick'`;
  - `'fecharSessoesDaPorta devolve as armas de todas as sessões abertas da porta'` (Review Focus 5);
  - `'o abate entra na sessão do matador'`;
  - `'extrair mais saque que os espaços da sessão é recusado'`.
- [ ] **Step 2:** Ver falhar.
- [ ] **Step 3:** Implementar. A resposta de cada evento é gravada em `lemnos_eventos.resposta` na mesma transação.
- [ ] **Step 4:** PASS.
- [ ] **Step 5:** Commit.

### Tarefa 6: punições em escada

**Files:**
- Create: `site/src/dominio/lemnos/punicoes.ts`
- Test: `site/src/dominio/lemnos/punicoes.test.ts`

**Interfaces:**
- **Produces:**
  - `DIAS_SEM_KICK_PARA_ZERAR = 30`;
  - `DIAS_DO_PRIMEIRO_BANIMENTO = 3`;
  - `registrarKick(tx, usuarioId, motivo: 'afk' | 'acampar', agora) => Promise<'aviso' | 'banido_dias' | 'banido_sempre'>`;
  - `banimentoAtivo(bd | tx, usuarioId, agora) => Promise<{ ate: Date | null } | null>`, onde `ate null` é para sempre;
  - `desfazerBanimento(bd, ator, punicaoId) => Promise<void>`, com permissão `cuidar_de_lemnos` e linha em `auditoria`.
- **Como conta:**
  - A "corrente" são os kicks não desfeitos, seguidos de trás para frente, enquanto o intervalo entre um e o anterior for menor que 30 dias.
  - O 3º kick da corrente bane por 3 dias.
  - Um kick depois de um banimento por dias, na mesma corrente, bane para sempre.
  - Um kick desfeito sai da corrente.

- [ ] **Step 1:** Escrever os testes:
  - `'1º e 2º kick só avisam'`;
  - `'3º kick bane 3 dias'`;
  - `'kick depois do banimento por dias bane para sempre'`;
  - `'31 dias sem kick zera a corrente'`;
  - `'desfazer tira da corrente e registra na auditoria'`;
  - `'jogador comum não desfaz'`.
- [ ] **Step 2:** Ver falhar.
- [ ] **Step 3:** Implementar. Acrescentar `cuidar_de_lemnos: ['adm']` em `site/src/auth/permissoes.ts`.
- [ ] **Step 4:** PASS.
- [ ] **Step 5:** Commit.

### Tarefa 7: XP pelos abates, sem a grana do XP

**Files:**
- Modify: `site/src/dominio/xp.ts`, em `GanhoDePartida` e `lancarXp`
- Create: `lancarXpDaSessao` em `site/src/dominio/lemnos/sessoes.ts`, ou num arquivo `xp-lemnos.ts` se ficar grande
- Test: `site/src/dominio/xp.test.ts` e `site/src/dominio/lemnos/sessoes.test.ts`

**Interfaces:**
- **Produces:**
  - `GanhoDePartida` ganha `xpFixo?: number`, que substitui `xpDaPartida`, e `semGrana?: boolean`, que pula a `lancarGrana`;
  - `xpDeLemnos(abates: number): number = min(abates * XP_POR_ABATE, XP_MAXIMO_POR_ABATES)`, sem o XP de participar, para entrar e sair repetido não render XP;
  - `lancarXpDaSessao(tx, sessaoId)` chama `lancarXp` com:
    - `origem 'diversao'`, `referencia 'lemnos:<sessaoId>'`, `resultado 'derrota'`, `jogouAteOFim true`;
    - `xpFixo: xpDeLemnos(abates)`, `semGrana: true`, `mapa 'lemnos'`.

    Pula sessões com 0 abates.
- [ ] **Step 1:** Escrever os testes:
  - `'semGrana não cria linha de grana'`;
  - `'xpFixo substitui a conta'`;
  - `'xpDeLemnos(30) = 500'`;
  - `'sessão fechada com 3 abates lança 60 XP e nenhuma grana'`.
- [ ] **Step 2:** Ver falhar.
- [ ] **Step 3:** Implementar.
- [ ] **Step 4:** PASS. Rodar todos os testes de `xp`, `xp-diversao` e `partidas-xp`, que não podem mudar.
- [ ] **Step 5:** Commit.

### Tarefa 8: rotas que o servidor chama

**Files:**
- Create: `site/src/dominio/lemnos/api.ts`
- Create: `site/src/app/api/servidor/lemnos/[aviso]/route.ts`
- Test: `site/src/dominio/lemnos/api.test.ts`

**Interfaces:**
- **Produces:** `respostaDoAviso(bd, aviso: string, pedido: Request, token: string | undefined) => Promise<Response>`:
  - com `aviso` em `inicio | entrada | renascer | extracao | morte | saida`, chama a função da Tarefa 5;
  - sem token, 401; aviso desconhecido, 404; corpo inválido no zod, 400; corpo maior que 64 KB, 413 (usar `lerAte`);
  - responde JSON com o que a função devolveu.
- **Formatos (zod):**
  - `steamid64 /^7656\d{13}$/`;
  - `referencia /^[A-Za-z0-9:-]{1,80}$/`;
  - `sessao uuid`;
  - `saque` com no máximo 20 ids do catálogo;
  - `armas` e `gastas` com no máximo 20 cada.
- O plugin usa exatamente estes nomes de campo, em camelCase.
- [ ] **Step 1:** Escrever os testes:
  - `'sem token dá 401'`;
  - `'aviso desconhecido dá 404'`;
  - `'saque com id fora do catálogo dá 400'`;
  - `'entrada válida devolve sessão e kit'`;
  - `'o mesmo corpo duas vezes devolve a mesma resposta'`.
- [ ] **Step 2:** Ver falhar.
- [ ] **Step 3:** Implementar. A rota só faz `return respostaDoAviso(obterBd(), params.aviso, pedido, process.env.SERVIDOR_TOKEN)`.
- [ ] **Step 4:** PASS.
- [ ] **Step 5:** Commit.

### Tarefa 9: telas do jogador

**Files:**
- Create:
  - `site/src/app/(membros)/lemnos/page.tsx`: o kit e o baú;
  - `site/src/app/(membros)/lemnos/mercado/page.tsx`: comprar e vender;
  - `site/src/app/(membros)/lemnos/sessoes/[id]/page.tsx`: estatísticas;
  - `site/src/app/(membros)/lemnos/acoes.ts`.
- Create: `site/src/dominio/lemnos/estatisticas.ts`
- Modify:
  - `site/src/dominio/notificacoes.ts`: tipo `'lemnos'`;
  - `site/src/dominio/jogar.ts` e `site/src/dominio/diversao.ts`: o modo `lemnos` com o nome "Ilha Lemnos";
  - `site/src/app/(membros)/jogar/page.tsx`: o cartão da Ilha Lemnos ganha o link "Montar o kit", que leva a `/lemnos`;
  - `site/src/estilos/global.css`.
- Test: `site/src/dominio/lemnos/estatisticas.test.ts` e `site/src/dominio/notificacoes.test.ts`

**Interfaces:**
- **Consumes:** as Tarefas 3, 4 e 5.
- **Produces:**
  - `estatisticasDaSessao(bd, usuarioId, sessaoId) => Promise<EstatisticasDaSessao | null>`:
    - só da própria conta;
    - devolve tempo, abates, mortes, extrações, o que guardou, o que perdeu e `granaGanha`;
    - abrir a página marca `vistaEm`.
  - `sessaoNaoVista(bd, usuarioId) => Promise<{ id: string } | null>`: a última encerrada sem `vistaEm`.
  - A notificação diz `'Você saiu da Ilha Lemnos: veja como foi'`, com `href '/lemnos/sessoes/<id>'`.
- **Foto do cartão:** `site/public/mapas/lemnos.webp`, feita da imagem do Sirocco na Oficina. Baixar a imagem só com o OK do dono; até lá, usar a foto de um mapa que já existe.
- **Visual:** o mesmo da Magnata Shop (classes de `loja/`). Ações com `codigo` gerado na tela antes do clique, como em `loja/acoes.ts`.
- **Textos:** "Entrar na Ilha Lemnos" no Jogar; "Você extraiu da Ilha Lemnos" e "Morreu na Ilha Lemnos" nas estatísticas, conforme o fim.
- [ ] **Step 1:** Escrever os testes:
  - `'estatísticas de outra conta dá null'`;
  - `'abrir marca vista e some a notificação'`;
  - `'a notificação aparece para sessão encerrada não vista'`.
- [ ] **Step 2:** Ver falhar.
- [ ] **Step 3:** Implementar o domínio e as telas.
- [ ] **Step 4:** PASS, mais `tsc` e `eslint`. Abrir as três telas no preview `site`, com o banco local, e conferir pelo `read_page` que comprar, vender, escolher o kit e ver as estatísticas funcionam.
- [ ] **Step 5:** Commit.

### Tarefa 10: Painel ADM da Ilha Lemnos

**Files:**
- Create: `site/src/app/(membros)/painel/lemnos/page.tsx` e `acoes.ts`
- Create: `site/src/dominio/lemnos/painel.ts`
- Modify: `site/src/app/(membros)/painel/lateral-do-painel.tsx`, com o item "Ilha Lemnos" em Gestão
- Test: `site/src/dominio/lemnos/painel.test.ts`

**Interfaces:**
- **Produces:**
  - `granaDaIlhaPorDia(bd, dias = 14) => Promise<{ dia: string; venda: number; dinheiro: number }[]>`, para vigiar a inflação;
  - `banimentosDaIlha(bd) => Promise<...>`, com os que valem e os 20 últimos kicks;
  - `paresSuspeitos(bd, agora?) => Promise<{ matador: string; morto: string; vezes: number }[]>`: 5 ou mais mortes do mesmo par em 24 horas, lidas de `lemnos_eventos` do tipo `morte`.
- **Na tela:** "Desfazer" chama `desfazerBanimento`, e o gráfico usa `GraficoDeDias`.
- [ ] **Step 1:** Escrever os testes:
  - `'grana por dia separa venda de dinheiro'`;
  - `'5 mortes do mesmo par em 24h aparecem; 4 não'`.
- [ ] **Step 2:** Ver falhar.
- [ ] **Step 3:** Implementar.
- [ ] **Step 4:** PASS.
- [ ] **Step 5:** Commit.

## Parte B: servidor

### Tarefa 11: configuração e scripts

**Files:**
- Create: `servidor/config/diversao/ilha-lemnos.conf` e `ilha-lemnos.cfg`
- Create: `servidor/config/lemnos/3649316235.json`, o arquivo do mapa, que começa vazio: `{ "safeZones": [], "saidas": [], "caixas": [], "chao": [] }`
- Modify: `servidor/scripts/iniciar_diversao.sh`, `servidor/scripts/compilar_plugin.sh` e `servidor/scripts/instalar_cs2.sh`
- Test: `servidor/tests/test_lemnos.py`

**Interfaces:**
- **Produces:**
  - O `.conf`:
    - `PORTA=27024`, `VAGAS=20`, `MAPA=de_dust2`, `OFICINA=3649316235`;
    - `GAME_TYPE=3`, `GAME_MODE=0`, `BASE=lemnos_base.cfg`, `REGRAS_DO_JOGO=gamemode_custom_server.cfg`;
    - `REGRA=lemnos`, `PLUGIN_DO_MODO=MagnatasLemnos`.
  - O `.cfg` precisa ter, no mínimo:
    - `mp_teammates_are_enemies 1`;
    - `mp_ignore_round_win_conditions 1`;
    - `mp_roundtime 60`;
    - `mp_respawn_on_death_t 0` e `mp_respawn_on_death_ct 0`;
    - `sv_buy_status_override 3`;
    - `mp_death_drop_gun 1`;
    - `bot_quota 0`;
    - `mp_autokick 0`.
  - `iniciar_diversao.sh`:
    - com `PLUGIN_DO_MODO=MagnatasLemnos`, instala `/home/cs2/bin/MagnatasLemnos.dll` em `plugins/MagnatasLemnos/` e não instala o MagnatasDiversao;
    - escreve `configs/plugins/MagnatasLemnos/MagnatasLemnos.json` com `SiteUrl`, `Token`, `Porta` e `ArquivoDoMapa`, em `chmod 600`;
    - copia `config/lemnos/<OFICINA>.json` para a pasta do plugin;
    - `todos` não liga o `ilha-lemnos`, que é ligado pelo site.
  - `compilar_plugin.sh` compila os dois plugins.
  - `instalar_cs2.sh` abre `ufw allow 27024/udp`.
- [ ] **Step 1:** Escrever os testes Python:
  - `test_lemnos_usa_o_plugin_proprio`;
  - `test_lemnos_porta_27024_aberta_no_ufw`;
  - `test_cfg_do_lemnos_tem_as_regras`, um por cvar acima;
  - `test_iniciar_nao_poe_o_plugin_da_diversao_no_lemnos`;
  - `test_config_do_plugin_com_permissao_600`;
  - `test_arquivo_do_mapa_e_json_valido`;
  - `test_lemnos_mantem_visual_e_lista`: o MagnatasVisual (personagem) e o MagnatasLista (só membros) continuam vindo junto com os addons.
- [ ] **Step 2:** Ver falhar.
- [ ] **Step 3:** Implementar.
- [ ] **Step 4:** `python -m pytest tests -q` com tudo passando: os 470 de antes e os novos.
- [ ] **Step 5:** Commit.

### Tarefa 12: plugin, a base (site, kit e safe zones)

**Files:**
- Create: `servidor/plugins/MagnatasLemnos/` com:
  - `MagnatasLemnos.csproj`, copiado do MagnatasDiversao;
  - `MagnatasLemnos.cs`, com a configuração e os eventos;
  - `Site.cs`, com a fila de avisos;
  - `Kit.cs`;
  - `Zonas.cs`.
- Test: `servidor/tests/test_lemnos.py`

**Interfaces:**
- **Consumes:** as rotas da Tarefa 8, com os mesmos nomes de campo, e o arquivo do mapa da Tarefa 11.
- **Produces:**
  - Classe `IlhaLemnos : BasePlugin`, com `ModuleName "Magnatas: Ilha Lemnos"` e `ModuleVersion "0.1.0"`.
  - **`Site`:** uma fila única que envia em ordem. Se falhar, reenvia com espera crescente até 10 minutos e depois descarta, com log. Toda referência é `lemnos:<porta>:<Guid>`.
  - **Ao carregar o plugin:** manda `inicio`.
  - **Conectar:**
    - chama `entrada`;
    - `nao_membro` ou `banido` geram kick com o texto "Você está fora da Ilha Lemnos até <data>" (ou "para sempre");
    - `ok` guarda a sessão e o kit e nasce numa safe zone sorteada.
  - **Kit:**
    - tira tudo, dá faca, armas e granadas pela `classe`;
    - guarda o mapa de entidade da arma para `linha`;
    - arma `magcoin: true` é marcada para sumir do chão.
  - **Safe zones:**
    - dentro, ninguém leva nem causa dano (`OnTakeDamage`);
    - quem saiu é marcado e, se voltar a entrar, é empurrado para fora;
    - renasce numa safe zone 5 segundos depois de morrer e chama `renascer`.
  - **Morte:** remove do mapa as armas Magcoin do morto e manda `morte`, com o matador e as `gastas`.
  - Lança de granada do kit vai para `gastas`.
- [ ] **Step 1:** Escrever os testes Python de texto-fonte:
  - `test_lemnos_nao_registra_OnEntityDeleted`;
  - `test_toda_chamada_ao_site_passa_pela_fila`;
  - `test_referencia_com_prefixo_lemnos`;
  - `test_fila_reenvia_ate_10_minutos`;
  - `test_safe_zone_bloqueia_dano`;
  - `test_arma_magcoin_some_do_chao_na_morte`;
  - `test_avisa_inicio_ao_carregar`.
- [ ] **Step 2:** Ver falhar.
- [ ] **Step 3:** Implementar.
- [ ] **Step 4:** pytest PASS.
- [ ] **Step 5:** Com o OK do dono, compilar na VPS. Precisa sair sem warnings, porque o projeto usa `TreatWarningsAsErrors`.
- [ ] **Step 6:** Commit.

### Tarefa 13: plugin, saque, mochila e extração

**Files:**
- Create: `servidor/plugins/MagnatasLemnos/Saque.cs`, `Mochila.cs` e `Extracao.cs`
- Test: `servidor/tests/test_lemnos.py`

**Interfaces:**
- **Produces:**
  - **Saque:**
    - nasce nos pontos `chao` e `caixas` do arquivo do mapa;
    - a raridade sai sorteada pela lista do ponto;
    - o objeto aparece com um modelo do jogo, escolhido por quem constrói;
    - reaparece de 5 a 10 minutos depois de pego, em ponto sorteado;
    - pegar é chegar a menos de 80 unidades e apertar **E** (`+use`).
  - **Mochila:**
    - lista de ids de saque, com limite `espacos`;
    - cheia, avisa "Mochila cheia";
    - o texto na tela (`PrintToCenterHtml`) mostra os espaços usados e os itens;
    - ao morrer, a mochila cai no chão como um objeto, e quem aperta **E** perto pega os itens até o próprio limite;
    - some do chão em 5 minutos.
  - **Extração:**
    - parado dentro de uma `saida` por 10 segundos, com contagem na tela (andar zera);
    - chama `extracao` com o saque, as armas na mão (`linha` ou nulo) e as `gastas`;
    - a resposta liga as `linhasNovas` às armas achadas;
    - esvazia a mochila, leva para uma safe zone sorteada e mostra "Você extraiu da Ilha Lemnos" com a grana.
- [ ] **Step 1:** Escrever os testes de texto-fonte:
  - `test_extracao_espera_10_segundos_parado`;
  - `test_mochila_respeita_espacos`;
  - `test_mochila_cai_ao_morrer_e_some_em_5_minutos`;
  - `test_saque_reaparece`;
  - `test_pegar_com_use`.
- [ ] **Step 2:** Ver falhar.
- [ ] **Step 3:** Implementar.
- [ ] **Step 4:** pytest PASS.
- [ ] **Step 5:** Commit.

### Tarefa 14: plugin, vigia, saída e reinício diário

**Files:**
- Create: `servidor/plugins/MagnatasLemnos/Vigia.cs` e `Reinicio.cs`
- Test: `servidor/tests/test_lemnos.py`

**Interfaces:**
- **Produces:**
  - **AFK:**
    - 3 minutos sem botão nem movimento: aviso no chat e no centro da tela;
    - mais 30 segundos: kick com motivo `kick_afk`.
  - **Acampar:**
    - 10 minutos dentro de um raio de 300 unidades, fora da safe zone: aviso;
    - mais 60 segundos: kick com motivo `kick_acampar`.
  - **Saída:** ao desconectar, manda `saida` com o motivo e `naSafeZone`. O kick manda o motivo do kick antes de desconectar.
  - **Reinício diário às 5h** (horário de Brasília, `America/Sao_Paulo`):
    - avisos no chat aos 10, 5 e 1 minuto;
    - às 5h, `saida` de todo mundo como `saiu`, com `naSafeZone` real (quem está fora perde a mochila, como na queda);
    - depois, `quit`. O site religa sozinho, porque o servidor é sempre ligado.
- [ ] **Step 1:** Escrever os testes de texto-fonte:
  - `test_afk_3_minutos_mais_30_segundos`;
  - `test_acampar_10_minutos_300_unidades`;
  - `test_kick_manda_motivo_antes_de_desconectar`;
  - `test_reinicio_as_5_de_brasilia_com_avisos`.
- [ ] **Step 2:** Ver falhar.
- [ ] **Step 3:** Implementar.
- [ ] **Step 4:** pytest PASS.
- [ ] **Step 5:** Commit.

### Tarefa 15: marcar o mapa andando por ele

**Files:**
- Create: `servidor/plugins/MagnatasLemnos/Marcar.cs`
- Modify: `servidor/config/lemnos/3649316235.json`, preenchido com o dono
- Test: `servidor/tests/test_lemnos.py`

**Interfaces:**
- **Produces:**
  - Comandos só do Adm (MagnatasVisual já sabe quem é Adm; reaproveitar a regra):
    - `css_marcar safe|saida|caixa|chao [raio]` acrescenta a posição atual no arquivo do mapa;
    - `css_marcados` lista o que já foi marcado;
    - `css_desmarcar` apaga o último.
  - Raios padrão:
    - `safe` 600, numa lista de 3 ou 4;
    - `saida` 150.
- [ ] **Step 1:** Escrever os testes: `test_marcar_so_adm` e `test_marcar_grava_no_arquivo_do_mapa`.
- [ ] **Step 2:** Ver falhar.
- [ ] **Step 3:** Implementar.
- [ ] **Step 4:** PASS.
- [ ] **Step 5:** Commit.
- [ ] **Step 6:** Com o OK do dono, instalar e ligar o `ilha-lemnos`. Andar com ele pelo Sirocco e marcar:
  - 3 ou 4 safe zones;
  - 3 ou 4 saídas;
  - umas 20 caixas;
  - uns 60 pontos de chão.

  Depois, baixar o arquivo e fazer commit.

### Tarefa 16: prova real e abertura

- [ ] **Step 1:** Com o OK do dono, publicar o site com a migração, pelo comando de publicação de sempre.
- [ ] **Step 2:** Com o OK do dono, compilar, instalar e ligar o `ilha-lemnos` de verdade, com a troca de mapa. Conferir no registro:
  - que o plugin carregou;
  - que o aviso de `inicio` chegou com 200;
  - que não houve `Segmentation`.
- [ ] **Step 3:** Partida de teste com o dono e mais alguém. O registro do site precisa mostrar cada passo:
  - comprar uma AK com grana;
  - escolher o kit e entrar;
  - pegar saque e extrair, e conferir a grana do maço e o saque no baú;
  - morrer com a AK, conferir que ela se perdeu e que a mochila caiu;
  - sair e ver as estatísticas;
  - vender o saque.
- [ ] **Step 4:** Deixar 3 minutos AFK fora da safe zone. Conferir o kick, a perda e o kick no Painel. Desfazer pelo Painel.
- [ ] **Step 5:** Só com o OK do dono, `UPDATE servidores_diversao SET ativo = true WHERE modo = 'lemnos'`.

## Decisões que tomei no plano (o dono confere)

- **Glock-18 de graça:** sem secundária, o jogador entra com uma Glock-18 que nunca se perde. Sem ela, quem não tem grana entra só de faca.
- **Arma de Magcoin vencida no meio da sessão:** continua até a sessão acabar.
- **Reinício diário às 5h de Brasília:** quem estiver fora da safe zone perde a mochila, mas as armas voltam ao baú.
- **XP só pelos abates,** sem o XP de participar. Entrar e sair não rende XP.
- **O plugin não tem testes em C#.** Segue o padrão do servidor: testes de texto-fonte mais o teste real na VPS. As regras de quem perde o quê ficam todas no site, que tem testes de verdade.
- **A Ilha Lemnos ocupa uma vaga sempre ligada.** Ficam ela e a Mutação, das 3 de `MAXIMO_LIGADOS_PADRAO`, e sobra uma para os modos sob demanda.
