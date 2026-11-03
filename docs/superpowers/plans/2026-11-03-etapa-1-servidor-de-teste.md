# Etapa 1: servidor de teste, plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Colocar um servidor de CS2 privado em pé no servidor do dono, jogar uma partida inteira com 10 amigos e responder com provas as perguntas da etapa 1.

**Architecture:** Não há site nesta etapa. O servidor Linux roda CS2 com Metamod, CounterStrikeSharp e MatchZy, mais os plugins de anti-hack em avaliação. Pequenas ferramentas em Python, com testes, cuidam do que pode dar errado sem ninguém perceber: lista de membros, patch do `gameinfo.gi` e exportação de estatísticas.

**Tech Stack:** Linux x86_64, SteamCMD, CS2 dedicated server (app 730), Metamod:Source 2.x, CounterStrikeSharp com runtime, MatchZy, Python 3 (só biblioteca padrão nas ferramentas do servidor), pytest, `python-a2s`.

**Spec:** `docs/2026-11-03-irmandade-design.md` (seções 3, 5.4, 5.5 e 6)

## Ajuste de 03/11/2026, decidido pelo dono

Vale sobre o resto do plano quando houver conflito.

- O servidor conferido na Task 1 roda outros sistemas do dono e não recebe o CS2.
- As Tasks 2 a 7 rodam primeiro no PC do dono, no Windows, em `G:\Irmandade\cs2`. O CS2 da Steam não é alterado, e nenhuma porta é aberta no roteador.
- No PC, os scripts são `servidor/scripts/windows/instalar_local.ps1` e `iniciar_local.ps1`, e o console do servidor fica em uma janela própria. Os segredos ficam em `G:\Irmandade\cs2.env`.
- Sem outra pessoa no PC, a lista de membros é testada tirando o próprio dono da lista, e os testes com "dono mais um amigo" usam bots quando der. O que não der fica registrado como pendente para o servidor novo.
- O mínimo de disco sobe para 100 GiB, porque o CS2 ocupa cerca de 74 GB.
- A Task 8 fica para o servidor novo, depois de repetir nele as Tasks 1 a 4 com os scripts Linux.

## Global Constraints

- Quem faz cada passo está marcado. **(dono)** é algo que só o dono pode fazer. O resto pode ser feito pelo Claude, se o dono der acesso por chave SSH.
- Senhas, chave do GSLT, chaves de licença e webhooks nunca vão para o chat, para o repositório ou para a saída de comandos. Ficam em `~/cs2.env`, com permissão `600`.
- Cartão e pagamento são sempre feitos pelo dono, e nada pago é contratado sem o aval dele.
- Nada de plugin que simule itens, skins, inventário ou patente.
- Nunca rodar um hack de verdade para testar o anti-hack, mesmo no servidor de teste. Isso coloca a conta Steam em risco.
- O CS2AC nunca pune ninguém nesta etapa. Ele só alerta.
- Um GSLT por servidor.
- Versões mínimas: Metamod:Source `2.0.0.1469`, CounterStrikeSharp `v369` com o build `with-runtime`.
- Só amigos convidados pelo dono jogam nesta etapa, com senha no servidor além da lista de membros.
- Requisitos que os testes usam: Linux, x86_64, AVX, 2 núcleos, 6 GiB de RAM, 70 GiB livres de disco e acesso root. RAM e disco são estimativas e podem ser revistas com o que for medido.

## Review Focus

- **Atualização do CS2 desliga os plugins sem avisar:** o `gameinfo.gi` é sobrescrito, o Metamod não carrega e a lista de membros para de valer. A pessoa espera que o servidor continue fechado. Coberto pela senha no servidor, pelo teste de `aplicar_metamod` (Task 3) e pela conferência antes da partida (Task 8).
- **SteamID no formato errado:** `STEAM_0:1:123`, link de perfil ou espaços impedem um amigo de entrar sem explicação. A pessoa espera uma mensagem dizendo qual linha está errada. Testado em `ler_membros` (Task 4).
- **Jogador com 0 mortes ou 0 abates:** dividir por zero derrubaria a exportação. A pessoa espera ver um KD válido. Testado em `calcular_kd` e `hs_pct` (Task 5).
- **CSV vazio ou com colunas diferentes após atualizar o MatchZy:** o MatchZy cria o arquivo vazio quando não há dados. A pessoa espera um erro claro, e não uma tabela errada. Testado em `ler_partida` (Task 5).
- **Jogador cai e volta no meio da partida:** a pessoa espera voltar ao mesmo time e a gravação continuar. Testado no roteiro da partida completa (Task 8).

