# Magnatas do CS: pendências

Lista do que ficou para depois da revisão geral de 04/11/2026. Quando um item for resolvido, pode sair daqui.

## Antes da partida com 10 amigos

- Instalar o servidor novo com `servidor/scripts/instalar_cs2.sh`, que agora agenda a atualização da lista de liberados a cada minuto.
- Provar com 10 pessoas de verdade:
  - a partida só começa com os dois times completos (`min_players_to_ready 5`);
  - o tempo de 10 minutos para entrar, preparar e jogar a rodada de faca é suficiente;
  - uma conta suspensa tenta voltar para a partida e é derrubada de novo em até 15 segundos;
  - duas partidas em fila no mesmo servidor: a segunda espera a gravação da primeira, e as duas gravações chegam;
  - o mix fechando com 10 pessoas no visual novo;
  - uma conta de fora entra no modo Cada um por si e é derrubada em até 15 segundos, e o placar zera depois de 20 minutos completos.
- Provar com os amigos nos modos da Diversão:
  - Mutação no `zm_biochemical_hotel`, onde bots não entram: todos entram como humanos, o golpe transforma outra pessoa, a força do empurrão, a cor do mutante e a partida inteira de 10 rodadas com XP;
  - Fantasma: o volume da respiração e o equilíbrio com o shift e o bhop invisíveis;
  - sair e voltar no meio da partida nos outros modos. No Equipe x Equipe, o dono saiu e voltou na VPS e continuou com os abates.
- Conferir no CS2 os comandos `demoui` e `demo_gototick`, que a tela do Olho de Águia ensina a usar.

## Servidores da aba Diversão no servidor novo

- Cada cartão é um CS2 rodando na mesma máquina. Vazio, cada um usa cerca de 1,1 GB. Ligar todos com `iniciar_diversao.sh todos`.
- `instalar_cs2.sh` só compila o plugin se o CounterStrikeSharp já estiver instalado. Se não estiver, rode `compilar_plugin.sh` depois. Ele baixa o .NET SDK na primeira vez (229 MB) e confere a assinatura.
- Liberar as portas `27016/udp` a `27021/udp` no firewall. O instalador e o aviso dele ainda falam só da `27015/udp`.
- Criar um token de servidor da Steam para cada um e guardar no `cs2.env`: `GSLT_AK_DESERT`, `GSLT_PISTOLA`, `GSLT_AWP`, `GSLT_EQUIPE`, `GSLT_MUTACAO` e `GSLT_FANTASMA`.
- Definir `DIVERSAO_HOST` no ambiente do site. Sem isso, os cartões aparecem fora do ar.
- Conferir no servidor real se os 5 minutos do Equipe x Equipe duram 5 minutos de relógio. No Linux dentro do Windows, o tempo do jogo anda cerca de 10% mais devagar que o real, e a partida dura cerca de 5 minutos e meio.

## Antes de abrir o site de verdade

- Tirar `PARTIDA_MIN_PRONTOS` do ambiente: é só de teste, e faria a partida começar com poucas pessoas.
- Tirar `XP_SOZINHO_PARA_TESTE=sim` do `.env.local` da VPS. Enquanto ele estiver lá, quem joga sozinho com bots ganha XP, e dá para acumular XP parado num servidor vazio. Avaliar com o dono se o XP ganho no teste fica ou é zerado.
- Tirar `VERIFICADOR_SIMULADOR_EM_PRODUCAO=sim` do `.env.local` da VPS e ligar o verificador de identidade de verdade. Enquanto ele estiver lá, a verificação aprova qualquer pessoa. O dono liberou só para a fase de teste com os amigos.
- Apagar as contas `ficticio_` e `teste_`, com a conta do dono já como Adm. Hoje, as contas `teste_adm` também seguram o cargo de Adm, então o site deixa o dono tirar o próprio cargo.
- Falar com o advogado sobre documentos, o nome e o logo. O logo traz o símbolo CS2 e soldados parecidos com os do jogo. Levar também as fotos de `site/public/mapas`, tiradas do jogo e da Oficina, e os mapas e áudios recriados do CrossFire.
- Definir o servidor do Discord, se houver, em `DISCORD_URL`.
- Restringir a porta TCP do RCON ao endereço do site. Fora da máquina, a senha e o token viajam em texto puro, e um único campo guarda o endereço de jogadores e de RCON.
- Rodar os testes de concorrência em um PostgreSQL de verdade, descartável. O banco de teste tem uma conexão só, então não consegue provar as travas.
- Reduzir as consultas por atualização de página: guardar o usuário atual por pedido e não somar o timer de 15 segundos ao das páginas que já atualizam.

## Melhorias adiadas

- Ciclo de deadlock possível entre punir alguém e fechar um mix. O banco desfaz um dos lados, e a pessoa vê uma página de erro.
- Sair do mix no instante em que ele fecha pode colocar a pessoa na partida.
- Encerrar um caso no instante em que chega uma denúncia nova pode fechá-la sem que ela entre na auditoria.
- `PARTIDA_MIN_PRONTOS` não tem trava para produção.
- Um Adm pode recusar uma proposta de banimento contra si mesmo.
- Botões que sempre falham: Aceitar e Recusar para quem não lidera a sala; Suspender e Propor para quem é o acusado, ou para um GM diante de um Adm.
- Configuração errada passa em silêncio: `.env.example` incompleto, `SITE_URL` vazio e senha vazia.
- A fila do mix nunca expira, então quem saiu há horas pode ser puxado para uma partida.
- A trava do `dev-preencher` não vale ao rodar com `npx tsx` em produção.
- Dois envios paralelos da mesma gravação podem sobrescrever o arquivo.
- A lista "Online agora" para em 30 pessoas e conta errado com muita gente.
- O teste de classes não cobre `className` dinâmico nem a prop `classe`.
- A mensagem de expulsão mostra o motivo com aspas sobrando.

## Decisões a rever quando houver GMs

- Um GM acusado consegue ver quem o denunciou e baixar a gravação. Só encerrar o caso é proibido.
- Um Adm pode suspender ou rebaixar outro Adm e depois confirmar um banimento sozinho.
