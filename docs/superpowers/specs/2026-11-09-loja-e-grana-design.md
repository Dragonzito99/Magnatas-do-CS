# Magnata Shop e Grana: desenho

Data: 09/11/2026. Primeira etapa da economia do jogo, combinada com o dono nesta data.

## Para que serve

O dono quer uma **loja** onde o jogador gasta uma moeda que ganha jogando, do mesmo jeito que ganha XP. Na palavra dele,
isso "não pode ter falha de jeito nenhum": mexe com a economia do jogo e, na segunda etapa, com dinheiro de verdade.
Por isso a primeira etapa já nasce com o livro-caixa, a proteção contra cobrança dupla e os testes que a segunda vai usar.

## As duas moedas (visão completa)

- **Grana**: ganha jogando. Compra itens **por tempo**: 1, 3, 5 ou 9 dias. Comprar de novo **soma os dias**.
- **MagCoin**: comprada com dinheiro de verdade no site. Compra os mesmos itens **para sempre**.

**Esta etapa faz só a Grana.** A MagCoin fica para a segunda etapa (ver "Fora do escopo").

## Metas desta etapa

1. Grana ganha em cada partida, junto do XP.
2. Grana inicial para quem já jogou, pelo XP acumulado.
3. Loja (Magnata Shop) com quatro tipos de item, todos só de aparência.
4. Baú: o jogador vê o que tem, quantos dias faltam, e escolhe o que está usando.
5. Os servidores (competitivo e diversão) aplicam o que o jogador escolheu.
6. Extrato da Grana para o jogador e, no Painel ADM, ajuste manual com motivo.

## Fora do escopo

- **MagCoin e pagamento com dinheiro de verdade.** Segunda etapa. Exige conta numa empresa de pagamento, que o dono cria.
- **Mutantes com poder** (Blindado, Saltador). Etapa futura, já desenhada em conversa: cada skin troca o G do mutante.
- Dar ou trocar Grana ou itens entre jogadores. Não existe transferência: fecha a porta para conta laranja e golpe.
- Devolução de compra. Erro se corrige pelo ajuste do Adm.

## O que seria um fracasso mesmo funcionando

- Saldo negativo, ou compra feita com saldo que não existia.
- Cobrar duas vezes por um clique duplo ou por internet lenta.
- Grana sem a partida que a gerou, ou a mesma partida pagando duas vezes.
- Saldo que ninguém consegue explicar linha por linha.
- Item que imite skin, faca, luva, patente ou medalha da Valve (regra dela; servidor perde a licença).
- Vender vantagem de jogo nesta etapa. Tudo aqui é só aparência.

## Regras da Grana (decididas pelo dono)

- **1 Grana a cada 10 XP**, arredondado para baixo, calculada no mesmo momento do XP de cada partida. Vale para o
  competitivo e para a diversão, nas mesmas condições do XP (partida de teste, cancelada ou sozinho não dá XP nem Grana).
  Uma partida boa no competitivo (1.100 XP) dá 110 Grana.
- **Abertura**: cada conta recebe uma vez `xp_total / 10` (para baixo), numa linha própria do livro-caixa.
- **Preços**: tabela na seção "Tabela de preços". Ela é uma proposta e **só vale depois do OK do dono**.

## Como o saldo fica à prova de erro

- **Livro-caixa** `lancamentos_de_grana`: uma linha por movimento, com quantidade positiva (ganho) ou negativa (gasto).
  Linhas nunca são editadas nem apagadas. Tipos: `partida`, `abertura`, `compra`, `ajuste`.
- Cada linha tem `referencia` e o par (conta, referencia) é **único** no banco:
  - partida: a mesma referência da linha de XP (a partida que pagou não paga de novo);
  - abertura: `abertura` (só uma por conta);
  - compra: o código da compra, gerado na tela antes do clique (clique duplo vira a mesma compra);
  - ajuste: um código novo por ajuste.
- **Saldo** guardado em `usuarios.grana`, atualizado **na mesma transação** que grava a linha, com uma regra do banco
  `grana >= 0`. Se faltar saldo, o banco recusa e nada é gravado.
- **Compra** trava a linha da conta (`select ... for update`) antes de conferir o saldo, para duas compras ao mesmo
  tempo não usarem o mesmo dinheiro.
- **Conferência**: a parte Grana do Painel ADM compara, toda vez que abre, `usuarios.grana` com a soma das linhas de
  cada conta. Se alguma não bater, mostra um alerta vermelho. Nunca corrige sozinha.
- O preço pago fica gravado na linha da compra: mudar a tabela depois não mexe no passado.

## Itens da primeira versão

Todos definidos no código do site, num catálogo único, sem nada de skin, arma, patente ou inventário da Steam.

| Tipo | O que faz | Onde aparece |
|---|---|---|
| Cor do nome | O nome do jogador no chat sai na cor escolhida | Chat de todos os servidores |
| Etiqueta | Um texto fixo antes do nome, ex. `[MAGNATA]`, `[CHEFÃO]`, `[DON]` | Chat de todos os servidores |
| Aviso de entrada | Ao entrar no servidor, todos veem "★ Fulano chegou" | Chat de todos os servidores |
| Moldura | Borda especial na foto | Perfil e ranking do site |

