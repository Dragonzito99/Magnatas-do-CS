# Aba Diversão: lista de servidores e modos

Data: 04/11/2026. Status: aguardando aprovação do dono.

## Por que existe

A aba Diversão hoje tem um cartão só, o Cada um por si. O dono quer uma lista de servidores por modo, no estilo da imagem de referência da GC, porque haverá vários mapas e modos, sendo os principais herdados do CrossFire. O membro abre a aba, vê onde há gente jogando e entra com um clique.

Sucesso é o dono jogar com os amigos nos quatro modos e sentir o CrossFire, em especial a respiração do fantasma pelo headset e a infecção da Mutação.

## O que o dono decidiu

**Tela**
- Abas no topo: Todos, Cada um por si, Equipe x Equipe, Mutação e Fantasma.
- Cada cartão mostra foto do mapa, modo, armas, mapa e jogadores (`3/16`), com os botões Copiar endereço e Entrar.
- Modo ainda não pronto aparece como "Em breve", sem botão de entrar. O esboço foi aprovado.
- Cada mapa novo vira um cartão novo.
- No futuro, tudo será feito por uma tela de Adm, inclusive criar servidores novos. Essa tela não faz parte desta entrega.

**Cada um por si: 3 servidores**
| Servidor | Mapa | Armas |
|---|---|---|
| O atual | Dust 2 | AK e Desert |
| Só pistola | Mirage | A pessoa escolhe a pistola |
| Só AWP | Mirage | AWP |

Renascimento espalhado e sem compra de outras armas, como o atual. Os mapas mudarão depois.

