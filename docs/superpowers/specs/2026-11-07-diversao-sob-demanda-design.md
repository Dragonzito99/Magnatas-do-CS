# Diversão sob demanda: o servidor liga quando alguém quer jogar

## Por que

A VPS tem 8 GB e cada servidor de CS2 usa cerca de 1,2 GB. Com o servidor de partidas sempre ligado, só cabem
uns 3 servidores da Diversão ao mesmo tempo, e o site tem 6 modos. O dono quer que o servidor de um modo só fique
ligado quando alguém for jogar.

## Como funciona para o jogador

- Na página **Diversão**, um modo desligado mostra o botão **"Ligar e entrar"** em vez de "Fora do ar".
- Ao clicar, o site manda ligar aquele servidor. O cartão passa a mostrar **"Ligando... cerca de 1 minuto"**
  para todo mundo, com o tempo correndo.
- Quem clicou fica na página. Quando o servidor responde, o site **abre o jogo sozinho** (o mesmo link `steam://connect`
  do botão "Entrar") e o cartão volta ao normal, com "Entrar" e o número de pessoas.
- Se outra pessoa clicar enquanto liga, ela só entra na mesma espera.
- Se o servidor não responder em 3 minutos, o cartão mostra "Não consegui ligar agora. Tente de novo em instantes."
  e o site desliga o que sobrou.

## Desligar sozinho

- Um servidor da Diversão sem ninguém por **5 minutos** seguidos é desligado pelo site (decisão do dono).
- A contagem usa a mesma pergunta que o site já faz ao servidor (`magnatas_jogadores`) na varredura.
- O servidor de **partidas** (Mix e Salas) não entra nisso: continua sempre ligado.

## Limite de memória

- No máximo **3 servidores da Diversão ligados ao mesmo tempo** (valor configurável no `.env.local`).
- Se o limite estiver cheio e alguém pedir outro modo: o site desliga o servidor da Diversão **vazio** há mais tempo
  e liga o pedido. Se todos os ligados tiverem gente, o cartão mostra
  "Todos os servidores estão cheios de gente agora. Tente de novo em alguns minutos."

## Como o site liga e desliga (decisões técnicas minhas)

- O site roda como o usuário `magnatas`; os servidores, como `cs2`, em sessões tmux.
- Dois scripts pequenos em `/home/cs2/bin`, versionados em `servidor/scripts/`:
  `ligar_diversao.sh <modo>` (chama o `iniciar_diversao.sh` de hoje) e `desligar_diversao.sh <modo>` (fecha a sessão tmux).
  Os dois só aceitam nomes que existem em `/home/cs2/bin/diversao/*.conf`.
- Uma regra de `sudoers` deixa o usuário `magnatas` rodar **só esses dois scripts** como `cs2`, sem senha.
- O estado de cada servidor (desligado, ligando, ligado, desde quando vazio) fica no banco, numa tabela nova,
  para o site e a varredura saberem o que está acontecendo mesmo depois de reiniciar.
- O cadastro de servidores da Diversão ganha um campo **"sob demanda"** (ligado por padrão em todos).
  Desligar o campo deixa um modo sempre ligado, se um dia o dono quiser.

## Fora do escopo

- Servidor de partidas sob demanda.
- Fila de espera quando todos estão cheios.
- Avisar no Discord que um modo ligou.

## Restrições

- Mesmo site (Next.js 16, Drizzle, Vitest com PGlite) e os mesmos scripts de servidor (bash, testes pytest em `servidor/tests`).
- O site nunca roda comando com texto vindo do usuário: o modo é conferido contra a lista do banco antes de chamar o script.
- Nada de esperar 1 minuto dentro de um pedido da página: ligar é disparado e a página acompanha pelo estado no banco.
