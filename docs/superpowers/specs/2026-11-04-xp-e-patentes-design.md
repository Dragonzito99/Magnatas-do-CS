# XP, patentes e rankings

Data: 04/11/2026. Status: aguardando aprovação do dono.

## Por que existe

O dono jogou o Equipe x Equipe e sentiu falta de a partida terminar de verdade, com recompensa. Ele quer um esquema como o do CrossFire: toda partida dá XP, e o XP faz a pessoa subir de patente. A patente reforça a ideia do clube: a pessoa entra como Recruta e tem um caminho longo até Magnata Supremo.

Sucesso é o membro ver o XP ganho ao fim de cada partida, ter vontade de jogar a próxima, e a patente mostrar quem tem história no clube.

## O que o dono decidiu

**Patentes**

| Nível | Patente | XP total |
|---|---|---:|
| 1 | Recruta | 0 |
| 2 | Magnata Jr. | 4.500 |
| 3 | Associado | 13.500 |
| 4 | Mafioso | 31.500 |
| 5 | Empresário | 63.000 |
| 6 | Consigliere | 112.500 |
| 7 | Ministro | 180.000 |
| 8 | Milionário | 270.000 |
| 9 | Don | 405.000 |
| 10 | Magnata Supremo | 630.000 |

Os nomes são do dono. Os valores saíram de uma proposta minha, e o dono pediu 50% a mais que a primeira versão: cerca de 1.050 partidas até o topo, contando 600 XP de média.

**XP por partida**
- Todas as partidas dão XP: Mix, Salas e todos os modos da Diversão.
- O máximo é de 1.100 XP por partida, em todos os modos, "por enquanto". Avisei que partidas curtas fazem subir mais rápido, e o dono escolheu assim.
- A fórmula, aprovada a partir da minha proposta:

| O que conta | XP |
|---|---|
| Jogar até o fim | 300 |
| Vencer | 300 |
| Empatar | 150 |
| Cada abate | 20, até 500 (25 abates) |

- Quem sai antes do fim não ganha XP. Partida cancelada não dá XP.

**Rankings**
- **Comunidade:** por XP total, de todas as partidas, sem zerar.
- **Mix do mês:** por K/D, só com partidas de Mix. Substitui o ranking do mês atual, que junta Mix e Salas.

**Fim de partida.** Ao acabar, aparece o resultado com o XP ganho e o aviso de patente nova. O dono aprovou o esboço com o placar e um quadro de XP por cima, e a próxima partida começando sozinha.

## Limites

- A patente é só do Magnatas, no site e nas nossas mensagens. O projeto não simula a patente oficial do CS2, itens nem inventário. Nada é mostrado como se fosse do jogo ou da Valve.
- O CS2 não permite telas novas. No jogo, o plugin usa `PrintToCenterHtml` e `PrintToChat`. A tela com todos os jogadores fica no site. O quadro ainda não foi testado com pessoas.
- Os abates da Diversão deixam de ficar só no jogo, porque o XP precisa deles. Isso revê uma decisão anterior do dono, e ele foi avisado.

## Escolhas minhas, que o dono viu e não corrigiu

- Quem já jogou começa como Recruta, com 0 XP. Partidas antigas não contam.
- **Cada um por si:** cada ciclo de 20 minutos é uma partida. O terço de cima do placar conta como vencedor, arredondando para cima. É preciso ter jogado pelo menos 5 minutos do ciclo.
- **Mutação:** cada mapa com 10 rodadas é uma partida.
- **Ranking do Mix:** continua o mínimo de 5 partidas no mês.

## Fora desta entrega

- Armas ou servidores liberados por patente.
- Insígnias desenhadas. Por enquanto, um ícone de coroa. A arte fica para quando o dono trouxer.
- Limite diário de XP e defesa contra combinar abates entre amigos. Fica como risco anotado.
- Tela de Adm para mudar os valores.
- Perder XP por punição. Conta suspensa ou banida não joga, então não ganha, e o XP dela fica como está.

## Como construir

Estas escolhas são minhas.

