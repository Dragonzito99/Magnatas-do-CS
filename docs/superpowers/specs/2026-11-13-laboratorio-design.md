# Laboratório — projeto

## Por quê

Para testar um personagem ou um mutante, hoje o Adm liga a Mutação, espera o sorteio e pede pelo chat que alguém
mande comandos no console do servidor (ex.: subir a HEALIX para o nível 3). O dono quer testar sozinho, na hora
(13/11/2026: "um mapa para testes de skins e mecânica", "os personagens", "e mutantes tbm").

## O que é

Dois servidores novos da Diversão, ligados só pela aba **Testes** do site e só para o Adm:

- **Laboratório de personagens** (`laboratorio-personagens`, porta 27022): os personagens próprios do pacote.
- **Laboratório de mutantes** (`laboratorio-mutantes`, porta 27023): os mutantes da Mutação e os poderes deles.

Ficam separados porque personagens próprios e mutantes juntos já derrubaram o jogo do Adm na Mutação
(10/11/2026). Juntar fica para depois que o diário das entidades mostrar a causa.

## Objetivos

1. O Adm escolhe o que testar com comandos no chat, sem console do servidor e sem ninguém ajudar.
2. Os dois rodam na Dust 2 (os bots precisam do caminho do mapa), com sv_cheats 1 para `thirdperson`, `noclip` e os
   bots parados.
3. Nada vale XP, nada vai ao perfil, nada aparece na tela Jogar.
4. Só contas Adm ficam: quem não é Adm é tirado ao entrar.
5. Cada laboratório se desliga sozinho depois de 10 minutos sem ninguém.

## Não-objetivos

- Mapa novo. Usa a Dust 2.
- Personagem e mutante no mesmo servidor.
- Skins de arma.
- Trocar o que a conta tem na loja ou no site.

## Comandos no chat

Todos começam com `!`. `!ajuda` lista os do laboratório em que se está.

**Personagens** (plugin MagnatasVisual):

| Comando | Faz |
|---|---|
| `!vestir` | Lista os personagens que dá para vestir. |
| `!vestir <nome>` | Veste o personagem (renasce já com ele). Nome = pasta, ex.: `adm`, `marfioso`, `heroi`. |
| `!tirar` | Volta ao boneco normal. |
| `!bot <nome>` | Chama um bot vestido com o personagem. |
| `!botgesto <danca\|flexao\|mortal>` | Os bots vestidos fazem o gesto. |
| `!danca`, `!flexao`, `!mortal` | O gesto em você, com o personagem vestido no laboratório. |
| `!parar` | Bots parados / andando. Começam parados. |
| `!limpar` | Tira os bots. |

**Mutantes** (plugin MagnatasDiversao, Mutação em modo laboratório):

| Comando | Faz |
|---|---|
| `!mutante <comum\|blindado\|fumaca\|healix> [1-3]` | Vira esse mutante no nível dado (1 se faltar). |
| `!humano` | Volta a humano. |
| `!recarga` | Zera a espera do E (corrida, escudo, fumaça, cura) e o pulo duplo. |
| `!bot humano` | Chama um bot humano, com arma. |
| `!bot <tipo> [nível]` | Chama um bot mutante desse tipo e nível. |
| `!parar` | Bots parados / andando. Começam parados. |
| `!limpar` | Tira os bots. |

Terceira pessoa: `thirdperson` e `firstperson` no console do jogo (vale porque o laboratório tem sv_cheats 1). O
`!ajuda` lembra isso.

## Regras que valem dentro

- **Personagens:** mata-mata da Diversão (renasce sozinho), dinheiro 16000, compra em qualquer lugar e a qualquer
  hora, munição infinita, sem fim de partida. Os bots não atiram.
- **Mutantes:** a rodada da Mutação fica sempre em andamento, sem sorteio, sem relógio, sem fim, sem super Negev
  sorteada e sem resultado ao site. O golpe do mutante continua transformando e subindo de nível. Mutante que morre
  renasce no mesmo tipo e nível. Os bots não atiram enquanto parados.
- **Trocar de boneco com o jogador vivo derrubou jogos** (Mutação, 10/11/2026). Por isso `!vestir`, `!tirar`,
  `!mutante` e `!humano` nunca trocam o modelo de quem está vivo e já tem boneco nosso: a pessoa volta a humano
  normal e renasce, e o boneco novo entra no nascimento (como já faz a Mutação) ou pela transformação de humano em
  mutante (o caminho normal da infecção).
- **Versão nova antes de liberar:** a lista fechada de personagens do MagnatasVisual ganha a marca "só no
  laboratório". Um personagem novo entra com a marca: veste no laboratório, mas em nenhum outro servidor, nem para a
  conta que já tiver o campo boneco apontando para ele. Aprovado, a marca sai e o Adm põe o personagem na conta.
  O herói da super Negev (`heroi_v1`) entra assim, para ser visto de perto.

## Peças

- `servidor/config/diversao/laboratorio-personagens.conf/.cfg` e `laboratorio-mutantes.conf/.cfg`. O `.cfg` de cada
  um vem depois da base (`cada_um_por_si.cfg` e `mutacao_base.cfg`) e só sobrescreve o que muda.
- `iniciar_diversao.sh`: passa `LABORATORIO` ao plugin (campo `Laboratorio` na config) e deixa o `.conf` escolher a
  variável do token (`TOKEN=LABORATORIO` → `GSLT_LABORATORIO`), para os dois usarem o mesmo token.
- MagnatasDiversao: regra nova `laboratorio` (inerte: sem XP, sem ciclo), modo laboratório da Mutação, comandos dos
  mutantes, desligar sozinho.
- MagnatasVisual: reconhece os laboratórios pela pasta (como já reconhece a Mutação), tira quem não é Adm, comandos
  dos personagens, marca "só no laboratório". O laboratório de mutantes conta como Mutação (sem o pacote dos
  personagens).
- Site: aba Testes ganha o bloco **Laboratório** com as duas linhas (Ligar / Ligando / Entrar). Liga pelo mesmo
  `ligar_diversao.sh` dos outros, com permissão nova `usar_laboratorio` (só Adm). Não entra na tabela de servidores
  da Diversão, então não aparece em Jogar, Bombando, Painel nem conta XP.
- VPS: liberar as portas 27022 e 27023 (UDP) no firewall, junto no instalador.

## O que depende do dono

- **Um token de servidor da Steam (GSLT)** para o laboratório. Sem token o servidor só aceita rede local. O dono cria
  em steamcommunity.com/dev/managegameservers (app 730) e guarda na VPS com um script que pede o token sem mostrar.
- O OK para instalar na VPS (plugins, configs, firewall) e publicar o site.

## Decisões minhas (o dono pode mudar)

- Dust 2 nos dois.
- Portas 27022 e 27023.
- Só Adm, como o resto da aba Testes.
- 10 minutos vazio para desligar.
- Bots começam parados e sem atirar.
- Nomes dos comandos acima.
