# Diversão, etapa 3: Fantasma — Plano de implementação

> **Para quem executa:** SUB-SKILL OBRIGATÓRIA: use superpowers:subagent-driven-development ou superpowers:executing-plans para seguir este plano, tarefa por tarefa. Os passos usam caixas (`- [ ]`) para acompanhar o progresso.

**Objetivo:** o cartão Fantasma deixa de ser "Em breve": um servidor no `gm_laboratory`, 8 x 8, com fantasmas invisíveis só de faca contra CTs com kit fixo, 13 rodadas, respiração que para na morte e XP ao fim da partida.

**Arquitetura:** a invisibilidade, os áudios e a bomba ficam com o script do mapa. O plugin `MagnatasDiversao` ganha a `Regra` `fantasma`, em um arquivo próprio (`Fantasma.cs`, classe parcial), com o que o mapa não faz: faca só, sorteio do kit de defuse, corte da respiração e fim da partida. As 13 rodadas e a troca de lados são do próprio jogo, pela configuração. O site só ativa o cartão, porque o XP por time já existe.

**Tecnologia:** CounterStrikeSharp v1.0.379 (C#, .NET 10), Bash, pytest, Drizzle, PGlite, Vitest.

**Design:** `docs/superpowers/specs/2026-11-04-modos-de-diversao-design.md` e, para o XP, `docs/superpowers/specs/2026-11-04-xp-e-patentes-design.md`.

## Regras gerais

- Trabalhar na branch `etapa-diversao/fantasma`, que parte da `etapa-diversao/xp`. As etapas anteriores ainda não tiveram a revisão independente, e nada vai para a `main` antes dela, a menos que o dono mande.
- Todo commit termina com `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Nunca encadear o commit depois de um teste sem conferir o resultado.
- Segredos nunca aparecem em saída de comando, no chat ou no repositório.
- `sv_cheats` e `bot_quota` ficam em 0 no servidor real. Bots só em teste.
- Sem simular item, skin, inventário ou patente oficial do jogo.
- Download do mapa `gm_laboratory`: Oficina da Steam, 58 MB, só com o OK do dono.
- Valores do dono: 13 rodadas, troca depois da 6ª, fim com 7 vitórias, até 8 de cada lado, compra bloqueada para todos.
- Valores da respiração, aprovados em teste: hashes `2454124772`, `2525673644` e `3258385741`; 3 cópias de `CrossFire_ghost_Breath01` a cada 2,5 segundos, com volume 1; segundo corte 0,1 segundo depois do primeiro.
- Comandos no terminal e no Linux: os mesmos dos planos anteriores. No site, nada de `prettier`, que não é dependência do projeto.

## O que os testes descartáveis já provaram

Código em `/var/tmp/fantasma-corte/TesteCorte.cs`, fora do projeto. Rodou com o dono de CT e bots de fantasma, em `game_type 0`, `game_mode 1`.

- O corte, o bloqueio e as cópias extras funcionam como descritos no design. Levar a lógica desse arquivo, sem os comandos `corte_*` e sem os contadores.
- O mapa roda o próprio `maps/gm_laboratory.cfg`: pulo contínuo, `sv_maxspeed 350`, radar desligado, `mp_freezetime 5`, `mp_randomspawn 1`, `mp_t_default_secondary null`, `mp_forcecamera 1` e `mp_warmup_end`. Ele também dá dinheiro e tempo de compra, que deixam de valer com `sv_buy_status_override 3`.
- O script torna invisível só o time 2 (TR). Depois da troca de lados, quem vira TR passa a ser fantasma.

**Ainda não provado:** o kit fixo neste modo do jogo, a troca depois da 6ª rodada com `mp_maxrounds 13`, o fim com 7 vitórias, o reinício automático e uma pessoa no papel de fantasma. A Task 5 e a Task 6 provam.

## Escolhas minhas, para o dono conferir

- Kit de defuse: se quem recebeu morrer, ele cai no chão e outro CT pode pegar. Continua existindo um só por rodada.
- Colete e capacete grátis para os dois times, e sem dano em colega, como no Equipe x Equipe.
- Tempo de rodada de 1:55, o padrão do jogo e o mesmo do teste aprovado.
- Se a última pessoa sair, a partida recomeça do zero para quem chegar depois.
- Aviso do fim: `CT venceu por 7 a 5`. Depois da troca, "CT" é o lado em que o time vencedor terminou.

## Foco da revisão

1. Um CT larga a M4 e um fantasma passa por cima: o fantasma continua só com faca. Teste na Task 2.
2. A 6ª rodada termina com um fantasma vivo: quem virou CT para de respirar, e quem virou TR passa a respirar. Teste na Task 3, conferência na Task 5.
3. Um fantasma vivo cai do servidor: a respiração não fica no mapa. Teste na Task 3.
4. Todo mundo sai no meio da partida: quem entra depois não herda placar velho. Teste na Task 1.
5. Nenhum CT vivo na hora do sorteio, ou um CT que sobreviveu com o kit da rodada anterior: nada quebra, e nunca há dois kits sorteados. Teste na Task 2.

---

### Task 1: A partida do Fantasma no plugin

**Arquivos:**
- Criar: `servidor/plugins/MagnatasDiversao/Fantasma.cs`
- Modificar: `servidor/plugins/MagnatasDiversao/MagnatasDiversao.cs`
- Teste: `servidor/tests/test_diversao.py`

**Interfaces:**
- Consome: `ZerarContagem()`, `AvisarFimDaPartida(string)`, `FecharPartida(string?, float)`, `Pessoas()`, `RegrasDoJogo()`, já existentes.
- Produz: `public partial class ModoDeDiversao`; `private void LigarFantasma()`; `private void ComecarRodadaDoFantasma(CCSGameRules regras)`; `private void EncerrarPartidaDoFantasma()`; `private DateTime inicioDaPartida`. As Tasks 2 e 3 acrescentam chamadas dentro de `LigarFantasma` e `ComecarRodadaDoFantasma`.

- [ ] **Passo 1: Escrever os testes que falham**

Em `test_diversao.py`, acrescentar `CODIGO_DO_FANTASMA`, lido de `plugins/MagnatasDiversao/Fantasma.cs`, e:

```python
def test_fantasma_so_liga_na_regra_dele():
    assert 'Config.Regra == "fantasma"' in CODIGO_DO_PLUGIN
    assert "LigarFantasma()" in CODIGO_DO_PLUGIN

def test_fantasma_nao_zera_a_contagem_a_cada_rodada():
    # A partida tem 13 rodadas: zerar em todas perderia os abates e o XP.
    assert "TotalRoundsPlayed == 0" in CODIGO_DO_FANTASMA
    assert 'Config.Regra == "fantasma"' in CODIGO_DO_PLUGIN[CODIGO_DO_PLUGIN.index("AoComecarRodada"):]

def test_fantasma_fecha_a_partida_uma_vez_quando_o_jogo_acaba():
    assert "EventCsWinPanelMatch" in CODIGO_DO_FANTASMA
    assert "partidaEncerrada" in CODIGO_DO_FANTASMA
    assert "FecharPartida(" in CODIGO_DO_FANTASMA

def test_fantasma_decide_o_vencedor_pelas_rodadas_dos_times():
    assert "CCSTeam" in CODIGO_DO_FANTASMA
    assert '"ct"' in CODIGO_DO_FANTASMA and '"tr"' in CODIGO_DO_FANTASMA and '"empate"' in CODIGO_DO_FANTASMA
    assert "venceu por" in CODIGO_DO_FANTASMA

def test_fantasma_envia_o_time_de_cada_conta():
    assert 'Config.Regra != "cada_um" ? time : null' in CODIGO_DO_PLUGIN

def test_abate_de_colega_nao_conta_nos_modos_com_time():
    assert 'Config.Regra != "cada_um" && quem.Team == alvo.Team' in CODIGO_DO_PLUGIN

def test_placar_de_abates_continua_so_no_equipe():
    # No Fantasma, o placar é de rodadas e quem cuida dele é o jogo.
    trecho = CODIGO_DO_PLUGIN[CODIGO_DO_PLUGIN.index("AoMorrer"):]
    assert trecho.index('Config.Regra == "equipe"') < trecho.index("MostrarNoPlacar()")

def test_fantasma_recomeca_quando_a_ultima_pessoa_sai():
    assert "EventPlayerDisconnect" in CODIGO_DO_FANTASMA
    assert "mp_restartgame 1" in CODIGO_DO_FANTASMA
```

- [ ] **Passo 2: Rodar e ver falhar**

Rodar: `python -m pytest servidor/tests/test_diversao.py -k "fantasma or colega or placar_de_abates" -q`
Esperado: FALHA, porque `Fantasma.cs` não existe.

- [ ] **Passo 3: Implementar**

`MagnatasDiversao.cs`: classe vira `partial`; versão `1.2.0`; a descrição de `Regra` passa a citar `fantasma`. `Load` chama `LigarFantasma()` quando `Config.Regra == "fantasma"`. `AoComecarRodada` chama `ComecarRodadaDoFantasma(regras)` nessa regra, sem cair no `ZerarContagem()`. `AoMorrer` passa a ignorar colega com `Config.Regra != "cada_um" && quem.Team == alvo.Team`, e só o placar de abates continua restrito ao `equipe`. `FecharPartida` envia `time = Config.Regra != "cada_um" ? time : null`.

`Fantasma.cs`:
- `ComecarRodadaDoFantasma`: com `regras.TotalRoundsPlayed == 0`, roda `ZerarContagem()` e grava `inicioDaPartida = DateTime.UtcNow`.
- Handler de `EventCsWinPanelMatch`: só na regra `fantasma` e com `partidaEncerrada` falso, chama `EncerrarPartidaDoFantasma()`.
- `EncerrarPartidaDoFantasma`: lê `Score` dos `CCSTeam` de CT e TR. O vencedor é `"ct"`, `"tr"` ou `"empate"`. Avisa com `AvisarFimDaPartida($"{lado} venceu por {maior} a {menor}")`, ou `"Empate"`, e chama `FecharPartida(vencedor, minutos)`, com os minutos desde `inicioDaPartida`, nunca abaixo de 0,01.
- Handler de `EventPlayerDisconnect`: só na regra `fantasma`; se não sobrar nenhuma de `Pessoas()` além de quem saiu, executa `mp_restartgame 1`.

- [ ] **Passo 4: Rodar e ver passar**

Rodar: o mesmo comando, depois `python -m pytest servidor/tests/test_diversao.py -q`
Esperado: PASSA, inclusive os testes antigos do Cada um por si e do Equipe x Equipe.

- [ ] **Passo 5: Compilar e salvar**

Rodar: a compilação do plano da etapa 2, com o código copiado para o Linux. Esperado: `Plugin compilado`, sem aviso, porque avisos são erros neste projeto.

```bash
git add servidor/plugins/MagnatasDiversao servidor/tests/test_diversao.py
git commit -m "feat: partida do fantasma no plugin"
```

---

### Task 2: Faca para o fantasma e sorteio do kit de defuse

**Arquivos:**
- Modificar: `servidor/plugins/MagnatasDiversao/Fantasma.cs`, `servidor/plugins/MagnatasDiversao/MagnatasDiversao.cs`
- Teste: `servidor/tests/test_diversao.py`

**Interfaces:**
- Consome: `ComecarRodadaDoFantasma` (Task 1).
- Produz: `private void DeixarSoAFaca(CCSPlayerController? jogador)`; `private void SortearKitDeDefuse()`.

- [ ] **Passo 1: Escrever os testes que falham**

```python
def test_fantasma_fica_so_com_faca_e_bomba():
    trecho = CODIGO_DO_FANTASMA[CODIGO_DO_FANTASMA.index("void DeixarSoAFaca"):]
    assert "CsTeam.Terrorist" in trecho
    assert "weapon_c4" in trecho
    assert "knife" in trecho

def test_fantasma_nao_fica_com_arma_pega_do_chao():
    assert "EventItemPickup" in CODIGO_DO_FANTASMA
    assert "DeixarSoAFaca(" in CODIGO_DO_FANTASMA[CODIGO_DO_FANTASMA.index("EventItemPickup"):]

def test_fantasma_fica_so_com_faca_ao_nascer():
    assert "DeixarSoAFaca(" in CODIGO_DO_PLUGIN[CODIGO_DO_PLUGIN.index("AoNascer"):]

def test_um_kit_de_defuse_sorteado_por_rodada():
    trecho = CODIGO_DO_FANTASMA[CODIGO_DO_FANTASMA.index("void SortearKitDeDefuse"):]
    # Quem sobreviveu ainda carrega o kit da rodada anterior.
    assert trecho.index("HasDefuser = false") < trecho.index('GiveNamedItem("item_defuser")')
    assert trecho.count('GiveNamedItem("item_defuser")') == 1
    assert "Random.Shared" in trecho
    assert "PawnIsAlive" in trecho

def test_sem_ct_vivo_o_sorteio_nao_quebra():
    trecho = CODIGO_DO_FANTASMA[CODIGO_DO_FANTASMA.index("void SortearKitDeDefuse"):]
    assert "Count == 0" in trecho

def test_avisa_quem_recebeu_o_kit():
    assert "kit de defuse" in CODIGO_DO_FANTASMA
```

- [ ] **Passo 2: Rodar e ver falhar**

Rodar: `python -m pytest servidor/tests/test_diversao.py -k "faca or defuse or kit or sorteio" -q`
Esperado: FALHA nos testes novos. `test_equipe_com_m4_ak_pistola_padrao_e_kit_de_granadas` continua passando.

- [ ] **Passo 3: Implementar**

`DeixarSoAFaca`: para jogador válido, vivo e do time TR, remove (`Remove()` na entidade) tudo que não for faca nem `weapon_c4`. Faca é o nome que contém `knife` ou `bayonet`. Se tirar algo, volta para a faca com `ExecuteClientCommand("slot3")`.

Handler de `EventItemPickup`, só na regra `fantasma`: chama `DeixarSoAFaca` depois de `EsperaAposNascer`. `AoNascer` faz o mesmo na regra `fantasma`.

`SortearKitDeDefuse`: fora do aquecimento, zera `HasDefuser` de todos os CTs (`new CCSPlayer_ItemServices(pawn.ItemServices.Handle)`, seguido de `Utilities.SetStateChanged(pawn, "CBasePlayerPawn", "m_pItemServices")`). Lista os CTs vivos; se `Count == 0`, sai. Sorteia um com `Random.Shared.Next`, entrega com `GiveNamedItem("item_defuser")` e avisa no chat: ` [Magnatas] Você recebeu o kit de defuse nesta rodada.`

`ComecarRodadaDoFantasma` agenda o sorteio para 0,2 segundo depois, quando todos já nasceram.

- [ ] **Passo 4: Rodar, compilar e salvar**

Rodar: os mesmos testes e a compilação.
Esperado: PASSA e `Plugin compilado`.

```bash
git add servidor/plugins/MagnatasDiversao servidor/tests/test_diversao.py
git commit -m "feat: faca para o fantasma e sorteio do kit de defuse"
```

---

### Task 3: Respiração que para na morte

**Arquivos:**
- Modificar: `servidor/plugins/MagnatasDiversao/Fantasma.cs`
- Teste: `servidor/tests/test_diversao.py`

**Interfaces:**
- Consome: `LigarFantasma`, `ComecarRodadaDoFantasma` e os handlers da Task 1.
- Produz: `private void Cortar(int entidade)`; `private void TocarCopiasDaRespiracao()`; o comando `magnatas_fantasma_ver`, só do servidor, usado na Task 5.

- [ ] **Passo 1: Escrever os testes que falham**

```python
def test_reconhece_os_tres_sons_da_respiracao():
    for som in ["2454124772", "2525673644", "3258385741"]:
        assert som in CODIGO_DO_FANTASMA
    assert "HookUserMessage(" in CODIGO_DO_FANTASMA

def test_bloqueia_respiracao_de_corpo_e_do_mundo():
    assert "entidade == 0" in CODIGO_DO_FANTASMA
    assert "mortos.Contains(entidade)" in CODIGO_DO_FANTASMA
    assert "HookResult.Stop" in CODIGO_DO_FANTASMA

def test_a_morte_corta_o_som_duas_vezes():
    trecho = CODIGO_DO_FANTASMA[CODIGO_DO_FANTASMA.index("EventPlayerDeath"):]
    assert "HookMode.Pre" in CODIGO_DO_FANTASMA
    assert "Cortar(entidade)" in trecho
    assert "AddTimer(RepassarCorte" in trecho
    assert "SosStopSoundEvent" in CODIGO_DO_FANTASMA

def test_copias_com_o_volume_aprovado():
    assert "CopiasDaRespiracao = 3" in CODIGO_DO_FANTASMA
    assert "IntervaloDaRespiracao = 2.5f" in CODIGO_DO_FANTASMA
    assert '"CrossFire_ghost_Breath01"' in CODIGO_DO_FANTASMA

def test_copias_so_em_fantasma_vivo():
    trecho = CODIGO_DO_FANTASMA[CODIGO_DO_FANTASMA.index("void TocarCopiasDaRespiracao"):]
    assert "PawnIsAlive" in trecho
    assert "CsTeam.Terrorist" in trecho

def test_a_lista_de_mortos_limpa_a_cada_rodada():
    assert "mortos.Clear()" in CODIGO_DO_FANTASMA[CODIGO_DO_FANTASMA.index("void ComecarRodadaDoFantasma"):]

def test_fantasma_que_cai_nao_deixa_respiracao():
    assert "Cortar(" in CODIGO_DO_FANTASMA[CODIGO_DO_FANTASMA.index("EventPlayerDisconnect"):]

def test_troca_de_lados_nao_leva_a_respiracao():
    # A rodada anterior ainda pode estar tocando: o som dura 17 segundos.
    assert "EventRoundPrestart" in CODIGO_DO_FANTASMA
    assert "tocando.Clear()" in CODIGO_DO_FANTASMA

def test_a_lista_de_sons_nao_cresce_sem_limite():
    assert "RemoveRange" in CODIGO_DO_FANTASMA

def test_o_diagnostico_e_so_do_servidor_e_nao_mostra_contas():
    trecho = CODIGO_DO_FANTASMA[CODIGO_DO_FANTASMA.index('"magnatas_fantasma_ver"'):]
    assert "CommandUsage.SERVER_ONLY" in trecho
    assert "SteamID" not in trecho
```

- [ ] **Passo 2: Rodar e ver falhar**

Rodar: `python -m pytest servidor/tests/test_diversao.py -k "respiracao or corta or copias or mortos or sons or diagnostico" -q`
Esperado: FALHA nos testes novos.

- [ ] **Passo 3: Implementar**

Levar de `TesteCorte.cs`: o gancho da mensagem 208 em `HookMode.Pre`, a guarda dos `soundevent_guid` por entidade, `Cortar`, o bloqueio e as cópias. Tudo só na regra `fantasma`, a partir de `LigarFantasma`.

Acréscimos ao teste descartável:
- Handler de `EventRoundPrestart`: corta os sons de todas as entidades e roda `tocando.Clear()`. Nessa hora a rodada nova ainda não criou a respiração dela.
- `EventPlayerDisconnect`: se o corpo existir, corta os sons dele.
- `magnatas_fantasma_ver`: uma linha por jogador, com slot, time, vivo ou morto, armas e se tem kit de defuse, e uma linha com a rodada, as vitórias de cada lado, as respirações vistas, cortadas e bloqueadas. Sem contas.

Nome de constantes: `InicioDeSom = 208`, `RepassarCorte = 0.1f`, `CopiasDaRespiracao = 3`, `VolumeDaRespiracao = 1f`, `IntervaloDaRespiracao = 2.5f`.

- [ ] **Passo 4: Rodar, compilar e salvar**

Rodar: os mesmos testes, depois `python -m pytest servidor/tests/test_diversao.py -q`, e a compilação.
Esperado: PASSA e `Plugin compilado`.

```bash
git add servidor/plugins/MagnatasDiversao servidor/tests/test_diversao.py
git commit -m "feat: respiracao do fantasma para na morte"
```

---

### Task 4: Servidor e cartão no site

**Arquivos:**
- Criar: `servidor/config/diversao/fantasma_base.cfg`, `fantasma.cfg`, `fantasma.conf`; uma migração em `site/drizzle/`, gerada com `npx drizzle-kit generate --custom --name=ativar_fantasma`
- Modificar: `servidor/tests/test_diversao.py`, `site/src/bd/servidores-diversao.test.ts`, `site/src/dominio/diversao.test.ts`, `site/src/dominio/xp-diversao.test.ts`, `docs/pendencias-antes-de-abrir.md`

**Interfaces:**
- Consome: `iniciar_diversao.sh`, que não muda; a regra `fantasma` das Tasks 1 a 3; `consequenciasDosTimes`, que já atende todo modo que não é `cada_um`.
- Produz: o servidor `fantasma` na porta `27021`, com `GSLT_FANTASMA` e `Regra` `fantasma`.

- [ ] **Passo 1: Escrever os testes que falham**

Em `test_diversao.py`, `SERVIDORES` ganha `"fantasma"`, e `test_portas_diferentes` espera também `"27021"`. Novos:

```python
def test_fantasma_no_mapa_certo_e_no_modo_do_teste():
    campos = conf("fantasma")
    assert campos["PORTA"] == "27021"
    assert campos["VAGAS"] == "16"
    assert campos["OFICINA"] == "3582464448"
    assert campos["GAME_TYPE"] == "0"
    assert campos["GAME_MODE"] == "1"
    assert campos["REGRAS_DO_JOGO"] == "gamemode_competitive_server.cfg"
    assert campos["REGRA"] == "fantasma"
    assert campos["ARMA_PRINCIPAL"] == ""

def test_fantasma_treze_rodadas_com_troca_e_sete_vitorias():
    assert valor("mp_maxrounds", "fantasma") == "13"
    assert valor("mp_halftime", "fantasma") == "1"
    assert valor("mp_match_can_clinch", "fantasma") == "1"
    assert valor("mp_overtime_enable", "fantasma") == "0"

def test_fantasma_recomeca_sozinho_com_tempo_de_ler_o_resultado():
    assert valor("mp_match_end_restart", "fantasma") == "1"
    assert valor("mp_match_restart_delay", "fantasma") == "15"
    assert valor("mp_endmatch_votenextmap", "fantasma") == "0"
    assert valor("mp_match_end_changelevel", "fantasma") == "0"

def test_fantasma_ct_com_kit_fixo():
    assert valor("mp_ct_default_primary", "fantasma") == "weapon_m4a1_silencer"
    assert valor("mp_ct_default_secondary", "fantasma") == "weapon_usp_silencer"
    assert valor("mp_ct_default_grenades", "fantasma") == '"weapon_smokegrenade weapon_flashbang weapon_hegrenade"'

def test_fantasma_tr_so_com_faca():
    assert valor("mp_t_default_primary", "fantasma") == '""'
    assert valor("mp_t_default_secondary", "fantasma") == "null"
    assert valor("mp_t_default_grenades", "fantasma") == '""'
    assert valor("mp_t_default_melee", "fantasma") == "weapon_knife"

def test_fantasma_ninguem_compra():
    assert valor("sv_buy_status_override", "fantasma") == "3"
    assert valor("mp_weapons_allow_map_placed", "fantasma") == "0"

def test_fantasma_arma_de_quem_morre_nao_vai_para_o_chao():
    assert valor("mp_death_drop_gun", "fantasma") == "0"
    assert valor("mp_death_drop_grenade", "fantasma") == "0"

def test_fantasma_tem_bomba():
    assert valor("mp_give_player_c4", "fantasma") == "1"

def test_fantasma_oito_de_cada_lado():
    assert valor("mp_autoteambalance", "fantasma") == "1"
    assert valor("mp_limitteams", "fantasma") == "1"
    assert valor("mp_friendlyfire", "fantasma") == "0"
```

Em `servidores-diversao.test.ts`, a linha de ordem 6 passa a `ativo: true`. Em `diversao.test.ts`, os hosts perguntados incluem `10.0.0.6`. Em `xp-diversao.test.ts`, `FANTASMA_INATIVO` vira `MUTACAO_INATIVO = 27020`, e entra:

```ts
test('no Fantasma, o XP sai do time, e quem jogou menos da metade não ganha', async () => {
  const ct = await membro();
  const tr = await membro();
  const atrasado = await membro();
  const ganhos = await enviar(
    resultado([jogador(ct, { minutos: 20 }), jogador(tr, { minutos: 20, time: 'tr' }), jogador(atrasado, { minutos: 2 })], { porta: 27021, duracaoMinutos: 20, vencedor: 'ct' }),
  );
  expect(ganhos.find((g) => g.steamid64 === ct.steamid64)).toMatchObject({ xp: 840 });
  expect(ganhos.find((g) => g.steamid64 === tr.steamid64)).toMatchObject({ xp: 540 });
  expect(ganhos.find((g) => g.steamid64 === atrasado.steamid64)).toMatchObject({ xp: 0 });
});
```

- [ ] **Passo 2: Rodar e ver falhar**

Rodar: `python -m pytest servidor/tests/test_diversao.py -k fantasma -q` e, de `site/`, `npx vitest run src/bd/servidores-diversao.test.ts src/dominio/diversao.test.ts src/dominio/xp-diversao.test.ts`
Esperado: FALHA por falta dos arquivos e do cartão ativo.

- [ ] **Passo 3: Implementar**

`fantasma_base.cfg`, com comentários curtos como os do `equipe_base.cfg`, e também: `sv_cheats 0`, `bot_quota 0`, `mp_teammates_are_enemies 0`, `mp_respawn_on_death_ct 0`, `mp_respawn_on_death_t 0`, `mp_ct_default_melee weapon_knife`, `mp_free_armor 2`, `mp_buy_anywhere 0`, `mp_buy_during_immunity 0`, `mp_death_drop_taser 0`, `mp_roundtime 1.92`, `mp_roundtime_defuse 1.92`, `mp_timelimit 0`, `mp_winlimit 0`, `mp_warmuptime 0`, `mp_freezetime 5`, além dos valores dos testes. `fantasma.cfg`: `hostname "Magnatas do CS | Fantasma"`. `fantasma.conf`: `MAPA=de_dust2`, `BASE=fantasma_base.cfg` e os campos do teste.

Migração: `UPDATE "servidores_diversao" SET "ativo" = true WHERE "porta" = 27021;`

`pendencias-antes-de-abrir.md`: portas até `27021/udp`, `GSLT_FANTASMA`, e o item do advogado continua citando os áudios do CrossFire.

- [ ] **Passo 4: Rodar, aplicar e salvar**

Rodar: os mesmos testes; depois, de `site/`, `npm run db:migrar` no banco de desenvolvimento.
Esperado: PASSA, e o cartão aparece como "Fora do ar" em `/diversao` enquanto o servidor não sobe.

```bash
git add servidor/config/diversao servidor/tests/test_diversao.py site/drizzle site/src docs/pendencias-antes-de-abrir.md
git commit -m "feat: servidor e cartao do fantasma"
```

---

### Task 5: Prova no servidor, com bots

Sem código novo, salvo correção. Toda mudança de plano entra no registro como decisão.

- [ ] **Passo 1: Instalar e subir**

Copiar `servidor/` para o Linux, compilar, instalar e rodar `sudo -u cs2 bash /home/cs2/bin/iniciar_diversao.sh fantasma`.
Esperado: mapa baixado uma vez em `oficina`, servidor no `gm_laboratory`, `sv_cheats` falso, `bot_quota 0`.

- [ ] **Passo 2: Conferir a configuração depois do script do mapa**

Rodar pela sonda, na porta 27021: `mp_maxrounds`, `mp_halftime`, `mp_match_can_clinch`, `sv_buy_status_override`, `mp_ct_default_primary`, `mp_t_default_secondary`, `mp_freezetime`, `mp_death_drop_gun`.
Esperado: os valores do plano. O `.cfg` do mapa pode rodar depois do nosso: se trocar algum valor que importa, registrar a decisão e corrigir no plugin.

- [ ] **Passo 3: Kit e sorteio, em cinco rodadas com bots**

Rodar: `bot_quota 8`, `mp_warmup_end`, e `magnatas_fantasma_ver` a cada rodada.
Esperado: TR só com faca e, um deles, a bomba. CT com M4-S, USP e as três granadas, inclusive quem sobreviveu e jogou granada. Exatamente um CT com kit no começo de cada rodada. Se a granada não voltar, registrar a decisão e entregar pelo plugin.

- [ ] **Passo 4: 13 rodadas de verdade**

Encurtar só no teste: `mp_roundtime_defuse 0.25`, `mp_freezetime 0`, `mp_round_restart_delay 1`. Ler o registro.
Esperado, com vitória do CT por tempo em todas: 6 a 0, troca de lados depois da 6ª rodada, 13 rodadas no total, vencedor por 7 a 6, reinício 15 segundos depois do fim, e o placar de volta a 0 a 0. Se a troca não vier depois da 6ª, registrar a decisão: `mp_halftime 0`, e o plugin chama `mp_swapteams` ao fim da 6ª.

- [ ] **Passo 5: Fim com 7 vitórias**

Só neste teste, `sv_cheats 1` e `bot_kill` nos CTs depois da troca, até um time chegar a 7.
Esperado: a partida termina nas 7 vitórias, antes da 13ª rodada, e o plugin registra um único fim.

- [ ] **Passo 6: Os outros modos com o plugin novo, e voltar ao real**

Reiniciar os quatro outros servidores com a versão nova.
Esperado: `magnatas_jogadores` responde em todos, e o Equipe x Equipe continua com `mp_roundtime 5`. No Fantasma, voltar os valores encurtados, `sv_cheats 0` e `bot_quota 0`, conferindo pela sonda.

---

### Task 6: Teste do dono e fechamento

- [ ] **Passo 1: O dono joga**

Com bots, entrar pelo cartão, em `/diversao`, em cada time.
Esperado, confirmado pelo dono:
- de CT: M4 silenciada, USP e as três granadas, sem conseguir comprar nada;
- o aviso do kit de defuse;
- de fantasma: invisível parado, só faca, plantando a bomba;
- a respiração localizável e parando na hora da morte;
- na troca de lados: quem virou CT sem respirar, quem virou TR respirando.

- [ ] **Passo 2: Partida inteira com XP**

Rodar 13 rodadas curtas, com o dono dentro, encurtando só o tempo de rodada.
Esperado: "Partida encerrada", o resultado, `+ N XP`, o reinício em 15 segundos, `POST /api/servidor/diversao/resultado` 200 no registro do site, e o mesmo valor no perfil dele.

- [ ] **Passo 3: Conferência final**

Rodar: de `site/`, `npx tsc --noEmit`, `npm run lint` e `npm test`; `python -m pytest servidor/tests -q`; `node G:/Magnatas-ferramentas/tmp/conferir-segredos.cjs`.
Esperado: tudo limpo e "Nenhum segredo no histórico".

- [ ] **Passo 4: Atualizar o design**

Em `2026-11-04-modos-de-diversao-design.md`, trocar o risco "Fantasma testado só com bots no papel de fantasma" pelo que foi provado e pelo que falta: várias pessoas ao mesmo tempo e o volume da respiração com pessoas.

```bash
git add docs servidor site
git commit -m "docs: resultado dos testes do fantasma"
```
