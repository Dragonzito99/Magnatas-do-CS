# Magnatas do CS: visual novo, perfil e Olho de Águia

Status: rascunho para aprovação do dono.
Projeto geral: `docs/2026-11-03-magnatas-design.md`. Este documento não muda nenhuma regra de lá, só a cara do site e duas telas.

Modelos e arte aprovados ficam em `docs/superpowers/specs/2026-11-03-visual-perfil-olho-de-aguia/`:

| Arquivo | O que é |
|---|---|
| `olho-de-aguia-v2.html`, `perfil.html`, `mg.css` | Modelos aprovados pelo dono. São a referência visual; os dados são de exemplo. Caminhos `/files/...` apontam para os arquivos desta pasta |
| `referencia.png` | A imagem que o dono mandou dizendo "queria algo assim" |
| `logo.webp` | Logo do dono, 2000x667, com fundo transparente e fumaça nas bordas |
| `personagem.webp` | Personagem do dono, 1219x1290, com fundo preto |
| `personagem-recortado.webp` | O mesmo personagem, sem o fundo preto (recorte feito por mim) |

---

## 1. O que é e por quê

O dono olhou o site e achou que o fundo branco destoa. Ele quer a cara de uma irmandade de CS: escura, marcante, com a arte dele. Também quer duas coisas que hoje faltam:

- **Perfil:** cada um ver o próprio K/D em uma ficha completa, sem precisar procurar.
- **Olho de Águia:** uma aba onde Adm e GM verificam as partidas denunciadas e assistem à gravação.

O sucesso é o dono abrir o site e sentir que é a imagem que ele mandou, em todas as páginas, com tudo o que já funciona continuando a funcionar.

## 2. Objetivos

1. Site inteiro em roxo e dourado, sem nenhum fundo claro, incluindo as telas de entrada, verificação, conta suspensa e conta banida.
2. Banner com logo, frase e personagem no topo das páginas de membros.
3. Perfil com K/D em destaque e ficha completa.
4. Aba Olho de Águia no lugar da aba Casos.
5. GM consegue ir da denúncia à gravação aberta no CS2 com o mínimo de passos.

## 3. Fora do escopo

- Replay 2D e vídeo dentro do site. O dono decidiu ver pelo CS2: "acho que é até melhor".
- Números por arma, precisão de tiros e jogadas como 1 contra 3. O plugin não envia, e exigiriam ler as gravações.
- Editar perfil (foto, nome, descrição). Foto e nome vêm da Steam.
- Compra de convites. Continua adiada até falar com o advogado, então "Seja um Magnata!" não pode sugerir compra.
- Mudar regras de salas, mix, partidas, denúncias ou punições, fora os três ajustes listados no fim da seção 9.
- Os modos fantasma e mutação (Etapa 4).

## 4. O que seria um fracasso, mesmo funcionando

- **Denúncia vazando.** Um membro descobrir pelo perfil que foi denunciado, ou ver gravação, SteamID ou punição de outro. Isso já é protegido hoje e tem que continuar.
- **Botão de enfeite.** Parecer clicável e não fazer nada. A exceção é o Discord, descrita na seção 11, que fica visível como "em breve".
- **Tela bonita e ilegível.** Brilho e roxo atrapalhando a leitura de placar, tabela ou aviso.
- **Banner atrapalhando o uso.** O banner empurrar o botão principal para fora da tela no celular, ou criar rolagem para o lado.
- **Parar de funcionar.** Qualquer fluxo já testado com o dono (mix, desafio, conectar, denúncia, chamado, punições) quebrar por causa da troca visual.

## 5. Restrições

- Tudo continua local e nada é publicado sem o dono pedir.
- As mesmas regras de permissão valem nas telas novas: a checagem fica no servidor, não só em esconder o botão.
- Segredos não aparecem em tela, log nem repositório.
- O disco C: está quase cheio: Node, cache e temporários ficam em `G:\Magnatas-ferramentas`.
- O site usa Next.js 16, que tem mudanças em relação às versões conhecidas. Ler `site/node_modules/next/dist/docs/` antes de usar uma função desconhecida (`site/AGENTS.md`).

## 6. O que o dono decidiu

