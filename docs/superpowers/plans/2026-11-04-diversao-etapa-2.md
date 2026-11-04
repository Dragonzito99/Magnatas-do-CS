# Diversão, etapa 2: Equipe x Equipe — Plano de implementação

> **Para quem executa:** SUB-SKILL OBRIGATÓRIA: use superpowers:subagent-driven-development ou superpowers:executing-plans para seguir este plano, tarefa por tarefa. Os passos usam caixas (`- [ ]`) para acompanhamento.

**Objetivo:** o cartão Equipe x Equipe deixa de ser "Em breve": um servidor no Transport Ship, 8 x 8, renascimento na base, kit fixo, 10 minutos e vitória por abates.

**Arquitetura:** o `iniciar_diversao.sh` passa a aceitar outro modo do jogo e mapas da Oficina, lendo os dois do `.conf`. O plugin `MagnatasDiversao` ganha uma `Regra` na configuração: `cada_um` mantém o que existe, e `equipe` conta os abates, mostra no placar e encerra a partida. Uma migração ativa o cartão.

**Tecnologia:** CounterStrikeSharp (C#, .NET 10), Bash, pytest, Drizzle, PGlite, Vitest.

**Design:** `docs/superpowers/specs/2026-11-04-modos-de-diversao-design.md`

## Regras gerais

- Trabalhar na branch `etapa-diversao/equipe`, que parte da `etapa-diversao/tela-e-cada-um`. A etapa 1 ainda não teve a revisão independente e não está na `main`.
- Todo commit termina com `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Segredos nunca aparecem em saída de comando, no chat ou no repositório.
- Preparo do terminal e comandos no Linux: os mesmos do plano da etapa 1.
- `sv_cheats` fica em 0 no servidor real. Bots só em teste.

## O que o teste descartável já provou

Código em `/var/tmp/equipe-teste/`, fora do projeto. Rodou só com bots, no Transport Ship, com partida encurtada para 1 minuto.

- `game_type 3`, `game_mode 0` entrega a arma principal, as pistolas e as três granadas pela configuração (`mp_*_default_grenades`), e renasce na base.
- `+map de_dust2 +host_workshop_map 3122345065` abre o mapa ao ligar. Só `+host_workshop_map` deixa o servidor parado, sem mapa.
- O atalho `bin/linuxsteamrt64/steamapps` para `/home/cs2/diversao/oficina` funciona, e o mapa de 124 MB é baixado uma vez só.
- Somar 1 em `CCSTeam.Score` com `SetStateChanged(time, "CTeam", "m_iScore")` mostra os abates no placar de cada time.
- `TerminateRound(5f, motivo)` funciona com `mp_ignore_round_win_conditions 1`. Com vencedor (`CTsWin`, `TerroristsWin`) ou empate (`RoundDraw`), a rodada seguinte começa em 5 segundos e o plugin zera o placar. Não houve fim de partida do CS2 em nenhum dos casos.
- O aquecimento não termina sem ninguém conectado. No teste sem pessoas, usar `mp_warmup_end`. Durante o aquecimento, o plugin não inicia a contagem.

## Foco da revisão

1. Todo mundo sai no meio da partida, e outra pessoa entra depois: o placar e o tempo não podem ficar errados. Testar na Task 4.
2. Pessoa que entra no meio recebe o kit e não recomeça o tempo de ninguém. Testar na Task 4.
3. Suicídio, queda, abate de colega e dano do mundo não contam ponto (Task 1).
4. Recarregar o plugin no meio da partida não pode deixar dois relógios rodando (Task 1).
5. Os três servidores de Cada um por si continuam iguais depois da mudança no plugin e no script (Tasks 1, 2 e 4).

---

### Task 1: Regra de equipe no plugin

**Arquivos:**
- Modificar: `servidor/plugins/MagnatasDiversao/MagnatasDiversao.cs`
- Modificar: `servidor/tests/test_diversao.py`

**Interfaces:**
- Produz: em `ConfiguracaoDoModo`, `Regra` (texto, padrão `cada_um`) e `MinutosDaPartida` (inteiro, padrão 10).

- [ ] **Passo 1: Escrever os testes que falham**

Em `test_diversao.py`, testes de texto sobre `CODIGO_DO_PLUGIN`:
- `test_a_regra_de_equipe_vem_da_configuracao`: contém `Regra`, `MinutosDaPartida` e `"equipe"`.
- `test_so_abate_de_inimigo_conta_ponto`: contém `quem == alvo` e `quem.Team == alvo.Team`.
- `test_abates_aparecem_no_placar`: contém `CCSTeam`, `"m_iScore"` e `SetStateChanged`.
- `test_a_partida_decide_vitoria_empate_por_abates`: contém `TerminateRound`, `RoundEndReason.CTsWin`, `RoundEndReason.TerroristsWin` e `RoundEndReason.RoundDraw`.
- `test_aquecimento_nao_inicia_a_contagem`: contém `WarmupPeriod`.
- `test_so_um_relogio_por_partida`: contém `?.Kill()` antes do novo `AddTimer` do fim da partida.
- `test_placar_de_20_minutos_so_no_cada_um_por_si`: o `mp_restartgame` aparece dentro de um `if` que confere a regra `cada_um`.

- [ ] **Passo 2: Rodar e ver falhar**

Rodar: `python -m pytest tests/test_diversao.py -q`, a partir de `servidor/`
Esperado: FALHA nos testes novos.

- [ ] **Passo 3: Implementar**

Seguir a lógica provada em `/var/tmp/equipe-teste/TesteEquipe.cs`, com os eventos saindo cedo se `Config.Regra != "equipe"`. Ajustes em relação ao teste:
- o tempo vem de `Config.MinutosDaPartida * 60`;
- a parte de 20 minutos do `Load` só roda com a regra `cada_um`;
- sem os comandos de diagnóstico.

Em `EntregarArma`, nada muda: na equipe `ArmaPrincipal` fica vazia, e as armas vêm da configuração do jogo.

- [ ] **Passo 4: Compilar e rodar os testes**

Compilar no Linux, como na Task 4 da etapa 1.
Esperado: `0 Error(s)`, `0 Warning(s)` e `python -m pytest tests/test_diversao.py -q` passando.

- [ ] **Passo 5: Salvar**

```bash
git add servidor
git commit -m "feat: plugin com a regra de equipe"
```

---

### Task 2: Servidor do Equipe x Equipe

**Arquivos:**
- Criar: `servidor/config/diversao/equipe_base.cfg`, `servidor/config/diversao/equipe.cfg`, `servidor/config/diversao/equipe.conf`
- Modificar: `servidor/config/diversao/{ak-desert,pistola,awp}.conf`
- Modificar: `servidor/scripts/iniciar_diversao.sh`, `servidor/tests/test_diversao.py`, `docs/pendencias-antes-de-abrir.md`

- [ ] **Passo 1: Escrever os testes que falham**

Em `test_diversao.py`, `valor()` passa a ler a base indicada em `BASE` no `.conf`, e não mais sempre `cada_um_por_si.cfg`. Acrescentar:

- `.conf` dos três servidores atuais: `GAME_TYPE=1`, `GAME_MODE=2`, `BASE=cada_um_por_si.cfg`, `REGRAS_DO_JOGO=gamemode_deathmatch_server.cfg`, `REGRA=cada_um`.
- `equipe.conf`: `PORTA=27019`, `VAGAS=16`, `MAPA=de_dust2`, `OFICINA=3122345065`, `ARMA_PRINCIPAL=`, `GAME_TYPE=3`, `GAME_MODE=0`, `BASE=equipe_base.cfg`, `REGRAS_DO_JOGO=gamemode_custom_server.cfg`, `REGRA=equipe`.
- Regras do `equipe`:

| Comando | Valor |
|---|---|
| `mp_teammates_are_enemies`, `mp_friendlyfire`, `mp_randomspawn` | `0` |
| `mp_respawn_on_death_ct`, `mp_respawn_on_death_t` | `1` |
| `mp_autoteambalance`, `mp_limitteams` | `1` |
| `mp_ct_default_primary` | `weapon_m4a1` |
| `mp_t_default_primary` | `weapon_ak47` |
| `mp_ct_default_secondary` | `weapon_hkp2000` |
| `mp_t_default_secondary` | `weapon_glock` |
| `sv_buy_status_override` | `3` |
| `mp_give_player_c4` | `0` |
| `mp_ignore_round_win_conditions` | `1` |
| `mp_roundtime` | `11`, um minuto acima do plugin, para quem encerra ser ele |
| `mp_maxrounds` | `1` |
| `mp_timelimit` | `0` |
| `mp_match_end_restart` | `1` |
| `bot_quota`, `sv_cheats` | `0` |

- Linhas de `mp_ct_default_grenades` e `mp_t_default_grenades`, cada uma com as três granadas.
- Script: `+game_type "$GAME_TYPE" +game_mode "$GAME_MODE"`; `+host_workshop_map` só quando `OFICINA` existe; `cat "$CONFIGS/$BASE" "$CONFIGS/$NOME.cfg"`; grava em `$REGRAS_DO_JOGO`; JSON com `Regra`; atalho `steamapps` para `$CASA/diversao/oficina`.

Remover os testes antigos que exigem o texto fixo `+game_type 1 +game_mode 2` e `gamemode_deathmatch_server.cfg` no script. A regra passa a ser conferida nos `.conf`.

- [ ] **Passo 2: Rodar e ver falhar**

Rodar: `python -m pytest tests/test_diversao.py -q`
Esperado: FALHA, porque `equipe.conf` não existe.

- [ ] **Passo 3: Implementar**

Criar os arquivos e ajustar o script. `equipe.cfg` traz só o `hostname` `"Magnatas do CS | Equipe x Equipe"`. Os demais valores vão em `equipe_base.cfg`, como no teste provado, sem `sv_cheats 1` e sem os comandos de bots.

Acrescentar `mp_respawn_immunitytime 3` e `mp_warmuptime 0` (escolhas minhas, a conferir no teste do dono).

Em `pendencias-antes-de-abrir.md`: portas até `27019/udp` e o token `GSLT_EQUIPE`.

- [ ] **Passo 4: Rodar e ver passar**

Rodar: `python -m pytest -q`, a partir de `servidor/`, e `bash -n scripts/iniciar_diversao.sh`.
Esperado: toda a suíte passa e a sintaxe está certa.

- [ ] **Passo 5: Salvar**

```bash
git add servidor docs/pendencias-antes-de-abrir.md
git commit -m "feat: servidor do equipe x equipe"
```

---

### Task 3: Ativar o cartão no site

**Arquivos:**
- Criar: uma migração em `site/drizzle/`, gerada com `npx drizzle-kit generate --custom --name=ativar_equipe`
- Modificar: `site/src/bd/servidores-diversao.test.ts`, `site/src/dominio/diversao.test.ts`

- [ ] **Passo 1: Atualizar os testes**

Em `servidores-diversao.test.ts`, a linha de ordem 4 passa a `ativo: true`. Em `diversao.test.ts`, os hosts perguntados passam a incluir `10.0.0.4`.

- [ ] **Passo 2: Rodar e ver falhar**

Rodar: `npx vitest run src/bd/servidores-diversao.test.ts src/dominio/diversao.test.ts`, a partir de `site/`
Esperado: FALHA nas duas expectativas alteradas.

- [ ] **Passo 3: Implementar**

Migração: `UPDATE "servidores_diversao" SET "ativo" = true WHERE "porta" = 27019;`

- [ ] **Passo 4: Rodar e ver passar, e salvar**

Rodar: os mesmos testes.
Esperado: PASSA.

```bash
git add site/drizzle site/src
git commit -m "feat: ativa o cartao do equipe x equipe"
```

---

### Task 4: Colocar no ar e testar com o dono

**Arquivos:** nenhum, salvo correções que o teste exigir, cada uma com teste antes.

- [ ] **Passo 1: Trocar no Linux**

Compilar o plugin, copiar `iniciar_diversao.sh` e `config/diversao`, religar os três servidores e subir o `equipe`.

Esperado nas portas 27016 a 27019: só o plugin da Diversão, `magnatas_jogadores` respondendo e o mapa certo. Na 27019: `game_type` 3 e mapa `transportship`.

- [ ] **Passo 2: Migrar e conferir o site**

Rodar `npm run db:migrar`. Esperado: `/diversao` mostra o cartão com `0/16` e Entrar, e os outros dois modos continuam "Em breve".

- [ ] **Passo 3: Provar os 10 minutos reais**

Com bots e `mp_warmup_end`, sem ninguém conectado, deixar uma partida rodar inteira.
Esperado no registro: `Round_End` cerca de 10 minutos depois do `Round_Start`, e o placar zerado na seguinte.

- [ ] **Passo 4: Pedir o teste ao dono**

Com `bot_quota 4` e o tempo da partida reduzido para 2 minutos só neste teste, o dono confere pelo botão Entrar:
- nasce na base do time, com M4 no CT ou AK no TR, pistola padrão e as três granadas, a cada renascimento;
- não consegue comprar;
- os abates aparecem no placar de cada time;
- ao fim, aparece o vencedor, e a partida recomeça com o placar zerado;
- a proteção de 3 segundos ao renascer está boa;
- sair e entrar de novo no meio da partida não deixa placar nem tempo errados.

- [ ] **Passo 5: Encerrar**

Voltar para 10 minutos e `bot_quota 0`. Rodar `npx vitest run`, `npx tsc --noEmit`, `npm run lint`, `python -m pytest -q` e `conferir-segredos.cjs`.
Esperado: tudo limpo.

Em seguida, a revisão independente das etapas 1 e 2 juntas, quando o dono autorizar, e superpowers:finishing-a-development-branch.
