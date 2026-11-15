# Ilha Lemnos (modo extração), etapa 1: desenho

Data: 15/11/2026. Combinado com o dono em conversa, nos dias 14 e 15/11/2026.

Neste texto, **(dono)** marca o que ele decidiu. **(proposta)** marca o que eu completei: vale até ele dizer outra coisa.

## Para que serve

O dono quer um modo novo no clube, de **extração**, no gênero do Arena Breakout:
- você entra num mapa grande com o que escolheu levar;
- pega mais coisas pelo caminho;
- precisa chegar vivo a um ponto de saída para salvar o que carrega.

O que ele quer do modo:
- **um motivo para jogar com cuidado**, já que morrer custa caro;
- **um servidor que fica ligado o dia inteiro**, onde o jogador entra quando quiser e fica 10 minutos ou 10 horas;
- **uma economia que conversa com o site**: o saque vira grana, e a grana e a Magcoin compram equipamento para o modo.

## A visão completa e o que esta etapa faz

O dono descreveu o modo inteiro. Ficou combinado fazer em etapas, cada uma jogável:

1. **Ciclo básico (esta etapa):** baú, entrada, saque, extração, venda, morte, AFK e estatísticas.
2. **Missões:** cofres com itens, lugar para invadir e saquear, refém que precisa ser levado até a saída para dar bônus (dono).
3. **Mundo 24h vivo:** o mapa muda com o passar do tempo e há eventos automáticos em alguns horários (dono).
4. **Domínio de clã:** vários locais do mapa podem ser dominados por um clã. Dominado, o local vira o renascimento do clã e lá eles guardam itens, mas outro clã pode tomar (dono). Os clãs já existem no site (`2026-11-08-clas-design.md`).

As etapas 2, 3 e 4 ficam **fora** deste trabalho. Esta etapa não pode fechar a porta para elas. Por exemplo: os lugares do mapa (safe zones, saídas, caixas) ficam num arquivo do mapa, e não espalhados pelo código, para as missões e os domínios entrarem depois.

Mais à frente, o dono quer **fazer o próprio mapa à mão** no editor do CS2, com eu ensinando. Esta etapa usa um mapa da Oficina: **dm_royale** (id 3637327357, 174 MB, cerca de cinco vezes a Dust 2, com prédios e morros), escolhido pelo dono para testar o conceito.

## Metas desta etapa

1. Um servidor de extração **sempre ligado**, no dm_royale, com até 20 jogadores (proposta, pelo tamanho da máquina).
2. Um **baú da extração** no site, separado do baú de aparência que já existe, com armas, granadas, mochilas e o personagem.
3. Na **loja**, uma seção da extração:
   - armas e granadas com grana;
   - armas com Magcoin, por dias ou para sempre;
   - mochilas maiores;
   - venda do saque por grana.
4. No servidor:
   - nascer numa safe zone com o que escolheu no site;
   - saque no chão e em caixas;
   - mochila com limite;
   - pontos de extração;
   - morte e saída com as regras abaixo.
5. Detecção de **AFK e de acampar**, com kick e punição em escada, e banimento **só do modo extração**.
6. Uma **tela de estatísticas** no site, mostrada quando o jogador sai do servidor.
7. O que precisar ser desfeito ou conferido aparece no **Painel ADM**: banimentos, ajustes e o registro das extrações.

## Fora do escopo

- Missões, mundo que muda, eventos e domínio de clã (etapas 2, 3 e 4).
- Mapa próprio do Magnatas.
- Mexer no baú dentro do jogo. **O baú só se mexe pelo site; para trocar de arma, o jogador sai do servidor (dono).**
- Trocar ou dar itens entre jogadores. A loja já fecha essa porta, contra conta laranja e golpe.
- Ranking da extração.

## O que seria um fracasso mesmo funcionando

- **Item duplicado:** o mesmo saque guardado duas vezes, ou arma que volta ao baú e também fica no chão para outro pegar.
- **Salvar a mochila sem extrair**, fechando o jogo, caindo a internet ou de qualquer outro jeito.
- **Perder o que já estava no baú** por queda do servidor ou erro do site.
- **Grana que ninguém explica:** toda grana da extração precisa entrar no livro-caixa (`lancamentos_de_grana`) com referência única, como a loja já faz.
- **A extração derrubar a Mutação, o competitivo ou o Laboratório.** Por isso o plugin é separado (ver Caminhos).
- **Inflação:** a extração dar tanta grana que tudo da Magnata Shop fica barato.
- **Banir do clube inteiro por AFK.** O banimento é só do modo extração (dono).
- **Item que imite skin, faca, luva, patente ou medalha da Valve.** Os itens de saque são objetos comuns, como relógio e joia.

