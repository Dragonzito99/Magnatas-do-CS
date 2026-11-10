# MagCoin, membros e Premium: plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** MagCoin comprada pelo Mercado Pago, itens para sempre, assinaturas Bronze/Prata/Ouro/Premium com vantagens,
envios do Premium e página de apoio — tudo testável em modo de teste do Mercado Pago.

**Architecture:** MagCoin entra no livro-caixa existente (coluna `moeda`). O site nunca confia no aviso do Mercado Pago:
busca o pagamento na API pelo id. Vantagens de membro são **materializadas** no baú (`itens_do_jogador` com
`expira_em = pago_ate`), então loja, baú, visuais e plugin não mudam de regra.

**Tech Stack:** Next.js 16, Drizzle/Postgres (PGlite nos testes), Vitest, API REST do Mercado Pago via `fetch` injetável.

**Spec:** `docs/superpowers/specs/2026-11-10-magcoin-e-apoio-design.md`

## Global Constraints

- Pacotes: `pequeno` R$ 10 = 100, `medio` R$ 25 = 260, `grande` R$ 50 = 550 MagCoins.
- Para sempre: cor/etiqueta/aviso/moldura = 150; mutante = 300 MagCoins.
- Níveis: bronze R$ 5 (+10% Grana, 0 MC), prata R$ 10 (+20%, 50 MC, `cor-dourada`), ouro R$ 15 (+30%, 100 MC,
  `moldura-ouro`), premium R$ 30 (+30%, 200 MC, `moldura-ouro`, itens `lancamento` para sempre, envios).
- Todos os níveis: etiqueta `[APOIADOR]` (item `etiqueta-apoiador`, fora da venda).
- `pago_ate` = data do pagamento + 1 mês + 3 dias. Envio na 1ª, 3ª, 5ª... mensalidade do Premium.
- Endereço: só a pessoa e o Adm; apagado 90 dias após o fim do Premium.
- Segredos: `MP_ACCESS_TOKEN`, `MP_WEBHOOK_SECRET` só no `.env.local`. Nunca em log.
- Valores em centavos (inteiros).

## Review Focus

1. Aviso repetido / fora de ordem: crédito uma vez só (referência = id do pagamento no Mercado Pago).
2. Valor pago diferente do pacote, ou pedido de outra conta: não credita.
3. Estorno depois de gastar: zera e sinaliza, sem saldo negativo.
4. Assinatura cancelada: vantagens até `pago_ate`, depois somem (item vencido, Grana sem bônus).
5. Aviso falso (sem a chave): nada muda, porque tudo vem da API.

---

### Task 1: Banco
`moeda` (`grana`|`magcoin`) em `lancamentos_de_grana`, único (conta, moeda, tipo, referência); tipos novos
`pagamento`, `mensalidade`, `estorno`, `presente`; `usuarios.magcoin` com CHECK >= 0; tabelas `pedidos`, `assinaturas`,
`mensalidades`, `enderecos`, `envios`. Teste de esquema. Commit.

### Task 2: Livro-caixa com duas moedas
`lancarMoeda(tx, {moeda, ...})` (`lancarGrana` vira atalho), `SaldoInsuficiente` para as duas, `extrato(bd, conta,
{moeda})`, `divergencias` por moeda. Testes. Commit.

### Task 3: Compra para sempre com MagCoin
`PRECOS_MAGCOIN`, `comprarParaSempre(bd, usuario, {itemId, codigo})`: cobra MagCoin, `expira_em = null`, recusa item
que já é para sempre e item fora da venda. Catálogo: `etiqueta-apoiador` e `moldura-ouro` (`venda: false`), Blindado
`lancamento: true`. Testes. Commit.

### Task 4: Membros
`NIVEIS`, `nivelAtivo(bd, conta, agora)`, `aplicarMensalidade(tx, assinatura, pagamento)` (estende `pago_ate`, credita MC,
materializa itens do nível e de lançamento, cria envio na mensalidade ímpar do Premium), bônus de Grana em `lancarXp`.
Testes. Commit.

### Task 5: Mercado Pago
`src/pagamento/mercadopago.ts` com `fetch` injetável: `criarPreferencia`, `buscarPagamento`, `criarAssinatura`,
`buscarAssinatura`, `buscarPagamentoAutorizado`, `cancelarAssinatura`; `assinaturaConfere(cabecalhos, dataId, segredo)`
(`id:{dataId};request-id:{x-request-id};ts:{ts};`, HMAC-SHA256 hex). Domínio: `abrirPedido`, `processarPagamento`
(crédito/estorno), `assinar`, `processarMensalidade`, `processarAssinatura`. Rota `POST /api/pagamentos/mercadopago`.
Testes com Mercado Pago falso. Commit.

### Task 6: Telas
`/apoio` (pacotes, níveis, assinar com e-mail do Mercado Pago, cancelar, endereço e envios), `/apoio/retorno`, loja com
preço em MagCoin, saldo de MagCoin no cabeçalho, selo no perfil, Painel ADM "Envios" e "Vendas". Conferir no navegador.
Commit.

### Task 7: Segredos e modo de teste
`guardar-segredos-portal.sh` aceita as chaves do Mercado Pago; dono gera as de teste; teste ponta a ponta com o
pagamento de mentira. Publicar só com OK.
