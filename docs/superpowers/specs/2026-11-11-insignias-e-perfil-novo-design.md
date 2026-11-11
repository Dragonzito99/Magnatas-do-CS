# Insígnias e perfil novo

Combinado com o dono em 11/11/2026, a partir dos rascunhos `site/public/rascunho/insignias-ideia.html` e
`site/public/rascunho/perfil-novo-ideia.html`.

## Por quê

O perfil do jogador "está com muita cara de vibe code" (dono): uma faixa, uma barra, quadrados com números e uma
tabela, igual a qualquer painel. O dono quer um perfil com cara de jogo e quer as **insígnias** do CrossFire
(Badge: conquistas por metas, com níveis, e uma principal que aparece ao lado do nome), feitas do nosso jeito.

## Metas

- O perfil vira uma tela de jogador com abas: **Visão geral**, **Insígnias**, **Partidas** e **Baú**.
- 6 famílias de insígnias × 5 níveis = 30 insígnias, calculadas com os dados que o site **já guarda** (as partidas
  antigas contam).
- Cada insígnia nova dá prêmio: Grana, XP e mutante aleatório.
- A pessoa escolhe uma **insígnia principal**, que aparece ao lado do nome.

## Fora do escopo

- Insígnias por arma, como no CrossFire: o site não guarda a arma de cada abate (precisaria mudar o plugin, e só
  contaria daqui para frente). Fica para depois, se o dono pedir.
- Mostrar a insígnia dentro do jogo (placar do CS2).
- Desenho copiado do CrossFire: tudo é desenho nosso.

## Não pode acontecer

- Prêmio dado duas vezes pela mesma insígnia (nem em corrida entre dois resultados chegando juntos, nem ao recalcular).
- Partida de teste/treino (sem XP) contando para insígnia.
- Insígnia some ou desce de nível depois de conquistada.
- Perder dados do perfil de hoje: tudo o que ele mostra continua em algum lugar da tela nova.

## As insígnias

| Família | Conta | Bronze | Prata | Ouro | Platina | Lendária |
|---|---|---|---|---|---|---|
| **Mira** | headshots (competitivo e mix) | 50 | 250 | 1.000 | 3.000 | 10.000 |
| **Ace** | rodadas de 5 abates (competitivo e mix) | 1 | 5 | 20 | 50 | 100 |
| **Estrela** | MVPs (competitivo e mix) | 10 | 50 | 200 | 500 | 1.000 |
| **Vencedor** | vitórias no competitivo e no mix | 5 | 25 | 100 | 300 | 1.000 |
| **Mutação** | partidas ganhas na Mutação | 5 | 25 | 100 | 300 | 1.000 |
| **Veterano** | partidas jogadas, de qualquer modo | 10 | 50 | 200 | 500 | 1.500 |

- Fontes: `partida_jogadores` (headshot_kills, k5, mvps; vitória pelo vencedor da partida) para competitivo e mix;
  `xp_partidas` com origem `diversao` para a Mutação (resultado `vitoria` nas partidas da Mutação) e para o Veterano.
  Só partidas que valem XP contam (teste do Adm, treino e partidas sem XP ficam de fora).
- O modo de uma partida da Diversão sai da referência `diversao:<porta>:<partida>`: a porta leva ao servidor em
  `servidores_diversao` e ao modo dele, como a tabela de partidas do perfil já faz (`dominio/ficha.ts`).
- O desenho: um escudo com o ícone da família; o nível muda a cor (bronze, prata, ouro, platina ciano, lendária roxa),
  os pontinhos embaixo (1 a 5), raios em volta a partir da Platina e asas na Lendária. Feito em SVG pelo site, como no
  rascunho.
- Conquistada uma vez, fica para sempre (guardar a data em que foi conquistada).

## Prêmios

| Nível | Grana | XP | Mutante aleatório |
|---|---|---|---|
| Bronze | 50 | 200 | — |
| Prata | 100 | 500 | 1 dia |
| Ouro | 200 | 1.000 | 3 dias |
| Platina | 400 | 2.000 | 5 dias |
| Lendária | 800 | 5.000 | para sempre |

