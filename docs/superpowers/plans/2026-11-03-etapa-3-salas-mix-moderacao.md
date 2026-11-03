# Etapa 3: salas, mix e moderação, plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Completar o site do Magnatas: salas 5x5 com desafio, mix automático, partidas de verdade no servidor de CS2, estatísticas, gravações, denúncias, chamado da equipe, ficha do jogador, suspensão e banimento.

**Architecture:** As regras ficam em `site/src/dominio/`, com o banco como parâmetro, testadas com PGlite. O site fala com o servidor de CS2 por RCON, atrás da interface `ControladorServidor`, com um controlador falso nos testes. O MatchZy busca a configuração da partida no site e envia eventos e gravações para rotas protegidas por token. Uma varredura periódica cuida do que expira. As telas se atualizam com consultas a cada 3 segundos.

**Tech Stack:** O da etapa 2, mais `rcon-client`.

**Spec:** `docs/2026-11-03-magnatas-design.md` (seções 4, 5.3, 5.4, 5.5 e 6)

**Depende de:** `docs/superpowers/plans/2026-11-03-etapa-2-site-e-entrada.md` concluído.

## Global Constraints

- Salas têm até 5 pessoas, e só sala completa desafia. A outra sala precisa aceitar. O desafio expira em 60 segundos.
- No mix, ao chegar em 10 pessoas, os times são sorteados e a partida começa sozinha.
- Uma pessoa só pode estar em uma sala, no mix ou em uma partida de cada vez. Só contas `ativo` participam.
- GM e Adm assistem como espectadores e não jogam na partida que assistem.
- Só os 10 jogadores da partida e a equipe entram no servidor durante a partida.
- Diversão não conta em estatística competitiva. Fantasma e mutação ficam para a etapa 4: aqui a aba mostra os cartões como "em breve".
- O banimento precisa de análise de várias partidas e denúncias. O GM propõe e o Adm confirma. Enquanto houver um único Adm, ele pode propor e confirmar sozinho. Com dois ou mais, quem propõe não confirma.
- O banimento vale para o CPF e para a conta Steam. Só um Adm reverte, em caso de erro provado, com motivo registrado.
- O GM pode expulsar um jogador da partida e suspendê-lo até a decisão do Adm. A suspensão é provisória e não é banimento.
- Se nenhum GM estiver online, o chamado vira denúncia.
- Na ficha, estatísticas ficam visíveis para todos os membros, e denúncias, só para a equipe.
- Gravações ficam 30 dias. As de jogador com denúncia aberta ficam até o caso fechar, e as que sustentam um banimento continuam guardadas.
- Toda ação da equipe vai para `auditoria`.
- Tudo que a etapa 2 definiu sobre segredos, disco C: e idioma continua valendo. Alertas do CS2AC ficam de fora até o dono decidir sobre a versão paga.

## Review Focus

- **Pessoa em dois lugares ao mesmo tempo:** entrar no mix estando em sala ou partida, ou dois pedidos juntos. Ela deve ficar em um lugar só. Testado em `exigirLivre` (Task 2) e `entrarNoMix` (Task 4).
- **Ninguém aparece para a partida:** o servidor não pode ficar preso. A partida é cancelada, e o servidor volta a ficar livre. Testado em `varrer` (Task 10).
- **Evento repetido ou fora de ordem do MatchZy:** não pode duplicar estatística nem reabrir partida. Testado em `aplicarEvento` (Task 6).
- **Servidor cheio ou fora do ar ao fechar o mix:** a partida fica aguardando servidor, e ninguém perde o lugar. Testado em `alocarServidores` (Task 5).
- **Banimento por engano:** a pessoa punida não pode ser punida duas vezes, e a reversão não pode liberar o CPF de outra conta banida. Testado em `reverterBanimento` (Task 9).

---

## Estrutura de arquivos

