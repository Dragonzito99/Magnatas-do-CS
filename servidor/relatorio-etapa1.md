# Relatório da etapa 1

Preenchido durante os testes. Só entra aqui o que foi visto na prática.

## Servidor
- Resultado do `verificar_servidor.py` em 03/11/2026: REPROVADO por pouco, com 69,96 GiB livres para um mínimo de 70. Ubuntu 24.04, x86_64, AVX, 6 núcleos, 11,7 GiB de RAM e root aprovados.
- Região: fora do Brasil, segundo o dono.
- Ping do dono: média de 162 ms (156 a 181 ms), em 6 pacotes, sem perda. Falta medir os amigos.
- A máquina não é exclusiva: roda 16 contêineres Docker com outros sistemas do dono (Pipefy, cardápio e chatbot) e um servidor de Valheim. Tem 6 GiB de RAM disponíveis.
- O cache de build do Docker ocupa 66 GB, com 62 GB que podem ser liberados.

## VAC
- Antes dos plugins, no PC com Windows: `vac_enabled=1` e `VAC secure mode is activated`.
- Depois dos plugins, no PC com Windows, sem `-insecure`: `vac_enabled=1` e `VAC secure mode is activated`. Versões: Metamod 2.0.0-git1483, CounterStrikeSharp v1.0.379 e MatchZy 0.9.2.
- Isso mostra que o servidor se declara seguro, não que o VAC pega trapaça. Falta repetir no Linux, no servidor novo.
- Com os plugins, o console mostra 68 avisos `Could not PreloadLibrary` nas DLLs do .NET. O MatchZy carregou mesmo assim. Observar se isso causa algum problema.

## Lista de membros
- Quem está na lista entra, e quem está fora é barrado: confirmado no PC em 03/11/2026. O dono entrou com a conta na lista e foi expulso ao reconectar depois de sair dela. Falta repetir com um amigo no servidor novo.

## Gravação e KD
- Gravação: FALHOU no PC com Windows. O MatchZy 0.9.2 pediu a gravação com o caminho completo, e o servidor respondeu `record G:/Irmandade/...dem: invalid path`. Testes manuais com `tv_record` pelo console remoto também não geraram arquivo. A causa não foi confirmada, e a suspeita é o caminho do Windows. Precisa ser o primeiro teste no servidor novo, em Linux, porque a análise de partidas depende disso.
- KD: funcionou em uma partida real de 2 rounds contra bots. O CSV saiu em `csgo/MatchZy_Stats/1/match_data_map0_1.csv`, com o mesmo cabeçalho dos testes, e a exportação deu 2 abates, 0 mortes, KD 2.0, 100% de tiros na cabeça e 200 de dano. Bots não aparecem no CSV.

## CS2AC
- Versão testada: pendente
- Canal de alerta: pendente
- Detecção real sem hack: pendente
- Alertas injustos: pendente

## CS2FOW
- Versão testada: pendente
- Esconde quem está atrás da parede: pendente
- Uso de CPU antes e depois: pendente
- Vale o custo: pendente

## Partida completa
- 10 jogadores até o fim: pendente
- Sair e voltar: pendente
- GM como espectador: pendente
- Opinião dos jogadores: pendente

## O que quebrou e como foi resolvido
- Nada registrado ainda

## O que muda antes da etapa 2
- Pendente
