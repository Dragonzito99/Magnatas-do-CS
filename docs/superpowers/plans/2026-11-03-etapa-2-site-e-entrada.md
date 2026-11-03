# Etapa 2: site e entrada, plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Colocar no ar, no PC do dono, o site do Magnatas com entrada por convite, login pela Steam, verificação simulada, papéis e menu lateral, até um membro aprovado aparecer como liberado no servidor de CS2.

**Architecture:** Um app Next.js em `site/`. As regras ficam em funções em `site/src/dominio/`, que recebem o banco como parâmetro e são testadas com um PostgreSQL real em memória (PGlite). Páginas e rotas só chamam essas funções. A verificação de identidade fica atrás de uma interface, com um simulador que se recusa a rodar em produção. O servidor de jogo busca a lista de liberados no site.

**Tech Stack:** Node.js 26 LTS, Next.js 16, React 19, TypeScript, PostgreSQL 16, Drizzle ORM, Vitest, PGlite, Zod.

**Spec:** `docs/2026-11-03-magnatas-design.md` (seções 2, 3, 4, 5.1, 5.2, 5.3 e 6)

**Depois deste plano:** a etapa 3 (salas, desafios, mix, diversão, partidas, denúncias, ficha e banimento) recebe um plano próprio, construído em cima deste.

## Global Constraints

- O nome da plataforma é Magnatas. Todo texto da tela é em português do Brasil.
- Nenhum documento real é tratado neste plano. Até o dono falar com o advogado, a verificação é só simulada.
- O sistema nunca guarda foto, número de documento nem CPF em texto. Guarda só o código gerado com HMAC-SHA-256 e a chave `CPF_HMAC_CHAVE`.
- Um CPF, uma conta. Menores de 18 anos são barrados. Quem foi banido não volta, nem com outra conta Steam.
- Cada código de convite serve uma vez só. Adm e GM geram sem limite. Cada membro verificado recebe 2 convites, que valem para a vida toda da conta, e o Adm pode dar mais.
- Quem convidou fica registrado, mas não é punido pelo convidado.
- Papéis: `jogador`, `gm` e `adm`. No começo, o dono é o único Adm.
- Sem cobrança de qualquer tipo.
- Formato A: menu lateral com Salas, Mix e Diversão, conteúdo no meio. Visual de referência em `modelo/opcoes.html#a-salas`: fundo claro, botões laranja e cartões escuros. Sem imagens do template GenLabs.
- Segredos ficam em `site/.env.local`, fora do repositório, e nunca vão para o chat.
- O disco C: do dono está quase cheio. Node, cache do npm e temporários ficam em `G:\Magnatas-ferramentas`.
- Quem faz cada passo está marcado. **(dono)** é algo que só o dono pode fazer.

## Review Focus

- **Retorno falso da Steam:** alguém monta a URL de retorno com o SteamID de outra pessoa. A pessoa espera que ninguém entre na conta dela. Testado em `validarRetornoSteam` (Task 2).
- **Banido volta com outra conta Steam:** o mesmo CPF com outra Steam não pode entrar. Testado em `aplicarResultadoVerificacao` (Task 4).
- **Dois usam o mesmo convite ao mesmo tempo:** só um entra, e o outro recebe uma mensagem clara. Testado em `consumirConvite` (Task 3).
- **Aniversário de 18 anos e data estranha:** quem faz 18 hoje entra, quem faz amanhã não, e uma data impossível não aprova ninguém. Testado em `maiorDeIdade` (Task 4).
- **Simulador ligado em produção:** aprovaria qualquer pessoa. O site precisa se recusar a iniciar. Testado em `criarVerificador` (Task 4).

---

## Estrutura de arquivos

```
site/
  package.json, tsconfig.json, next.config.ts, drizzle.config.ts, vitest.config.ts
  .env.example
  drizzle/                      migrações geradas
  src/
    bd/esquema.ts               tabelas
    bd/conexao.ts               conexão com o PostgreSQL
    bd/teste.ts                 banco em memória para os testes
    dominio/usuarios.ts         contas e estados
    dominio/convites.ts         gerar, consumir e revogar convites
    dominio/verificacao.ts      regras do resultado da verificação
    dominio/equipe.ts           papéis e auditoria
    dominio/lista.ts            lista de liberados do servidor
    auth/steam.ts               login OpenID da Steam
    auth/sessoes.ts             sessões no banco
    auth/permissoes.ts          o que cada papel pode fazer
    auth/destino.ts             para onde cada estado é levado
    verificacao/verificador.ts  interface e simulador
    app/                        páginas e rotas
    estilos/                    tokens e componentes do visual
  scripts/criar-adm.ts          cria o primeiro Adm
servidor/scripts/atualizar_lista.sh
```

---

### Task 1: Base do projeto e banco

**Files:**
- Create: tudo em `site/` listado como configuração, `site/src/bd/esquema.ts`, `site/src/bd/conexao.ts`, `site/src/bd/teste.ts`, `site/.env.example`, `.claude/launch.json`
- Modify: `.gitignore`
- Test: `site/src/bd/esquema.test.ts`