---

## Estrutura de arquivos

```
.gitignore
pytest.ini
servidor/
  ferramentas/
    verificar_servidor.py   confere se o servidor serve para rodar o CS2
    gameinfo.py             aplica a linha do Metamod no gameinfo.gi
    membros.py              valida membros, gera lista de liberados e partida
    stats.py                transforma o CSV do MatchZy em tabela com KD
    checar_vac.py           pergunta ao servidor se o VAC está ativo
  scripts/
    instalar_cs2.sh         instala SteamCMD e CS2
    iniciar_cs2.sh          inicia o servidor numa sessão tmux
    atualizar_cs2.sh        atualiza o CS2 e reaplica o Metamod
  config/
    server.cfg              regras do servidor
    matchzy.cfg             configuração do MatchZy
  tests/
    fixtures/match_data_map0_12.csv
    test_verificar_servidor.py
    test_gameinfo.py
    test_membros.py
    test_stats.py
  relatorio-etapa1.md       respostas da etapa 1
```

Testes rodam no PC do dono, a partir da pasta do projeto, com `python -m pytest servidor/tests -v`. Na primeira vez: `python -m pip install pytest python-a2s`.

---

### Task 1: Conferir o servidor

**Files:**
- Create: `.gitignore`, `pytest.ini`, `servidor/ferramentas/verificar_servidor.py`, `servidor/relatorio-etapa1.md`
- Test: `servidor/tests/test_verificar_servidor.py`

**Interfaces:**
- Produces: `Fatos` (dataclass: `sistema: str`, `arquitetura: str`, `avx: bool`, `nucleos: int`, `ram_gib: float`, `disco_livre_gib: float`, `root: bool`), `avaliar(fatos: Fatos) -> list[str]`, `coletar(caminho_disco: str = "/") -> Fatos`

- [ ] **Step 1: Iniciar o repositório**

Rodar `git init`. O `.gitignore` deve conter `membros.csv`, `*.env`, `cs2fow.cfg`, `__pycache__/`, `.pytest_cache/` e `.claude/`. Criar `pytest.ini` com `[pytest]` e `pythonpath = servidor/ferramentas`, para os testes importarem as ferramentas.

- [ ] **Step 2: Escrever os testes que falham**

```python
BOM = Fatos("Linux", "x86_64", True, 4, 8.0, 100.0, True)

def test_servidor_bom_nao_tem_problemas():
    assert avaliar(BOM) == []

@pytest.mark.parametrize("campo,valor,trecho", [
    ("sistema", "Windows", "Linux"),
    ("arquitetura", "aarch64", "x86_64"),
    ("avx", False, "AVX"),
    ("nucleos", 1, "núcleos"),
    ("ram_gib", 5.9, "RAM"),
    ("disco_livre_gib", 69.0, "disco"),
    ("root", False, "root"),
])
def test_cada_requisito_reprova(campo, valor, trecho):
    problemas = avaliar(replace(BOM, **{campo: valor}))
    assert len(problemas) == 1 and trecho in problemas[0]
```

- [ ] **Step 3: Rodar e ver falhar**

Run: `python -m pytest servidor/tests/test_verificar_servidor.py -v`
Expected: FAIL com erro de importação.

- [ ] **Step 4: Implementar `avaliar` e `coletar`**

`coletar` lê `/proc/cpuinfo` (`flags` contém `avx`), `/proc/meminfo`, `shutil.disk_usage`, `platform` e `os.geteuid() == 0`. Ao rodar como programa, imprime os fatos e termina com `APROVADO` ou com a lista de problemas e `REPROVADO`.

- [ ] **Step 5: Rodar e ver passar**

Run: `python -m pytest servidor/tests/test_verificar_servidor.py -v`
Expected: PASS.

- [ ] **Step 6: Rodar no servidor (dono)**

Conectar por SSH, copiar o arquivo e rodar `sudo python3 verificar_servidor.py`.
Expected: `APROVADO`.

