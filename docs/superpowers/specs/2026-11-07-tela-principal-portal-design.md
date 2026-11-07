# Tela principal: portal do clube

## Por que

Hoje o membro que entra no site cai direto em Salas. O dono quer uma tela principal que funcione como
portal: chamar para jogar, mostrar o que acontece no clube, as novidades do CS2 e o cenário competitivo,
com destaque para os times brasileiros.

## Objetivos

### 1. Rota e menu

- Nova página **Início** (`/inicio`), primeira do menu, com o ícone de casa que hoje leva a Salas.
- Quem entra no site (`/`) e quem sai da verificação/banido/suspenso passa a cair em `/inicio`, não mais em `/salas`
  (`site/src/auth/destino.ts`).
- O logo do banner também leva a `/inicio`.

### 2. Layout (opção B, escolhida pelo dono no rascunho)

De cima para baixo:
1. **Bombando agora** (faixa larga no topo).
2. Duas colunas: **Notícias do clube** (larga) e uma coluna com **MVPs**, **Atualizações do CS2** e **Tier S**.
Em celular, tudo vira uma coluna na mesma ordem.

### 3. Bombando agora

- Até 4 cartões, os lugares com mais gente agora, cada um com o botão de entrar:
  - salas incompletas (mais cheias primeiro; "Entrar" leva a `/salas`),
  - o Mix, se tiver alguém na fila ("Entrar" leva a `/mix`),
  - servidores da Diversão ligados com gente (contagem que o site já pergunta ao servidor; "Entrar" é o link `steam://` que a página Diversão já usa).
- Abaixo, as **partidas ao vivo** (até 3), com placar e link.
- Sem nada acontecendo: "Ninguém jogando agora. Que tal abrir uma sala?" com botão para `/salas`.

### 4. Notícias do clube

- Adm (só adm) escreve, edita e apaga notícias numa página da equipe. Campos: título (até 120), texto
  (até 5.000, parágrafos simples, sem HTML), imagem opcional (link de uma das imagens do próprio site ou upload — decisão do construtor, preferindo o mais simples) e fixar no topo.
- A tela mostra as 5 mais recentes (fixadas primeiro); cada uma abre numa página própria `/noticias/<id>` com o texto completo.
- **Patch de aviso** (pedido do dono): a cada atualização publicada do site/servidores, entra uma notícia do clube
  contando o que mudou, em linguagem simples. Quem publica a atualização (eu, o Claude) escreve e publica a notícia
  junto; o dono pode editar. Para isso existe um script (`npm run noticia:publicar <arquivo>`) que roda **na VPS**, dentro de
  `/opt/magnatas/site`, e cria a notícia a partir de um arquivo de texto, além da tela da equipe.
- Autor: notícia escrita na tela da equipe guarda o adm que escreveu; notícia do script fica sem autor e aparece
  como "Equipe Magnatas" (decisão minha).

### 5. MVPs

- **MVP do dia** e **MVP do mês**: quem somou mais estrelas de MVP (`partida_jogadores.mvps`) nas partidas
  **encerradas** do clube (desafio e Mix) no dia / no mês, no horário de Brasília. Empate: mais kills; depois, menor apelido.
- Mostra avatar, apelido, estrelas e partidas; clicar abre o perfil.
- Logo abaixo, **top 5 do mês** em lista curta.
- Sem partidas no período: "Ninguém ainda hoje" / "Ninguém ainda neste mês".

### 6. Atualizações do CS2 (Steam)

- Fonte: API pública da Steam `ISteamNews/GetNewsForApp` do app 730, **só os itens oficiais da Valve**
  (`feedlabel` = "Community Announcements" / `feed_type` oficial — o construtor confere o campo certo).
- Mostra as 4 mais recentes: título e resumo de 1–2 frases **traduzidos para português**, data e link "Ler na Steam".
- Tradução com a API da Anthropic (Claude), modelo mais barato que dê conta, **uma vez por notícia**:
  a tradução fica guardada no banco e nunca é refeita.