- **Visual:** roxo e dourado, como em `referencia.png`, com o logo e o personagem dele. Ele viu o modelo e aprovou: "Ficou bom".
- **Nome no logo:** "Magnatas do CS". Avisado de que CS pode ter relação com a marca da Valve, respondeu: "Pode colocar". O logo também traz o símbolo "CS2" e soldados parecidos com os do jogo; foi avisado e o logo ficou como ele mandou.
- **Frase do banner:** a palavra "compita" ficou estranha para ele. Hoje está "Jogue · Vença · Faça parte", que foi sugestão minha e ele ainda pode trocar.
- **Menu lateral:** mantido (Formato A).
- **Aba:** chama "Olho de Águia" e é só de Adm e GM. Mostra "o clip da partida que foi denunciado".
- **Gravação:** o GM assiste pelo CS2, não dentro do site.
- **Perfil:** ver "o próprio KD, uma ficha completa". Viu o modelo com os números novos e aprovou: "Ficou bom".
- **Rodada de faca:** continua no início de toda partida.

## 7. Visual

Referência: `mg.css` e os dois modelos. Cores:

| Nome | Valor | Uso |
|---|---|---|
| Fundo | `#07040d` | Página |
| Painel | `#120a1f` | Blocos |
| Painel 2 | `#0c0716` | Blocos dentro de blocos |
| Texto | `#f3eefc` | Texto principal |
| Apagado | `#ab9fc2` | Texto de apoio |
| Linha | `rgba(168,85,247,.28)` | Bordas |
| Linha forte | `rgba(168,85,247,.6)` | Banner e destaques |
| Roxo | `#a855f7` | Brilho e detalhes |
| Ouro | `#f5b301` | Ações, contadores e seleção |
| Sobre o ouro | `#1c1102` | Texto em cima do dourado |

Botão principal: dourado de `#ffcf33` para `#e88f00`. Botão secundário: fundo roxo bem fraco, com borda.

**Banner:** ocupa 196 px no computador, com o logo à esquerda, a frase embaixo dele e o personagem apontando no centro. No celular, o logo e o personagem ficam menores e a frase some, como em `mg.css`.

**Barra do topo, no banner:** sino e Discord (seção 11), e o nome com a foto, que abre um menu com "Meu perfil" e "Sair". O "Sair" sai do pé do menu lateral.

**Menu lateral:** "MAGNATAS" no alto, depois Salas, Mix, Diversão, Convites, Equipe e Olho de Águia. No pé, a arte "Seja um Magnata!". A página atual fica destacada em dourado.

**Números e tabelas:** números em fonte monoespaçada e texto nas cores de texto. Vitória e derrota sempre com ícone e palavra, nunca só pela cor.

**Páginas sem menu** (`/`, `/verificacao`, `/verificacao/simulador`, `/suspenso`, `/banido`): mesmas cores e logo, sem banner. Não há modelo para elas; seguem o mesmo estilo.

## 8. Perfil

É a página `/jogadores/[id]`, com a nova cara. "Meu perfil" abre a página da própria conta, e a ficha de outro membro usa a mesma tela.

**Para qualquer membro:**

- Cabeçalho com foto, nome, papel e data de entrada.
- K/D em destaque; vitórias em porcentagem, com "22 de 38 partidas"; dano por rodada; abates na cabeça em porcentagem.
- Abates, mortes, assistências e abates por partida.
- Histórico com partida, mapa, data, resultado, placar, K/D/A e dano por rodada. Cada linha abre a partida.
- Por mapa: partidas, vitórias em porcentagem e K/D, do mapa mais jogado para o menos jogado.
- Melhor partida: a de mais abates; no empate, a mais recente. Mostra abates, K/D, partida e mapa.
- Só contam partidas encerradas, como hoje. Partida cancelada não conta.
- Sem nenhuma partida, os números ficam zerados e os blocos de histórico, mapa e melhor partida mostram que ainda não há jogos.

**Só para GM e Adm:** continuam aparecendo os dados da equipe, a suspensão e o banimento, as denúncias e o link da gravação no histórico, com as mesmas regras de hoje.

**Ver na Steam:** o link revela o SteamID, que hoje só a equipe vê. Por isso aparece só no próprio perfil e para a equipe. Escolha minha.

Dados: `fichaDoJogador` em `site/src/dominio/ficha.ts` já soma quase tudo; faltam assistências, abates por partida, dano por rodada de cada partida, os números por mapa e a melhor partida. As partidas antigas já têm esses dados, então não precisa coletar nada novo nem mudar o banco.

## 9. Olho de Águia

