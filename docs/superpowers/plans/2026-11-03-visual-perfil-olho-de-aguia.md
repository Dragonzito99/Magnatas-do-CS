# Visual novo, perfil e Olho de Águia: plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deixar o site inteiro em roxo e dourado com a arte do dono, criar o perfil completo, a aba Olho de Águia e o sino de notificações.

**Architecture:** As regras novas ficam em `site/src/dominio/`, com o banco como parâmetro e testes em PGlite, como no resto do projeto. O visual continua em um único `global.css`, com as cores em variáveis. Telas são componentes de servidor, e só o que precisa de navegador vira componente de cliente.

**Tech Stack:** Next.js 16, React 19, TypeScript, Drizzle, PostgreSQL 16, Vitest com PGlite. Nenhuma dependência nova e nenhuma migração de banco.

**Spec:** `docs/superpowers/specs/2026-11-03-visual-perfil-olho-de-aguia-design.md`. Modelos e arte em `docs/superpowers/specs/2026-11-03-visual-perfil-olho-de-aguia/`.

## Global Constraints

- Nenhum fundo claro em nenhuma página.
- Cores, em variáveis de `global.css`: fundo `#07040d`, painel `#120a1f`, painel 2 `#0c0716`, texto `#f3eefc`, apagado `#ab9fc2`, linha `rgba(168,85,247,.28)`, linha forte `rgba(168,85,247,.6)`, roxo `#a855f7`, ouro `#f5b301`, sobre o ouro `#1c1102`. Botão principal: dourado de `#ffcf33` para `#e88f00`.
- Texto comum com contraste de pelo menos 4,5:1.
- Frase do banner: `JOGUE · VENÇA · FAÇA PARTE`. Título das abas do navegador: `Magnatas do CS`.
- Na tela, o nome é sempre "Olho de Águia". A palavra "Casos" não aparece mais para o usuário.
- Só contam partidas encerradas na ficha, nos números por mapa e na melhor partida.
- Denúncias, punições, SteamID e gravações continuam só para a equipe. "Ver na Steam" é exceção apenas para a própria pessoa.
- Nunca avisar alguém de que foi denunciado.
- Compra de convites continua fora: "Seja um Magnata!" só leva a `/convites`.
- Vitória e derrota sempre com ícone e palavra, nunca só pela cor.
- Toda ação da equipe vai para `auditoria`.
- Segredos não aparecem em tela, log, repositório ou chat.
- Node, cache e temporários ficam em `G:\Magnatas-ferramentas`. Ler `site/node_modules/next/dist/docs/` antes de usar função desconhecida do Next.
- Para rodar o site, o Linux precisa estar ligado, porque o banco fica nele: `wsl.exe -d Ubuntu-24.04 -u root -- sleep 7200` em segundo plano. O `instrumentation.ts` só muda ao reiniciar `next dev`.
- Testes de tela usam contas fictícias (`scripts/dev-sessao.ts`, `scripts/dev-preencher.ts`). No fim de cada teste, tirar o cookie fictício do navegador embutido.

## Review Focus

- **Jogador comum tentando entrar na aba ou chamando a ação direto:** deve ser recusado no servidor, não só ter o botão escondido. Testes em `destino.test.ts` (Task 6) e `olho-de-aguia.test.ts` (Task 5).
- **Dois membros da equipe encerrando o mesmo caso, ou o caso mudando enquanto a tela está aberta:** o segundo recebe aviso de que o caso já foi encerrado, sem erro feio. Teste em `olho-de-aguia.test.ts` (Task 5).
- **Apelido longo ou com símbolos, como `Aposentado| DraGonZit0`:** não pode quebrar menu, tabela nem criar rolagem para o lado. Conferência em 375 px nas Tasks 3, 4 e 6.
- **Perfil de quem nunca jogou:** números zerados e blocos vazios com aviso, sem divisão por zero. Teste em `ficha.test.ts` (Task 4).
- **Gravação ainda chegando, ausente ou apagada:** o caso mostra um aviso no lugar de "Assistir no CS2". Teste em `olho-de-aguia.test.ts` (Task 5).

## Estrutura de arquivos

