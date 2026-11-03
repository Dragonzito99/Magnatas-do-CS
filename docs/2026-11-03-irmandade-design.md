# Irmandade (nome provisório): projeto

Data: 03/11/2026. Situação: aprovado pelo dono em 03/11/2026.

Como ler: **(você)** foi decidido pelo dono do projeto. **(minha escolha)** é decisão do Claude, que pode ser trocada. **(a testar)** ainda não foi comprovado na prática.

## 1. O que é e por quê

Uma plataforma fechada para jogar CS2, tipo uma irmandade, em que só entra quem tem convite. **(você)**

O motivo: o CS2 normal está cheio de hack e não tem modos diferentes, e a Gamers Club é cara, também tem hack e também não tem esses modos. O dono quer um lugar seguro, com modos próprios e com controle real para verificar quem está trapaceando. **(você)**

O projeto será construído em conjunto: o Claude explica cada escolha técnica e a palavra final é do dono. **(você)**

## 2. Objetivos

**Meta:** chegar a pelo menos 100 jogadores simultâneos, cerca de 10 partidas 5x5 ao mesmo tempo, em torno de seis meses depois de abrir. **(você)**

**Faz parte:**
- Entrada só por convite, com verificação de identidade por documento.
- Banimento definitivo: quem é banido não volta. **(você)**
- Salas 5x5 com desafio, mix automático e salas de diversão. **(você)**
- Equipe (GM e Adm) que acompanha partidas e analisa denúncias, com uma ficha completa de cada jogador. **(você)**

**Não faz parte agora:**
- Cobrança de qualquer tipo. Convite comprado fica para depois da resposta jurídica (seção 3). **(você)**
- Programa anti-hack instalado no PC do jogador. **(minha escolha)**
- Ranking, nível ou ELO. O competitivo começa só com estatísticas. **(minha escolha)**
- Aplicativo próprio. É um site, e o jogador entra no servidor pelo próprio CS2. **(minha escolha)**
- Menores de 18 anos. A verificação barra a entrada, e isso pode ser revisto depois com o advogado. **(você)**
- Punições para ofensas e comportamento ruim. Por enquanto, as regras tratam só de hack. **(minha escolha)**

**O que faria o projeto fracassar, mesmo funcionando:**
- Banir um inocente, já que o banimento não tem volta.
- Vazar documentos de jogadores.
- Prometer "zero hack" e ser desmentido. A promessa honesta é que trapacear aqui sai caro.
- O site parecer uma página de propaganda em vez de uma plataforma de jogo. **(você rejeitou essa versão)**

## 3. Restrições

**Contrato da Steam (atualizado em 10/09/2026).** O uso padrão é pessoal e não comercial, e oferecer matchmaking exige autorização escrita da Valve. Salas e mix podem se encaixar nisso. Essa exigência não depende de cobrança. Não encontramos regra específica sobre cobrar acesso, nem se plataformas parecidas têm autorização.

- Começa sem cobrar. **(você)**
- Enquanto isso, a plataforma é construída e testada só com amigos. **(você)**
- A abertura para pessoas de fora só é decidida depois de ouvir um advogado e tentar falar com a Valve por escrito. **(você)**
- Se a resposta for ruim ou não vier, essa é uma decisão a ser tomada de novo, com a orientação do advogado em mãos. As etapas 2 e 3 podem ser perdidas se a decisão for não abrir, e esse risco foi aceito. **(minha leitura da sua decisão)**

**Plugins proibidos.** Nada que simule itens, skins, inventário ou patente. A Valve bane o token do servidor por isso, e esse banimento não é removido pelo suporte.

**LGPD.** Dados de documento, de identidade e de rosto exigem proteção. O advogado precisa orientar antes que a etapa 2 trate documentos reais, mesmo que sejam de amigos. Até lá, o desenvolvimento usa o modo de teste do serviço de verificação. A mesma consulta responde em nome de quem a plataforma opera, pessoa física ou empresa, porque isso define quem assina com o serviço de verificação. **(minha escolha)**

**Orçamento baixo no começo. (minha suposição, o dono não fixou valor)** O teste começa no PC do dono, e a partida com os amigos roda em um servidor novo. **(você)** O servidor que o dono já tem não recebe o CS2, porque roda outros sistemas dele. **(você)** O servidor novo e os preços são decididos antes da partida com os amigos. **(minha escolha)** Cada etapa mostra o custo antes, e nada pago é contratado sem o aval do dono. Os R$ 490 da seção 5.4 cobrem só os servidores de jogo, sem contar anti-wall, armazenamento de gravações, hospedagem do site, verificação e advogado. **(minha escolha)**

**Atualizações do CS2** podem quebrar os plugins até serem corrigidos. É preciso um servidor de teste e um jeito de checar tudo depois de cada atualização.

## 4. Quem usa