Página nova em `/olho-de-aguia`, no lugar de `/equipe/casos`, que passa a redirecionar para ela. Exige a mesma permissão de hoje (`moderar`). O contador do menu é o de hoje (`contarCasos`).

**Chamado agora.** Cada chamado aberto aparece em uma faixa no alto, com partida, estado e quem chamou. "Assistir ao vivo" faz o que "Atender" faz hoje: registra o atendimento e abre a partida, onde está o botão de entrar como espectador. A regra de quem joga não poder fiscalizar continua valendo.

**Partidas denunciadas.** Lista à esquerda; cada item é um caso, formado por **partida + acusado**, com o número de denúncias abertas. Denúncia sem acusado, a que nasce de um chamado sem equipe online, vira um caso "Acusado a definir" daquela partida. Ordem: mais denúncias primeiro; no empate, a mais antiga. No celular, a lista fica em cima do detalhe.

**Detalhe do caso:**

- Foto, nome e link para a ficha do acusado, com partida, mapa e data.
- Números dele naquela partida: K/D, porcentagem na cabeça e dano por rodada. Também quantas denúncias ele já recebeu, em qualquer partida. Isso substitui o "Banimentos" do modelo, que seria quase sempre 0 e poderia contar como punição um erro já revertido.
- Cada denúncia, com quem denunciou e o que escreveu.
- Bloco da gravação, conforme a situação: disponível mostra "Assistir no CS2"; as outras situações que `situacaoDaGravacao` já calcula mostram um aviso no lugar do botão.
- Campo de conclusão e as ações abaixo.

**Ações:**

| Botão | O que faz | Encerra o caso? |
|---|---|---|
| Encerrar sem punição | Fecha todas as denúncias abertas do caso com a conclusão escrita | Sim |
| Suspender | `suspender`, com a conclusão como motivo | Não |
| Propor banimento | `proporBanimento`, com o nome da partida e a conclusão como motivo, para o Adm saber de onde veio | Não |

- Conclusão é obrigatória nas três ações.
- Depois de uma punição, o botão de encerrar passa a dizer "Encerrar caso". Quem analisa pode encerrar a qualquer momento, sem esperar o Adm.
- A decisão do Adm não encerra o caso sozinha, e os fluxos da ficha continuam como estão.
- Com "Acusado a definir", só existe encerrar.
- **Quem não pode encerrar:** quem denunciou ou foi acusado, como hoje em `analisarDenuncia`. O botão não aparece e o servidor também recusa.
- **Suspender e propor banimento:** seguem as regras de hoje, as mesmas da ficha. Só valem as recusas que já existem, como agir contra si mesmo. Quem denunciou continua podendo suspender, e a confirmação de banimento continua exigindo outra pessoa, com a exceção de hoje para Adm único.
- Encerrar o caso inteiro precisa ser uma ação só no servidor, em uma transação, com registro na auditoria.

**Propostas de banimento.** Continuam visíveis na aba, em um bloco próprio, como hoje. A confirmação continua na ficha do jogador, onde quem propôs não pode confirmar.

**Assistir no CS2.** Baixa a gravação pela rota que já existe (`/api/gravacoes/[id]`, que confere a permissão e registra na auditoria) e mostra na tela o comando para abrir no jogo, com botão de copiar.

Ainda não testado, e deve ser o primeiro passo da construção, no CS2 de verdade do dono:

1. Em qual pasta o arquivo precisa estar para `playdemo` funcionar, e como dizer isso de forma simples na tela.
2. Se dá para abrir direto na rodada denunciada. Hoje o site não guarda a marcação de tempo das rodadas. Se não der para pular de forma simples, a tela diz para ir à rodada pela barra de controle da gravação. O plano não deve criar coleta nova só para isso sem avisar o dono.

**Três ajustes de regra que esta aba precisa.** Sem eles, a aba mostraria botão sem efeito ou perderia prova:

1. **Gravação protegida durante a punição.** Hoje a gravação só passa dos 30 dias se houver denúncia aberta ou jogador banido (`gravacaoProtegida`, em `varredura.ts`). Passa a valer também quando o acusado da partida está suspenso ou tem proposta de banimento aberta. Assim, encerrar o caso não apaga a prova enquanto o Adm decide.
2. **Chamado sem resposta não some.** Quando a partida acaba com um chamado ainda aberto, a varredura transforma esse chamado em uma denúncia "Acusado a definir", como já acontece quando não há equipe online. A faixa "Chamado agora" só mostra chamados de partida em andamento, para "Assistir ao vivo" sempre funcionar.
3. **"Acusado a definir" e quem jogou.** Como o culpado pode ser qualquer um da partida, quem jogou nela não pode encerrar esse caso. É a mesma ideia de hoje em `atenderChamado`.