- O mutante é sorteado entre os mutantes à venda na loja e entra no Baú como se tivesse sido comprado: se a pessoa já
  tem aquele mutante por tempo, os dias somam; se já tem para sempre, sorteia outro. Na Lendária, se a pessoa já
  tem todos os mutantes para sempre, ganha 1.000 de Grana a mais no lugar (escolha minha).
- **Decisão do dono:** as insígnias que já vierem conquistadas pelas partidas antigas, no dia em que o sistema entrar,
  **também dão o prêmio**.
- Grana entra no extrato como um lançamento próprio ("Insígnia Mira Ouro"); o XP soma direto no total da patente
  (não vira linha de partida, para não aparecer como partida no perfil); o prêmio fica guardado na própria insígnia e
  aparece na aba Insígnias.
- Cada prêmio é entregue uma vez só por (conta, insígnia): a gravação da insígnia e do prêmio é uma coisa só.

## Quando é calculado

- Depois de cada resultado de partida que vale XP (competitivo, mix e Diversão), para os jogadores daquela partida.
- Uma vez, na entrada do sistema, para todo mundo (as partidas antigas).
- Insígnia nova: aviso no sino ("Nova insígnia: Mutação Platina", com o prêmio) e, se for a primeira, ela vira a
  principal sozinha.

## O perfil novo

**Topo (em todas as abas):** avatar grande com a moldura que a pessoa usa; nome na cor que ela usa; selos de papel
(Adm, Moderador), apoiador, patente, clã e a insígnia principal; barra de XP da patente com "X de Y XP para
Próxima"; "Na Magnatas desde". Fundo: foto do mapa em que a pessoa mais joga (sem foto conhecida, o fundo padrão).
Botões à direita: Adicionar amigo, Chamar para o clã, Ver na Steam (as mesmas regras de hoje para aparecer).

**Visão geral:**
- Esquerda: **Números** (K/D em destaque, Vitórias, Dano por rodada, Headshot; embaixo abates, mortes,
  assistências, MVPs, aces), **Últimas partidas** em faixas (foto do mapa, verde vitória / vermelho derrota, modo e
  mapa, placar ou resultado, K/D ou abates, XP), **Por mapa** em cartões com foto e barra de vitórias.
- Direita: **mutante em uso** andando (a animação da loja; sem mutante, a caixa some), **3 melhores insígnias**,
  **Melhor partida**, **Elogios**.
- No fim, só para a equipe: Dados da equipe e Denúncias contra este jogador, como hoje.

**Insígnias:** resumo (quantas tem de 30, o nível mais alto, a próxima mais perto); uma linha por família com a barra
"Faltam N para Nível" e os 5 níveis, os conquistados acesos e os outros apagados. No próprio perfil, clicar numa
conquistada a torna a principal (estrela).

**Partidas:** a lista completa em faixas, com filtro por modo (Todas, Competitivo, Mix, Mutação, Fantasma, Equipe e os
outros modos da Diversão). Clicar abre a partida, como hoje.

**Baú:** vitrine aberta para qualquer visitante (decisão do dono): mutantes andando, molduras, etiquetas, aviso e cor
do nome que a pessoa tem, com o que está em uso marcado. Itens vencidos não aparecem.

**Insígnia principal também aparece:** ao lado do nome no ranking e nas salas.

## Escolhas minhas (para o dono conferir)

- A família Ace conta só rodadas de 5 abates (no rascunho eu tinha dito que as de 4 contariam nos níveis baixos;
  ficou mais simples assim).
- "Melhor que X% do clube" embaixo do K/D fica de fora por enquanto (seria uma conta nova contra todo mundo).
- Partida da Diversão conta para Mutação e Veterano; headshot, ace e MVP só do competitivo e do mix, porque a
  Diversão não guarda esses números.
- Na entrada do sistema, quem já tem várias insígnias recebe um aviso no sino só, com a soma dos prêmios, em vez de um
  aviso por insígnia.

## O que fica para quem constrói

- As tabelas novas (insígnias conquistadas, principal), a origem nova de XP e o tipo novo de lançamento de Grana.
- Como juntar os números das famílias sem pesar a página.
- O desenho final dos ícones (o rascunho é a primeira versão).
- Celular: as abas e as linhas de insígnias quebram como no rascunho.