- [ ] **Step 7: Decidir se segue**

Se o dono só tiver painel, sem SSH, ou o resultado for `REPROVADO`, parar aqui e decidir com ele a troca antes de gastar qualquer coisa. Registrar em `servidor/relatorio-etapa1.md` os fatos, a região e o ping de quem vai jogar (`ping <ip>` do PC de cada um, ou a média de 2 ou 3 amigos).

- [ ] **Step 8: Commit**

```bash
git add .gitignore pytest.ini servidor/
git commit -m "feat: conferencia do servidor de teste"
```

---

### Task 2: Instalar o CS2 puro e medir o VAC de referência

**Files:**
- Create: `servidor/scripts/instalar_cs2.sh`, `servidor/scripts/iniciar_cs2.sh`, `servidor/config/server.cfg`, `servidor/ferramentas/checar_vac.py`

**Interfaces:**
- Produces: instalação em `/home/cs2/server`, sessão tmux `cs2`, log em `/home/cs2/server/game/csgo/console.log`, comando `checar_vac.py <host> [porta]` que imprime `vac_enabled=0` ou `vac_enabled=1`

- [ ] **Step 1: Criar o GSLT (dono)**

Em `steamcommunity.com/dev/managegameservers`, com o app `730`. A conta Steam não pode estar limitada nem banida.

- [ ] **Step 2: Escrever `instalar_cs2.sh`**

Cria o usuário `cs2`, instala `tmux`, `libicu` e as dependências da SteamCMD para a distribuição encontrada, baixa a SteamCMD da Valve, roda `+force_install_dir /home/cs2/server +login anonymous +app_update 730 validate +quit` e liga `steamclient.so` em `~/.steam/sdk64/`. Pode rodar de novo sem quebrar nada.

- [ ] **Step 3: Escrever `iniciar_cs2.sh` e `server.cfg`**

`iniciar_cs2.sh` carrega `~/cs2.env` (`GSLT` e `SV_PASSWORD`) e abre a sessão tmux `cs2` com:

```bash
game/bin/linuxsteamrt64/cs2 -dedicated -condebug -port 27015 \
  +game_type 0 +game_mode 1 +map de_mirage \
  +sv_setsteamaccount "$GSLT" +sv_password "$SV_PASSWORD" \
  +tv_enable 1 +tv_delay 0 +exec server.cfg
```

Sem `-insecure`. A porta de GOTV (27020) fica fechada, porque com `tv_delay 0` ela revelaria a partida em tempo real. Só a porta `27015/udp` é aberta no firewall. `server.cfg` define o nome do servidor e `sv_cheats 0`.

- [ ] **Step 4: Escrever `checar_vac.py`**

Usa `a2s.info((host, porta))` e imprime `vac_enabled=` com o valor de `.vac_enabled`, sem mostrar mais nada.

- [ ] **Step 5: Instalar e iniciar (dono cria `~/cs2.env`)**

Run: `sudo bash instalar_cs2.sh`, depois criar `/home/cs2/cs2.env` com permissão `600`, depois `sudo -u cs2 bash iniciar_cs2.sh`.
Expected: `tmux attach -t cs2` mostra o mapa carregado e nenhum erro de GSLT no console.

- [ ] **Step 6: Entrar e medir**

**(dono)** No console do CS2: `password <senha>` e `connect <ip>:27015`. Do PC: `python servidor/ferramentas/checar_vac.py <ip>`.
Expected: entra no mapa e imprime `vac_enabled=1`. Anotar o resultado e `grep -i -E "vac|secure" console.log` no relatório como referência. Se vier `vac_enabled=0` ou sem resposta, usar só o log e anotar.

- [ ] **Step 7: Commit**

```bash
git add servidor/
git commit -m "feat: instalacao do cs2 e medicao do vac"
```

---

### Task 3: Metamod, CounterStrikeSharp e atualização segura

**Files:**
- Create: `servidor/ferramentas/gameinfo.py`, `servidor/scripts/atualizar_cs2.sh`
- Test: `servidor/tests/test_gameinfo.py`

**Interfaces:**
- Produces: `aplicar_metamod(texto: str) -> str`, comando `gameinfo.py <caminho>`, que grava só quando há mudança

- [ ] **Step 1: Escrever os testes que falham**