**Limite conhecido, sem mudança:** enquanto o dono for o único da equipe, uma denúncia feita por ele, contra ele ou de uma partida "a definir" que ele jogou fica aberta até existir um GM. Ele ainda pode suspender e banir; só o encerramento espera. O custo é um item a mais na lista e a gravação guardada por mais tempo.

## 10. Escolhas minhas, para o dono conferir

- Olho de Águia substitui a aba Casos, em vez de existir ao lado dela.
- "Ver na Steam" só no próprio perfil e para a equipe.
- "MAGNATAS", no alto do menu, leva à página inicial de quem já entrou (hoje `/salas`) e não fica marcado como página atual.
- "Seja um Magnata!" leva a `/convites`.
- Suspender e propor banimento não encerram o caso sozinhos, e quem analisa pode encerrar sem esperar o Adm.
- Quem denunciou pode suspender e propor banimento, mas não pode encerrar o caso.
- O número "Banimentos" do modelo vira "Denúncias contra ele".
- Os três ajustes de regra no fim da seção 9.
- Banner em todas as páginas de membros, com o tamanho do modelo.
- Título das abas do navegador: "Magnatas do CS".

## 11. Sino e Discord

**Sino.** O dono disse: "seria notificações". Abre uma lista do que está esperando a pessoa agora, com um contador. Cada item leva à página certa e some sozinho quando o assunto é resolvido.

- **Para qualquer membro:** desafio recebido pela sala que a pessoa lidera, e partida dela pronta para entrar.
- **Só para GM e Adm:** chamados, denúncias e propostas de banimento abertos. O total usa `contarCasos`, igual ao da aba.
- **Nunca avisar alguém de que foi denunciado.**
- Vem de dados que já existem e se atualiza junto com a página, como `atualizar.tsx`.
- Não guarda histórico nem "lido/não lido". Escolha minha, para não criar tabela nova agora. Avisos como "sua denúncia foi analisada" dependeriam disso e ficam para depois.

**Discord.** Ainda não existe servidor. O dono pediu para deixar o botão, então ele fica visível. Sem endereço configurado, aparece desativado, com a indicação "Discord em breve" (escolha minha). Com o endereço configurado, abre o servidor. Essa é a única exceção à regra de não ter botão sem efeito, por decisão do dono.

## 12. O que fica com quem constrói

- Como organizar o CSS, desde que as cores fiquem em variáveis, como hoje em `site/src/estilos/global.css`.
- Como aplicar a arte em `site/public/`, incluindo diminuir o logo para não pesar a página. O tamanho exibido é bem menor que o original.
- Ícones, desde que no estilo dos modelos, e o ícone da aba do navegador.
- Como guardar qual caso está aberto, desde que o endereço permita recarregar a página sem perder o caso.
- Nomes internos no código. Na tela, o nome é sempre "Olho de Águia".
- O comportamento de `/equipe`, que continua existindo com a mesma regra de hoje.

## 13. Como saber que ficou pronto

- Testes automáticos para os números novos da ficha, para a montagem dos casos, para o encerramento do caso inteiro e para as permissões. A suíte atual continua passando.
- Testes confirmando que um membro comum não recebe dados de equipe no perfil, não acessa a aba e não vê no sino nada sobre denúncias.
- Conferência no navegador de todas as páginas, em computador e celular: sem fundo claro, sem rolagem para o lado e com o texto legível.
- Contraste do texto calculado para as cores da seção 7, atingindo o nível AA (4,5:1 no texto comum).
- Os fluxos já testados continuam funcionando: entrar, salas, desafio, mix, conectar, denúncia, chamado, suspensão, banimento e reversão.
- O dono abre e confirma que é o que ele queria. A gravação abrindo no CS2 dele faz parte dessa conferência.

## 14. Relação com a Etapa 3

A revisão geral da Etapa 3 ainda não foi feita: o dono escolheu deixar para depois. Este projeto é construído em cima daquele código sem revisão. Sugiro uma revisão só, no fim deste projeto, cobrindo as duas partes, antes de qualquer uso real.