```
site/src/
  bd/esquema.ts                  novas tabelas
  dominio/disponibilidade.ts     uma pessoa em um lugar só
  dominio/salas.ts               criar, entrar, sair
  dominio/desafios.ts            desafiar, aceitar, recusar
  dominio/mix.ts                 fila do mix
  dominio/partidas.ts            criar, alocar, configuração do MatchZy
  dominio/eventos.ts             eventos do MatchZy e estatísticas
  dominio/gravacoes.ts           registrar e limpar gravações
  dominio/denuncias.ts           denúncias e chamados
  dominio/ficha.ts               dados da ficha do jogador
  dominio/banimentos.ts          suspensão, banimento e reversão
  dominio/varredura.ts           o que expira
  servidor-jogo/controlador.ts   interface, RCON e falso
  app/(membros)/salas, mix, diversao, partidas/[id], jogadores/[id], equipe/casos
  app/api/servidor/partidas/[numero]/config, eventos, gravacoes/[token]
servidor/scripts/iniciar_cs2.sh  RCON e variáveis do site
```

---

### Task 1: Provar a conversa com o MatchZy e guardar exemplos reais

**Files:**
- Create: `site/src/dominio/exemplos/map_result.json`, `series_end.json`, `round_end.json`
- Modify: `servidor/scripts/iniciar_cs2.sh`, `docs/superpowers/plans/2026-11-03-etapa-3-salas-mix-moderacao.md`

A documentação não mostra tudo, e o resto do plano depende destas respostas. Se alguma resposta contrariar o plano, ajustar as tasks seguintes antes de seguir.

- [ ] **Step 1: Ligar o RCON e os ajustes do MatchZy**

`iniciar_cs2.sh` passa a usar `-usercon +rcon_password "$RCON_PASSWORD"` quando a variável existir. Em `config.cfg`: `matchzy_remote_log_url`, `matchzy_remote_log_header_key Authorization`, `matchzy_remote_log_header_value "Bearer <token>"` e `matchzy_demo_upload_url`.

- [ ] **Step 2: Capturar com um receptor temporário**

Rodar no Windows um servidor Python descartável, em `.superpowers/`, que grava em arquivo todo POST recebido, com cabeçalhos, e serve um JSON de partida com o dono no time 1, um ID fictício no time 2, `players_per_team: 1` e `cvars` de partida curta.
Run: `matchzy_loadmatch_url "<url>" "Authorization" "Bearer teste"` pelo RCON.
Expected: o console confirma a partida carregada e o receptor registra o GET com o cabeçalho.

- [ ] **Step 3: Jogar uma partida curta (dono)**

O dono entra, dá `.ready` e joga contra bots até o fim.
Expected: chegam `series_start`, `going_live`, `round_end`, `map_result` e `series_end`, e a gravação chega ao receptor.

- [ ] **Step 4: Testar quem está fora da partida (dono)**

Carregar uma partida sem o dono nos times, com `matchzy_kick_when_no_match_loaded true`, e o dono tenta entrar. Depois, carregar uma partida com o dono em `spectators`.
Expected: fora da lista é expulso, e espectador entra como espectador. Se o MatchZy não expulsar, a Task 5 passa a trocar o `whitelist.cfg` por partida.

- [ ] **Step 5: Encerrar pelo RCON**

Run: `get5_endmatch` durante uma partida carregada.
Expected: a partida é cancelada e o evento correspondente chega. Anotar o evento real.

- [ ] **Step 6: Guardar os exemplos**

Salvar os corpos reais em `site/src/dominio/exemplos/`, trocando SteamIDs e nomes por valores de teste. Anotar neste plano: os nomes reais dos campos de estatística, se a gravação aceita token no caminho da URL, e o que muda nas tasks.

- [ ] **Step 7: Commit**

```bash
git add site/src/dominio/exemplos servidor/scripts/iniciar_cs2.sh docs/
git commit -m "feat: exemplos reais de eventos do matchzy"
```

---

### Task 2: Salas e disponibilidade

**Files:**
- Modify: `site/src/bd/esquema.ts`
- Create: `site/src/dominio/disponibilidade.ts`, `site/src/dominio/salas.ts`
- Test: `site/src/dominio/salas.test.ts`