**Equipe x Equipe**
- Mapa: [Transport Ship](https://steamcommunity.com/sharedfiles/filedetails/?id=3122345065).
- Até 8 de cada lado.
- Quem morre renasce na base do próprio time.
- A cada renascimento: CT com M4, TR com AK, pistola padrão e kit de smoke, flash e HE.
- 5 minutos de partida. Vence o time com mais abates. O dono reduziu de 10 depois do teste, "por enquanto".

**Mutação**
- Igual ao CrossFire que o dono jogava. Mapa: [zm_biochemical_hotel](https://steamcommunity.com/sharedfiles/filedetails/?id=3223106683).
- Regras aprovadas: 20 segundos para se espalhar; sorteio de 1 mutante para cada 8 jogadores; o ataque do mutante transforma o humano; o tiro empurra o mutante; o mutante tem muita vida, corre mais e só ataca com as garras; o mutante morto renasce em alguns segundos.
- Humano com AK ou M4, pistola e munição de reserva infinita.
- Rodada de 3 minutos, até 16 pessoas, e a seguinte começa sozinha. Mutantes vencem se ninguém continuar humano. Humanos vencem se sobreviverem até o fim.
- No futuro, haverá mutantes diferentes com poderes diferentes. Agora, um tipo só, com a construção preparada para receber os outros.

**Fantasma**
- Mapa: [gm_laboratory](https://steamcommunity.com/sharedfiles/filedetails/?id=3582464448), que já traz o modo em script próprio. O dono testou com bots e aprovou: "muito bom".
- Regras aprovadas: plantar e desarmar a bomba, fantasmas invisíveis só com faca contra um time visível com armas, quem morre volta na rodada seguinte, 8 x 8, troca de lados no meio e recomeço automático.
- O time visível (CT) nasce com M4 silenciada, USP e kit de smoke, flash e HE, sem comprar nada. O dono pediu isso depois do teste.
- A cada rodada, um CT sorteado recebe o kit de defuse.
- Morreu, a respiração para na hora. O dono testou e confirmou.
- O volume da respiração ficou bom com os bots, e será conferido de novo com pessoas.

## O que os testes já provaram

Estes testes usaram plugins descartáveis, que não fazem parte do projeto. O código está em `/var/tmp/fantasma-corte` e `/var/tmp/fantasma-teste`, no Linux da máquina de testes.

- **O script do `gm_laboratory` funciona** em servidor dedicado, sem plugin. Ele faz a invisibilidade por velocidade e os áudios de rodada do CrossFire.
- **O script do mapa não corta a respiração na morte.** Ele continua disparando o som a partir do corpo no chão. A correção aprovada pelo dono:
  - escutar a mensagem 208 (`CMsgSosStartSoundEvent`) e reconhecer os hashes `2454124772`, `2525673644` e `3258385741` (`CrossFire_ghost_Breath01`, `02` e `03`, MurmurHash2 em minúsculas com semente `0x53524332`);
  - guardar o `soundevent_guid` de cada som por `source_entity_index`;
  - na morte, enviar `SosStopSoundEvent` para cada som guardado daquela entidade, e repetir 0,1 segundo depois;
  - bloquear (`HookResult.Stop`) a respiração que venha de um corpo morto ou da entidade 0.
- **Volume:** além do som do mapa, 3 cópias de `CrossFire_ghost_Breath01` emitidas do corpo a cada 2,5 segundos em cada fantasma vivo. Elas também são cortadas na morte.
- **Limpeza dos mortos:** limpar a lista de mortos no início de cada rodada, porque o evento de nascer nem sempre traz o corpo de um jogador humano.
- **O modo mata-mata do CS2 (`game_type 1`, `game_mode 2`) ignora `mp_*_default_primary`.** Só ele espalha quem renasce. Por isso a arma principal vem do plugin.
- **O modo personalizado (`game_type 3`, `game_mode 0`) entrega a arma principal e renasce na base.** Com `mp_timelimit 0` e `mp_maxrounds 0` juntos, ele congela todo mundo como partida encerrada. Com `mp_maxrounds 1`, `mp_timelimit 0`, `mp_roundtime` definido e `mp_match_end_restart 1`, a partida termina e recomeça sozinha.
- **Fim de partida no modo mata-mata** deixa todo mundo sem time e nada recomeça. Por isso o plugin atual reinicia com `mp_restartgame` antes.
- **`status_json` do CS2 só olha as primeiras vagas** do servidor. A lista de contas vem do comando `magnatas_jogadores` do plugin.
- **`host_workshop_map`** carregou os três mapas da Oficina em servidor dedicado sem GSLT.
- **Cada CS2 vazio usa cerca de 1,1 GB de memória.** O uso com jogadores não foi medido.

## O que está fora desta entrega

- A tela de Adm para criar e editar servidores.
- Mutantes de tipos diferentes.
- Abates da Diversão no ranking ou no perfil. Continuam só dentro do jogo, como o dono decidiu para o Cada um por si.
- Bots na versão real. Bots servem só para teste.
- Salas e Mix não mudam.

## Como construir

Estas escolhas são minhas. O dono não as revisou uma a uma.

**Banco de dados.** Uma tabela `servidores_diversao` guarda cada cartão: modo, título das armas, nome do mapa, foto, host, porta, vagas, `ativo` e ordem. Os seis cartões entram por migração, e os não prontos ficam com `ativo` falso e aparecem como "Em breve". É nessa tabela que a futura tela de Adm vai mexer. `DIVERSAO_HOST` deixa de guardar a lista e passa a ser só o endereço padrão da máquina de jogos.

**Site.** `/diversao` passa a ler a tabela. A varredura de 15 segundos fiscaliza todos os servidores ativos e não pode deixar um servidor travado prender os outros. A situação de cada servidor fica guardada por 10 segundos e por servidor, não uma para todos como hoje. O botão Copiar copia o comando de conexão. No celular, os cartões ficam em uma coluna.

**Fotos dos mapas.** Baixar uma vez a imagem pública de cada mapa e guardar em `site/public/mapas/`. O site não depende da Steam ao abrir a página. Dust 2 e Mirage saem das imagens do próprio jogo ou de uma captura de tela do dono.

**Plugin.** Um único `MagnatasMataMata`, renomeado para `MagnatasDiversao`, escolhe o comportamento por uma variável definida na configuração de cada servidor. Todos os modos usam `magnatas_jogadores`.
- Cada um por si: entrega a arma principal definida na configuração e reinicia a cada 20 minutos.
- Só pistola: compra liberada apenas para pistolas (`mp_buy_allow_guns 1`), sem custo, em qualquer lugar. O atual e o de AWP continuam sem compra.
- Só AWP: AWP e faca, sem pistola. Esta é escolha minha.
- Equipe x Equipe: conta os abates por time, mostra no placar e decide o vencedor por abates ao fim dos 5 minutos. Sem isso, o jogo daria a vitória ao CT por tempo.
- Mutação: toda a lógica da seção de regras, com os atributos do mutante em uma estrutura de dados, para os tipos futuros entrarem sem reescrever.
- Fantasma: o que foi provado acima, mais as armas fixas do CT (`weapon_m4a1_silencer`, `weapon_usp_silencer` e as três granadas pela configuração), compra bloqueada para os dois times (`sv_buy_status_override 3`) e o sorteio de exatamente um kit de defuse por rodada entre os CTs vivos. O restante fica com o script do mapa.

**Servidores.** `iniciar_mata_mata.sh` vira `iniciar_diversao.sh <nome>`, com uma pasta e uma configuração por servidor, em `servidor/config/diversao/`. Portas de 27016 a 27021. Na pasta, `bin` pode ser ligado com `cp -al`, que não ocupa espaço duplicado.

**Acesso.** Continua como hoje: só membro ativo vê a aba, todos os servidores usam a mesma senha de entrada, e os botões entregam essa senha. Servidor cheio mostra "Servidor cheio" no lugar de Entrar.

**Valores que escolhi e o dono pode mudar:**
- Mutação: mutante com 2.000 de vida, 10% mais rápido e renascendo em 3 segundos. Cada humano recebe AK ou M4 por sorteio no início da rodada.
- Equipe x Equipe: times equilibrados automaticamente, e abates iguais terminam em empate. M4 é a M4A4.
- Fantasma: o dono pediu 13 rodadas no total. Escolhi trocar de lados depois da 6ª e encerrar quando um time chegar a 7 vitórias. O restante da configuração do mapa fica como veio: velocidade, pulo e radar desligado. O dinheiro e o tempo de compra do mapa deixam de valer, porque ninguém compra.

## Ordem de entrega

1. Tela, banco e os três Cada um por si.
2. Equipe x Equipe.
3. Fantasma, porque a parte difícil já foi provada.
4. Mutação, que é a maior.

Cada etapa termina com o dono testando no jogo.

## Riscos

- **Mapas da Oficina podem mudar ou sumir.** O autor pode atualizar ou apagar o mapa, e o servidor baixa a versão nova sozinho. O `gm_laboratory` é o mais sensível, porque o modo depende do script dele e dos hashes dos sons. Se os hashes mudarem, a respiração volta a ficar presa ao corpo.
- **Limitações que o autor do `gm_laboratory` avisa.** Com vários fantasmas por perto, toca no máximo uma respiração por vez. O fantasma pode aparecer um instante ao aterrissar de um pulo. As mãos do próprio fantasma continuam visíveis para ele.
- **Fantasma testado só com bots no papel de fantasma.** Falta testar uma pessoa como fantasma e várias pessoas ao mesmo tempo.
- **Mapas ainda não jogados.** O `zm_biochemical_hotel` e o Transport Ship só foram carregados. Podem trazer regras ou scripts próprios que atrapalhem os modos, e isso só aparece ao jogar.
- **Direito de uso.** Os mapas recriam conteúdo do CrossFire, e o `gm_laboratory` traz os áudios originais. Isso entra na conversa com o advogado, antes de abrir para fora.
- **Máquina.** São 6 servidores de Diversão mais o de partidas. Sete CS2 vazios já somam cerca de 8 GB. Sugiro partir de 8 núcleos dedicados e 32 GB, e confirmar medindo com o servidor cheio. A máquina ainda não foi contratada.
- **Meta de 100 pessoas.** Os seis servidores somam 96 vagas, sem contar as partidas.
- **Máquina na internet.** Cada servidor precisa da própria porta liberada e do próprio token de servidor da Steam, como já anotado em `docs/pendencias-antes-de-abrir.md` para o Cada um por si.

## Como saber que ficou pronto

- A aba mostra os seis cartões, com jogadores atualizados, e funciona no celular.
- Cada modo pronto foi jogado pelo dono com pessoas de verdade.
- Uma conta de fora é derrubada em até 15 segundos em qualquer servidor de Diversão.
- Um servidor desligado aparece como "Fora do ar" e não atrapalha os outros.
- O dono confirma no jogo o que os testes automáticos não alcançam: armas, renascimento, som e placar.