| Papel | O que faz |
|---|---|
| **Jogador** | Joga, recebe 2 convites, denuncia partidas e chama a equipe durante o jogo. **(você)** |
| **GM** | Fica online, acompanha partidas, analisa denúncias e gera convites. **(você)** Propõe banimentos. **(minha escolha, aprovada)** Não pode jogar na partida que assiste. **(minha escolha, aprovada)** Pode expulsar um jogador da partida e suspendê-lo até a decisão do Adm, para um hack óbvio não seguir em jogo. **(minha escolha)** |
| **Adm** | Gera convites **(você)**, faz tudo que o GM faz, cuida da equipe e das regras e confirma banimentos. **(minha escolha, aprovada)** No começo, o dono é o único Adm. **(você)** |

## 5. Como funciona

### 5.1 Entrada
1. A pessoa recebe um código de convite. **(você)**
2. Entra no site com o código e faz login pela Steam. **(minha escolha)**
3. Faz a verificação de identidade com documento num serviço externo **(você aceitou o serviço externo)**, com selfie e prova de que é uma pessoa de verdade, para dificultar o uso do documento de um parente. **(minha escolha)** Menores de 18 anos são barrados aqui. **(você)**
4. O sistema não guarda a foto do documento. Guarda só um código protegido gerado a partir do CPF, feito com chave secreta, porque um hash simples de CPF pode ser quebrado. **(minha escolha)**
5. Esse código é comparado com o de todos os membros e banidos: um CPF, uma conta. **(minha escolha)**
6. A conta é ativada, a Steam da pessoa fica liberada nos servidores e ela recebe 2 convites.

Candidato para a verificação **(a testar)**: Didit, com 500 verificações completas grátis por mês e US$ 0,33 cada depois disso. A consulta de CPF na Receita custa US$ 0,40 e só entra se os testes mostrarem que é necessária. **(minha escolha)** Serpro e idwall não têm preço público. A Didit lista consultas pela Serpro a US$ 0,45 e pela Unico a cerca de US$ 0,20.

### 5.2 Convites
- Adm e GM geram códigos, e cada membro tem 2. **(você)**
- Cada código serve uma vez só, e fica registrado quem convidou quem. **(minha escolha)**
- Os 2 convites valem para a vida toda da conta, e o Adm pode dar mais. **(minha escolha)**
- Quem convidou não é punido se o convidado for banido. **(decidido na conversa)**

### 5.3 Site
Formato A, com menu lateral: abas Salas, Mix e Diversão, lista no meio, sua sala e amigos online à direita. **(você)** Modelo de referência: `modelo/opcoes.html`, formato A.

Visual inspirado no template GenLabs: fundo claro, botões laranja e cartões escuros. **(você)** Sem usar imagens do template, e com licença a conferir se algo dele for reaproveitado.

- **Salas:** criar ou entrar numa sala de até 5 pessoas e desafiar outra. **(você)** A outra sala precisa aceitar. **(minha escolha, aprovada)** Só sala completa pode desafiar. **(minha escolha)**
- **Mix:** todo mundo entra e, ao chegar em 10, a partida começa sozinha. **(você)** Os times são sorteados. **(minha escolha, aprovada)**
- **Diversão:** salas de fantasma, mutação e futuros modos. **(você)** Não contam em estatística competitiva. **(minha escolha)**

### 5.4 Partidas e servidores
- O site escolhe um servidor livre, envia os dados da partida e mostra o link de conexão.
- Só os 10 jogadores da partida e a equipe entram.
- A partida é gravada, e a gravação e as estatísticas voltam para o site.
- Base técnica **(a testar)**: servidor CS2 com Metamod, CounterStrikeSharp e MatchZy, que já controla jogadores, grava e envia as partidas.
- Preço de tabela **(a testar)**: R$ 49 por mês por servidor de 12 vagas (Hostzone) ou € 0,33 por hora por servidor (DatHost, com São Paulo e API). Para 10 servidores, cerca de R$ 490 por mês.

### 5.5 Anti-hack
**Camadas:**
1. **Identidade e banimento definitivo:** o principal diferencial. **(você)**
2. **Detecção no servidor (CS2AC):** sem instalar nada no PC. Só alerta o GM e nunca bane sozinho. **(minha escolha, aprovada) (a testar)** A versão gratuita não recebe mais atualizações e pode parar após um update do CS2. A atual é paga e usa a mesma chave do CS2FOW.
3. **Anti-wall no servidor (CS2FOW):** o servidor não envia a posição de quem está escondido. A versão gratuita também foi abandonada. A atual custa US$ 10 por mês para um servidor e até US$ 50 para dez, e a chave cobre os dois plugins. O teste de 7 dias exige cartão e cobra sozinho se não for cancelado. **(a testar)**
4. **Pessoas:** denúncia, GM como espectador e gravações. **(você)**