## Caminhos considerados

- **A: pôr a extração no plugin que já roda a Mutação e os outros modos (MagnatasDiversao).** Aproveita tudo, mas qualquer mudança na extração pode derrubar a Mutação, que já caiu uma vez por mudança no plugin.
- **B: um plugin novo, só da extração (escolhido pelo dono).** Roda só no servidor da extração e reaproveita o que já existe:
  - o personagem, pelo MagnatasVisual;
  - o jeito de ligar o servidor (`iniciar_diversao.sh` com um `.conf` novo);
  - a lista de quem pode entrar;
  - a conversa com o site pelo `SERVIDOR_TOKEN`;
  - o livro-caixa da grana.
- **C: usar um modo de battle royale pronto da comunidade.** Descartado: não conversa com baú, grana e loja.

## Como joga

### Antes de entrar (site)

- O jogador abre o **baú da extração** e escolhe o que vai levar (dono):
  - personagem;
  - arma principal;
  - arma secundária;
  - granadas;
  - mochila (proposta: entra no baú junto com as armas).
- Clica em **Entrar** e conecta no servidor pelo mesmo caminho dos outros modos.
- No site, o que ele escolheu fica marcado como **em campo** até ele sair do servidor.

### No mapa

- Nasce numa **safe zone** sorteada. Ninguém leva dano dentro dela (proposta: também não dá para atirar de dentro). O mapa tem várias safe zones (dono); proposta: 3 ou 4 no dm_royale.
- **Saiu da safe zone, não volta mais (dono).** Quem tenta voltar é empurrado para fora.
- **Saque (proposta, falta o OK do dono):**
  - **Dinheiro solto**, em maços de notas: vira grana ao extrair.
  - **Comum:** relógio, celular, rádio. Fica no chão pelo mapa todo e vale pouco.
  - **Raro:** joias, notebook, documentos. Fica em caixas, em lugares fixos.
  - **Lendário:** barra de ouro, maleta de diamantes. Fica nos cofres e nas missões, então quase não aparece nesta etapa.
  - O saque aparece como objeto de verdade no chão. O jogador chega perto, aperta **E** e o item vai para a mochila.
  - Caixas e itens **reaparecem com o tempo**, porque o servidor nunca reinicia a rodada.
- **Mochila:** tem limite de espaços (dono). Cada item ocupa 1 espaço (proposta). A mochila aparece na tela.
- **Extração:** 3 ou 4 pontos de saída no mapa (proposta). O jogador fica uns 10 segundos parado no ponto (proposta) para extrair.

### Extraiu

- Tudo o que carrega vai **para o baú** (dono).
- O jogador aparece numa safe zone, ainda no servidor, e pode sair de novo (dono).

### Morreu

- **Perde:**
  - o que tinha dentro da mochila (dono);
  - as armas e granadas compradas com grana (dono).
- **Volta para o baú:**
  - as armas compradas com Magcoin, por dias ou para sempre (dono);
  - a mochila comprada, mas vazia (dono).
- Renasce numa safe zone e continua no servidor (proposta, seguindo a extração). Volta com o que tiver no baú da escolha que fez no site; se a arma escolhida se perdeu, entra só com o que restou.

### Saiu do servidor

- Fechar o jogo ou cair a conexão **fora da safe zone** conta como morte (proposta). Sem isso, quem vai morrer fecha o jogo e salva a mochila.
- Saindo, o jogador cai na **tela de estatísticas** no site (dono). Ela mostra tudo o que fez nessa sessão:
  - quanto tempo jogou;
  - abates e mortes;
  - quantas extrações;
  - o que guardou no baú;
  - o que perdeu;
  - quanto vale o saque.

### AFK e acampar

- **Quem fica AFK ou acampa de jeito estranho leva kick (dono).** Na proposta, os dois casos ganham aviso antes:
  - **AFK:** 3 minutos sem mexer;
  - **Acampar:** 10 minutos preso numa área pequena. Esperar de tocaia um pouco faz parte do gênero.