**Interfaces:**
- Produces:
  - Tabelas `salas` (`id`, `nome`, `liderId`, `criadoEm`), `salaMembros` (`salaId`, `usuarioId` único, `entrouEm`), `filaMix` (`usuarioId` chave, `entrouEm`), `partidas`, `partidaJogadores`, `servidores`, `gravacoes`, `denuncias`, `chamados`, `banimentos`, `desafios`, definidas nas tasks que as usam, em uma migração por task.
  - `exigirLivre(tx, usuarioId): Promise<void>`, que lança `JaOcupado`
  - `criarSala(bd, ator, nome): Promise<Sala>`
  - `entrarNaSala(bd, ator, salaId): Promise<void>`, que lança `SalaCheia`
  - `sairDaSala(bd, ator): Promise<void>`
  - `expulsarDaSala(bd, lider, usuarioId): Promise<void>`
  - `listarSalas(bd): Promise<SalaComMembros[]>`, com salas completas primeiro

- [ ] **Step 1: Escrever os testes que falham**

```ts
test('quem cria a sala vira líder e primeiro membro');
test('o nome é obrigatório e tem no máximo 30 caracteres');
test.each(['aguardando_verificacao', 'suspenso', 'banido'])('conta %s não cria nem entra');
test('a sala aceita 5 pessoas e recusa a sexta com SalaCheia');
test('quem já está em sala não entra em outra (JaOcupado)');
test('quem está no mix não entra em sala (JaOcupado)');
test('quem está em partida ativa não entra em sala (JaOcupado)');
test('dois pedidos pela última vaga: só um entra');
test('quando o líder sai, o membro mais antigo vira líder');
test('quando o último sai, a sala é apagada');
test('só o líder expulsa, e não expulsa a si mesmo');
test('sala em partida não aceita entrada nem saída');
test('lista traz salas completas primeiro');
```

Cada teste verifica o estado no banco, por exemplo: `expect(await membros(bd, sala.id)).toHaveLength(5)` e `await expect(entrarNaSala(bd, sexto, sala.id)).rejects.toThrow(SalaCheia)`.

- [ ] **Step 2: Rodar e ver falhar**

Run: `npm test -- src/dominio/salas`
Expected: FAIL por módulo inexistente.

- [ ] **Step 3: Implementar**

Entrada na sala roda em transação com `SELECT ... FOR UPDATE` na linha da sala. `salaMembros.usuarioId` único protege contra duas salas ao mesmo tempo.

- [ ] **Step 4: Rodar e ver passar**

Run: `npm test -- src/dominio/salas`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add site/
git commit -m "feat: salas e disponibilidade"
```

---

### Task 3: Desafios

**Files:**
- Create: `site/src/dominio/desafios.ts`
- Modify: `site/src/bd/esquema.ts`
- Test: `site/src/dominio/desafios.test.ts`

**Interfaces:**
- Consumes: `criarPartida` da Task 5. Nesta task, aceitar chama uma função injetada, e a Task 5 liga a real. `sairDaSala` passa a cancelar o desafio pendente da sala.
- Produces: `desafiar(bd, lider, salaAlvoId, agora?)`, `aceitarDesafio(bd, lider, desafioId, agora?)`, `recusarDesafio(bd, lider, desafioId)`, `cancelarDesafio(bd, lider, desafioId)`, `desafiosDaSala(bd, salaId)`. Tabela `desafios`: `id`, `salaOrigemId`, `salaAlvoId`, `estado` (`pendente`, `aceito`, `recusado`, `cancelado`, `expirado`), `expiraEm`, `criadoEm`.

- [ ] **Step 1: Escrever os testes que falham**

```ts
test('líder de sala completa desafia outra sala completa');
test('sala com menos de 5 não desafia nem é desafiada');
test('só o líder desafia, aceita, recusa ou cancela');
test('uma sala não desafia a si mesma');
test('com um desafio pendente, a sala não desafia nem recebe outro');
test('aceitar cria a partida com as duas salas como times, e as salas ficam em partida');
test('dois aceites ao mesmo tempo criam uma partida só');
test('aceitar depois de 60 segundos falha e marca expirado');
test('aceitar com um membro que saiu falha, porque a sala não está mais completa');
test('recusar libera as duas salas para novos desafios');
test('sair com desafio pendente cancela o desafio');
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npm test -- src/dominio/desafios`
Expected: FAIL por módulo inexistente.

- [ ] **Step 3: Implementar**

`aceitarDesafio` usa `UPDATE desafios SET estado='aceito' WHERE id=? AND estado='pendente' AND expira_em > agora RETURNING`, com a criação da partida na mesma transação.

- [ ] **Step 4: Rodar e ver passar**

Run: `npm test -- src/dominio/desafios`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add site/
git commit -m "feat: desafios entre salas"
```

