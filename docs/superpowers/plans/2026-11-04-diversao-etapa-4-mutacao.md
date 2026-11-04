# Diversão, etapa 4: Mutação — Plano de implementação

> **Para quem executa:** SUB-SKILL OBRIGATÓRIA: use superpowers:subagent-driven-development ou superpowers:executing-plans para seguir este plano, tarefa por tarefa. Os passos usam caixas (`- [ ]`) para acompanhar o progresso.

**Objetivo:** o cartão Mutação deixa de ser "Em breve": um servidor no `zm_biochemical_hotel`, até 16 pessoas, com o mutante sorteado depois de 20 segundos, o golpe que transforma, o tiro que empurra e XP a cada 10 rodadas.

**Arquitetura:** o plugin `MagnatasDiversao` ganha a `Regra` `mutacao`, em um arquivo próprio (`Mutacao.cs`, classe parcial). Todos nascem CT, e virar mutante é passar para TR sem morrer. O jogo não decide nada da rodada (`mp_ignore_round_win_conditions 1`): quem encerra é o plugin, como no Equipe x Equipe. No site, o XP usa a regra do Cada um por si, porque a mesma pessoa joga nos dois lados.

**Tecnologia:** CounterStrikeSharp v1.0.379 (C#, .NET 10), Bash, pytest, Drizzle, PGlite, Vitest.

**Design:** `docs/superpowers/specs/2026-11-04-modos-de-diversao-design.md` e, para o XP, `docs/superpowers/specs/2026-11-04-xp-e-patentes-design.md`.

## Regras gerais

- Trabalhar na branch `etapa-diversao/mutacao`, que parte da `etapa-diversao/fantasma`. As etapas anteriores ainda não tiveram a revisão independente, e nada vai para a `main` antes dela, a menos que o dono mande.
- Todo commit termina com `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Nunca encadear o commit depois de um teste sem conferir o resultado.
- Segredos nunca aparecem em saída de comando, no chat ou no repositório.
- `sv_cheats` e `bot_quota` ficam em 0 no servidor real. Bots só em teste.
- Sem simular item, skin, inventário ou patente oficial do jogo.
- Download do mapa `zm_biochemical_hotel`: Oficina da Steam, 38 MB, só com o OK do dono.
- Valores do dono: 20 segundos para se espalhar, 1 mutante para cada 8 jogadores, rodada de 3 minutos, até 16 pessoas, AK ou M4 por sorteio, pistola e munição de reserva infinita.
- Valores que escolhi e o dono viu: mutante com 2.000 de vida, 10% mais rápido, renascendo em 3 segundos; 10 rodadas são 1 partida para o XP.
- Comandos no terminal e no Linux: os mesmos dos planos anteriores. Sempre ligar o servidor do zero antes de dar por provado: a troca a quente esconde erros de arranque, como aconteceu no Fantasma.

## O que o teste descartável já provou

Código em `/var/tmp/mutacao-teste/TesteMutacao.cs`, fora do projeto. Rodou só com bots, no `de_dust2`, em `game_type 3`, `game_mode 0`.

- `VirtualFunctions.CBaseEntity_TakeDamageOldFunc.Hook(..., HookMode.Pre)` funciona nesta versão do jogo. `GetParam<CEntityInstance>(0)` é o alvo, `GetParam<CTakeDamageInfo>(1)` traz o autor em `Attacker.Value`, e `HookResult.Handled` cancela o dano.
- `SwitchTeam(CsTeam.Terrorist)` troca de time sem matar.
- `MaxHealth` e `Health` em 2000, com `SetStateChanged` em `m_iMaxHealth` e `m_iHealth`, valem. A rodada seguinte volta a 100 sozinha, se `MaxHealth` voltar a 100.
- `VelocityModifier = 1.1f` leva a corrida de 250 a 275. O valor precisa ser reaplicado de tempos em tempos, porque o dano pode zerar.
- `Respawn()` traz de volta depois dos 3 segundos, e o evento de nascer permite refazer os atributos.
- `SwitchTeam(CsTeam.CounterTerrorist)` em `EventRoundPrestart` faz todos nascerem humanos na rodada seguinte, com as armas do CT.
- `ConVar.Find("sv_infinite_ammo")?.SetValue(2)` vale, mesmo protegido contra o console. No RCON, é recusado.
- `Teleport(null, null, velocidade)` no `EventPlayerHurt` empurra o mutante.

**Ainda não provado:** o mapa (só foi carregado, e pode trazer regras próprias), a força do empurrão e a cor do mutante na tela, o gasto real de munição e uma pessoa jogando.

## Escolhas minhas, para o dono conferir

- **Garras:** o CS2 não permite trocar o modelo da faca sem baixar conteúdo para cada jogador. O mutante ataca com a faca do jogo e fica esverdeado. Garras de verdade ficam para quando houver arte.
- **XP:** a mesma pessoa joga nos dois lados, então não existe time vencedor na partida. Vence o terço de cima do placar, como no Cada um por si. Transformar um humano e matar um mutante contam 1 abate cada.
- **Arredondamento:** 1 mutante para cada 8, para baixo, nunca menos de 1. Com 16 pessoas são 2, e com 15 é 1.
- **Sozinho:** com menos de 2 pessoas, ninguém vira mutante. Quem chegar depois dispara o sorteio.
- **Quem entra no meio:** antes do sorteio, nasce humano. Depois, nasce mutante em até 3 segundos. Ninguém fica esperando morto.
- **Queda:** humano que morre por queda vira mutante e renasce em 3 segundos.
- **Empurrão:** 5 por ponto de dano, até 300. É o valor mais provável de mudar depois de jogar.
- **Sem colete**, para o tiro valer inteiro contra o mutante.
- **Tempo:** os 20 segundos contam dentro dos 3 minutos do relógio.
- **Entre rodadas:** 5 segundos. Entre partidas: 15, com o aviso e o XP.

## Foco da revisão

1. Dois mutantes acertam o mesmo humano no mesmo instante: ele vira mutante uma vez, e só um abate é contado. Teste na Task 1.
2. O último mutante sai do servidor com a rodada no meio: outro é sorteado, e a rodada não fica sem mutante até o fim. Teste na Task 2.
3. O último humano sai ou morre por queda: a rodada termina com vitória dos mutantes, sem ficar parada. Teste na Task 2.
4. Uma atualização do CS2 quebra o gancho de dano: o plugin continua de pé, e quem morre pelo golpe vira mutante em 3 segundos. Teste na Task 1.
5. Todo mundo sai no meio da partida: quem chega depois começa da 1ª rodada, sem XP de ninguém. Teste na Task 2.

---

### Task 1: Transformar em mutante

**Arquivos:**
- Criar: `servidor/plugins/MagnatasDiversao/Mutacao.cs`
- Modificar: `servidor/plugins/MagnatasDiversao/MagnatasDiversao.cs`, `servidor/plugins/MagnatasDiversao/Fantasma.cs`
- Teste: `servidor/tests/test_diversao.py`

**Interfaces:**
- Consome: `DeixarSoAFaca(CCSPlayerController?)`, de `Fantasma.cs`; `Registrar(CCSPlayerController)`, `naPartida`, `Pessoas()`, `EsperaAposNascer`.
- Produz: `private sealed record TipoDeMutante(string Nome, int Vida, float Velocidade, float SegundosParaRenascer, Color Cor)`; `private void LigarMutacao()`; `private void DesligarMutacao()`; `private void TransformarEmMutante(CCSPlayerController? jogador, CCSPlayerController? autor)`; `private void AplicarAtributosDoMutante(CCSPlayerController jogador)`. A Task 2 chama `ConferirFimDaRodada()` no fim de `TransformarEmMutante`, e a Task 1 deixa esse método vazio.

- [ ] **Passo 1: Escrever os testes que falham**

Em `test_diversao.py`, acrescentar `CODIGO_DA_MUTACAO`, lido de `plugins/MagnatasDiversao/Mutacao.cs`, e:

```python
def test_mutacao_so_liga_na_regra_dela():
    assert 'Config.Regra == "mutacao"' in CODIGO_DO_PLUGIN
    assert "LigarMutacao()" in CODIGO_DO_PLUGIN

def test_os_atributos_do_mutante_ficam_em_um_lugar_so():
    # Os mutantes de outros tipos entram aqui, sem reescrever o modo.
    assert "record TipoDeMutante" in CODIGO_DA_MUTACAO
    assert 'new("Mutante", 2000, 1.1f, 3f' in CODIGO_DA_MUTACAO

def test_o_golpe_transforma_sem_causar_dano():
    assert "CBaseEntity_TakeDamageOldFunc.Hook(" in CODIGO_DA_MUTACAO
    assert "HookResult.Handled" in CODIGO_DA_MUTACAO

def test_o_gancho_sai_ao_descarregar_o_plugin():
    assert "CBaseEntity_TakeDamageOldFunc.Unhook(" in CODIGO_DA_MUTACAO
    assert "DesligarMutacao()" in CODIGO_DO_PLUGIN[CODIGO_DO_PLUGIN.index("override void Unload"):]

def test_sem_o_gancho_o_plugin_continua_de_pe():
    trecho = CODIGO_DA_MUTACAO[CODIGO_DA_MUTACAO.index("void LigarMutacao"):]
    assert trecho.index("try") < trecho.index("CBaseEntity_TakeDamageOldFunc.Hook(") < trecho.index("catch")

def test_humano_que_morre_vira_mutante():
    # Queda, ou golpe se o gancho quebrar numa atualização do jogo.
    trecho = CODIGO_DA_MUTACAO[CODIGO_DA_MUTACAO.index("EventPlayerDeath"):]
    assert "SwitchTeam(CsTeam.Terrorist)" in trecho
    assert "SegundosParaRenascer" in trecho
    assert ".Respawn()" in trecho

def test_dois_golpes_nao_transformam_duas_vezes():
    trecho = CODIGO_DA_MUTACAO[CODIGO_DA_MUTACAO.index("void TransformarEmMutante"):]
    assert "PawnIsAlive: true, Team: CsTeam.CounterTerrorist" in trecho
    assert trecho.index("Team: CsTeam.CounterTerrorist") < trecho.index("SwitchTeam(CsTeam.Terrorist)")

def test_quem_vira_mutante_fica_so_com_a_faca():
    assert "DeixarSoAFaca(" in CODIGO_DA_MUTACAO[CODIGO_DA_MUTACAO.index("void AplicarAtributosDoMutante"):]

def test_mutante_nao_fica_com_arma_do_chao():
    assert '"mutacao"' in CODIGO_DO_FANTASMA[CODIGO_DO_FANTASMA.index("AoPegarItem"):]

def test_o_mutante_tem_vida_velocidade_e_cor():
    trecho = CODIGO_DA_MUTACAO[CODIGO_DA_MUTACAO.index("void AplicarAtributosDoMutante"):]
    for campo in ['"m_iHealth"', '"m_iMaxHealth"', '"m_clrRender"', "VelocityModifier"]:
        assert campo in trecho

def test_o_mutante_mantem_a_velocidade():
    assert "ManterVelocidadeDosMutantes, TimerFlags.REPEAT" in CODIGO_DA_MUTACAO

def test_todos_voltam_a_ser_humanos_na_rodada_seguinte():
    trecho = CODIGO_DA_MUTACAO[CODIGO_DA_MUTACAO.index("EventRoundPrestart"):]
    assert "SwitchTeam(CsTeam.CounterTerrorist)" in trecho
    assert "MaxHealth = VidaDoHumano" in trecho
```

- [ ] **Passo 2: Rodar e ver falhar**

Rodar: `python -m pytest servidor/tests/test_diversao.py -q`
Esperado: erro de coleta, porque `Mutacao.cs` não existe.

- [ ] **Passo 3: Implementar**

`MagnatasDiversao.cs`: `Load` chama `LigarMutacao()` na regra `mutacao`. Novo `public override void Unload(bool hotReload)`, que chama `DesligarMutacao()` nessa regra. `AoNascer` agenda `AplicarAtributosDoMutante` para quem nasce TR nessa regra. Versão `1.3.0`, e a descrição de `Regra` cita `mutacao`.

`Fantasma.cs`: `AoPegarItem` passa a valer também para `mutacao`.

`Mutacao.cs`:
- `MutanteComum = new("Mutante", 2000, 1.1f, 3f, Color.FromArgb(255, 110, 255, 110))`, e `mutanteDaRodada` aponta para ele.
- `LigarMutacao`: `AddTimer(0.5f, ManterVelocidadeDosMutantes, TimerFlags.REPEAT)`, e o gancho dentro de `try`, com `ganchoDeDano` guardando se ligou.
- `AoReceberDano(DynamicHook)`: alvo `player` CT e autor `player` TR, chama `TransformarEmMutante` em `Server.NextFrame` e retorna `HookResult.Handled`. O resto segue `Continue`, e qualquer exceção segue `Continue`.
- `TransformarEmMutante`: confere `{ IsValid: true, PawnIsAlive: true, Team: CsTeam.CounterTerrorist }`, faz `SwitchTeam(CsTeam.Terrorist)`, aplica os atributos, avisa no centro (`Você virou mutante!`) e soma 1 abate ao autor, em `naPartida` e em `ActionTrackingServices.MatchStats.Kills`.
- `AplicarAtributosDoMutante`: faca só, vida, velocidade e cor, do `mutanteDaRodada`.
- Handler de `EventPlayerDeath`: na regra `mutacao`, se o morto é TR, ou CT com a rodada em andamento, passa para TR e chama `Respawn()` depois de `SegundosParaRenascer`.
- Handler de `EventRoundPrestart`: todos os TR voltam a CT, com cor branca e `MaxHealth = VidaDoHumano` (100).

- [ ] **Passo 4: Rodar, compilar e salvar**

Rodar: os testes e a compilação.
Esperado: PASSA, inclusive os testes antigos, e `Plugin compilado`.

```bash
git add servidor/plugins/MagnatasDiversao servidor/tests/test_diversao.py
git commit -m "feat: transformar em mutante"
```

---

### Task 2: Rodada, partida e XP

**Arquivos:**
- Modificar: `servidor/plugins/MagnatasDiversao/Mutacao.cs`, `servidor/plugins/MagnatasDiversao/MagnatasDiversao.cs`
- Teste: `servidor/tests/test_diversao.py`

**Interfaces:**
- Consome: `TransformarEmMutante` (Task 1); `ZerarContagem()`, `AvisarFimDaPartida(string)`, `FecharPartida(string?, float)`, `RegrasDoJogo()`, `inicioDaPartida`, `SegundosMostrandoOVencedor`.
- Produz: `private void ComecarRodadaDaMutacao()`; `private void SortearMutantes()`; `private void ConferirFimDaRodada()`; `private void EncerrarRodadaDaMutacao(RoundEndReason motivo)`; `private void ColocarNaRodada(CCSPlayerController? jogador)`.

- [ ] **Passo 1: Escrever os testes que falham**

```python
def test_vinte_segundos_para_espalhar():
    assert "SegundosParaEspalhar = 20f" in CODIGO_DA_MUTACAO

def test_um_mutante_para_cada_oito():
    assert "JogadoresPorMutante = 8" in CODIGO_DA_MUTACAO
    assert "Math.Max(1, vivos.Count / JogadoresPorMutante)" in CODIGO_DA_MUTACAO

def test_sozinho_ninguem_vira_mutante():
    assert "vivos.Count < 2" in CODIGO_DA_MUTACAO[CODIGO_DA_MUTACAO.index("void SortearMutantes"):]

def test_mutantes_vencem_quando_nao_sobra_humano():
    assert "RoundEndReason.TerroristsWin" in CODIGO_DA_MUTACAO[CODIGO_DA_MUTACAO.index("void ConferirFimDaRodada"):]

def test_humanos_vencem_no_fim_do_tempo():
    assert "RoundEndReason.CTsWin" in CODIGO_DA_MUTACAO
    assert 'ConVar<float>.Find("mp_roundtime")' in CODIGO_DA_MUTACAO

def test_so_um_relogio_por_rodada():
    assert CODIGO_DA_MUTACAO.index("fimDaRodada?.Kill()") < CODIGO_DA_MUTACAO.index("fimDaRodada = AddTimer")
    assert CODIGO_DA_MUTACAO.index("relogioDoSorteio?.Kill()") < CODIGO_DA_MUTACAO.index("relogioDoSorteio = AddTimer")

def test_a_rodada_nao_termina_duas_vezes():
    trecho = CODIGO_DA_MUTACAO[CODIGO_DA_MUTACAO.index("void EncerrarRodadaDaMutacao"):]
    assert "if (!rodadaEmAndamento) return;" in trecho

def test_dez_rodadas_sao_uma_partida():
    assert "RodadasPorPartida = 10" in CODIGO_DA_MUTACAO
    assert "FecharPartida(null," in CODIGO_DA_MUTACAO
    assert "SegundosMostrandoOVencedor" in CODIGO_DA_MUTACAO[CODIGO_DA_MUTACAO.index("void EncerrarRodadaDaMutacao"):]

def test_a_partida_nao_zera_a_cada_rodada():
    assert "rodadasDaPartida == 0" in CODIGO_DA_MUTACAO[CODIGO_DA_MUTACAO.index("void ComecarRodadaDaMutacao"):]

def test_o_aviso_mostra_o_placar_das_rodadas():
    assert "Humanos {" in CODIGO_DA_MUTACAO
    assert "AvisarFimDaPartida(" in CODIGO_DA_MUTACAO

def test_quem_entra_no_meio_nao_fica_morto():
    assert "EventPlayerTeam" in CODIGO_DA_MUTACAO
    assert "ColocarNaRodada(" in CODIGO_DA_MUTACAO[CODIGO_DA_MUTACAO.index("EventPlayerTeam"):]

def test_quem_chega_depois_dispara_o_sorteio_que_faltou():
    assert "SortearMutantes()" in CODIGO_DA_MUTACAO[CODIGO_DA_MUTACAO.index("void ColocarNaRodada"):]

def test_se_o_ultimo_mutante_sai_outro_e_sorteado():
    assert "SortearMutantes()" in CODIGO_DA_MUTACAO[CODIGO_DA_MUTACAO.index("void ConferirFimDaRodada"):]

def test_quem_sai_pode_encerrar_a_rodada():
    assert "ConferirFimDaRodada" in CODIGO_DA_MUTACAO[CODIGO_DA_MUTACAO.index("EventPlayerDisconnect"):]

def test_se_a_ultima_pessoa_sai_a_partida_recomeca():
    trecho = CODIGO_DA_MUTACAO[CODIGO_DA_MUTACAO.index("EventPlayerDisconnect"):]
    assert "mp_restartgame 1" in trecho
    assert "rodadasDaPartida = 0" in trecho
```

- [ ] **Passo 2: Rodar e ver falhar**

Rodar: `python -m pytest servidor/tests/test_diversao.py -q`
Esperado: FALHA nos testes novos.

- [ ] **Passo 3: Implementar**

`MagnatasDiversao.cs`: `AoComecarRodada` chama `ComecarRodadaDaMutacao()` na regra `mutacao`.

`Mutacao.cs`:
- `ComecarRodadaDaMutacao`: com `rodadasDaPartida == 0`, roda `ZerarContagem()`, grava `inicioDaPartida` e zera o placar dos times. Marca `rodadaEmAndamento` e `sorteioFeito` falso. Liga `relogioDoSorteio`, de 20 segundos, e `fimDaRodada`, com o valor de `mp_roundtime`. Avisa no chat: ` [Magnatas] Espalhem-se: o mutante aparece em 20 segundos.`
- `SortearMutantes`: humanos vivos; com menos de 2, deixa `sorteioFeito` falso e sai. Senão marca `sorteioFeito`, embaralha com `Random.Shared` e transforma `Math.Max(1, vivos.Count / JogadoresPorMutante)`, sem autor.
- `ConferirFimDaRodada`: só com a rodada em andamento e o sorteio feito. Sem humano vivo, `EncerrarRodadaDaMutacao(RoundEndReason.TerroristsWin)`. Sem nenhum TR no servidor, `SortearMutantes()`.
- `EncerrarRodadaDaMutacao`: `if (!rodadaEmAndamento) return;`, desliga os relógios, soma a vitória e `rodadasDaPartida`, avisa no centro (`Humanos venceram` ou `Mutantes venceram`). Na 10ª rodada: `AvisarFimDaPartida($"Humanos {x} x {y} Mutantes")`, `FecharPartida(null, minutos)`, zera `rodadasDaPartida` e `TerminateRound(SegundosMostrandoOVencedor, motivo)`. Nas outras: `TerminateRound(SegundosEntreRodadas, motivo)`, com 5 segundos.
- `ColocarNaRodada`: para quem escolheu time e está morto. Antes do sorteio, `Respawn()` como CT; se o sorteio ficou pendente e já há 2 pessoas depois dos 20 segundos, `SortearMutantes()`. Depois do sorteio, passa para TR e renasce em `SegundosParaRenascer`.
- Handler de `EventPlayerTeam`: na regra `mutacao` e sem `Disconnect`, chama `ColocarNaRodada` depois de `EsperaAposNascer`.
- Handler de `EventPlayerDisconnect`: na regra `mutacao`; sem mais ninguém de `Pessoas()`, `rodadasDaPartida = 0` e `mp_restartgame 1`. Senão, `ConferirFimDaRodada` depois de `EsperaAposNascer`, quando a pessoa já saiu.

- [ ] **Passo 4: Rodar, compilar e salvar**

Rodar: os testes e a compilação.
Esperado: PASSA e `Plugin compilado`.

```bash
git add servidor/plugins/MagnatasDiversao servidor/tests/test_diversao.py
git commit -m "feat: rodada e partida da mutacao"
```

---

### Task 3: Armas do humano e tiro que empurra

**Arquivos:**
- Modificar: `servidor/plugins/MagnatasDiversao/Mutacao.cs`, `servidor/plugins/MagnatasDiversao/MagnatasDiversao.cs`
- Teste: `servidor/tests/test_diversao.py`

**Interfaces:**
- Consome: `ComecarRodadaDaMutacao` (Task 2).
- Produz: `private void EntregarArmaDoHumano(CCSPlayerController? jogador)`; o comando `magnatas_mutacao_ver`, só do servidor, usado na Task 5.

- [ ] **Passo 1: Escrever os testes que falham**

```python
def test_humano_recebe_ak_ou_m4_por_sorteio():
    trecho = CODIGO_DA_MUTACAO[CODIGO_DA_MUTACAO.index("void EntregarArmaDoHumano"):]
    assert "CsTeam.CounterTerrorist" in trecho
    assert "Random.Shared" in trecho
    assert '"weapon_ak47"' in CODIGO_DA_MUTACAO and '"weapon_m4a1"' in CODIGO_DA_MUTACAO

def test_o_sorteio_da_arma_vale_para_cada_rodada():
    # Quem sobreviveu ainda está com a arma da rodada anterior.
    trecho = CODIGO_DA_MUTACAO[CODIGO_DA_MUTACAO.index("void EntregarArmaDoHumano"):]
    assert trecho.index(".Remove()") < trecho.index("GiveNamedItem(")

def test_o_humano_recebe_a_arma_ao_nascer():
    assert "EntregarArmaDoHumano(" in CODIGO_DO_PLUGIN[CODIGO_DO_PLUGIN.index("AoNascer"):]

def test_municao_de_reserva_infinita():
    # O console recusa, e o mapa pode reverter ao carregar. Por isso o plugin liga a cada rodada.
    trecho = CODIGO_DA_MUTACAO[CODIGO_DA_MUTACAO.index("void ComecarRodadaDaMutacao"):]
    assert 'ConVar.Find("sv_infinite_ammo")?.SetValue(2)' in trecho

def test_tiro_empurra_o_mutante():
    trecho = CODIGO_DA_MUTACAO[CODIGO_DA_MUTACAO.index("EventPlayerHurt"):]
    assert "ForcaDoEmpurrao" in trecho
    assert "EmpurraoMaximo" in trecho
    assert "Teleport(" in trecho
    assert "ForcaDoEmpurrao = 5f" in CODIGO_DA_MUTACAO
    assert "EmpurraoMaximo = 300f" in CODIGO_DA_MUTACAO

def test_o_diagnostico_da_mutacao_e_so_do_servidor_e_nao_mostra_contas():
    trecho = CODIGO_DA_MUTACAO[CODIGO_DA_MUTACAO.index('"magnatas_mutacao_ver"'):]
    assert "CommandUsage.SERVER_ONLY" in trecho
    assert "SteamID" not in trecho
```

- [ ] **Passo 2: Rodar e ver falhar**

Rodar: `python -m pytest servidor/tests/test_diversao.py -q`
Esperado: FALHA nos testes novos.

- [ ] **Passo 3: Implementar**

`EntregarArmaDoHumano`: para CT vivo, remove AK e M4 que estiverem com ele e entrega uma das duas, por `Random.Shared`. A pistola e a faca vêm da configuração. `AoNascer` agenda isso na regra `mutacao`.

`ComecarRodadaDaMutacao` liga `sv_infinite_ammo` em 2.

Handler de `EventPlayerHurt`, na regra `mutacao`: alvo TR e autor CT. Direção horizontal do autor até o alvo. Força `Math.Min(evento.DmgHealth * ForcaDoEmpurrao, EmpurraoMaximo)`, somada à velocidade atual com `Teleport(null, null, velocidade)`.

`magnatas_mutacao_ver`: uma linha por jogador, com vaga, time, vivo, vida, velocidade, modificador e armas, e uma linha com a rodada da partida, as vitórias de cada lado, se o sorteio foi feito e se o gancho ligou. Sem contas.

- [ ] **Passo 4: Rodar, compilar e salvar**

Rodar: os testes e a compilação.
Esperado: PASSA e `Plugin compilado`.

```bash
git add servidor/plugins/MagnatasDiversao servidor/tests/test_diversao.py
git commit -m "feat: armas do humano e tiro que empurra"
```

---

### Task 4: Servidor, cartão e XP no site

**Arquivos:**
- Criar: `servidor/config/diversao/mutacao_base.cfg`, `mutacao.cfg`, `mutacao.conf`; uma migração em `site/drizzle/`, gerada com `npx drizzle-kit generate --custom --name=ativar_mutacao`
- Modificar: `site/src/dominio/xp-diversao.ts`, `servidor/tests/test_diversao.py`, `site/src/bd/servidores-diversao.test.ts`, `site/src/dominio/diversao.test.ts`, `site/src/dominio/xp-diversao.test.ts`, `docs/pendencias-antes-de-abrir.md`

**Interfaces:**
- Consome: `iniciar_diversao.sh`, que não muda; a regra `mutacao`; `consequenciasDoCadaUm`.
- Produz: o servidor `mutacao` na porta `27020`, com `GSLT_MUTACAO` e `Regra` `mutacao`.

- [ ] **Passo 1: Escrever os testes que falham**

Em `test_diversao.py`, `SERVIDORES` ganha `"mutacao"` antes de `"fantasma"`, e `test_portas_diferentes` espera `"27020"` entre `"27019"` e `"27021"`. Novos:

```python
def test_mutacao_no_mapa_certo_e_no_modo_personalizado():
    campos = conf("mutacao")
    assert campos["PORTA"] == "27020"
    assert campos["VAGAS"] == "16"
    assert campos["OFICINA"] == "3223106683"
    assert campos["GAME_TYPE"] == "3"
    assert campos["GAME_MODE"] == "0"
    assert campos["REGRAS_DO_JOGO"] == "gamemode_custom_server.cfg"
    assert campos["REGRA"] == "mutacao"
    assert campos["ARMA_PRINCIPAL"] == ""

def test_mutacao_rodada_de_tres_minutos_quem_encerra_e_o_plugin():
    assert valor("mp_roundtime", "mutacao") == "3"
    assert valor("mp_ignore_round_win_conditions", "mutacao") == "1"
    assert valor("mp_maxrounds", "mutacao") == "1"
    assert valor("mp_timelimit", "mutacao") == "0"

def test_mutacao_todos_comecam_humanos():
    assert valor("mp_humanteam", "mutacao") == "ct"
    assert valor("mp_autoteambalance", "mutacao") == "0"
    assert valor("mp_limitteams", "mutacao") == "0"

def test_mutacao_arma_principal_vem_do_plugin():
    assert valor("mp_ct_default_primary", "mutacao") == '""'
    assert valor("mp_ct_default_secondary", "mutacao") == "weapon_hkp2000"
    assert valor("mp_ct_default_grenades", "mutacao") == '""'

def test_mutacao_mutante_so_com_faca():
    assert valor("mp_t_default_primary", "mutacao") == '""'
    assert valor("mp_t_default_secondary", "mutacao") == "null"
    assert valor("mp_t_default_grenades", "mutacao") == '""'
    assert valor("mp_t_default_melee", "mutacao") == "weapon_knife"

def test_mutacao_sem_colete_sem_compra_sem_bomba():
    assert valor("mp_free_armor", "mutacao") == "0"
    assert valor("sv_buy_status_override", "mutacao") == "3"
    assert valor("mp_give_player_c4", "mutacao") == "0"

def test_mutacao_quem_renasce_e_o_plugin():
    # Se o jogo também renascesse, os dois disputariam.
    assert valor("mp_respawn_on_death_t", "mutacao") == "0"
    assert valor("mp_respawn_on_death_ct", "mutacao") == "0"

def test_mutacao_sem_aquecimento():
    assert valor("mp_warmuptime", "mutacao") == "0"
    assert valor("mp_warmup_online_enabled", "mutacao") == "0"
    assert valor("mp_warmuptime_all_players_connected", "mutacao") == "0"
```

Em `servidores-diversao.test.ts`, a linha de ordem 5 passa a `ativo: true`. Em `diversao.test.ts`, os hosts perguntados incluem `10.0.0.5`. Em `xp-diversao.test.ts`, a linha `['de servidor inativo', MUTACAO_INATIVO]` sai da tabela, a constante `MUTACAO_INATIVO` some, e entram:

```ts
test('porta de servidor desativado não grava nada', async () => {
  await bd.update(servidoresDiversao).set({ ativo: false }).where(eq(servidoresDiversao.porta, 27021));
  const conta = await membro();
  const resposta = await respostaDoResultado(bd, pedido(resultado([jogador(conta)], { porta: 27021 })), TOKEN);
  expect(resposta.status).toBe(404);
  expect(await bd.select().from(xpPartidas)).toEqual([]);
});

test('na Mutação, vence o terço de cima do placar, sem olhar o lado', async () => {
  const primeira = await membro();
  const segunda = await membro();
  const terceira = await membro();
  const ganhos = await enviar(
    resultado(
      [jogador(primeira, { abates: 12, minutos: 30 }), jogador(segunda, { abates: 4, minutos: 30 }), jogador(terceira, { abates: 4, minutos: 30, time: 'tr' })],
      { porta: 27020, duracaoMinutos: 30, vencedor: null },
    ),
  );
  expect(ganhos.find((g) => g.steamid64 === primeira.steamid64)).toMatchObject({ xp: 840 });
  expect(ganhos.find((g) => g.steamid64 === segunda.steamid64)).toMatchObject({ xp: 380 });
  expect(ganhos.find((g) => g.steamid64 === terceira.steamid64)).toMatchObject({ xp: 380 });
});
```

- [ ] **Passo 2: Rodar e ver falhar**

Rodar: `python -m pytest servidor/tests/test_diversao.py -k mutacao -q` e, de `site/`, `npx vitest run src/bd/servidores-diversao.test.ts src/dominio/diversao.test.ts src/dominio/xp-diversao.test.ts`
Esperado: FALHA por falta dos arquivos, do cartão ativo e da regra do XP.

- [ ] **Passo 3: Implementar**

`mutacao_base.cfg`, a partir do `equipe_base.cfg`, com os valores dos testes e também: `sv_cheats 0`, `bot_quota 0`, `mp_teammates_are_enemies 0`, `mp_friendlyfire 0`, `mp_randomspawn 0`, `mp_force_assign_teams 1`, `mp_ct_default_melee weapon_knife`, `mp_buytime 0`, `mp_buy_anywhere 1`, `mp_buy_during_immunity 0`, `mp_startmoney 0`, `mp_maxmoney 0`, `mp_playercashawards 0`, `mp_teamcashawards 0`, `mp_weapons_allow_map_placed 0`, `mp_death_drop_gun 0`, `mp_death_drop_grenade 0`, `mp_death_drop_taser 0`, `mp_death_drop_defuser 0`, `spec_freeze_time 0`, `spec_freeze_deathanim_time 0`, `spec_freeze_traveltime 0`, `spec_freeze_time_lock 0`, `mp_roundtime_defuse 0`, `mp_roundtime_hostage 0`, `mp_winlimit 0`, `mp_halftime 0`, `mp_freezetime 0`, `mp_match_can_clinch 0`, `mp_endmatch_votenextmap 0`, `mp_match_end_changelevel 0`, `mp_match_end_restart 1`, `mp_match_restart_delay 5` e `mp_bot_ai_bt "scripts/ai/deathmatch/bt_default.kv3"`, só para os testes com bots. `mutacao.cfg`: `hostname "Magnatas do CS | Mutação"`. `mutacao.conf`: `MAPA=de_dust2`, `BASE=mutacao_base.cfg` e os campos do teste.

`xp-diversao.ts`: `consequencias` usa `consequenciasDoCadaUm` também quando `modo === 'mutacao'`.

Migração: `UPDATE "servidores_diversao" SET "ativo" = true WHERE "porta" = 27020;`

`pendencias-antes-de-abrir.md`: portas `27016/udp` a `27021/udp` e `GSLT_MUTACAO`.

- [ ] **Passo 4: Rodar, aplicar e salvar**

Rodar: os mesmos testes; depois, de `site/`, `npm run db:migrar` no banco de desenvolvimento.
Esperado: PASSA, e o cartão aparece como "Fora do ar" em `/diversao` enquanto o servidor não sobe.

```bash
git add servidor/config/diversao servidor/tests/test_diversao.py site/drizzle site/src docs/pendencias-antes-de-abrir.md
git commit -m "feat: servidor e cartao da mutacao"
```

---

### Task 5: Prova no servidor, com bots

Sem código novo, salvo correção. Toda mudança de plano entra no registro como decisão.

- [ ] **Passo 1: Ligar do zero e olhar o mapa**

Copiar `servidor/` para o Linux, compilar, instalar e rodar `sudo -u cs2 bash /home/cs2/bin/iniciar_diversao.sh mutacao`.
Esperado: mapa baixado uma vez em `oficina`, `css_plugins list` com o plugin `LOADED` e `Failed to load plugin` ausente do registro. Listar os scripts e o `.cfg` dentro do mapa: se ele trouxer regras próprias, registrar a decisão.

- [ ] **Passo 2: Conferir a configuração depois que o mapa carrega**

Rodar pela sonda, na porta 27020: `mp_roundtime`, `mp_ignore_round_win_conditions`, `mp_humanteam`, `sv_buy_status_override`, `mp_ct_default_primary`, `mp_free_armor`, `sv_cheats`, `bot_quota`.
Esperado: os valores do plano.

- [ ] **Passo 3: Rodadas com bots**

Rodar: `bot_join_team ct`, `bot_quota 8`, `mp_roundtime 1`, com `magnatas_mutacao_ver` e o registro.
Esperado:
- todos nascem CT, com AK ou M4 e pistola;
- aos 20 segundos, exatamente 1 vira TR com 2000 de vida, modificador 1,10 e só faca;
- com 16 bots, exatamente 2;
- golpe transforma sem morrer, e o mutante morto volta em 3 segundos;
- sem humano, a rodada termina com vitória dos mutantes; com humano no fim do tempo, dos humanos;
- 5 segundos depois, todos CT de novo.

- [ ] **Passo 4: 10 rodadas**

Encurtar só no teste: `mp_roundtime 0.5`. Ler o registro.
Esperado: depois da 10ª rodada, 15 segundos e a contagem de volta à 1ª, sem `Game Over`, sem travar ninguém e sem o placar antigo.

- [ ] **Passo 5: Os outros modos com o plugin novo, e voltar ao real**

Reiniciar os outros cinco servidores do zero.
Esperado: `LOADED` e `magnatas_jogadores` em todos, Equipe x Equipe com `mp_roundtime 5`, Fantasma com `sv_autobunnyhopping` ligado. No servidor da Mutação, ligar do zero outra vez, conferindo `sv_cheats` falso, `bot_quota 0` e `mp_roundtime 3`.

---

### Task 6: Teste do dono e fechamento

- [ ] **Passo 1: O dono joga**

Com bots, entrar pelo cartão em `/diversao`.
Esperado, confirmado pelo dono:
- entra direto como humano, com AK ou M4 e pistola;
- a munição de reserva não acaba;
- aos 20 segundos sai o sorteio;
- o golpe transforma, sem morrer;
- como mutante: esverdeado, só faca, mais rápido, muita vida e volta em 3 segundos;
- o tiro empurra o mutante, com uma força boa de jogar.

- [ ] **Passo 2: Partida inteira com XP**

Rodar 10 rodadas curtas, com o dono dentro, encurtando só o tempo de rodada.
Esperado: "Partida encerrada", `Humanos X x Y Mutantes`, `+ N XP`, a próxima em 15 segundos, `POST /api/servidor/diversao/resultado` 200 no registro do site, e o mesmo valor no perfil dele.

- [ ] **Passo 3: Conferência final**

Rodar: de `site/`, `npx tsc --noEmit`, `npx eslint` e `npx vitest run`; `python -m pytest servidor/tests -q`; `node G:/Magnatas-ferramentas/tmp/conferir-segredos.cjs`.
Esperado: tudo limpo e "Nenhum segredo no histórico".

- [ ] **Passo 4: Atualizar o design**

Em `2026-11-04-modos-de-diversao-design.md`: o que o teste provou, as escolhas que o dono confirmou e o que falta com várias pessoas ao mesmo tempo.

```bash
git add docs servidor site
git commit -m "docs: resultado dos testes da mutacao"
```