```python
ORIGINAL = '\t\t\tGame_LowViolence\tcsgo_lv // Perfect World content override\n\t\t\tGame\tcsgo\n'
LINHA = 'Game\tcsgo/addons/metamod'

def test_insere_logo_abaixo_de_low_violence():
    linhas = aplicar_metamod(ORIGINAL).splitlines()
    assert 'csgo_lv' in linhas[0] and LINHA in linhas[1] and linhas[2].strip() == 'Game\tcsgo'

def test_aplicar_duas_vezes_nao_duplica():
    assert aplicar_metamod(aplicar_metamod(ORIGINAL)).count('csgo/addons/metamod') == 1

def test_sem_a_linha_de_referencia_da_erro():
    with pytest.raises(ValueError, match='Game_LowViolence'):
        aplicar_metamod('Game\tcsgo\n')

def test_preserva_fim_de_linha_windows():
    assert '\r\n' in aplicar_metamod(ORIGINAL.replace('\n', '\r\n')).split('metamod')[1][:2]
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `python -m pytest servidor/tests/test_gameinfo.py -v`
Expected: FAIL com erro de importação.

- [ ] **Step 3: Implementar `aplicar_metamod`**

Mantém a indentação da linha de referência e usa o mesmo fim de linha do arquivo.

- [ ] **Step 4: Rodar e ver passar**

Run: `python -m pytest servidor/tests/test_gameinfo.py -v`
Expected: PASS.

- [ ] **Step 5: Instalar os plugins**

Baixar o Metamod 2.x mais recente de `metamodsource.net` (`branch=master`, mínimo `2.0.0.1469`) e o CounterStrikeSharp `with-runtime` mais recente para Linux (mínimo `v369`). Copiar as duas pastas `addons` para `game/csgo/`. Rodar `gameinfo.py game/csgo/gameinfo.gi` e reiniciar o servidor.

- [ ] **Step 6: Conferir o carregamento e o VAC**

No console: `meta list`.
Expected: mostra CounterStrikeSharp por Roflmuffin.
Do PC: `checar_vac.py <ip>`. Anotar no relatório o valor e o que o console diz sobre VAC. Essa é a resposta à pergunta da etapa 1. Se o Metamod só carregar com `-insecure`, anotar também e seguir sem VAC.

- [ ] **Step 7: Escrever `atualizar_cs2.sh` e provar que funciona**

O script para o servidor, roda `app_update 730 validate`, roda `gameinfo.py`, inicia o servidor e pede para conferir `meta list`.
Run: o script, no servidor.
Expected: mesmo com o `validate` restaurando o `gameinfo.gi`, `meta list` continua mostrando o CounterStrikeSharp.

- [ ] **Step 8: Commit**

```bash
git add servidor/
git commit -m "feat: metamod, counterstrikesharp e atualizacao segura"
```

---

### Task 4: MatchZy, lista de membros e gravação

**Files:**
- Create: `servidor/ferramentas/membros.py`, `servidor/config/matchzy.cfg`
- Test: `servidor/tests/test_membros.py`

**Interfaces:**
- Produces: `Membro` (dataclass: `steamid64: str`, `apelido: str`, `papel: str`), `ler_membros(caminho: str) -> list[Membro]`, `gerar_whitelist(membros: list[Membro]) -> str`, `gerar_partida(membros: list[Membro], mapa: str, semente: int | None = None) -> dict`
- Consumes: `membros.csv`, com cabeçalho `steamid64,apelido,papel` e papel `jogador`, `gm` ou `adm`. Fica fora do repositório.

- [ ] **Step 1: Escrever os testes que falham**

```python
def test_rejeita_formato_errado_dizendo_a_linha(tmp_path):
    arq = escrever(tmp_path, 'steamid64,apelido,papel\nSTEAM_0:1:123,Bia,jogador\n')
    with pytest.raises(ValueError, match=r'linha 2.*STEAM_0:1:123'):
        ler_membros(arq)

def test_rejeita_id_duplicado(tmp_path):
    arq = escrever(tmp_path, 'steamid64,apelido,papel\n' + f'{ID1},Bia,jogador\n{ID1},Rafa,jogador\n')
    with pytest.raises(ValueError, match='duplicado'):
        ler_membros(arq)