---

### Task 4: Mix

**Files:**
- Create: `site/src/dominio/mix.ts`
- Test: `site/src/dominio/mix.test.ts`

**Interfaces:**
- Produces: `entrarNoMix(bd, ator, opcoes?: { semente?: number }): Promise<{ partidaId?: string }>`, `sairDoMix(bd, ator)`, `verMix(bd): Promise<{ jogadores: UsuarioPublico[]; total: number }>`.

- [ ] **Step 1: Escrever os testes que falham**

```ts
test('entrar coloca a pessoa na fila, e sair tira');
test('quem está em sala ou partida não entra (JaOcupado)');
test('entrar duas vezes não duplica');
test('o décimo fecha o mix: cria a partida, esvazia a fila e sorteia dois times de 5');
test('dois entrando ao mesmo tempo no 9/10 e 10/10 criam uma partida só');
test('com 12 pedidos, os 10 mais antigos jogam e 2 ficam na fila');
test('sementes diferentes geram times diferentes');
test('conta suspensa enquanto estava na fila não entra na partida e deixa a vaga para o próximo');
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npm test -- src/dominio/mix`
Expected: FAIL por módulo inexistente.

- [ ] **Step 3: Implementar**

Inserir na fila e, na mesma transação, travar a fila com `pg_advisory_xact_lock`, conferir o total e criar a partida com os 10 mais antigos que continuam `ativo`.

- [ ] **Step 4: Rodar e ver passar**