**Interfaces:**
- Produces: `criarBancoDeTeste(): Promise<Bd>` em `bd/teste.ts`, `obterBd(): Bd` em `bd/conexao.ts`, onde `Bd` é o tipo comum do Drizzle para PGlite e `pg`.

- [ ] **Step 1: Instalar o Node sem usar o disco C:**

Baixar o zip Windows x64 da versão LTS atual de `nodejs.org/dist` para `G:\Magnatas-ferramentas\node`. Conferir o SHA-256 com o `SHASUMS256.txt` da mesma versão.
Run: `G:\Magnatas-ferramentas\node\node.exe --version`
Expected: `v26.13.0` ou a LTS vigente.

Toda sessão define `PATH` com essa pasta, `npm_config_cache=G:\Magnatas-ferramentas\npm-cache` e `TEMP`/`TMP` em `G:\Magnatas-ferramentas\tmp`.

- [ ] **Step 2: Criar o app e as dependências**

Criar o projeto Next.js em `site/`, com App Router, TypeScript e pasta `src`, sem Tailwind. Instalar `drizzle-orm`, `pg`, `zod`, e em desenvolvimento `drizzle-kit`, `vitest`, `@electric-sql/pglite`, `@types/pg`, `tsx`. Usar a versão do TypeScript que o Next aceitar. Scripts: `dev`, `build`, `test`, `db:gerar`, `db:migrar`, `adm:criar`. Acrescentar `site/.env.local`, `site/.next/` e `site/node_modules/` ao `.gitignore`.

- [ ] **Step 3: Escrever os testes que falham**

```ts
test('banco de teste aplica as migrações', async () => {
  const bd = await criarBancoDeTeste();
  const linhas = await bd.select().from(usuarios);
  expect(linhas).toEqual([]);
});

test('steamid64 é único', async () => {
  const bd = await criarBancoDeTeste();
  await bd.insert(usuarios).values({ steamid64: STEAM_A, apelido: 'A' });
  await expect(bd.insert(usuarios).values({ steamid64: STEAM_A, apelido: 'B' })).rejects.toThrow();
});

test('o mesmo código de CPF não pode estar em duas contas', async () => {
  const bd = await criarBancoDeTeste();
  await bd.insert(usuarios).values({ steamid64: STEAM_A, apelido: 'A', cpfHmac: 'x' });
  await expect(bd.insert(usuarios).values({ steamid64: STEAM_B, apelido: 'B', cpfHmac: 'x' })).rejects.toThrow();
});
```

- [ ] **Step 4: Rodar e ver falhar**

Run: `npm test -- src/bd` em `site/`
Expected: FAIL por módulo inexistente.

- [ ] **Step 5: Implementar o esquema**

Tabelas em `bd/esquema.ts`:
- `usuarios`: `id` (uuid), `steamid64` (texto único), `apelido`, `avatarUrl`, `papel` (`jogador`, `gm`, `adm`; padrão `jogador`), `estado` (`aguardando_verificacao`, `ativo`, `suspenso`, `banido`; padrão `aguardando_verificacao`), `cpfHmac` (texto único, opcional), `convitesRestantes` (inteiro; padrão 0), `convidadoPor` (usuário, opcional), `criadoEm`.
- `convites`: `id`, `codigo` (único), `criadoPor` (usuário, opcional), `usadoPor` (usuário, opcional), `usadoEm`, `revogadoEm`, `criadoEm`.
- `sessoes`: `id`, `tokenHash` (único), `usuarioId`, `expiraEm`, `criadoEm`.
- `cpfs_banidos`: `cpfHmac` (chave primária), `banidoEm`. Fica nesta tabela para o bloqueio continuar mesmo se a conta sumir.
- `verificacoes`: `id`, `usuarioId`, `provedor`, `referencia` (única), `estado` (`pendente`, `aprovada`, `reprovada`), `motivo`, `criadoEm`, `concluidoEm`.
- `auditoria`: `id`, `atorId` (opcional), `acao`, `alvoId` (opcional), `detalhes` (json), `criadoEm`.

Gerar a migração com `npm run db:gerar`. `criarBancoDeTeste` cria um PGlite em memória e aplica as migrações de `drizzle/`.

- [ ] **Step 6: Rodar e ver passar**

Run: `npm test -- src/bd`
Expected: PASS.

- [ ] **Step 7: Instalar o PostgreSQL de desenvolvimento no Ubuntu do WSL**

Instalar `postgresql` com `apt`, criar o usuário e o banco `magnatas` com senha gerada na hora, escutando só em `127.0.0.1`. Gravar `DATABASE_URL` em `site/.env.local`.
Run: `npm run db:migrar` em `site/`
Expected: migrações aplicadas sem erro. Rodar de novo deve dizer que não há nada a aplicar.

- [ ] **Step 8: Commit**

```bash
git add .gitignore site/
git commit -m "feat: base do site e banco"
```

---

### Task 2: Login pela Steam e sessões