def test_rejeita_papel_desconhecido(tmp_path):
    arq = escrever(tmp_path, f'steamid64,apelido,papel\n{ID1},Bia,rei\n')
    with pytest.raises(ValueError, match='papel'):
        ler_membros(arq)

def test_whitelist_tem_um_id_por_linha():
    assert gerar_whitelist([membro(ID1), membro(ID2)]) == f'{ID1}\n{ID2}\n'

def test_partida_divide_dez_jogadores_em_dois_times():
    p = gerar_partida(dez_jogadores() + [membro(ID_GM, papel='gm')], 'de_mirage', semente=1)
    assert len(p['team1']['players']) == 5 and len(p['team2']['players']) == 5
    assert not set(p['team1']['players']) & set(p['team2']['players'])
    assert p['maplist'] == ['de_mirage'] and p['num_maps'] == 1
    assert list(p['spectators']['players']) == [ID_GM]

def test_partida_exige_dez_jogadores():
    with pytest.raises(ValueError, match='10'):
        gerar_partida(dez_jogadores()[:9], 'de_mirage')
```

Um SteamID64 válido tem 17 dígitos e começa com `7656119`.

- [ ] **Step 2: Rodar e ver falhar**

Run: `python -m pytest servidor/tests/test_membros.py -v`
Expected: FAIL com erro de importação.

- [ ] **Step 3: Implementar as três funções e a linha de comando**

`gerar_partida` sorteia os times com `random.Random(semente)` e devolve `maplist`, `num_maps`, `players_per_team: 5`, `skip_veto: true`, `team1`, `team2` e `spectators`. Comandos: `membros.py whitelist membros.csv` e `membros.py partida membros.csv de_mirage`, que imprimem na saída padrão.

- [ ] **Step 4: Rodar e ver passar**

Run: `python -m pytest servidor/tests/test_membros.py -v`
Expected: PASS.

- [ ] **Step 5: Instalar e configurar o MatchZy**

Baixar a versão mais recente e extrair em `game/csgo/`. Copiar `matchzy.cfg` para `game/csgo/cfg/MatchZy/config.cfg`, com `matchzy_whitelist_enabled_default true`, `matchzy_kick_when_no_match_loaded false` e `matchzy_demo_path "MatchZy/"`. Colocar o SteamID64 do dono em `cfg/MatchZy/admins.json`. Gerar `cfg/MatchZy/whitelist.cfg` a partir de `membros.csv` e reiniciar.

- [ ] **Step 6: Conferir o carregamento**

No console: `css_plugins list`.
Expected: mostra MatchZy por WD-.

- [ ] **Step 7: Provar que a lista barra quem está fora (dono mais um amigo)**

Um amigo que tem a senha, mas não está em `membros.csv`, tenta entrar.
Expected: é expulso. Depois, o dono entra normalmente. Anotar no relatório.

- [ ] **Step 8: Provar que grava com poucos jogadores (dono mais um amigo)**

Escrever à mão um `teste.json` com um jogador em cada time, `players_per_team: 1` e `cvars: {"mp_maxrounds": "2"}`, porque `gerar_partida` exige 10 nomes. Carregar com `matchzy_loadmatch teste.json`, dar `.ready` e jogar até o fim.
Expected: aparece uma gravação em `game/csgo/MatchZy/` e um CSV em `game/csgo/MatchZy_Stats/`.

- [ ] **Step 9: Commit**

```bash
git add servidor/
git commit -m "feat: matchzy, lista de membros e gravacao"
```

---

### Task 5: Exportar KD e estatísticas

**Files:**
- Create: `servidor/ferramentas/stats.py`, `servidor/tests/fixtures/match_data_map0_12.csv`
- Test: `servidor/tests/test_stats.py`

**Interfaces:**
- Produces: `calcular_kd(kills: int, deaths: int) -> float`, `hs_pct(head_shot_kills: int, kills: int) -> float`, `ler_partida(caminho: str) -> list[dict]`, `exportar(entrada: str, saida: str) -> None`
- Consumes: CSV `csgo/MatchZy_Stats/match_data_map{mapa}_{id}.csv`, com as colunas `steamid64`, `team`, `name`, `kills`, `deaths`, `assists`, `damage` e `head_shot_kills`, entre outras.

- [ ] **Step 1: Criar a fixture com a saída real**

Copiar o CSV gerado na Task 4 e trocar os SteamIDs e nomes por valores de exemplo. A primeira linha deve continuar igual à original.

- [ ] **Step 2: Escrever os testes que falham**

```python
def test_kd_arredonda_em_duas_casas():
    assert calcular_kd(20, 15) == 1.33

