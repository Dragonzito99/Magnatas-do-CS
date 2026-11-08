# Clãs: desenho

Data: 08/11/2026. Base visual: `site/public/rascunho/clas.html`, aprovado pelo dono.

## Para que serve

O dono quer que os jogadores montem um **time fixo** dentro do Magnatas, joguem juntos e disputem com outros clãs.
Hoje "Clãs" aparece no menu como "em breve". Ao terminar este trabalho, o item deixa de ser "em breve" e leva para a tela de clãs.

O que faz isso dar certo, nas palavras dele: clã x clã é **o clã completo contra outro clã completo**, com MD1 ou MD3, seguindo o mesmo jeito do competitivo que já existe (sala, desafio, aceite, vetos, servidor).

## Metas

- Criar, procurar, entrar, sair e administrar um clã.
- Desafiar outro clã para **MD1** ou **MD3**, só com os 5 do clã na sala.
- **Treino**: o clã joga contra ele mesmo, sem valer XP nem ranking.
- **Ranking de clãs**.
- O clã aparece no perfil do jogador e nas salas.

## Fora do escopo

- Moeda própria e Magnata Shop (outro trabalho, ainda sem regras).
- Brasão ou imagem enviada pelo clã: por enquanto, sigla e cor.
- Chat do clã. O Discord continua sendo o lugar da conversa.
- Torneios ou temporadas de clãs.

## O que seria um fracasso mesmo funcionando

- Dar para **farmar** XP ou vitória de clã: treino valendo XP, ou o mesmo par de clãs jogando 20 vezes por dia para subir no ranking.
- Clã x clã com gente de fora do clã no time.
- Uma MD3 que trava no meio e deixa os 10 sem conseguir jogar outra coisa.
- Telas diferentes do resto do site: tudo no visual dos rascunhos já aprovados.

## Regras decididas pelo dono

### O clã

- Criar: **nome**, **sigla de 2 a 4 letras** (aparece como `[MGN]`), **cor** (uma de 5: ouro, roxo, verde, vermelho, prata), **descrição** e **quem pode entrar** ("Qualquer um" ou "Só com convite").
- Cargos: **Dono**, **Capitães** e **Membros**. **Até 20 pessoas** por clã.
- Cada pessoa está em **um clã por vez**.
- Página do clã:
  - posição no ranking, vitórias juntos, aproveitamento e membros (x/20);
  - a lista de membros com cargo, patente e K/D;
  - as últimas partidas do clã;
  - os pedidos para entrar, com Aceitar e Recusar.
- Abas: **Meu clã**, **Procurar clãs**, **Ranking de clãs** e **Criar clã**, como no rascunho.

### Clã x clã

- Só vale com uma **sala com os 5 do mesmo clã**, contra outra sala com os 5 de **outro** clã.
- Quem **desafia** e quem **aceita** é o **Dono ou um Capitão** do clã, e precisa ser o líder da sala.
- Ao desafiar, escolhe **MD1** ou **MD3**. O outro lado vê: "O clã [MGN] desafiou vocês para uma MD3".
- Aceitou: **tela de aceite dos 10**, igual ao competitivo, e depois segue igual ao competitivo.
- **MD1**: vetos como hoje, até sobrar 1 mapa.
- **MD3**:
  - os vetos escolhem 3 mapas, no jeito comum do CS: veta, veta, escolhe, escolhe, veta, veta, e o que sobra é o desempate;
  - os mapas são jogados **um depois do outro, no mesmo servidor**;
  - vence quem ganhar **2 mapas**. Se alguém ganhar os 2 primeiros, o terceiro não é jogado.

### Treino

- Clã contra o **mesmo clã** (duas salas de 5 do mesmo clã) só existe como **treino**.
- O treino **aparece no perfil**, com placar e estatísticas, mas vale **0 XP** e **não conta no ranking de clãs**.
  - **Por quê:** os 10 são do mesmo clã, então um lado podia se deixar matar para o outro pegar XP.
- MD1 ou MD3, como no clã x clã.

### Ranking de clãs e o que cada partida vale

- Ordena pelas **vitórias do clã**. O empate se resolve pelo aproveitamento e depois pelo nome.
- **MD1 vale 1 vitória. MD3 vale 1 vitória** (a da série). Nas "últimas do clã" aparece se foi MD1 ou MD3.
- **Só conta clã x clã.** Mix, salas comuns e treino ficam de fora.
- **Anti-farm:** contra o **mesmo clã**, só **1 partida por dia** (dia de Brasília) conta no ranking. As outras podem ser jogadas, mas não somam.
- **XP:** cada mapa de clã x clã dá XP como o competitivo de hoje. Numa MD3, quem joga os 3 mapas ganha XP 3 vezes.
- O ranking de clãs **não zera**.

## Decisões minhas (o dono pode mudar)

