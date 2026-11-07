# Aceitar a partida, vetos de mapa e juntar salas

## Por que

O dono quer que as partidas competitivas do site funcionem como as lobbies da Gamers Club
(https://help.gamersclub.com.br/pt_br/como-jogar-uma-partida-competitiva-BkMpE3Aut):
ninguém entra numa partida sem confirmar presença, os líderes escolhem o mapa por vetos,
e salas incompletas podem se juntar para fechar 5. Hoje, quando o desafio é aceito, a partida
nasce na hora com um mapa sorteado, e quem saiu do computador trava os outros nove.

## O que já existe (e continua)

- Sala de até 5, com líder e nome igual ao nick do líder (`site/src/dominio/salas.ts`).
- Quem fecha o site há 5 minutos sai da sala (`fecharSalasAbandonadas`, na varredura).
- Desafio entre salas completas: pedido, aceite, recusa, cancelamento, prazo de 60 s (`desafios.ts`).
- Mix: fila de 10, times sorteados (`mix.ts`).
- Partida: `criarPartida` → `aguardando_servidor` → `alocarServidores` carrega no MatchZy → botão de entrar.
- Banimento: proposta da equipe e confirmação do adm (`banimentos.ts`); conta `banido` perde o acesso.

## Objetivos

### 1. Aceitar a partida (desafio e Mix)

- Quando o desafio é aceito, ou quando o Mix fecha 10, a partida nasce num estado novo, **aguardando aceite**,
  sem servidor e sem mapa.
- Cada um dos 10 jogadores tem **30 segundos** para clicar em **Aceitar**. A tela mostra quem já aceitou.
- Todos aceitaram:
  - Desafio → vai para os **vetos**.
  - Mix → o mapa é **sorteado** (como hoje) e a partida segue para `aguardando_servidor`.
- Alguém não aceitou em 30 s → a partida é **cancelada** e:
  - **Desafio:** quem não aceitou **sai da sala**. As duas salas voltam para a lista com o resto
    do pessoal (se o líder saiu, a liderança passa adiante, como já acontece). Quem não aceitou leva
    a **punição progressiva** (item 3).
  - **Mix:** quem não aceitou **sai da fila**, **sem punição**. Quem aceitou volta para a fila
    na **frente**, na ordem em que estava, para fechar de novo assim que chegar gente.

### 2. Vetos de mapa (só desafio)

- Mapas: os 7 de hoje (`MAPAS` em `partidas.ts`): Mirage, Inferno, Nuke, Ancient, Anubis, Dust 2, Overpass.
- Na entrada da tela de vetos, um **cara ou coroa** decide qual líder veta primeiro. Os 10 veem o resultado.
- Os líderes vetam **um mapa por vez, alternando**, até sobrar um. Esse é o mapa da partida.
- Cada veto tem **20 segundos**. Se o líder não vetar a tempo, o site veta um mapa **aleatório** por ele.
- Só o líder de cada sala veta. Os outros veem os vetos acontecendo.
- Com o mapa definido, a partida segue para `aguardando_servidor` e o fluxo de hoje continua.

### 3. Punição por não aceitar (só desafio)

- Strikes contados nos **últimos 30 dias** (um strike com mais de 30 dias não conta mais).
- 1º strike: **3 minutos** sem jogar. 2º: **15 minutos**. 3º: **30 minutos**.
- 4º: **1 dia** sem jogar, com um aviso na tela: se repetir, banimento permanente.
- 5º: **banimento permanente direto**, sem passar pela equipe, com motivo e data registrados
  (o dono vai fazer depois um "mural da vergonha" que lista banidos com motivo e data).
  É igual ao banimento confirmado pela equipe: conta `banido`, sessões apagadas e **CPF bloqueado**
  (decisão do dono).
- A equipe pode reverter esse banimento pelo caminho que já existe. Reverter **zera os strikes** da pessoa:
  se ela voltar a não aceitar, a escada recomeça do 1º strike (3 minutos), e assim por diante (decisão do dono).
- Partida cancelada por outro motivo antes de todos aceitarem (equipe suspendeu ou baniu alguém,
  ou cancelou a partida) não dá strike a ninguém (decisão minha).

### 5. Tela do servidor e voltar para a partida

- Depois dos vetos (ou do sorteio no Mix), a mesma página da partida passa a mostrar a liberação do servidor
  e, quando pronto, os botões de entrar e copiar o IP. A página **fica nessa tela até a partida terminar**:
  quem cair do jogo volta por ela.
- Enquanto a pessoa estiver numa partida em andamento (aceite, vetos, servidor ou ao vivo), **toda página
  do site** mostra no topo um aviso **"Você está em uma partida — Voltar para a partida"**, que leva à
  página da partida. Assim, quem fechou a aba e abriu o site de novo acha o caminho de volta na hora.

### 6. Tela pós-partida

Quando a partida termina, a mesma página mostra o resultado (vale para desafio e Mix):

- **MVP da partida** em destaque no topo: quem ganhou mais estrelas de MVP nas rodadas (o número que o
  servidor já manda nos eventos); empate → mais kills.
- **Placar no estilo HLTV** (decisão do dono), um quadro por time:
  Jogador | K-D | +/- | ADR | KAST | HS% | Rating | XP ganho.
  - ADR = dano ÷ rodadas. KAST = % de rodadas com kill, assistência, sobrevivência ou troca
    (o MatchZy manda `kast` nos números do jogador). HS% = kills com headshot ÷ kills.
  - Rating: a fórmula pública do **HLTV Rating 1.0** (a do 2.0 não é pública), com kills, mortes,
    rodadas e multi-kills (1k a 5k), que o servidor também manda. Hoje o site guarda só kills, mortes,
    assistências, dano, headshots e rodadas; os campos que faltam (MVP, KAST, multi-kills) passam a ser guardados.
- **Denunciar**: continua o que já existe na página da partida.
- **Elogiar** (novo): cada jogador pode elogiar outro da partida apontando uma coisa boa do Magnata,
  escolhendo um tipo. Tipos (decisão minha): **Bom de mira**, **Gente boa**, **Líder**, **Bom de equipe**.
  - Um elogio por pessoa elogiada por partida; não pode elogiar a si mesmo; só quem jogou a partida elogia.
  - O perfil mostra o total de cada tipo (ex.: "Bom de mira ×12"). Elogio não dá XP (decisão minha).

### 7. Aviso de que a partida apareceu

- Igual à GC (decisão do dono): quando os 30 s começam, cada um dos 10 recebe o aviso mesmo com o site
  numa aba escondida ou o navegador minimizado — **som**, **notificação do Windows** (pedindo permissão
  ao navegador na primeira vez) e **título da aba piscando**. Clicar leva à tela de aceitar.
- Hoje a página para de se atualizar com a aba escondida, e o navegador atrasa relógios de abas escondidas,
  então o aviso precisa chegar por uma conexão aberta com o site, não por um relógio na página.
- A regra para o jogador: deixar o site aberto no navegador enquanto espera partida.
- "Sem jogar" = não pode criar sala, entrar em sala, entrar no Mix, desafiar, aceitar desafio
  nem pedir/aceitar junção. A tela mostra até quando dura o bloqueio.

### 4. Juntar salas

- Funciona como um desafio: o líder de uma sala pede para **juntar** com outra sala;
  o líder da outra **aceita** ou **recusa**; o pedido expira como o desafio (60 s).
- Só pode pedir se a soma das duas salas couber em 5.
- Aceito: todos da sala que pediu passam para a sala que aceitou, que mantém o líder e o nome dela.
  A sala que pediu deixa de existir.
- Não pode pedir nem aceitar com qualquer das salas em partida.

## Fora do escopo

- Sala privada e link de convite: todas as salas aparecem para todos, e só se entra pelo site.
- Pré-veto, filtro por nível e as restrições da GC (Prime, verificado).
- Clãs (o nome da sala vai puxar o clã quando existir).
- O mural da vergonha.
- Vetos no Mix e punição no Mix.

## Restrições

- Next.js 16 do projeto (ler `site/AGENTS.md`), Drizzle, PostgreSQL, testes Vitest com PGlite.
- Os prazos (30 s, 20 s) são conferidos pelo servidor, nunca pelo navegador. O que vence sem resposta
  é resolvido pela varredura (`varrer`, que já roda sozinha no site) e também na próxima ação de alguém.
- A página da partida já se atualiza sozinha; o relógio de 30 s e de 20 s aparece contando na tela.
- O banimento automático precisa de um autor: `banimentos.propostoPor` hoje é obrigatório e aponta para
  uma conta. Decisão do construtor como registrar que foi o sistema.
- Tudo em português do Brasil, no estilo do projeto.

## Decisões minhas (o dono pode mudar)

- Mix com alguém que não aceitou: os que aceitaram voltam para a frente da fila, na ordem anterior (o dono confirmou).
- Lados (CT/TR) continuam como o MatchZy faz hoje.
- O cara ou coroa é só um resultado com uma animação curta, sem ninguém escolher cara ou coroa.

## O que fica para o construtor

- Nomes dos estados novos da partida e das tabelas (aceites, vetos, strikes, junções).
- Como desenhar as telas de aceite e de vetos, seguindo o visual do site.