- Cores: só as que o chat do CS2 mostra (vermelho, verde, azul, roxo, dourado, laranja, rosa, azul-claro...). Cada cor é
  um item.
- Etiquetas: lista fixa no catálogo. O jogador **não digita** o texto (nada de palavrão ou imitação de cargo da equipe).
  Etiquetas que pareçam cargo (`ADM`, `GM`, `STAFF`) não podem existir.
- Molduras: 3 ou 4 desenhos feitos em CSS (ex. dourada, neon, fogo).
- Um item **usado por tipo**: uma cor, uma etiqueta, um aviso e uma moldura ao mesmo tempo.

## Tempo dos itens

- Comprar um item que a pessoa não tem: vale de **agora** até agora + dias.
- Comprar um item que ainda está valendo: os dias **somam** ao fim atual.
- Comprar um item que já venceu: conta de agora de novo.
- Item vencido some do uso sozinho: o site considera vencido na hora de ler, sem depender de tarefa agendada.
- A posse fica em `itens_do_jogador` (conta, item, `expira_em`, `usando`). A MagCoin, na segunda etapa, grava `expira_em`
  vazio para "para sempre"; esta etapa já trata vazio como permanente.

## Tabela de preços (proposta, aguardando o OK do dono)

Base: uma partida rende de 30 a 110 Grana. O item de 1 dia custa mais ou menos uma partida; o de 9 dias, cinco a seis.

| Item | 1 dia | 3 dias | 5 dias | 9 dias |
|---|---|---|---|---|
| Cor do nome | 80 | 200 | 300 | 480 |
| Etiqueta | 100 | 250 | 380 | 600 |
| Aviso de entrada | 60 | 150 | 230 | 370 |
| Moldura | 80 | 200 | 300 | 480 |

## Telas do site

- **Magnata Shop** (aba que já está no menu): os itens por tipo, com prévia (o nome colorido, a etiqueta, a moldura na
  foto do próprio jogador), os quatro preços e o botão Comprar. Antes de cobrar, uma confirmação mostra item, dias e
  preço. Sem saldo, o botão diz quanto falta.
- **Baú**: o que a pessoa tem, quantos dias faltam, e "Usar" / "Tirar" por tipo. Também o **extrato**: cada ganho e gasto
  com data, motivo e saldo.
- **Cabeçalho**: o saldo de Grana ao lado da conta.
- **Painel ADM**: buscar um jogador, ver o extrato, dar ou tirar Grana com motivo obrigatório. Fica na auditoria que já
  existe. Só o Adm faz ajuste.

## Servidores do jogo

- Um plugin novo, **MagnatasVisual**, instalado no competitivo e nos servidores da diversão. Os plugins atuais não mudam.
- Ao entrar um jogador, e no começo de cada rodada para todos, o plugin pergunta ao site o que cada um está usando
  (`GET /api/servidor/visuais`, com o token dos servidores). Trocar no Baú vale na rodada seguinte.
- O site responde só o resultado pronto (cor, etiqueta, aviso). O servidor não sabe de saldo nem de preço.
- O plugin assume o chat: reescreve `say` e `say_team` com etiqueta e cor, respeitando chat de time e de morto.
  Mensagens que são comandos (começando com `.` ou `!`, como o `.ready` do MatchZy) passam intactas, para não quebrar o
  competitivo nem os comandos da diversão.
- Se o site não responder, o jogador fala com o nome normal. O jogo nunca para por causa da loja.

## Testes que provam

- Grana da partida igual a `xp / 10`, e a mesma partida não paga duas vezes.
- Abertura paga uma vez só, mesmo rodando duas vezes.
- Compra sem saldo é recusada e não grava nada.
- Clique duplo (mesmo código de compra) cobra uma vez.
- Duas compras ao mesmo tempo não deixam o saldo negativo.
- Soma dos dias: item novo, item valendo, item vencido.
- Item vencido não aparece na resposta para o servidor.
- Conferência acusa saldo diferente da soma das linhas.
- Ajuste do Adm exige motivo e vai para a auditoria; jogador comum não consegue ajustar.
- Nenhuma etiqueta do catálogo parece cargo da equipe.
- Plugin: chat com e sem item, site fora do ar.

## Ordem para ir ao ar

1. Tudo testado no site local com contas de teste.
2. Dono aprova a tabela de preços.
3. Publicar site e plugin (com o OK do dono, como sempre).
4. Rodar a abertura uma vez, conferir a soma, e só então abrir a aba da loja.

## Decisões minhas (o dono pode mudar)

- Nome do plugin, tipos e cores exatos, desenhos das molduras e lista de etiquetas.
- Atualizar o servidor no começo de cada rodada, e não na hora do clique.
- A conferência só avisa no Painel; nunca corrige saldo sozinha.