**Fluxo:**
- O jogador denuncia uma partida ou chama a equipe durante o jogo. **(você)**
- Se nenhum GM estiver online, o chamado vira denúncia. **(minha escolha)**
- O GM analisa várias partidas e as denúncias da pessoa. **(você)**
- O GM propõe o banimento e o Adm confirma. **(minha escolha, aprovada)**
- Enquanto o dono for o único Adm, ele pode propor e confirmar sozinho. Com dois ou mais Adms, quem propõe não pode ser quem confirma. **(você)**
- Em caso de hack óbvio, o GM expulsa e suspende o jogador até a decisão do Adm. A suspensão é provisória e não é banimento. **(minha escolha)**
- O banimento vale para o CPF e para a conta Steam. Quem trapaceou nunca volta. **(você)**
- A única exceção é um erro provado, que um Adm pode reverter. A reversão fica registrada com o motivo. **(você)**

**Ficha do jogador:** tudo em um lugar só, com KD e demais estatísticas, histórico de partidas, gravações, denúncias, alertas do anti-hack e quem convidou. **(você)** Estatísticas ficam visíveis para todos os membros, e denúncias e alertas, só para a equipe. **(minha escolha)**

As gravações ficam guardadas por 30 dias, e as de jogadores com denúncia aberta, até o caso ser fechado. As que sustentam um banimento continuam guardadas, para permitir a revisão de um possível erro. **(minha escolha)**

### 5.6 Modos
Fantasma: um time invisível na faca contra um time armado. Mutação: quem é pego vira mutante. As regras foram baseadas no CrossFire. **(minha suposição, o dono não contestou)** Já existem plugins de infecção e de invisibilidade que servem de ponto de partida, mas os dois modos precisarão de desenvolvimento próprio. **(a testar)**

## 6. Ordem de construção

Cada etapa recebe seu próprio plano, começando pela etapa 1. **(ordem proposta pelo Claude e seguida com o aval do dono)**

**Etapa 1: servidor de teste, sem site.**
Primeiro roda no PC do dono, em uma cópia separada do CS2, sem abrir portas no roteador. **(você)** Depois, o servidor novo passa pela conferência de acesso, sistema, processador, memória, disco e região, e recebe a partida com os amigos. **(você)**

Pronto quando:
- 10 amigos jogam uma partida inteira no servidor novo.
- Quem não está na lista não consegue entrar.
- A partida fica gravada e o KD é exportado.
- O CS2AC gera alertas.
- O CS2FOW foi avaliado.
- Está respondido se o VAC continua ativo com plugins, porque as fontes divergem.

Resultados ruins nesta etapa não param o projeto sozinhos. Se CS2AC, CS2FOW ou VAC decepcionarem, troca-se o componente ou segue-se com identidade e análise da equipe. Um programa instalado no PC só volta à mesa por decisão do dono. **(minha escolha)**

**Etapa 2: site e entrada.**
Antes de tratar documentos reais, passa pela orientação do advogado (seção 3).
Pronto quando alguém convidado consegue fazer login pela Steam, verificar a identidade e aparecer como liberado no servidor, e os papéis e convites funcionam.

**Etapa 3: salas, mix e moderação.**
Pronto quando desafios e mix criam partidas sozinhos e denúncia, chamado da equipe, ficha, suspensão e banimento funcionam. A abertura para pessoas de fora só acontece depois desta etapa e da decisão descrita na seção 3. **(você)**

**Etapa 4: fantasma e mutação.**
Pronto quando os dois modos rodam com salas próprias no site.

## 7. Tecnologia proposta (minha escolha, a confirmar no plano)

- **Site:** TypeScript com Next.js e banco PostgreSQL. A mesma linguagem serve para as telas e para o servidor do site. O Node.js precisa ser instalado no computador do dono.
- **Plugins do jogo:** C# com CounterStrikeSharp, que é o padrão atual.
- **Servidores:** Linux, com um token da Steam (GSLT) por servidor.

## 8. O que fica com quem constrói

Detalhes de tela, escolha de mapas, confirmação de presença antes da partida e o que fazer quando alguém não aparece, comunicação entre site e servidor, e a escolha final do serviço de verificação depois de testar.

## 9. Fontes

- [Contrato de assinante da Steam](https://store.steampowered.com/subscriber_agreement/)
- [Suporte da Steam sobre bans de GSLT](https://help.steampowered.com/faqs/view/07AF-502E-A104-BD4B)
- [MatchZy](https://github.com/shobhit-pathak/MatchZy/)
- [CS2AC](https://github.com/karola3vax/CS2AC/releases)
- [CS2FOW](https://github.com/karola3vax/CS2FOW/wiki)
- [CS2-GameModifiers](https://github.com/vinicius-trev/CS2-GameModifiers-Plugin)
- [Plugins de CounterStrikeSharp](https://github.com/topics/counterstrikesharp-plugin)
- [DatHost para plataformas](https://dathost.com/for-platforms)
- [Preços da Hostzone](https://hostzone.com.br/en/cs2-servers/)
- [Preços da Didit](https://didit.me/pricing)
- [Didit: CPF e rosto no Brasil](https://docs.didit.me/api-reference/database-validation/brazil/cpf-facial.md)
