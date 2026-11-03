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
- Quem está fora é barrado: pendente

## Gravação e KD
- Gravação gerada e abrindo: pendente
- KD confere com o placar: pendente

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