Run: `npm test -- src/dominio/mix`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add site/
git commit -m "feat: mix automatico"
```

---

### Task 5: Partidas, servidores e configuração do MatchZy

**Files:**
- Create: `site/src/dominio/partidas.ts`, `site/src/servidor-jogo/controlador.ts`, `site/src/app/api/servidor/partidas/[numero]/config/route.ts`
- Modify: `site/src/bd/esquema.ts`, `site/src/dominio/desafios.ts`, `site/src/dominio/mix.ts`
- Test: `site/src/dominio/partidas.test.ts`, `site/src/servidor-jogo/controlador.test.ts`

**Interfaces:**
- Produces:
  - Tabela `servidores`: `id`, `nome`, `host`, `porta`, `ativo`, `partidaId`.
  - Tabela `partidas`: `id`, `numero` (serial único, é o `matchid`), `tipo` (`desafio`, `mix`), `estado` (`aguardando_servidor`, `carregando`, `aguardando_jogadores`, `ao_vivo`, `encerrada`, `cancelada`), `mapa`, `servidorId`, `vencedor`, `placar1`, `placar2`, `criadoEm`, `iniciadaEm`, `encerradaEm`.
  - Tabela `partidaJogadores`: `partidaId`, `usuarioId`, `time` (1 ou 2), `kills`, `deaths`, `assists`, `damage`, `headshotKills`, `rodadas`.
  - `criarPartida(tx, { tipo, time1, time2, mapa? }): Promise<Partida>`
  - `alocarServidores(bd, controlador): Promise<void>`
  - `configDaPartida(bd, numero): Promise<object | null>`
  - `ControladorServidor`: `{ carregarPartida(servidor, numero): Promise<void>; encerrarPartida(servidor): Promise<void>; expulsar(servidor, steamid64): Promise<void>; }`
  - `controladorRcon(ambiente)`, `controladorFalso()`, este só em testes

- [ ] **Step 1: Escrever os testes que falham**

```ts
test('partida nasce aguardando servidor, com 5 jogadores em cada time e mapa do conjunto');
test('alocar usa um servidor livre, passa para carregando e pede o carregamento');
test('sem servidor livre, a partida espera, e ninguém perde o lugar');
test('servidor inativo não é usado');
test('dois servidores e três partidas: a mais antiga é atendida primeiro, e a terceira espera');
test('falha de RCON devolve a partida para aguardando servidor e libera o servidor');
test('config traz matchid, mapa, times com apelidos, players_per_team 5 e skip_veto');
test('config coloca GMs e Adms ativos em spectators, menos quem está jogando');
test('config de partida encerrada ou desconhecida é null');
test('a rota de config recusa token errado');
test('expulsar acha o userid no status e chama kickid');
test('expulsar quem não está no servidor não dá erro');
```

```ts
test('lê o userid no texto do status', () => {
  expect(acharUserId(STATUS_EXEMPLO, STEAM_A)).toBe(3);
  expect(acharUserId(STATUS_EXEMPLO, STEAM_B)).toBeNull();
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npm test -- src/dominio/partidas src/servidor-jogo`
Expected: FAIL por módulo inexistente.

- [ ] **Step 3: Implementar**

Mapas: `de_mirage`, `de_inferno`, `de_nuke`, `de_ancient`, `de_anubis`, `de_dust2`, `de_overpass`. O RCON usa `rcon-client` com `RCON_SENHA` e timeout de 5 segundos, chamado fora da transação do banco. O comando é `matchzy_loadmatch_url "<site>/api/servidor/partidas/<numero>/config" "Authorization" "Bearer <token>"`. Ligar `aceitarDesafio` e o mix a `criarPartida`, e chamar `alocarServidores` depois da transação. Cadastro inicial de servidor por `npm run servidor:criar`.

- [ ] **Step 4: Rodar e ver passar**

Run: `npm test -- src/dominio/partidas src/servidor-jogo src/dominio/desafios src/dominio/mix`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add site/
git commit -m "feat: partidas, servidores e configuracao do matchzy"
```

---

### Task 6: Eventos, estatísticas e gravações

**Files:**
- Create: `site/src/dominio/eventos.ts`, `site/src/dominio/gravacoes.ts`, `site/src/app/api/servidor/eventos/route.ts`, `site/src/app/api/servidor/gravacoes/[token]/route.ts`
- Modify: `site/src/bd/esquema.ts`
- Test: `site/src/dominio/eventos.test.ts`, `site/src/dominio/gravacoes.test.ts`

**Interfaces:**
- Produces:
  - `aplicarEvento(bd, evento: unknown): Promise<void>`, que recebe o JSON e ignora o que não conhece
  - Tabela `gravacoes`: `id`, `partidaId` única, `arquivo`, `bytes`, `criadoEm`, `apagadaEm`
  - `salvarGravacao(bd, pasta, cabecalhos, corpo): Promise<void>`

- [ ] **Step 1: Escrever os testes que falham**

Os testes usam os exemplos reais da Task 1.

```ts
test('going_live marca a partida como ao vivo e registra o início');
test('round_end atualiza o placar');
test('map_result grava kills, deaths, assists, dano, tiros na cabeça e rodadas de cada jogador');
test('map_result repetido não duplica nem soma de novo');
test('series_end encerra, grava o vencedor e libera o servidor');
test('series_end sem vencedor marca como cancelada');
test('evento de partida encerrada não reabre nem muda nada');
test('going_live depois de series_end é ignorado');
test('evento de matchid desconhecido é ignorado');
test.each([null, 'texto', {}, { event: 'x' }])('evento estranho %j é ignorado sem erro');
test('a rota de eventos recusa token errado e responde 200 com o certo');
test('gravação é salva na pasta configurada e registrada na partida');
test('nome de arquivo vindo do servidor não escapa da pasta (../../x)');
test('gravação de partida desconhecida é recusada');
test('corpo maior que o limite é recusado');
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npm test -- src/dominio/eventos src/dominio/gravacoes`
Expected: FAIL por módulo inexistente.

- [ ] **Step 3: Implementar**

Validar o evento com Zod, com os nomes reais da Task 1. O arquivo é salvo como `<numero>.dem.zip` em `GRAVACOES_PASTA`, sem usar o nome recebido. A liberação do servidor roda na mesma transação.

- [ ] **Step 4: Rodar e ver passar**

Run: `npm test -- src/dominio/eventos src/dominio/gravacoes`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add site/
git commit -m "feat: eventos do matchzy, estatisticas e gravacoes"
```

---

### Task 7: Telas de salas, mix, partida e diversão

**Files:**
- Modify: `site/src/app/(membros)/salas/page.tsx`, `mix/page.tsx`, `diversao/page.tsx`, `site/src/estilos/global.css`
- Create: `site/src/app/(membros)/salas/acoes.ts`, `mix/acoes.ts`, `site/src/app/(membros)/partidas/[id]/page.tsx`, `site/src/app/(membros)/atualizar.tsx`
- Test: `site/src/dominio/partidas.test.ts`

**Interfaces:**
- Produces: `partidaAtualDe(bd, usuarioId): Promise<Partida | null>`, `dadosDeConexao(partida, servidor, usuario): { url: string } | null`, `<Atualizar segundos={3} />`.

- [ ] **Step 1: Escrever os testes que falham**

```ts
test('partidaAtualDe traz a partida ativa e ignora encerradas');
test('dados de conexão aparecem para jogador da partida e para a equipe');
test('dados de conexão não aparecem para outro membro');
test('dados de conexão não aparecem antes de o servidor estar pronto');
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npm test -- src/dominio/partidas`
Expected: FAIL nos quatro testes novos.

- [ ] **Step 3: Implementar a lógica e as telas**

Seguir `modelo/opcoes.html#a-salas` e `#a-mix`: lista de salas com botão de desafiar ou entrar, sua sala com os 5 lugares e o desafio recebido, amigos online à direita. Mix com os 10 lugares e a contagem. Partida com times, placar, botão de conectar (`steam://connect/<host>:<porta>/<senha>`) e os botões de denunciar e chamar a equipe da Task 8. Diversão com os cartões de fantasma, mutação e próximo modo, como "em breve". Quando há partida ativa, salas e mix mostram um aviso com link para ela. Cada ação do servidor chama `exigirAcesso`.

- [ ] **Step 4: Rodar e ver passar**

Run: `npm test -- src/dominio/partidas`
Expected: PASS.

- [ ] **Step 5: Conferir no navegador**

Com contas fictícias do `dev-sessao`, abrir salas, mix, partida e diversão em largura de computador e de celular.
Expected: igual ao modelo A, sem rolagem horizontal e sem erro no console, com as listas se atualizando sozinhas.

- [ ] **Step 6: Commit**

```bash
git add site/
git commit -m "feat: telas de salas, mix, partida e diversao"
```

---

### Task 8: Denúncias, chamados e ficha

**Files:**
- Create: `site/src/dominio/denuncias.ts`, `site/src/dominio/ficha.ts`, `site/src/app/(membros)/jogadores/[id]/page.tsx`, `site/src/app/(membros)/equipe/casos/page.tsx`
- Modify: `site/src/bd/esquema.ts`, `site/src/app/(membros)/partidas/[id]/page.tsx`
- Test: `site/src/dominio/denuncias.test.ts`, `site/src/dominio/ficha.test.ts`

**Interfaces:**
- Produces:
  - Tabela `denuncias`: `id`, `partidaId`, `denuncianteId`, `acusadoId`, `motivo`, `estado` (`aberta`, `em_analise`, `encerrada`), `analistaId`, `conclusao`, `criadoEm`, com par único de partida, denunciante e acusado.
  - Tabela `chamados`: `id`, `partidaId`, `chamadoPor`, `estado` (`aberto`, `atendido`, `virou_denuncia`), `atendidoPor`, `criadoEm`.
  - Coluna `usuarios.vistoEm`, atualizada a cada página, para saber quem da equipe está online.
  - `denunciar(bd, ator, { partidaId, acusadoId, motivo })`, `chamarEquipe(bd, ator, partidaId, agora?)`, `atenderChamado(bd, gm, chamadoId)`, `analisarDenuncia(bd, gm, id, conclusao)`, `fichaDoJogador(bd, leitor, jogadorId)`

- [ ] **Step 1: Escrever os testes que falham**

```ts
test('jogador da partida denuncia outro jogador da partida');
test('não dá para denunciar a si mesmo nem quem não jogou');
test('quem não jogou a partida não denuncia');
test('a mesma denúncia repetida é recusada com mensagem clara');
test('o motivo é obrigatório, com no máximo 500 caracteres');
test('chamado em partida ao vivo com GM online fica aberto');
test('sem GM online há menos de 2 minutos, o chamado vira denúncia sem acusado definido');
test('chamado repetido na mesma partida reaproveita o aberto');
test('GM que está jogando a partida não atende o chamado');
test('atender registra quem atendeu e libera os dados de conexão');
test('jogador comum não vê casos nem conclui denúncia');
```

```ts
test('ficha soma as partidas competitivas', async () => {
  // duas partidas: 20/10 com 5 na cabeça e 400 de dano em 20 rodadas; 10/10 com 5 e 300 em 15
  expect(ficha.estatisticas).toEqual({
    partidas: 2, vitorias: 1, abates: 30, mortes: 20, kd: 1.5, hsPct: 33.3, adr: 20,
  });
});
test('ficha de quem nunca jogou mostra zeros, sem dividir por zero');
test('ficha de quem tem 0 mortes mostra KD igual aos abates');
test('partida cancelada não entra nas estatísticas');
test('membro vê estatísticas e histórico, mas não denúncias nem gravações');
test('equipe vê denúncias, gravações, quem convidou e quem foi convidado');
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npm test -- src/dominio/denuncias src/dominio/ficha`
Expected: FAIL por módulo inexistente.

- [ ] **Step 3: Implementar a lógica e as telas**

`/jogadores/[id]` é a ficha. `/equipe/casos` lista chamados abertos, denúncias abertas e propostas de banimento, com link para a ficha. Botões de denunciar e de chamar a equipe na tela da partida. O menu mostra um contador de casos para a equipe. Nomes de jogador são sempre tratados como texto.

- [ ] **Step 4: Rodar e ver passar**

Run: `npm test -- src/dominio/denuncias src/dominio/ficha`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add site/
git commit -m "feat: denuncias, chamados e ficha do jogador"
```

---

### Task 9: Suspensão, banimento e reversão

**Files:**
- Create: `site/src/dominio/banimentos.ts`
- Modify: `site/src/bd/esquema.ts`, `site/src/auth/permissoes.ts`, `site/src/app/(membros)/jogadores/[id]/page.tsx`, `site/src/app/(membros)/equipe/casos/page.tsx`
- Test: `site/src/dominio/banimentos.test.ts`

**Interfaces:**
- Produces:
  - Tabela `banimentos`: `id`, `usuarioId`, `cpfHmac`, `motivo`, `estado` (`proposto`, `confirmado`, `recusado`, `revertido`), `propostoPor`, `confirmadoPor`, `revertidoPor`, `motivoReversao`, `criadoEm`, `decididoEm`.
  - `suspender(bd, controlador, gm, usuarioId, motivo)`, `liberarSuspensao(bd, adm, usuarioId, motivo)`, `proporBanimento(bd, gm, usuarioId, motivo)`, `confirmarBanimento(bd, controlador, adm, banimentoId)`, `recusarBanimento(bd, adm, banimentoId, motivo)`, `reverterBanimento(bd, adm, banimentoId, motivo)`

- [ ] **Step 1: Escrever os testes que falham**

```ts
test('GM suspende: a conta fica suspensa e é expulsa do servidor');
test('conta suspensa sai da fila do mix e da sala');
test('jogador comum não suspende nem propõe');
test('ninguém suspende ou bane a si mesmo');
test('GM não suspende nem bane Adm');
test('Adm libera a suspensão, e fica registrado');
test('proposta sem motivo é recusada');
test('GM não confirma banimento');
test('com um único Adm, ele propõe e confirma sozinho');
test('com dois Adms, quem propôs não confirma, e o outro confirma');
test('confirmar: conta banida, CPF em cpfs_banidos, sessões apagadas, expulsa do servidor e fora da lista de liberados');
test('banimento de conta sem CPF ainda bloqueia a conta Steam');
test('CPF banido com outra Steam é barrado na verificação');
test('duas confirmações do mesmo banimento têm efeito uma vez só');
test('não pode haver duas propostas abertas para a mesma pessoa');
test('reverter exige motivo e só o Adm reverte');
test('reverter volta a conta para ativo, tira o CPF da lista e registra a auditoria');
test('reverter não apaga o CPF se outra conta com o mesmo código estiver banida');
test('toda ação grava ator, alvo e motivo na auditoria');
test('falha no RCON não desfaz a suspensão nem o banimento');
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npm test -- src/dominio/banimentos`
Expected: FAIL por módulo inexistente.

- [ ] **Step 3: Implementar a lógica e as telas**

A ficha mostra os botões conforme a permissão, com confirmação antes de suspender ou banir. A expulsão pelo RCON roda depois da transação, e uma falha só registra um aviso, já que a lista de liberados segue valendo.

- [ ] **Step 4: Rodar e ver passar**

Run: `npm test -- src/dominio/banimentos`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add site/
git commit -m "feat: suspensao, banimento e reversao"
```

---

### Task 10: Varredura, retenção e teste de ponta a ponta

**Files:**
- Create: `site/src/dominio/varredura.ts`, `site/scripts/dev-preencher.ts`
- Modify: `site/src/instrumentation.ts`
- Test: `site/src/dominio/varredura.test.ts`

**Interfaces:**
- Produces: `varrer(bd, controlador, pasta, agora?): Promise<void>`, chamada a cada 15 segundos em um único processo.

- [ ] **Step 1: Escrever os testes que falham**

```ts
test('desafio vencido vira expirado');
test('partida carregando há mais de 2 minutos volta a aguardar servidor e libera o servidor');
test('partida aguardando jogadores há mais de 5 minutos é cancelada, encerrada no servidor e libera o servidor');
test('partida ao vivo sem evento há 3 horas é cancelada');
test('cancelar por falta de jogadores devolve as salas e não conta em estatística');
test('varrer aloca as partidas que aguardam servidor');
test('gravação com mais de 30 dias é apagada do disco e marcada');
test('gravação com denúncia aberta fica');
test('gravação de partida de jogador banido fica');
test('rodar duas vezes seguidas não muda o resultado');
test('falha em uma etapa não impede as outras');
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npm test -- src/dominio/varredura`
Expected: FAIL por módulo inexistente.

- [ ] **Step 3: Implementar**

`instrumentation.ts` agenda `varrer` só no processo Node, sem sobrepor execuções. `dev-preencher.ts` cria contas fictícias e as coloca em uma sala ou no mix, e recusa rodar em produção.

- [ ] **Step 4: Rodar e ver passar**

Run: `npm test`
Expected: PASS em toda a suíte.

- [ ] **Step 5: Testar de ponta a ponta (dono)**

1. Preencher o mix com 9 contas fictícias, e o dono entra como décimo.
   Expected: a partida é criada, o servidor carrega, e o botão de conectar leva ao jogo.
2. Com `min_players_to_ready` de teste, jogar até o fim contra bots.
   Expected: placar, KD na ficha e gravação registrados.
3. Criar duas salas de 5 com fictícios, o dono como líder, desafiar e aceitar pela outra conta.
   Expected: partida criada.
4. Abrir denúncia, chamar a equipe e atender em outra sessão, ver o caso em `/equipe/casos`.
5. Suspender e liberar uma conta fictícia, propor e confirmar um banimento e reverter.
   Expected: a ficha, a lista de liberados e a auditoria mostram cada passo.
6. Esperar uma partida sem jogadores passar de 5 minutos.
   Expected: cancelada, e o servidor volta a ficar livre.

- [ ] **Step 6: Commit**

```bash
git add site/
git commit -m "feat: varredura, retencao e teste completo"
```