- Sem chave configurada ou com a tradução falhando: mostra o título original em inglês (a tela nunca quebra).
- Busca nova no máximo a cada 30 minutos (cache no banco ou em memória).

### 7. Tier S (Liquipedia)

- Fonte: **MediaWiki API da Liquipedia** (gratuita), respeitando os termos dela:
  - no máximo 1 pedido a cada 2 s, e `action=parse` no máximo 1 a cada 30 s;
  - `User-Agent` próprio identificando o site e um contato: `MagnatasDoCS/1.0 (https://magnatasdocs.com.br; <contato>)`,
    lido da variável `LIQUIPEDIA_CONTATO` do `.env.local` (o dono autorizou o e-mail dele; o valor fica só na VPS, fora do repositório);
    sem ela, a busca na Liquipedia não roda;
  - aceitar gzip; guardar o resultado o máximo possível;
  - **citar "Fonte: Liquipedia" com link**, porque o conteúdo é CC-BY-SA 3.0;
  - nunca ler as páginas HTML normais, só a API.
- Mostra os **campeonatos Tier S em andamento** (nome, datas, premiação, link) e, nesses campeonatos,
  os **próximos jogos e resultados recentes dos times brasileiros**. A lista de times é uma constante no código
  (FURIA, MIBR, paiN, Imperial, Legacy, Fluxo, RED Canids e ODDIK); para mudar, o dono pede e sai numa atualização (decisão minha).
- Atualiza a cada 10 minutos, numa tarefa do servidor (a varredura ou um relógio próprio), **nunca** a cada visita.
- Fora do ar ou sem dados: o quadro mostra "Sem campeonatos Tier S agora" e segue a vida.

### 8. Chave da Anthropic

- Fica no `/opt/magnatas/site/.env.local` da VPS como `ANTHROPIC_API_KEY`, posta **pelo dono** com um script
  que pede a chave sem mostrar na tela (no estilo do `/root/guardar-tokens.sh`), troca a linha no `.env.local` (dono `magnatas`, modo 600)
  e reinicia o site (`systemctl restart magnatas-site`). Nunca no repositório, nem na conversa, nem na saída de comandos.
- O dono preferiu manter a chave que colou na conversa em 07/11, sabendo do risco.

### 9. Como o site roda na VPS

- Um processo só: serviço systemd `magnatas-site` (`npm run start`), atrás do Caddy, com o código em `/opt/magnatas/site`.
  As atualizações são enviadas por SSH (arquivos, `npm ci`, `npm run db:migrar`, `npm run build`, reinício).
- Por ser um processo só, os limites da Liquipedia e o relógio de 10 minutos podem ficar em memória, dentro do
  `instrumentation.ts`. Se um dia houver mais de um processo, isso precisa de trava no banco.

## Fora do escopo

- Notícias da HLTV (bloqueia acesso automático e o conteúdo é deles).
- Comentários e curtidas nas notícias.
- Notificar membros de notícia nova (pode vir depois no sino).
- Campeonatos que não são Tier S e times que não são brasileiros.

## Restrições

- Next.js 16 do projeto (ler `site/AGENTS.md`), Drizzle, PostgreSQL, Vitest com PGlite; mesmo visual do site.
- Nada de chamada externa (Steam, Liquipedia, Anthropic) durante a renderização da página: a página lê só do banco/cache.
- Testes não chamam serviços externos: as buscas recebem a função de rede por parâmetro e os testes passam respostas gravadas.
- Textos em português do Brasil.

## Decisões minhas (o dono pode mudar)

- `/inicio` como nome da rota; `/salas` continua igual.
- Notícias do clube só por adm (GM não publica).
- 5 notícias do clube na tela; 4 da Steam; até 4 cartões em "Bombando agora".
- MVP do dia usa o dia de Brasília (meia-noite a meia-noite).
- Lista inicial de times brasileiros acima.

## O que fica para o construtor

- Forma exata de ler os campeonatos e jogos na Liquipedia (quais páginas/templates da API).
- Nomes de tabelas e colunas.
- Desenho fino dos quadros, seguindo o rascunho B.
