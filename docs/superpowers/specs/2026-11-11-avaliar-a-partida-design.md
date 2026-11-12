# Avaliar a partida: resultado, ida automática e a partida da Diversão

Combinado com o dono em 11/11/2026, na conversa.

## Por quê

Elogiar e denunciar só funcionam na página da partida do mix/competitivo, e ninguém é levado até lá: a pessoa sai do
jogo e esquece. Na Diversão nem existe página da partida. O dono quer que, ao terminar, o jogador caia na página da
partida, veja quanto ganhou e avalie quem jogou com ele.

## Metas

1. **Cartão "Seu resultado"** no topo da página da partida encerrada, para quem jogou: XP ganho, Grana ganha, K/D
   (abates/mortes), vitória/derrota/empate e as insígnias que saíram nela.
2. **Mix e competitivo:** quando a partida em que a pessoa está termina, a aba do site aberta vai sozinha para a página
   dela, na parte "Avalie os jogadores".
3. **Página da partida da Diversão:** modo, mapa, data, os membros que jogaram (abates, mortes, resultado), o cartão
   "Seu resultado", elogiar e denunciar como no mix.
4. **Diversão, várias seguidas:** enquanto a pessoa continua no servidor, nada muda de tela. Quando ela sai do
   servidor, a aba do site vai para a última partida, que mostra no topo "Suas partidas de agora" (as que ela jogou
   desde que entrou, até as 10 últimas das 12 horas anteriores), cada uma com mapa, XP, Grana, K/D e resultado, e um link
   para avaliar.
5. **Sino:** "Avalie a partida #12" (mix) ou "Avalie suas 3 partidas da Mutação" (Diversão), até a pessoa abrir.

## Fora do escopo

- Puxar para a página quem sai no meio de uma partida que continua (o dono concordou: só no fim).
- Gravação (demo) da Diversão.

## Não pode acontecer

- Tirar alguém da tela no meio de um pagamento ou formulário: a ida automática só acontece numa aba que está em
  página de navegação comum, e uma vez por partida.
- Elogiar/denunciar quem não jogou aquela partida, ou elogiar/denunciar duas vezes a mesma pessoa na mesma partida.
- Mostrar bots ou quem não é membro.

## Escolhas minhas (para o dono conferir)

- A partida da Diversão é o que o servidor manda no fim (o mesmo resultado que dá o XP). A página dela fica em
  `/partidas/diversao/<porta>-<partida>`.
- Elogio e denúncia da Diversão ficam guardados com a referência da partida da Diversão, e aparecem para a equipe no
  Olho de Águia como as outras (sem gravação; o link leva à página da partida da Diversão).
- "Saiu do servidor" é visto pela lista de quem está em cada servidor, que o site já pergunta ao servidor. A aba
  pergunta isso a cada 15 s só enquanto há partida da Diversão sem avaliar nas últimas 12 h.
- O sino da Diversão some quando a pessoa abre a página de qualquer uma das partidas avisadas.