**Files:**
- Create: `site/src/auth/steam.ts`, `site/src/auth/sessoes.ts`, `site/src/dominio/usuarios.ts`, `site/src/app/api/auth/steam/route.ts`, `site/src/app/api/auth/steam/retorno/route.ts`, `site/src/app/api/auth/sair/route.ts`
- Test: `site/src/auth/steam.test.ts`, `site/src/auth/sessoes.test.ts`

**Interfaces:**
- Produces:
  - `urlDeLoginSteam(retorno: string): string`
  - `validarRetornoSteam(parametros: URLSearchParams, retornoEsperado: string, buscar?: typeof fetch): Promise<string | null>`, que devolve o SteamID64 ou `null`
  - `criarSessao(bd: Bd, usuarioId: string, agora?: Date): Promise<string>`, que devolve o token
  - `lerSessao(bd: Bd, token: string, agora?: Date): Promise<Usuario | null>`
  - `encerrarSessao(bd: Bd, token: string): Promise<void>`
  - `buscarPorSteam(bd: Bd, steamid64: string): Promise<Usuario | null>`

- [ ] **Step 1: Escrever os testes que falham**

```ts
const VALIDO = () => new URLSearchParams({
  'openid.mode': 'id_res',
  'openid.op_endpoint': 'https://steamcommunity.com/openid/login',
  'openid.claimed_id': `https://steamcommunity.com/openid/id/${STEAM_A}`,
  'openid.identity': `https://steamcommunity.com/openid/id/${STEAM_A}`,
  'openid.return_to': RETORNO,
  'openid.assoc_handle': 'x', 'openid.signed': 'x', 'openid.sig': 'x', 'openid.response_nonce': 'x',
});
const steamConfirma = async () => new Response('ns:http://specs.openid.net/auth/2.0\nis_valid:true\n');
const steamNega = async () => new Response('ns:http://specs.openid.net/auth/2.0\nis_valid:false\n');

test('aceita retorno confirmado pela Steam', async () => {
  expect(await validarRetornoSteam(VALIDO(), RETORNO, steamConfirma)).toBe(STEAM_A);
});

test('recusa quando a Steam não confirma a assinatura', async () => {
  expect(await validarRetornoSteam(VALIDO(), RETORNO, steamNega)).toBeNull();
});

test.each([
  ['openid.claimed_id', 'https://steamcommunity.com.falso.net/openid/id/76561198000000001'],
  ['openid.claimed_id', 'https://steamcommunity.com/openid/id/123'],
  ['openid.op_endpoint', 'https://falso.net/openid/login'],
  ['openid.return_to', 'https://falso.net/retorno'],
  ['openid.mode', 'cancel'],
])('recusa %s adulterado sem nem consultar a Steam', async (campo, valor) => {
  const parametros = VALIDO(); parametros.set(campo, valor);
  const buscar = vi.fn(steamConfirma);
  expect(await validarRetornoSteam(parametros, RETORNO, buscar)).toBeNull();
  expect(buscar).not.toHaveBeenCalled();
});

test('falha de rede na Steam não autentica ninguém', async () => {
  expect(await validarRetornoSteam(VALIDO(), RETORNO, async () => { throw new Error('rede'); })).toBeNull();
});

test('sessão guarda só o hash do token', async () => {
  const token = await criarSessao(bd, usuario.id);
  const [linha] = await bd.select().from(sessoes);
  expect(linha.tokenHash).not.toContain(token);
  expect((await lerSessao(bd, token))?.id).toBe(usuario.id);
});

test('sessão expira depois de 30 dias', async () => {
  const inicio = new Date('2026-01-01T00:00:00Z');
  const token = await criarSessao(bd, usuario.id, inicio);
  expect(await lerSessao(bd, token, new Date('2026-01-30T23:00:00Z'))).not.toBeNull();
  expect(await lerSessao(bd, token, new Date('2026-01-31T01:00:00Z'))).toBeNull();
});