- **O kick conta como morte e o jogador perde tudo** (dono), como na seção Morreu. O que já estava guardado no baú não se perde.
- **Punição em escada (dono):**
  - 1º e 2º kick: perde tudo;
  - 3º kick: banido do modo por alguns dias (proposta: 3 dias);
  - mais um kick depois disso: banido do modo para sempre.
- **O banimento vale só para o modo extração (dono).**
- **Os kicks zeram depois de 30 dias sem levar outro (proposta, sem resposta do dono).**
- **Todo banimento aparece no Painel ADM e pode ser desfeito (proposta, sem resposta do dono).**

### Respostas do dono à revisão (15/11/2026)

- **Matou alguém, pode pegar a mochila e as armas dele e extrair com elas (dono).**
  - A arma de Magcoin nunca cai no chão; volta para o baú do dono dela.
  - Arma achada no mapa ou tirada de um morto e extraída entra no baú como arma de uso único, igual às de grana (proposta).
  - O Painel ADM vigia mortes repetidas entre os mesmos dois jogadores, contra o golpe da segunda conta (proposta).
- **Todos contra todos na etapa 1 (dono).** Grupo entra com os clãs, na etapa 4.
- **A extração dá XP pelos abates, mas sem a grana do XP (dono).** A grana do modo vem só do saque.
- **Inimigos do computador (dono):** ele quer humanos, mutantes e animais no mapa. Não entram na etapa 1, que testa primeiro o modo só com gente (proposta). Entram junto com o mundo vivo.
- **Lore forte (dono):** o modo precisa de uma história. A proposta está na seção "A história".

## A história (proposta, falta o OK do dono)

*Escrita para amarrar a extração à Mutação, que já existe no clube.*

- **A Zona:** o surto da Mutação começou numa ilha. O governo cercou a ilha, evacuou às pressas e declarou a área perdida. Ficou tudo para trás: cofres, joias, documentos, armas.
- **Os Magnatas:** quem compra o que sai de lá são os Magnatas. Eles pagam bem e não perguntam de onde veio. Os jogadores são **coletores**: mercenários que entram na Zona por conta própria, a serviço deles.
- **Safe zones:** são os **postos dos Magnatas**, acampamentos cercados onde ninguém atira. Quem sai de um posto está por conta própria, e o posto não abre a porta para quem volta.
- **Pontos de extração:** barcos e helicópteros dos Magnatas, que só esperam alguns segundos.
- **Baú e loja:** o baú é o armário do coletor no posto. A loja é o mercado dos Magnatas, que compra o saque e vende armas.
- **Inimigos das próximas etapas:**
  - **saqueadores**, humanos que ficaram na ilha;
  - **mutantes**, os infectados da Mutação;
  - **animais mutados**.
- **Nome do modo: Ilha Lemnos (dono, 15/11/2026).** Na mitologia, Lemnos é a ilha onde Hefesto caiu do Olimpo e montou a forja,
  o que liga o modo à Forja de Hefesto. Textos: "Entrar na Ilha Lemnos", "Você extraiu da Ilha Lemnos", "Morreu na Ilha Lemnos".

## Economia

### O que entra no baú

| Coisa | Como consegue | Ao morrer |
|---|---|---|
| Arma ou granada **de grana** | Loja, com grana. Cada compra é **uma unidade** | Se perde (dono) |
| Arma **de Magcoin** | Loja, com Magcoin, por dias ou para sempre (dono) | Volta para o baú (dono) |
| Mochila maior | Loja, por dias ou para sempre com Magcoin (dono) | Volta vazia (dono) |
| Saque | Extraindo | Perdido, se estava na mochila |

- As armas são **as armas normais do CS2, sem visual próprio** (dono).
- **Moedas por item:**
  - **Armas:** por dias ou para sempre, sempre com Magcoin (dono). Com grana, a arma é de uso único.
  - **Mochilas:** por dias com grana, seguindo a regra da loja, ou para sempre com Magcoin (dono: "umas maiores na loja por dias e qualquer coisa uma permanente por magcoins").
- **Armas e granadas de grana se contam por unidade (proposta).** Quem compra 3 AKs tem 3 no baú. Se morre, a próxima entrada usa outra, se ainda tiver escolhido AK.
  - Granada lançada se gasta, mesmo que o jogador extraia.
  - A munição de reserva não se conta.