**Banco de dados.** Uma tabela `xp_partidas` guarda cada ganho: conta, origem (`partida` ou `diversao`), referência da partida, abates, resultado, XP e data. Um índice único por conta e referência impede contar duas vezes. A coluna `usuarios.xp_total` guarda a soma e é atualizada na mesma transação. A patente não é guardada: sai do XP total por uma função pura.

**Regras.** `dominio/xp.ts` traz, como funções puras e testadas: `xpDaPartida({ jogouAteOFim, resultado, abates })`, `patenteDe(xpTotal)` e `progressoDe(xpTotal)`. A tabela de patentes fica em uma constante só, porque os valores devem mudar.

**Mix e Salas.** O ponto de entrada é `finalizarPartida`, em `dominio/partidas.ts`, que já roda em transação quando o `series_end` chega. Com estado `encerrada`, ela lança o XP de quem está em `partida_jogadores`, usando `kills`, `time` e `vencedor`. Quem saiu antes do fim continua nessa tabela, então é preciso definir como reconhecer o abandono no plano, olhando os eventos que o MatchZy já envia. Sem como saber, quem está na partida recebe.

**Diversão.** Um novo endereço `POST /api/servidor/diversao/resultado`, com o mesmo `SERVIDOR_TOKEN` dos outros e limite de 1 MiB. O plugin envia a porta do servidor, um id único da partida e, por conta, abates, minutos jogados e resultado. O site confere e calcula o XP. O plugin nunca envia XP pronto. Contas que não são de membro ativo são ignoradas. Reenviar o mesmo id não conta duas vezes.

**Plugin.** Ao fim da partida do Equipe x Equipe e a cada ciclo do Cada um por si, o plugin envia o resultado e, com a resposta, mostra o quadro com o XP no centro da tela e a patente nova, se houver. Se o site não responder, a partida segue normalmente, e o plugin tenta de novo algumas vezes antes de desistir. `SITE_URL` e `SERVIDOR_TOKEN` já existem em `cs2.env` e entram no JSON de configuração do plugin, com permissão só para o usuário `cs2`. O tempo mostrando o resultado sobe de 5 para 15 segundos, para dar tempo de ler. No Cada um por si, o reinício de 20 minutos vira um fim de ciclo com o mesmo quadro.

**Telas.**
- `/ranking` ganha duas abas: Comunidade (a primeira) e Mix do mês, que mantém a navegação por mês.
- O perfil mostra patente, barra de progresso e as últimas partidas com XP.
- `/partidas/[id]` mostra o XP de cada jogador. A Diversão não tem página de partida; o XP dela aparece no perfil.
- O sino avisa de patente nova, até a pessoa abrir o perfil.
- O nome no banner mostra a patente em letras pequenas.

**Ligação com os outros modos.** Fantasma e Mutação entram com esse mesmo envio quando forem construídos.

## Riscos

- **Combinar abates:** amigos podem se deixar matar em um servidor vazio para ganhar XP. O teto de 500 XP por partida limita, mas não impede. O dono fica responsável por rever isso antes de abrir o clube para mais gente.
- **Partidas curtas:** com o mesmo teto, o Equipe x Equipe dá muito mais XP por hora que o Mix. O dono sabe e escolheu assim, por enquanto.
- **Valores novos:** ninguém jogou com esta fórmula, então os números devem mudar. Mudar a tabela de patentes não pode exigir alterar a história de ninguém, e por isso a patente é calculada.
- **Abandono na Diversão:** quem cai por falha de internet logo antes do fim perde o XP daquela partida.

## Como saber que ficou pronto

- Uma partida de Mix ou Salas encerrada dá o XP certo a cada jogador, uma só vez, mesmo com evento repetido.
- Partida cancelada não dá XP a ninguém.
- Ao fim do Equipe x Equipe e do ciclo do Cada um por si, o dono vê o quadro com o XP no jogo, e o valor bate com o site.
- Subir de patente aparece no jogo, no sino, no perfil e no ranking.
- As duas abas de ranking funcionam no computador e no celular.
- Com o site desligado, os servidores da Diversão continuam jogando normalmente.