test('token encerrado ou desconhecido não abre sessão', async () => {
  const token = await criarSessao(bd, usuario.id);
  await encerrarSessao(bd, token);
  expect(await lerSessao(bd, token)).toBeNull();
  expect(await lerSessao(bd, 'qualquer')).toBeNull();
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npm test -- src/auth`
Expected: FAIL por módulo inexistente.

- [ ] **Step 3: Implementar `steam.ts` e `sessoes.ts`**

`validarRetornoSteam` confere os campos antes de chamar a rede: `claimed_id` e `identity` iguais e casando com `^https://steamcommunity\.com/openid/id/(7656119\d{10})$`, `op_endpoint` exato e `return_to` igual ao esperado. Depois envia os mesmos parâmetros por POST com `openid.mode=check_authentication` e exige a linha `is_valid:true`. O token da sessão tem 32 bytes aleatórios e é guardado com SHA-256.

- [ ] **Step 4: Rodar e ver passar**

Run: `npm test -- src/auth`
Expected: PASS.

- [ ] **Step 5: Criar as rotas**

`/api/auth/steam` redireciona para a Steam. `/api/auth/steam/retorno` valida, abre sessão em cookie `HttpOnly`, `SameSite=Lax` e `Secure` fora de localhost, ou leva para `/?erro=conta` se a pessoa não tiver conta nem convite (a Task 3 completa esse caso). `/api/auth/sair` aceita só POST.

- [ ] **Step 6: Commit**

```bash
git add site/
git commit -m "feat: login pela steam e sessoes"
```

---

### Task 3: Convites e criação da conta

**Files:**
- Create: `site/src/dominio/convites.ts`, `site/src/app/convites/page.tsx`
- Modify: `site/src/app/api/auth/steam/route.ts`, `site/src/app/api/auth/steam/retorno/route.ts`
- Test: `site/src/dominio/convites.test.ts`

**Interfaces:**
- Consumes: `Usuario`, `buscarPorSteam` da Task 2.
- Produces:
  - `gerarConvite(bd: Bd, ator: Usuario): Promise<string>`, que devolve o código ou lança `SemConvites`
  - `conviteValido(bd: Bd, codigo: string): Promise<boolean>`
  - `consumirConvite(bd: Bd, codigo: string, novo: { steamid64: string; apelido: string; avatarUrl?: string }): Promise<Usuario>`, que lança `ConviteInvalido`
  - `revogarConvite(bd: Bd, ator: Usuario, codigo: string): Promise<void>`
  - `listarConvites(bd: Bd, ator: Usuario): Promise<Convite[]>`

- [ ] **Step 1: Escrever os testes que falham**

```ts
test('membro ativo gasta um dos seus convites', async () => {
  const membro = await criarUsuario(bd, { estado: 'ativo', convitesRestantes: 2 });
  await gerarConvite(bd, membro);
  expect((await recarregar(bd, membro)).convitesRestantes).toBe(1);
});

test('membro sem convites não gera', async () => {
  const membro = await criarUsuario(bd, { estado: 'ativo', convitesRestantes: 0 });
  await expect(gerarConvite(bd, membro)).rejects.toThrow(SemConvites);
});

test.each(['aguardando_verificacao', 'suspenso', 'banido'])('conta %s não gera', async (estado) => {
  const membro = await criarUsuario(bd, { estado, convitesRestantes: 2 });
  await expect(gerarConvite(bd, membro)).rejects.toThrow(SemConvites);
});

test.each(['gm', 'adm'])('%s gera sem gastar', async (papel) => {
  const equipe = await criarUsuario(bd, { estado: 'ativo', papel, convitesRestantes: 0 });
  await gerarConvite(bd, equipe);
  expect((await recarregar(bd, equipe)).convitesRestantes).toBe(0);
});

test('consumir cria a conta aguardando verificação e registra quem convidou', async () => {
  const dono = await criarUsuario(bd, { estado: 'ativo', papel: 'adm' });
  const codigo = await gerarConvite(bd, dono);
  const novo = await consumirConvite(bd, codigo, { steamid64: STEAM_B, apelido: 'B' });
  expect(novo.estado).toBe('aguardando_verificacao');
  expect(novo.convidadoPor).toBe(dono.id);
  expect(novo.convitesRestantes).toBe(0);
});

test('o mesmo código não serve duas vezes', async () => {
  const codigo = await codigoDeTeste(bd);
  await consumirConvite(bd, codigo, { steamid64: STEAM_B, apelido: 'B' });
  await expect(consumirConvite(bd, codigo, { steamid64: STEAM_C, apelido: 'C' })).rejects.toThrow(ConviteInvalido);
});

test('dois consumos ao mesmo tempo: só um vence e nenhuma conta sobra sem convite', async () => {
  const codigo = await codigoDeTeste(bd);
  const resultados = await Promise.allSettled([
    consumirConvite(bd, codigo, { steamid64: STEAM_B, apelido: 'B' }),
    consumirConvite(bd, codigo, { steamid64: STEAM_C, apelido: 'C' }),
  ]);
  expect(resultados.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
  const contas = await bd.select().from(usuarios).where(inArray(usuarios.steamid64, [STEAM_B, STEAM_C]));
  expect(contas).toHaveLength(1);
});

test('código revogado não serve, e o convite volta para quem criou', async () => {
  const membro = await criarUsuario(bd, { estado: 'ativo', convitesRestantes: 1 });
  const codigo = await gerarConvite(bd, membro);
  await revogarConvite(bd, membro, codigo);
  expect((await recarregar(bd, membro)).convitesRestantes).toBe(1);
  await expect(consumirConvite(bd, codigo, { steamid64: STEAM_B, apelido: 'B' })).rejects.toThrow(ConviteInvalido);
});

test('código já usado não pode ser revogado', async () => {
  const membro = await criarUsuario(bd, { estado: 'ativo', convitesRestantes: 1 });
  const codigo = await gerarConvite(bd, membro);
  await consumirConvite(bd, codigo, { steamid64: STEAM_B, apelido: 'B' });
  await expect(revogarConvite(bd, membro, codigo)).rejects.toThrow(ConviteInvalido);
});

test('código é aleatório e fácil de digitar', async () => {
  const codigo = await codigoDeTeste(bd);
  expect(codigo).toMatch(/^[0-9A-HJKMNP-TV-Z]{10}$/);
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npm test -- src/dominio/convites`
Expected: FAIL por módulo inexistente.

- [ ] **Step 3: Implementar `convites.ts`**

O código tem 10 caracteres de `crypto.randomInt`, no alfabeto Crockford. `consumirConvite` roda em transação e marca o convite com `UPDATE ... WHERE usado_por IS NULL AND revogado_em IS NULL RETURNING`. Se nenhuma linha voltar, lança `ConviteInvalido`. Depois cria o usuário e grava `usadoPor`. Códigos digitados com minúsculas são aceitos.

- [ ] **Step 4: Rodar e ver passar**

Run: `npm test -- src/dominio/convites`
Expected: PASS.

- [ ] **Step 5: Ligar o convite ao login**

A página inicial pede o código, confere com `conviteValido` e guarda em um cookie `HttpOnly` de 15 minutos antes de ir para a Steam. No retorno: se a conta existe, abre sessão. Se não existe e há convite, chama `consumirConvite` com o nome e o avatar públicos do `steamcommunity.com/profiles/<id>?xml=1`, usando o SteamID como apelido se isso falhar. Sem conta e sem convite, volta para a página inicial com uma mensagem. Limite de 10 tentativas de código por minuto por IP, em memória.

- [ ] **Step 6: Criar a página `/convites`**

Lista os códigos da pessoa, com usado, disponível ou revogado, botão de gerar, de copiar e de revogar, e o número de convites restantes.

- [ ] **Step 7: Commit**

```bash
git add site/
git commit -m "feat: convites e criacao da conta"
```

---

### Task 4: Verificação de identidade simulada

**Files:**
- Create: `site/src/dominio/verificacao.ts`, `site/src/verificacao/verificador.ts`, `site/src/app/verificacao/page.tsx`, `site/src/app/verificacao/simulador/page.tsx`, `site/src/app/api/verificacao/retorno/route.ts`
- Test: `site/src/dominio/verificacao.test.ts`, `site/src/verificacao/verificador.test.ts`

**Interfaces:**
- Produces:
  - `cpfValido(cpf: string): boolean`
  - `maiorDeIdade(nascimento: string, hoje: Date): boolean`, com `nascimento` em `AAAA-MM-DD`
  - `codigoDoCpf(cpf: string, chave: string): string`
  - `ResultadoVerificacao`: `{ referencia: string; aprovado: boolean; cpf?: string; nascimento?: string; motivo?: string }`
  - `aplicarResultadoVerificacao(bd: Bd, resultado: ResultadoVerificacao, chave: string, hoje?: Date): Promise<'aprovada' | 'reprovada' | 'banido'>`
  - `Verificador`: `{ iniciar(usuario: Usuario): Promise<{ referencia: string; url: string }> }`
  - `criarVerificador(ambiente: Record<string, string | undefined>): Verificador`

- [ ] **Step 1: Escrever os testes que falham**

```ts
test.each(['52998224725', '529.982.247-25'])('aceita CPF válido %s', (cpf) => expect(cpfValido(cpf)).toBe(true));
test.each(['52998224724', '11111111111', '123', '', 'abc'])('recusa CPF inválido %s', (cpf) => expect(cpfValido(cpf)).toBe(false));

test.each([
  ['2008-11-03', true],   // faz 18 hoje
  ['2008-11-04', false],  // faz 18 amanhã
  ['1990-01-01', true],
  ['2010-02-30', false],  // data impossível
  ['2030-01-01', false],
  ['ontem', false],
])('maiorDeIdade(%s) em 03/11/2026 é %s', (nascimento, esperado) => {
  expect(maiorDeIdade(nascimento, new Date('2026-11-03T12:00:00Z'))).toBe(esperado);
});

test('código do CPF depende da chave e ignora a pontuação', () => {
  expect(codigoDoCpf('52998224725', CHAVE)).toBe(codigoDoCpf('529.982.247-25', CHAVE));
  expect(codigoDoCpf('52998224725', CHAVE)).not.toBe(codigoDoCpf('52998224725', OUTRA_CHAVE));
  expect(codigoDoCpf('52998224725', CHAVE)).not.toContain('52998224725');
});

test('aprovação ativa a conta, dá 2 convites e não guarda o CPF', async () => {
  const { usuario, referencia } = await pendente(bd);
  expect(await aplicar(bd, { referencia, aprovado: true, cpf: CPF, nascimento: ADULTO })).toBe('aprovada');
  const atual = await recarregar(bd, usuario);
  expect(atual.estado).toBe('ativo');
  expect(atual.convitesRestantes).toBe(2);
  expect(atual.cpfHmac).toBe(codigoDoCpf(CPF, CHAVE));
  expect(JSON.stringify(await tudoNoBanco(bd))).not.toContain(CPF);
});

test('menor de idade é reprovado e continua sem acesso', async () => {
  const { usuario, referencia } = await pendente(bd);
  expect(await aplicar(bd, { referencia, aprovado: true, cpf: CPF, nascimento: MENOR })).toBe('reprovada');
  expect((await recarregar(bd, usuario)).estado).toBe('aguardando_verificacao');
});

test('CPF já usado em outra conta é reprovado', async () => {
  const primeira = await pendente(bd, STEAM_A);
  await aplicar(bd, { referencia: primeira.referencia, aprovado: true, cpf: CPF, nascimento: ADULTO });
  const segunda = await pendente(bd, STEAM_B);
  expect(await aplicar(bd, { referencia: segunda.referencia, aprovado: true, cpf: CPF, nascimento: ADULTO })).toBe('reprovada');
});

test('CPF banido com outra conta Steam bane a conta nova', async () => {
  await bd.insert(cpfsBanidos).values({ cpfHmac: codigoDoCpf(CPF, CHAVE) });
  const { usuario, referencia } = await pendente(bd);
  expect(await aplicar(bd, { referencia, aprovado: true, cpf: CPF, nascimento: ADULTO })).toBe('banido');
  expect((await recarregar(bd, usuario)).estado).toBe('banido');
});

test('o mesmo resultado aplicado duas vezes não dá convites de novo', async () => {
  const { usuario, referencia } = await pendente(bd);
  const resultado = { referencia, aprovado: true, cpf: CPF, nascimento: ADULTO };
  await aplicar(bd, resultado); await aplicar(bd, resultado);
  expect((await recarregar(bd, usuario)).convitesRestantes).toBe(2);
});

test('referência desconhecida é recusada', async () => {
  await expect(aplicar(bd, { referencia: 'x', aprovado: true, cpf: CPF, nascimento: ADULTO })).rejects.toThrow();
});

test('quem já tem o papel de equipe mantém o papel ao ser aprovado', async () => {
  const { usuario, referencia } = await pendente(bd, STEAM_A, { papel: 'adm' });
  await aplicar(bd, { referencia, aprovado: true, cpf: CPF, nascimento: ADULTO });
  expect((await recarregar(bd, usuario)).papel).toBe('adm');
});

test('simulador não inicia em produção', () => {
  expect(() => criarVerificador({ NODE_ENV: 'production', VERIFICADOR: 'simulador' })).toThrow(/produção/);
});

test('produção sem verificador configurado não inicia', () => {
  expect(() => criarVerificador({ NODE_ENV: 'production' })).toThrow();
});

test('desenvolvimento usa o simulador', async () => {
  const verificador = criarVerificador({ NODE_ENV: 'development', VERIFICADOR: 'simulador' });
  expect((await verificador.iniciar(usuarioDeTeste)).url).toContain('/verificacao/simulador');
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npm test -- src/dominio/verificacao src/verificacao`
Expected: FAIL por módulo inexistente.

- [ ] **Step 3: Implementar as regras e o simulador**

`aplicarResultadoVerificacao` roda em transação. Uma verificação já concluída devolve o mesmo resultado, sem aplicar de novo. A ordem é: confere se foi aprovada e se o CPF é válido, confere a idade, gera o código, procura em `cpfs_banidos` e depois em outra conta. Mensagens para a pessoa não revelam se o CPF pertence a outra conta. `CPF_HMAC_CHAVE` precisa ter pelo menos 32 caracteres.

- [ ] **Step 4: Rodar e ver passar**

Run: `npm test -- src/dominio/verificacao src/verificacao`
Expected: PASS.

- [ ] **Step 5: Criar as telas**

`/verificacao` explica o que será pedido e leva ao verificador. `/verificacao/simulador` existe só com o simulador, avisa em destaque que é um teste e deixa escolher aprovar, reprovar, menor de idade ou CPF repetido. O simulador gera um CPF de teste válido, ou usa o CPF digitado, e devolve o resultado para `/api/verificacao/retorno`.

- [ ] **Step 6: Commit**

```bash
git add site/
git commit -m "feat: verificacao de identidade simulada"
```

---

### Task 5: Papéis, equipe e primeiro Adm

**Files:**
- Create: `site/src/auth/permissoes.ts`, `site/src/dominio/equipe.ts`, `site/src/app/equipe/page.tsx`, `site/scripts/criar-adm.ts`
- Test: `site/src/auth/permissoes.test.ts`, `site/src/dominio/equipe.test.ts`

**Interfaces:**
- Produces:
  - `pode(usuario: Usuario, acao: Acao): boolean`, com `Acao` em `gerar_convite_ilimitado`, `ver_equipe`, `mudar_papel`, `dar_convites`
  - `mudarPapel(bd: Bd, ator: Usuario, alvoId: string, papel: Papel): Promise<void>`, que lança `SemPermissao` ou `UltimoAdm`
  - `darConvites(bd: Bd, ator: Usuario, alvoId: string, quantidade: number): Promise<void>`
  - `registrarAuditoria(bd: Bd, entrada: { atorId?: string; acao: string; alvoId?: string; detalhes?: unknown }): Promise<void>`

- [ ] **Step 1: Escrever os testes que falham**

```ts
test.each([
  ['jogador', 'gerar_convite_ilimitado', false],
  ['gm', 'gerar_convite_ilimitado', true],
  ['adm', 'gerar_convite_ilimitado', true],
  ['gm', 'ver_equipe', true],
  ['jogador', 'ver_equipe', false],
  ['gm', 'mudar_papel', false],
  ['adm', 'mudar_papel', true],
  ['gm', 'dar_convites', false],
  ['adm', 'dar_convites', true],
])('%s pode %s: %s', (papel, acao, esperado) => {
  expect(pode(usuarioAtivo(papel), acao)).toBe(esperado);
});

test.each(['suspenso', 'banido', 'aguardando_verificacao'])('adm %s não pode nada', (estado) => {
  expect(pode(usuarioCom({ papel: 'adm', estado }), 'mudar_papel')).toBe(false);
});

test('adm promove jogador a gm e fica registrado', async () => {
  await mudarPapel(bd, adm, jogador.id, 'gm');
  expect((await recarregar(bd, jogador)).papel).toBe('gm');
  const [registro] = await bd.select().from(auditoria);
  expect(registro).toMatchObject({ atorId: adm.id, acao: 'mudar_papel', alvoId: jogador.id });
});

test('gm não muda papel', async () => {
  await expect(mudarPapel(bd, gm, jogador.id, 'gm')).rejects.toThrow(SemPermissao);
});

test('o último adm não pode deixar de ser adm', async () => {
  await expect(mudarPapel(bd, adm, adm.id, 'jogador')).rejects.toThrow(UltimoAdm);
});

test('com dois adms, um pode deixar de ser', async () => {
  const outro = await criarUsuario(bd, { papel: 'adm', estado: 'ativo' });
  await mudarPapel(bd, adm, outro.id, 'jogador');
  expect((await recarregar(bd, outro)).papel).toBe('jogador');
});

test('adm dá convites, e a quantidade precisa ser positiva', async () => {
  await darConvites(bd, adm, jogador.id, 3);
  expect((await recarregar(bd, jogador)).convitesRestantes).toBe(3);
  await expect(darConvites(bd, adm, jogador.id, 0)).rejects.toThrow();
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npm test -- src/auth/permissoes src/dominio/equipe`
Expected: FAIL por módulo inexistente.

- [ ] **Step 3: Implementar `permissoes.ts` e `equipe.ts`**

Só contas no estado `ativo` têm permissões.

- [ ] **Step 4: Rodar e ver passar**

Run: `npm test -- src/auth/permissoes src/dominio/equipe`
Expected: PASS.

- [ ] **Step 5: Criar `/equipe` e `npm run adm:criar`**

`/equipe` lista membros com apelido, papel, estado, quem convidou e convites, com as ações que a pessoa pode fazer. `criar-adm.ts <steamid64>` cria ou promove a conta do dono a Adm no estado `aguardando_verificacao`, para ele também passar pela verificação. Só funciona pela linha de comando.

- [ ] **Step 6: Commit**

```bash
git add site/
git commit -m "feat: papeis, equipe e primeiro adm"
```

---

### Task 6: Menu lateral, redirecionamentos e visual

**Files:**
- Create: `site/src/auth/destino.ts`, `site/src/proxy.ts` ou o arquivo equivalente da versão do Next, `site/src/estilos/`, `site/src/app/layout.tsx`, `site/src/app/(membros)/layout.tsx`, `site/src/app/(membros)/salas/page.tsx`, `mix/page.tsx`, `diversao/page.tsx`, `site/src/app/banido/page.tsx`, `site/src/app/suspenso/page.tsx`
- Modify: `site/src/app/page.tsx`, `site/src/app/convites/page.tsx`, `site/src/app/equipe/page.tsx`, `site/src/app/verificacao/page.tsx`
- Test: `site/src/auth/destino.test.ts`

**Interfaces:**
- Produces: `destinoPara(usuario: Usuario | null, caminho: string): string | null`, que devolve para onde redirecionar ou `null` para deixar passar.

- [ ] **Step 1: Escrever os testes que falham**

```ts
test.each([
  [null, '/salas', '/'],
  [null, '/', null],
  [null, '/equipe', '/'],
  [['aguardando_verificacao', 'jogador'], '/salas', '/verificacao'],
  [['aguardando_verificacao', 'jogador'], '/verificacao', null],
  [['aguardando_verificacao', 'adm'], '/equipe', '/verificacao'],
  [['ativo', 'jogador'], '/', '/salas'],
  [['ativo', 'jogador'], '/verificacao', '/salas'],
  [['ativo', 'jogador'], '/salas', null],
  [['ativo', 'jogador'], '/equipe', '/salas'],
  [['ativo', 'gm'], '/equipe', null],
  [['suspenso', 'jogador'], '/salas', '/suspenso'],
  [['banido', 'jogador'], '/salas', '/banido'],
  [['banido', 'adm'], '/equipe', '/banido'],
  [['banido', 'jogador'], '/banido', null],
])('%j em %s vai para %s', (conta, caminho, esperado) => {
  expect(destinoPara(conta && usuarioCom({ estado: conta[0], papel: conta[1] }), caminho)).toBe(esperado);
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npm test -- src/auth/destino`
Expected: FAIL por módulo inexistente.

- [ ] **Step 3: Implementar `destinoPara` e ligar às páginas**

Toda página protegida chama `lerSessao` no servidor e aplica `destinoPara`, porque uma conta banida precisa perder o acesso na hora.

- [ ] **Step 4: Rodar e ver passar**

Run: `npm test -- src/auth/destino`
Expected: PASS.

- [ ] **Step 5: Portar o visual do formato A**

Levar tokens e componentes de `modelo/opcoes.html` para `site/src/estilos/`: botões laranja e cinza, cartões escuros, painéis e menu lateral com Salas, Mix, Diversão, Convites e, para quem pode, Equipe. Salas, Mix e Diversão mostram por enquanto que chegam na próxima etapa. A página inicial é uma tela simples de entrada com o campo de código, sem título gigante de propaganda.

- [ ] **Step 6: Conferir no navegador**

Rodar `npm run dev` pelo `.claude/launch.json` e abrir no painel do navegador em largura de computador e de celular: página inicial, verificação, salas, convites, equipe, banido e suspenso.
Expected: formato igual ao modelo A, sem rolagem horizontal, sem erro no console.

- [ ] **Step 7: Commit**

```bash
git add site/
git commit -m "feat: menu lateral, redirecionamentos e visual"
```

---

### Task 7: Lista de liberados no servidor e teste de ponta a ponta

**Files:**
- Create: `site/src/dominio/lista.ts`, `site/src/app/api/servidor/lista/route.ts`, `servidor/scripts/atualizar_lista.sh`
- Test: `site/src/dominio/lista.test.ts`

**Interfaces:**
- Produces: `listaDeLiberados(bd: Bd): Promise<string>`, com um SteamID64 por linha.

- [ ] **Step 1: Escrever os testes que falham**

```ts
test('só contas ativas entram na lista', async () => {
  await criarUsuario(bd, { steamid64: STEAM_A, estado: 'ativo' });
  await criarUsuario(bd, { steamid64: STEAM_B, estado: 'aguardando_verificacao' });
  await criarUsuario(bd, { steamid64: STEAM_C, estado: 'suspenso' });
  await criarUsuario(bd, { steamid64: STEAM_D, estado: 'banido' });
  expect(await listaDeLiberados(bd)).toBe(`${STEAM_A}\n`);
});

test('lista vazia é um arquivo vazio', async () => {
  expect(await listaDeLiberados(bd)).toBe('');
});

test('a rota recusa token errado ou ausente', async () => {
  expect((await chamarRota({})).status).toBe(401);
  expect((await chamarRota({ authorization: 'Bearer errado' })).status).toBe(401);
});

test('a rota entrega a lista com o token certo', async () => {
  const resposta = await chamarRota({ authorization: `Bearer ${TOKEN}` });
  expect(resposta.status).toBe(200);
  expect(await resposta.text()).toBe(`${STEAM_A}\n`);
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npm test -- src/dominio/lista`
Expected: FAIL por módulo inexistente.

- [ ] **Step 3: Implementar a lista, a rota e o script**

A rota compara o token de `SERVIDOR_TOKEN` em tempo constante. `atualizar_lista.sh` baixa a lista com `curl -fsS` para um arquivo temporário e só troca `whitelist.cfg` se o download der certo, para uma queda do site não abrir nem esvaziar a lista. O token fica em `/home/cs2/cs2.env`.

- [ ] **Step 4: Rodar e ver passar**

Run: `npm test -- src/dominio/lista`
Expected: PASS.

- [ ] **Step 5: Deixar o Linux enxergar o site (dono)**

Criar `C:\Users\eduar\.wslconfig` com `networkingMode=mirrored` em `[wsl2]` e `hostAddressLoopback=true` em `[experimental]`, e rodar `wsl --shutdown`. Se o Windows perguntar sobre o firewall para o Node, permitir só em rede privada.
Run: `curl -I http://127.0.0.1:3000` dentro do Ubuntu, com o site rodando.
Expected: resposta do site. O servidor de CS2 passa a ser acessado por `127.0.0.1:27015`.

- [ ] **Step 6: Testar de ponta a ponta (dono)**

1. `npm run adm:criar` com o SteamID do dono.
2. Entrar com a Steam, passar pelo simulador e chegar em `/salas`.
3. Gerar um convite em `/convites`.
4. Rodar `atualizar_lista.sh` e conectar no servidor. Expected: entra.
5. Marcar a própria conta como suspensa pelo banco, rodar o script e reconectar. Expected: é expulso, e o site leva para `/suspenso`.
6. Voltar para ativo.

- [ ] **Step 7: Commit**

```bash
git add site/ servidor/scripts/atualizar_lista.sh
git commit -m "feat: lista de liberados no servidor"
```