def test_kd_sem_mortes_vale_os_abates():
    assert calcular_kd(7, 0) == 7.0

def test_kd_sem_abates_e_sem_mortes_vale_zero():
    assert calcular_kd(0, 0) == 0.0

def test_hs_sem_abates_vale_zero():
    assert hs_pct(0, 0) == 0.0

def test_hs_em_porcentagem():
    assert hs_pct(5, 20) == 25.0

def test_csv_vazio_da_erro_claro(tmp_path):
    arq = tmp_path / 'vazio.csv'; arq.write_text('')
    with pytest.raises(ValueError, match='vazio'):
        ler_partida(str(arq))

def test_coluna_faltando_diz_qual(tmp_path):
    arq = tmp_path / 'x.csv'; arq.write_text('steamid64,name,kills\n1,a,1\n')
    with pytest.raises(ValueError, match='deaths'):
        ler_partida(str(arq))

def test_exportar_gera_as_colunas_da_ficha(tmp_path):
    saida = tmp_path / 'saida.csv'
    exportar(FIXTURE, str(saida))
    assert saida.read_text().splitlines()[0] == 'steamid64,apelido,time,abates,mortes,assistencias,kd,hs_pct,dano'
```

- [ ] **Step 3: Rodar e ver falhar**

Run: `python -m pytest servidor/tests/test_stats.py -v`
Expected: FAIL com erro de importação.

- [ ] **Step 4: Implementar com `csv.DictReader`**

Comando: `stats.py <entrada.csv> <saida.csv>`.

- [ ] **Step 5: Rodar e ver passar**

Run: `python -m pytest servidor/tests/test_stats.py -v`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add servidor/
git commit -m "feat: exportacao de kd e estatisticas"
```

---

### Task 6: Avaliar o CS2AC

**Files:**
- Modify: `servidor/relatorio-etapa1.md`

A versão gratuita não recebe mais atualizações e pode não funcionar no CS2 atual. A avaliação começa por ela porque não custa nada.

- [ ] **Step 1: Instalar a última versão gratuita**

Baixar o pacote Linux em `github.com/karola3vax/CS2AC/releases` e extrair na pasta principal do servidor. Reiniciar.
No console: `cs2ac_status`.
Expected: mostra que está rodando. Se não carregar, anotar e ir para o Step 5.

- [ ] **Step 2: Configurar sem punição**

Em `game/csgo/cfg/cs2ac.cfg`, colocar todos os membros em `cs2ac_whitelist`, no formato descrito no próprio arquivo. Quem está nessa lista é detectado, mas nunca punido. Ler os comentários de `cs2ac_punishment_command` e `cs2ac_kick_command` e deixá-los sem efeito, se o arquivo permitir.
Run: `cs2ac_reload`, depois `cs2ac_check_config`.
Expected: nenhum erro de configuração.

- [ ] **Step 3: Provar o canal de alerta**

Run: `cs2ac_test_announcement`. Se o dono quiser alertas no Discord, ele mesmo coloca o webhook e roda `cs2ac_webhook_test`.
Expected: o aviso aparece.

- [ ] **Step 4: Tentar um alerta real sem usar hack (dono)**

Ligar o pulo ao scroll (`bind mwheeldown +jump`) e pular sem parar por alguns minutos, para testar os módulos de movimento. Anotar se apareceu algum alerta. Se não aparecer, o relatório registra "canal comprovado, detecção não comprovada". Essa é uma resposta válida, porque não vamos usar hack para testar.

- [ ] **Step 5: Decidir sobre a versão paga (dono)**

Só se a versão gratuita falhar. A versão atual custa US$ 10 por mês por servidor e a mesma chave cobre CS2AC e CS2FOW. O teste de 7 dias exige cartão e cobra sozinho no fim, se não for cancelado. Registrar a decisão e a data de cancelamento no relatório.

- [ ] **Step 6: Commit**

```bash
git add servidor/relatorio-etapa1.md
git commit -m "docs: avaliacao do cs2ac"
```

---