```
site/public/marca/logo.webp, personagem.webp      arte usada no site
site/src/estilos/global.css                       cores e estilos
site/src/estilos/contraste.test.ts                contraste e proibição de fundo claro
site/src/app/layout.tsx                           título das abas
site/src/app/logo-grande.tsx                      logo das telas sem menu
site/src/app/(membros)/layout.tsx                 banner, menu e conteúdo
site/src/app/(membros)/banner.tsx                 banner com logo, frase, personagem e barra
site/src/app/(membros)/menu-suspenso.tsx          abre e fecha o menu da conta e o sino
site/src/app/(membros)/sino.tsx                   lista de notificações
site/src/app/(membros)/menu.tsx                   itens do menu lateral
site/src/app/(membros)/jogadores/[id]/page.tsx    perfil
site/src/app/(membros)/olho-de-aguia/             página, ações e botão de assistir
site/src/app/(membros)/equipe/casos/page.tsx      vira só um redirecionamento
site/src/dominio/discord.ts                       valida o endereço do Discord
site/src/dominio/ficha.ts                         números novos do perfil
site/src/dominio/olho-de-aguia.ts                 casos, encerramento e chamados
site/src/dominio/denuncias.ts                     chamado sem resposta e contagem
site/src/dominio/varredura.ts                     gravação protegida e nova etapa
site/src/dominio/notificacoes.ts                  o que aparece no sino
site/src/auth/destino.ts                          aba só para a equipe
```

---

### Task 1: Abrir a gravação no CS2 (dono)

**Files:** nenhum arquivo do site. O resultado vai para o ledger, porque a Task 6 depende dele.

**Interfaces:**
- Produces: a linha `Task 1: Ruling:` com a pasta exigida, o comando exato e se dá para pular para a rodada.

- [ ] **Step 1: Copiar a gravação real da partida 7 para a pasta do CS2 do dono**