1. **Como a MD3 roda.** Cada mapa é **uma partida do site**: 3 partidas ligadas por uma **série**.
   - Os vetos acontecem uma vez só, na primeira partida, e escolhem os 3 mapas.
   - Quando um mapa termina, o site cria a próxima partida da série com os mesmos 10 e o próximo mapa, e manda carregar **no mesmo servidor**. Os jogadores continuam conectados e só dão "pronto" de novo.
   - Quando um time chega a 2 mapas, a série acaba e o site não cria a próxima.
   - **Por quê:** o site já sabe jogar uma partida de um mapa só, do começo ao fim: estatísticas, XP, gravação, Olho de Águia e perfil. Com uma partida por mapa, tudo isso continua funcionando sem mudar. Usar a série de 3 mapas do próprio MatchZy obrigaria a refazer como o site guarda estatísticas, porque elas zeram a cada mapa.
   - A tela da partida mostra "Mapa 2 de 3 · série 1 x 0" e liga as partidas da série.
2. **Tipo do desafio.** O líder escolhe entre:
   - **Desafio comum**, como hoje, sempre disponível;
   - **Clã x clã MD1 / MD3**, só quando as duas salas são de clãs diferentes e completas;
   - **Treino MD1 / MD3**, só quando as duas salas são do mesmo clã.

   O site confere de novo no aceite: se alguém trocou de sala ou saiu do clã, o desafio cai.
   Se o líder da sala for só Membro, as opções de clã não aparecem para ele, e a sala mostra: "Só o Dono ou um Capitão desafia pelo clã".
3. **Se alguém abandonar no meio da MD3:** vale a regra de abandono que já existe para cada mapa. A partida abandonada é cancelada e **a série inteira é cancelada**, sem vencedor, sem contar no ranking. O XP dos mapas já jogados fica.
4. **Sair e entrar de clã:** quem sai de um clã só pode entrar em outro **24 horas** depois.
   - **Por quê:** sem esse tempo, um jogador forte pode "emprestar" a vaga e trocar de clã entre um desafio e outro.
5. **O dono do clã sai:** precisa passar o cargo de Dono para outra pessoa antes. Se for o último membro, sair **desfaz o clã**. O histórico das partidas continua, com o nome e a sigla guardados.
6. **Nome e sigla únicos** no site, sem diferenciar maiúscula de minúscula. A sigla aceita só letras e números.
7. **Clã aberto:** "Entrar" entra direto. **Só com convite:** "Pedir para entrar" cria um pedido, e Dono ou Capitão aceitam ou recusam. Dono e Capitão também podem **chamar** alguém para o clã: a pessoa recebe um aviso no sino e aceita.
8. **Quem faz o quê:**
   - **Dono:** tudo, incluindo editar o clã, promover ou rebaixar Capitão, expulsar qualquer um e passar o cargo de Dono.
   - **Capitão:** aceitar pedidos, chamar pessoas, expulsar Membros, desafiar e aceitar desafios.
   - **Membro:** jogar e sair.
9. **Onde o clã aparece:**
   - a sigla, na cor do clã, ao lado do apelido nas salas, na tela da partida e no perfil;
   - no perfil, um selo "[MGN] Magnatas Originais" que leva à página do clã.
10. **Equipe do site:** um Adm pode **desfazer um clã** ou trocar nome e sigla ofensivos, com registro na auditoria. Fica na página do clã, só para Adm.

## O que já existe e deve ser reaproveitado

- Salas de 5 (`site/src/dominio/salas.ts`), desafio entre salas (`desafios.ts`), aceite dos 10 (`aceites.ts`), vetos com prazo de 20 segundos (`vetos.ts`) e a partida competitiva com MatchZy (`partidas.ts`, `eventos.ts`). O clã x clã é um desafio com mais regras; não é um fluxo novo.
- O XP já é lançado por partida (`xp.ts`). Para o treino, basta não lançar, mantendo as estatísticas.
- O sino de avisos (`notificacoes.ts`) para desafio de clã, chamado para o clã e pedido aceito.
- Visual: as telas seguem o rascunho `clas.html`, com as classes e o estilo das páginas já refeitas (Jogar, Ranking, Perfil).

## Fica a critério de quem constrói

- Nomes de tabelas e colunas, e como guardar a série.
- A ordem exata dos 6 vetos da MD3 entre os dois clãs, desde que siga "veta, veta, escolhe, escolhe, veta, veta, sobra o desempate", com o cara ou coroa decidindo quem começa.
- Paginação da busca e do ranking.
- Textos de aviso e de erro, no tom do site (curtos, em português simples, sem jargão).

## Como saber que está pronto

- Testes cobrindo as regras de cima, em especial:
  - 5 do mesmo clã;
  - Dono ou Capitão;
  - treino com 0 XP;
  - 1 por dia contra o mesmo clã no ranking;
  - a MD3 parando em 2 a 0;
  - a série cancelada por abandono;
  - os 24 horas para trocar de clã.
- As telas conferidas no computador e no celular, sem rolagem para o lado.
- "Clãs" sai de "em breve" no menu e no Ranking.