### Task 7: Avaliar o CS2FOW

**Files:**
- Modify: `servidor/relatorio-etapa1.md`

- [ ] **Step 1: Medir sem o plugin (dono mais um amigo)**

Com duas pessoas no servidor, anotar o uso de CPU do processo `cs2` com `top`. Ativar `sv_cheats 1` e, no console do CS2, `r_drawothermodels 2`. Os dois ficam em lados opostos de uma parede.
Expected: dá para ver o outro através da parede. Isso é um comando do próprio jogo, liberado só com `sv_cheats 1`, e não é um hack. Se o comando não funcionar nesta versão do CS2, anotar e fazer só a medição de CPU e a checagem do `cs2fow_status`.

- [ ] **Step 2: Instalar a versão gratuita antiga ou o teste pago**

Tentar primeiro a versão antiga, no repositório `karola3vax/CS2FOW`. Se não carregar, o teste pago só entra com a decisão do dono (Task 6, Step 5). Com a chave, ela vai em `cs2fow_license_key`, em `cfg/cs2fow.cfg`, que não entra no repositório. Reiniciar por completo.
No console: `meta list` e `cs2fow_status`.
Expected: mostra o plugin ativo. O primeiro carregamento do mapa prepara as paredes, e nesse momento todos ficam visíveis.

- [ ] **Step 3: Medir com o plugin (dono mais um amigo)**

Repetir o Step 1 e rodar `cs2fow_metrics`.
Expected: o outro jogador some atrás da parede e reaparece ao ficar visível. Anotar o uso de CPU, as métricas e se alguém viu um inimigo aparecer tarde demais ao virar uma esquina.

- [ ] **Step 4: Voltar ao normal e registrar**

Run: `sv_cheats 0`. Registrar no relatório o que funcionou, o custo e a recomendação de manter ou tirar. Decisão **(dono)**.

- [ ] **Step 5: Commit**

```bash
git add servidor/relatorio-etapa1.md
git commit -m "docs: avaliacao do cs2fow"
```

---

### Task 8: Partida completa com 10 amigos

**Files:**
- Modify: `servidor/relatorio-etapa1.md`

- [ ] **Step 1: Conferir antes de marcar (dono)**

Run: `df -h`, `meta list`, `css_plugins list` e `cs2ac_status`.
Expected: pelo menos 5 GiB livres e tudo carregado. Se o CS2 tiver atualizado, rodar `atualizar_cs2.sh` antes.

- [ ] **Step 2: Gerar e carregar a partida**

Preencher `membros.csv` com os 10 amigos, gerar a lista de liberados e a partida, enviar para o servidor e rodar `matchzy_loadmatch partida.json`.
Expected: o console confirma a partida carregada.

- [ ] **Step 3: Jogar a partida inteira (dono mais 9 amigos)**

Durante o jogo, testar:
- Um jogador sai e volta. Expected: volta para o mesmo time.
- Alguém com a equipe (`papel` `gm`) entra como espectador, sem jogar. Expected: assiste sem entrar em time. Se todos os 10 estiverem jogando, repetir depois com outra pessoa.
- Anotar qualquer alerta do CS2AC e conferir se foi justo.

- [ ] **Step 4: Conferir o resultado**

Copiar a gravação e o CSV para o PC. Abrir a gravação no CS2 com `playdemo`. Run: `python servidor/ferramentas/stats.py <csv> saida.csv`.
Expected: a gravação abre do início ao fim, e o KD de cada um bate com o placar final da partida.

- [ ] **Step 5: Ouvir os jogadores (dono)**

Perguntar aos 10 sobre ping, travadas e sensação de jogo. Anotar, lembrando que o servidor fica fora do Brasil.

- [ ] **Step 6: Fechar o relatório**

Responder em `servidor/relatorio-etapa1.md`:
- O servidor serve? Qual o ping?
- O VAC continua ativo com plugins?
- A lista barra quem está fora?
- A gravação e o KD funcionam?
- O CS2AC alerta? Teve alerta injusto?
- O CS2FOW vale o custo?
- O que quebrou e como foi resolvido?
- O que muda no projeto antes da etapa 2?

- [ ] **Step 7: Commit**

```bash
git add servidor/relatorio-etapa1.md
git commit -m "docs: resultado da etapa 1"
```