Origem: `G:\Magnatas-ferramentas\gravacoes\7.dem`. Destino: `game\csgo\` da instalação do dono, localizada com ele.
Expected: arquivo copiado. Nada no servidor muda.

- [ ] **Step 2: Dono digita `playdemo 7` no console do CS2**

Expected: a partida abre. Anotar se precisou da pasta `csgo`, testando também `playdemo` com o arquivo em Downloads.

- [ ] **Step 3: Dono testa `demoui` e `demo_gototick 5000`**

Expected: a barra de controle abre e o pulo funciona. O site não guarda a marcação de tempo das rodadas, então pular para a rodada denunciada só entra se for simples; caso contrário, a tela orienta a usar a barra. Não criar coleta nova sem avisar o dono.

- [ ] **Step 4: Registrar no ledger**

Registrar como `Task 1: Ruling:` o texto exato que a tela vai mostrar. Se `playdemo 7` confundir o jogo, o nome baixado muda para `magnatas_<numero>.dem` em `respostaDoDownload` (`gravacoes.ts`), com o teste ajustado na Task 6.

---

### Task 2: Cores, arte e telas sem menu

**Files:**
- Create: `site/src/estilos/contraste.test.ts`, `site/src/app/logo-grande.tsx`, `site/public/marca/logo.webp`, `site/public/marca/personagem.webp`
- Modify: `site/src/estilos/global.css`, `site/src/app/layout.tsx`, `site/src/app/page.tsx`, as páginas com a classe `laranja`
- Test: `site/src/estilos/contraste.test.ts`

**Interfaces:**
- Produces: variáveis CSS `--pagina`, `--painel`, `--painel-2`, `--tinta`, `--tinta-2`, `--tinta-3`, `--linha`, `--linha-forte`, `--roxo`, `--ouro`, `--sobre-ouro`, e a classe `.botao.ouro`, que substitui `.botao.laranja`. `LogoGrande()` em `logo-grande.tsx`.

- [ ] **Step 1: Escrever os testes que falham**

O teste lê `global.css` e extrai as variáveis de `:root`.

```ts
test.each([['--tinta'], ['--tinta-2'], ['--tinta-3']])('%s tem contraste de 4,5:1 em página, painel e painel 2', (variavel) => {
  for (const fundo of ['--pagina', '--painel', '--painel-2']) expect(contraste(cor(variavel), cor(fundo))).toBeGreaterThanOrEqual(4.5);
});
test('o texto sobre o ouro tem contraste nas duas pontas do botão', () => {
  for (const fundo of ['#ffcf33', '#e88f00']) expect(contraste(cor('--sobre-ouro'), fundo)).toBeGreaterThanOrEqual(4.5);
});
test('nenhum fundo claro sobrou', () => {
  expect(css).not.toMatch(/background(-color)?:\s*(#fff\b|#ffffff|white|#fff7ed)/i);
  expect(css).not.toMatch(/background(-color)?:\s*rgba\(255,\s*255,\s*255,\s*0?\.[3-9]/i);
});
```

`contraste` segue a fórmula WCAG de luminância relativa. `cor` lê o valor hexadecimal da variável.

- [ ] **Step 2: Rodar e ver falhar**

Run: `npm test -- src/estilos/contraste`
Expected: FAIL, porque as cores atuais são claras.

- [ ] **Step 3: Trocar as cores e colocar a arte**

- Mapear as variáveis atuais para a tabela das Global Constraints: `--verde` vira `#4ade80`. `--brilho` usa roxo e ouro, como `.mg-banner` em `mg.css`.
- Trocar todas as cores fixas de `global.css` por variáveis, seguindo o estilo de `mg.css`. Isso inclui `.aviso`, `.lateral`, `.item-menu`, inputs e o cartão escuro.
- Renomear `.laranja` para `.ouro` em CSS e páginas.
- `metadata.title` passa a ser `Magnatas do CS`.
- Copiar `personagem-recortado.webp` para `public/marca/personagem.webp`. Gerar `public/marca/logo.webp` com 1000 px de largura, usando `sharp` por um script temporário em `G:\Magnatas-ferramentas\tmp`.
- `LogoGrande` usa `next/image` e substitui o texto "MAGNATAS" em `/`, `/verificacao`, `/verificacao/simulador`, `/suspenso` e `/banido`.

- [ ] **Step 4: Rodar e ver passar**

Run: `npm test`
Expected: PASS em toda a suíte.

- [ ] **Step 5: Conferir no navegador**

Abrir as cinco telas sem menu em 1366 px e 375 px.
Expected: fundo escuro, logo sem retângulo em volta, texto legível, sem rolagem para o lado.

- [ ] **Step 6: Commit**

```bash
git add site/
git commit -m "feat: cores roxo e dourado e arte da marca"
```

---

### Task 3: Banner, menu lateral e barra do topo

**Files:**
- Create: `site/src/app/(membros)/banner.tsx`, `site/src/app/(membros)/menu-suspenso.tsx`, `site/src/dominio/discord.ts`
- Modify: `site/src/app/(membros)/layout.tsx`, `site/src/app/(membros)/menu.tsx`, `site/src/estilos/global.css`
- Test: `site/src/dominio/discord.test.ts`

**Interfaces:**
- Produces: `enderecoDoDiscord(valor: string | undefined): string | null`. `Banner({ usuario, discord, sino }: { usuario: UsuarioPublico; discord: string | null; sino?: React.ReactNode })`. `MenuSuspenso({ rotulo, titulo, children })`, de cliente, que abre e fecha, e fecha ao trocar de página, ao clicar fora e com Esc.

- [ ] **Step 1: Escrever os testes que falham**

```ts
test('sem endereço não há link', () => {
  expect(enderecoDoDiscord(undefined)).toBeNull();
  expect(enderecoDoDiscord('  ')).toBeNull();
});
test('só aceita endereço https', () => {
  expect(enderecoDoDiscord('https://discord.gg/abc')).toBe('https://discord.gg/abc');
  expect(enderecoDoDiscord('http://discord.gg/abc')).toBeNull();
  expect(enderecoDoDiscord('javascript:alert(1)')).toBeNull();
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npm test -- src/dominio/discord`
Expected: FAIL por módulo inexistente.

- [ ] **Step 3: Implementar a estrutura**

Referência: `.mg-banner`, `.mg-barra`, `.mg-menu` e `.mg-seja` em `mg.css`, e o HTML de `olho-de-aguia-v2.html`.

- `layout.tsx` monta banner em cima, e menu e conteúdo abaixo. O `Sair` sai do pé do menu.
- Menu da conta: `Meu perfil` (`/jogadores/${usuario.id}`) e `Sair` (POST em `/api/auth/sair`).
- Discord com endereço abre em nova aba. Sem endereço, é um `<span aria-disabled="true">` sem aparência de clicável, com o texto "Discord em breve" no `title` e no leitor de tela. O endereço vem de `DISCORD_URL`.
- "MAGNATAS" é um link para `/salas`, sem `aria-current`.
- "Seja um Magnata!" é um link para `/convites`, com a coroa em SVG e o texto em CSS.
- O item "Casos" continua até a Task 6.
- Em até 860 px, logo e personagem diminuem, a frase e o "Seja um Magnata!" somem, e o menu continua usável como hoje.

- [ ] **Step 4: Rodar e ver passar**

Run: `npm test -- src/dominio/discord`
Expected: PASS.

- [ ] **Step 5: Conferir no navegador**

Abrir Salas, Mix e uma partida em 1366 px e 375 px, com o apelido `Aposentado| DraGonZit0`.
Expected: banner como no modelo, nome cortado com reticências, menu da conta abre e fecha com Esc, sair funciona, botão principal visível sem rolar no celular, sem rolagem para o lado.

- [ ] **Step 6: Commit**

```bash
git add site/
git commit -m "feat: banner, menu lateral e barra do topo"
```

---

### Task 4: Perfil completo

**Files:**
- Modify: `site/src/dominio/ficha.ts`, `site/src/app/(membros)/jogadores/[id]/page.tsx`, `site/src/estilos/global.css`
- Test: `site/src/dominio/ficha.test.ts`

**Interfaces:**
- Produces, em `fichaDoJogador`, além do que já devolve:
  - `estatisticas.assistencias: number`, `estatisticas.vitoriasPct: number` (inteiro), `estatisticas.abatesPorPartida: number` (uma casa)
  - `historico[].adr: number` (uma casa)
  - `porMapa: { mapa: string; partidas: number; vitoriasPct: number; kd: number }[]`, do mais jogado para o menos jogado e, no empate, pelo nome
  - `melhorPartida: { id: string; numero: number; tipo: Partida['tipo']; mapa: string; kills: number; kd: number } | null`
  - `steamid64?: string`, só quando o leitor é a própria pessoa ou a equipe

- [ ] **Step 1: Escrever os testes que falham**

O ajudante `jogada` passa a aceitar `assists` opcional. O teste `ficha soma as partidas competitivas` ganha `assistencias`, `vitoriasPct: 50` e `abatesPorPartida: 15`. Testes novos:

```ts
test('por mapa ordena do mais jogado para o menos jogado', async () => {
  await jogada(jogador, numeros(20, 10), { mapa: 'de_mirage', vencedor: 1 });
  await jogada(jogador, numeros(10, 10), { mapa: 'de_mirage', vencedor: 2 });
  await jogada(jogador, numeros(5, 5), { mapa: 'de_inferno', vencedor: 1 });
  expect((await fichaDoJogador(bd, outro, jogador.id))?.porMapa).toEqual([
    { mapa: 'de_mirage', partidas: 2, vitoriasPct: 50, kd: 1.5 },
    { mapa: 'de_inferno', partidas: 1, vitoriasPct: 100, kd: 1 },
  ]);
});
test('melhor partida é a de mais abates e, no empate, a mais recente');
test('o histórico traz o dano por rodada de cada partida');
test('quem nunca jogou tem por mapa vazio, sem melhor partida e números zerados');
test('quem tem 0 mortes em um mapa tem KD igual aos abates');
test('SteamID vai para a própria pessoa e para a equipe, nunca para outro membro', async () => {
  expect(await fichaDoJogador(bd, outro, jogador.id)).not.toHaveProperty('steamid64');
  expect((await fichaDoJogador(bd, jogador, jogador.id))?.steamid64).toBe(jogador.steamid64);
});
```

`numeros(kills, deaths)` é um ajudante do teste, com os demais campos zerados ou fixos.

- [ ] **Step 2: Rodar e ver falhar**

Run: `npm test -- src/dominio/ficha`
Expected: FAIL nos campos novos.

- [ ] **Step 3: Implementar os números**

Calcular a partir de `linhas`, que já vem da mais nova para a mais antiga, então o primeiro máximo é o mais recente. `partidaJogadores.assists` entra na soma.

- [ ] **Step 4: Rodar e ver passar**

Run: `npm test -- src/dominio/ficha`
Expected: PASS.

- [ ] **Step 5: Refazer a página**

Seguir `perfil.html`: cabeçalho, K/D em destaque, três números principais, quatro menores, histórico, por mapa e melhor partida. O histórico continua mostrando a gravação para a equipe, e cada linha abre a partida. "Ver na Steam" só aparece com `steamid64`, em `https://steamcommunity.com/profiles/<steamid64>`, com `rel="noreferrer"`. As seções da equipe e as `Punicoes` continuam abaixo, com a nova aparência. O K/D aparece com duas casas.

- [ ] **Step 6: Conferir no navegador**

Abrir o perfil do dono como ele mesmo, como GM fictício e como jogador fictício, e o de uma conta sem partidas, em 1366 px e 375 px.
Expected: jogador fictício não vê SteamID, "Ver na Steam", denúncias nem gravação. Sem rolagem para o lado.

- [ ] **Step 7: Commit**

```bash
git add site/
git commit -m "feat: perfil completo do jogador"
```

---

### Task 5: Regras do Olho de Águia

**Files:**
- Create: `site/src/dominio/olho-de-aguia.ts`, `site/src/dominio/olho-de-aguia.test.ts`
- Modify: `site/src/dominio/denuncias.ts`, `site/src/dominio/varredura.ts`
- Test: `site/src/dominio/denuncias.test.ts`, `site/src/dominio/varredura.test.ts`

**Interfaces:**
- Produces, em `olho-de-aguia.ts`:

```ts
export type CasoDeDenuncia = {
  chave: string; // `${partidaId}:${acusadoId ?? 'a-definir'}`
  partida: Pick<Partida, 'id' | 'numero' | 'tipo' | 'mapa' | 'criadoEm' | 'encerradaEm'>;
  acusado: (UsuarioPublico & { estado: EstadoUsuario }) | null;
  denuncias: { id: string; motivo: string; criadoEm: Date; denuncianteId: string; denuncianteApelido: string }[];
  numeros: { kills: number; deaths: number; kd: number; hsPct: number; adr: number } | null;
  denunciasContraEle: number; // em qualquer partida, inclusive encerradas
  temPropostaAberta: boolean;
  gravacao: SituacaoDaGravacao;
  gravacaoId?: string;
  podeEncerrar: boolean;
};
export function listarCasosDeDenuncia(bd: Bd, leitor: Pick<Usuario, 'id'>, agora?: Date): Promise<CasoDeDenuncia[]>;
export function encerrarCaso(bd: Bd, gm: Pick<Usuario, 'id'>, caso: { partidaId: string; acusadoId: string | null }, conclusao: string): Promise<void>;
export function chamadosEmAndamento(bd: Bd, leitor: Pick<Usuario, 'id'>): Promise<{ id: string; partidaId: string; partidaNumero: number; partidaTipo: Partida['tipo']; estado: Partida['estado']; chamadoPorApelido: string }[]>;
export function motivoDaProposta(partida: Pick<Partida, 'tipo' | 'numero'>, conclusao: string): string;
```

- Produces, em `denuncias.ts`: `converterChamadosSemResposta(bd: Bd): Promise<void>` e `contagemDeCasos(bd, leitor): Promise<{ chamados: number; denuncias: number; propostas: number }>`. `contarCasos` passa a somar essa contagem.
- `analisarDenuncia` e `listarCasos` continuam até a Task 6, porque `equipe/casos` ainda os usa.

- [ ] **Step 1: Escrever os testes de casos que falham**

Em `olho-de-aguia.test.ts`:

```ts
test('jogador comum não lista, não encerra e não vê chamados', async () => {
  await expect(listarCasosDeDenuncia(bd, membro)).rejects.toBeInstanceOf(SemPermissao);
  await expect(encerrarCaso(bd, membro, { partidaId, acusadoId }, 'x')).rejects.toBeInstanceOf(SemPermissao);
  await expect(chamadosEmAndamento(bd, membro)).rejects.toBeInstanceOf(SemPermissao);
});
test('denúncias da mesma partida contra a mesma pessoa viram um caso só');
test('denúncia sem acusado vira um caso a definir, com acusado e números nulos');
test('mais denúncias vêm primeiro e, no empate, a mais antiga');
test('o caso traz K/D, porcentagem na cabeça e dano por rodada do acusado naquela partida');
test('o caso conta denúncias contra ele em qualquer partida, inclusive encerradas');
test('caso encerrado não aparece na lista');
test.each(['disponivel', 'aguardando', 'sem', 'apagada'])('o caso informa a gravação %s, e só a disponível traz o id');
test('podeEncerrar é falso para quem denunciou e para o acusado');
test('em caso a definir, podeEncerrar é falso para quem jogou a partida');
test('temPropostaAberta reflete proposta aberta do acusado');
test('encerrar fecha todas as denúncias do caso, com a conclusão, e registra encerrar_caso na auditoria');
test('encerrar um caso não mexe em outro da mesma partida');
test('conclusão vazia ou com mais de 500 caracteres dá ConclusaoInvalida');
test('quem denunciou, o acusado e, em caso a definir, quem jogou recebem SemPermissao ao encerrar');
test('encerrar duas vezes dá DenunciaIndisponivel na segunda');
test('outra pessoa denunciando depois de encerrado abre o caso de novo');
test('chamadosEmAndamento só traz partida aguardando jogadores ou ao vivo');
test('motivoDaProposta junta o nome da partida e a conclusão', () => {
  expect(motivoDaProposta({ tipo: 'mix', numero: 7 }, 'Mira na parede')).toBe('Mix #7: Mira na parede');
});
```

- [ ] **Step 2: Escrever os testes de chamado e gravação que falham**

Em `denuncias.test.ts`:

```ts
test('atender chamado de partida que já acabou dá ChamadoIndisponivel');
test('chamado aberto de partida encerrada ou cancelada vira denúncia a definir', async () => {
  await converterChamadosSemResposta(bd);
  expect(chamadoRecarregado.estado).toBe('virou_denuncia');
  expect(denunciaCriada).toMatchObject({ denuncianteId: quemChamou.id, acusadoId: null, motivo: 'Chamado durante a partida, sem resposta da equipe.' });
});
test('chamado de partida em andamento continua aberto');
test('rodar duas vezes não cria outra denúncia');
test('quem já tem denúncia a definir nessa partida não ganha outra');
test('contagemDeCasos separa chamados, denúncias e propostas, e contarCasos soma tudo');
```

Em `varredura.test.ts`:

```ts
test('gravação vencida fica se um jogador da partida está suspenso');
test('gravação vencida fica se um jogador da partida tem proposta de banimento aberta');
test('gravação vencida é apagada depois que a proposta é recusada e o jogador está ativo');
test('varrer transforma chamado sem resposta em denúncia');
```

- [ ] **Step 3: Rodar e ver falhar**

Run: `npm test -- src/dominio/olho-de-aguia src/dominio/denuncias src/dominio/varredura`
Expected: FAIL por módulo e funções inexistentes.

- [ ] **Step 4: Implementar**

- `encerrarCaso`, em uma transação: `exigirPermissao(tx, gm, 'moderar')`, validar a conclusão, buscar as denúncias abertas do caso com `.for('update')` e `isNull(acusadoId)` quando for a definir, recusar com `DenunciaIndisponivel` se não houver nenhuma, e com `SemPermissao` se o `gm` denunciou alguma, é o acusado ou, em caso a definir, jogou a partida. Depois, atualizar todas e registrar `encerrar_caso` com os ids.
- `converterChamadosSemResposta`: para cada chamado aberto de partida `encerrada` ou `cancelada`, em uma transação, mudar para `virou_denuncia` com `where estado = 'aberto'`. Só inserir a denúncia se a linha mudou e se quem chamou ainda não tem denúncia aberta sem acusado naquela partida. Uma falha não pode impedir os outros.
- `atenderChamado`: recusar com `ChamadoIndisponivel` quando a partida não está em `ESTADOS_COM_CHAMADO`.
- `gravacaoProtegida`: `usuarios.estado` em `['banido', 'suspenso']`, ou `banimentos.estado = 'proposto'` para um dos jogadores.
- `varrer`: nova etapa `() => converterChamadosSemResposta(bd)` antes de `apagarGravacoesVencidas`.
- Reaproveitar `situacaoDaGravacao`.

- [ ] **Step 5: Rodar e ver passar**

Run: `npm test -- src/dominio/olho-de-aguia src/dominio/denuncias src/dominio/varredura`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add site/src/dominio/
git commit -m "feat: regras do olho de aguia"
```

---

### Task 6: Aba Olho de Águia

**Files:**
- Create: `site/src/app/(membros)/olho-de-aguia/page.tsx`, `.../olho-de-aguia/acoes.ts`, `.../olho-de-aguia/assistir-no-cs2.tsx`
- Modify: `site/src/app/(membros)/equipe/casos/page.tsx` (só redireciona), `site/src/app/(membros)/menu.tsx`, `site/src/app/(membros)/jogadores/[id]/acoes.ts`, `site/src/auth/destino.ts`, `site/src/estilos/global.css`
- Delete: `site/src/app/(membros)/equipe/casos/acoes.ts`. Em `denuncias.ts`, sai `analisarDenuncia` e `listarCasos`, e o que os testes deles cobrem e ainda não está em `olho-de-aguia.test.ts` migra para lá.
- Test: `site/src/auth/destino.test.ts`

**Interfaces:**
- Consumes: Task 1 (texto e comando da gravação) e Task 5 (`listarCasosDeDenuncia`, `encerrarCaso`, `chamadosEmAndamento`, `motivoDaProposta`).
- Produces: as ações `atender`, `encerrar`, `suspenderDoCaso` e `proporDoCaso`. A rota `/olho-de-aguia?caso=<chave>&erro=<codigo>`.

- [ ] **Step 1: Escrever os testes que falham**

```ts
test('jogador é mandado de /olho-de-aguia para /salas', () => {
  expect(destinoPara({ estado: 'ativo', papel: 'jogador' }, '/olho-de-aguia')).toBe('/salas');
});
test('GM e Adm ficam em /olho-de-aguia', () => {
  expect(destinoPara({ estado: 'ativo', papel: 'gm' }, '/olho-de-aguia')).toBeNull();
  expect(destinoPara({ estado: 'ativo', papel: 'adm' }, '/olho-de-aguia')).toBeNull();
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npm test -- src/auth/destino`
Expected: FAIL no primeiro teste.

- [ ] **Step 3: Implementar a permissão e as ações**

- `SO_EQUIPE` inclui `/olho-de-aguia`. A página repete `pode(usuario, 'moderar')`, como `equipe/casos` fazia.
- `/equipe/casos` faz `redirect('/olho-de-aguia')`. `jogadores/[id]/acoes.ts` troca seu redirecionamento de id inválido.
- `atender` sai de `equipe/casos/acoes.ts` sem mudar o fluxo.
- `encerrar` recebe `partidaId`, `acusadoId` (vazio em caso a definir) e `conclusao`.
- `suspenderDoCaso` chama `suspender(obterBd(), controladorDoAmbiente(), ator, acusadoId, conclusao)`.
- `proporDoCaso` chama `proporBanimento` com `motivoDaProposta`, depois de buscar a partida.
- Erros voltam como `?caso=<chave>&erro=<codigo>`, com os códigos e textos de hoje mais os das punições. Os campos validam UUID com `z.uuid()`.

- [ ] **Step 4: Rodar e ver passar**

Run: `npm test -- src/auth/destino`
Expected: PASS.

- [ ] **Step 5: Montar a tela**

Seguir `olho-de-aguia-v2.html`, mudando o número "Banimentos" para "Denúncias contra ele".

- `<Atualizar segundos={5} />`. O título é "Olho de Águia".
- Faixa de chamado: `chamadosEmAndamento`, com o botão "Assistir ao vivo" chamando `atender`.
- Lista de casos à esquerda, com link `?caso=<chave>`. Sem `caso` válido, abre o primeiro. Sem casos, um aviso de que não há denúncias abertas.
- Detalhe como na spec, seção 9. "Ver ficha" não aparece em caso a definir.
- Botões: "Encerrar sem punição", que vira "Encerrar caso" quando `acusado.estado !== 'ativo'` ou `temPropostaAberta`. "Suspender" só com o acusado ativo. "Propor banimento" sem proposta aberta e sem banimento. Suspender e propor usam `BotaoConfirmar`, com os mesmos textos da ficha. Em caso a definir, só encerrar.
- `podeEncerrar` falso: sem o botão de encerrar, com o texto "Você está envolvido nesse caso, então outra pessoa da equipe precisa encerrar."
- Textarea com `maxLength={480}`, porque o nome da partida entra no motivo da proposta.
- `AssistirNoCs2({ gravacaoId, numero })`, de cliente: o link baixa de `/api/gravacoes/<id>`, e ao clicar aparecem os passos e o comando da Task 1, com botão de copiar. Outras situações mostram os textos `NOME_DA_GRAVACAO`, movidos para `textos-da-partida.ts`.
- Bloco de propostas de banimento, como em `equipe/casos`, com link para a ficha.
- Menu: "Olho de Águia" com o ícone de olho e o contador, em `/olho-de-aguia`.

- [ ] **Step 6: Conferir no navegador**

Com contas fictícias, uma delas com apelido longo e símbolos: partida com duas denúncias contra a mesma pessoa, um caso a definir e um chamado ao vivo.
Expected: como GM, encerrar, suspender e propor funcionam e a auditoria registra. Quem denunciou não vê o botão de encerrar. Dois encerramentos em abas diferentes mostram o aviso, sem tela de erro. Como jogador, `/olho-de-aguia` volta para `/salas`. `/equipe/casos` leva à aba nova. "Assistir no CS2" baixa `3,8 MB` da partida 7 e o comando copia. Em 375 px, a lista fica sobre o detalhe, sem rolagem para o lado.

- [ ] **Step 7: Commit**

```bash
git add site/
git commit -m "feat: aba olho de aguia"
```

---

### Task 7: Sino de notificações

**Files:**
- Create: `site/src/dominio/notificacoes.ts`, `site/src/dominio/notificacoes.test.ts`, `site/src/app/(membros)/sino.tsx`
- Modify: `site/src/app/(membros)/layout.tsx`, `site/src/app/(membros)/banner.tsx`, `site/src/estilos/global.css`
- Test: `site/src/dominio/notificacoes.test.ts`

**Interfaces:**
- Consumes: `contagemDeCasos` (Task 5), `minhaSala`, `desafiosDaSala`, `partidaAtualDe`, `pode`.
- Produces: `notificacoesDe(bd: Bd, usuario: Usuario, agora?: Date): Promise<Notificacao[]>`, com `type Notificacao = { tipo: 'desafio' | 'partida' | 'chamados' | 'denuncias' | 'propostas'; texto: string; href: string; quantidade: number }`.

- [ ] **Step 1: Escrever os testes que falham**

```ts
test('líder vê o desafio recebido, com link para as salas', async () => {
  expect(await notificacoesDe(bd, liderAlvo)).toEqual([expect.objectContaining({ tipo: 'desafio', href: '/salas', quantidade: 1 })]);
});
test('desafio enviado, membro que não lidera e desafio vencido não notificam');
test('partida aguardando jogadores notifica quem joga, com link para a partida');
test('partida ao vivo não notifica');
test('equipe vê chamados, denúncias e propostas, e a soma bate com contarCasos');
test('tipo sem pendência não aparece');
test('jogador denunciado não recebe nenhuma notificação', async () => {
  await denunciar(bd, outro, { partidaId, acusadoId: jogador.id, motivo: 'x' });
  expect(await notificacoesDe(bd, jogador)).toEqual([]);
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npm test -- src/dominio/notificacoes`
Expected: FAIL por módulo inexistente.

- [ ] **Step 3: Implementar**

Itens da equipe levam a `/olho-de-aguia`. Ler a sala só se a pessoa tiver sala e for líder (`sala.liderId === usuario.id`). `Sino` usa `MenuSuspenso`, mostra o contador com a soma das quantidades e, sem itens, "Nada esperando por você". `layout.tsx` chama `notificacoesDe`, passa o resultado ao banner e inclui `<Atualizar segundos={15} />`. Sem histórico e sem "lido".

- [ ] **Step 4: Rodar e ver passar**

Run: `npm test -- src/dominio/notificacoes`
Expected: PASS.

- [ ] **Step 5: Conferir no navegador**

Com contas fictícias: desafio recebido, partida pronta e denúncia aberta.
Expected: o contador aparece, cada item abre a página certa e some depois de resolvido. O jogador denunciado não vê nada.

- [ ] **Step 6: Commit**

```bash
git add site/
git commit -m "feat: sino de notificacoes"
```

---

### Task 8: Conferência final

**Files:** nada novo, a não ser correções do que aparecer.

- [ ] **Step 1: Rodar tudo**

Run: `npm test`, `npx tsc --noEmit` e `npx eslint src`
Expected: tudo passando, sem avisos novos.

- [ ] **Step 2: Percorrer todas as páginas**

Salas, Mix, Diversão, Convites, Equipe, Olho de Águia, perfil, partida, `/`, `/verificacao`, `/verificacao/simulador`, `/suspenso` e `/banido`, em 1366 px e 375 px.
Expected: sem fundo claro, sem rolagem para o lado, texto legível. Corrigir o que aparecer, com commit.

- [ ] **Step 3: Repetir os fluxos já testados, com contas fictícias**

Salas, desafio aceito, mix fechando, conectar, denúncia, chamado, suspensão, banimento e reversão.
Expected: tudo igual ao teste da Etapa 3. O servidor de CS2 só é ligado se o dono for jogar.

- [ ] **Step 4: Conferência do dono**

O dono abre o site e confirma que é a imagem que ele pediu, e abre uma gravação no CS2 dele pelo botão.
Expected: o dono aprova. Ajustes pequenos entram aqui.

- [ ] **Step 5: Revisão geral**

Uma revisão só, cobrindo a Etapa 3 e este plano, com `review-package` em `38f5af4..HEAD`. Passar ao revisor as duas specs, os dois planos, as duas seções Review Focus e os `Ruling:` dos dois ledgers. Avisar o dono de que demora. Critical e Important entram em uma passada de correção com RED→GREEN. Minor vai para o ledger.