- **Personagem (proposta):** é o boneco que o jogador já tem pelo visual do site. Não é um item novo e nunca se perde.
- **Teto de grana (proposta):** nesta etapa, só a tabela de preços. O painel mostra quanta grana a extração gerou por dia, e um teto entra depois se a conta mostrar que precisa.
- O "dinheiro do jogo" é **a mesma grana do site** (dono). Hoje a grana vem do XP (1 a cada 10 XP) e compra coisas na Magnata Shop (`2026-11-09-loja-e-grana-design.md`).
- **Mochilas (proposta de números):**

  | Mochila | Espaços |
  |---|---|
  | Básica, que todo mundo tem | 8 |
  | Média | 12 |
  | Grande | 16 |
  | Tática | 20 |

- **Venda do saque:** na loja, por grana (dono). Cada venda é uma linha no livro-caixa com tipo novo (`venda`) e referência única.
- O **dinheiro solto** entra na grana na hora da extração, com uma linha de livro-caixa própria.
- **Preços:** saem numa tabela, como fez a loja, e **só valem depois do OK do dono**. A tabela precisa deixar claro quanto de grana uma hora de extração rende comparada a uma hora de competitivo, para não desvalorizar a Shop.

### Quem manda no que existe

- **O servidor diz o que aconteceu; o site guarda.** O plugin avisa o site de três coisas:
  - entrada, com o que o jogador levou;
  - extração, com o que guardou;
  - morte ou saída, com o que perdeu.

  Cada aviso tem uma **referência única**, para não contar duas vezes, e só é aceito com o `SERVIDOR_TOKEN`.
- **O site confere** se o que o servidor disse que o jogador levou bate com o baú dele. Nada sai do nada.
- **Arma de Magcoin nunca fica no chão.** Quando o dono dela morre, ela some do mapa e volta para o baú. Outro jogador não pega.
- **Se o servidor cair ou reiniciar (proposta):**
  - quem estava fora da safe zone perde a mochila (o saque não foi salvo);
  - **as armas e granadas voltam para o baú**, porque a culpa não foi do jogador;
  - nada que já estava no baú se perde.

## Servidor 24h

- **Sempre ligado, como a Mutação hoje:** fica fora do "sob demanda", e o site religa sozinho se cair.
- **Reinício diário de madrugada (proposta),** para atualizações do CS2 e para limpar a memória:
  - aviso no chat 10 minutos antes, para dar tempo de extrair;
  - quem não extrair segue a regra de queda do servidor.
- **Capacidade:** a máquina atual tem 4 núcleos, 7,7 GB de memória e já roda o competitivo e a Mutação, cada um com cerca de 1,2 GB. Um terceiro servidor cabe para começar, com até 20 jogadores (proposta). Se lotar, vale pensar numa máquina maior.
- **Antes de abrir para todos, testa no Laboratório**, como os outros modos.

## Restrições

- **Regras da Valve:** nenhum item imita skin, faca, luva, patente ou medalha.
- **Grana:** usa o livro-caixa `lancamentos_de_grana`, com referência única por movimento, e nunca deixa saldo negativo (regras que já existem).
- **Magcoin:** compra pelo mesmo caminho de `comprarParaSempre` da loja.
- **Plugin novo:**
  - **não pode registrar `OnEntityDeleted`**, que derrubou a Mutação em 13/11/2026;
  - depois de qualquer mudança, o servidor precisa ser ligado de verdade, com troca de mapa, antes de dizer que está pronto.
- **Instalar ou ligar algo na máquina, e publicar o site, só com o OK do dono, cada vez.**
- **Mapa:** usa o dm_royale como está, da Oficina. Safe zones, saídas e lugares de caixa ficam num arquivo próprio do mapa.

## O que fica para quem constrói

- Como desenhar a mochila e os avisos na tela do CS2.
- Como fazer os objetos de saque aparecerem e serem pegos: modelos que já existem no jogo ou um pacote na Oficina, como foi feito com os banners.
- Os lugares exatos de safe zones, saídas e caixas no dm_royale, marcados andando pelo mapa no Laboratório.
- O desenho das telas novas do site (baú da extração, seção da loja, estatísticas), seguindo o visual da Magnata Shop.
- A divisão em tarefas e a ordem de construção.
