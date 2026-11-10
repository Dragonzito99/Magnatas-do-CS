# MagCoin, membros e Magnata Premium: desenho

Data: 10/11/2026. Segunda etapa da economia (a primeira é `2026-11-09-loja-e-grana-design.md`), combinada com o dono
nesta data. Envolve **dinheiro de verdade**: tudo é construído e testado primeiro no modo de teste do Mercado Pago.

## Para que serve

O dono quer que a comunidade **apoie o clube** e ganhe algo em troca:

1. **MagCoin**: comprada no site com dinheiro de verdade; compra os itens da loja **para sempre**.
2. **Membro** (Bronze, Prata, Ouro): apoio mensal de R$ 5, 10 ou 15, com vantagens.
3. **Magnata Premium**: R$ 30 por mês, com tudo do Ouro, os **itens de lançamento para sempre** e **produtos do clube em
   casa** a cada 2 meses.
4. Uma **página de apoio** que junta tudo.

## Decisões do dono

- Pagamento pelo **Mercado Pago** (conta PJ do CNPJ dele): PIX e cartão, e cobrança mensal automática.
- **Pacotes de MagCoin**: R$ 10 = 100, R$ 25 = 260, R$ 50 = 550.
- **Preço para sempre**: cor, etiqueta, aviso e moldura = 150 MagCoins; mutante Blindado = **300** MagCoins.
- **Membros** (mensal):

| | Bronze R$ 5 | Prata R$ 10 | Ouro R$ 15 | Premium R$ 30 |
|---|---|---|---|---|
| Selo no perfil | Bronze | Prata | Ouro | Premium |
| Etiqueta `[APOIADOR]` no chat | sim | sim | sim | sim |
| Grana a mais por partida | +10% | +20% | +30% | +30% |
| MagCoins por mês | — | 50 | 100 | 200 |
| Item liberado enquanto for membro | — | uma cor do nome | moldura exclusiva Ouro | moldura exclusiva Ouro |
| Itens de lançamento para sempre | — | — | — | sim |
| Produtos em casa | — | — | — | a cada 2 meses |

## Fora do escopo

- Nota fiscal: fica com o dono e o contador. O site dá um relatório das vendas no Painel ADM para isso.
- Transferir MagCoin entre jogadores, presentear, revender. Não existe.
- Devolver MagCoin em dinheiro.
- Cartão guardado no site: o site nunca vê número de cartão; tudo acontece na página do Mercado Pago.

## O que seria um fracasso mesmo funcionando

- MagCoin creditada sem o pagamento aprovado, ou creditada duas vezes pelo mesmo pagamento.
- Confiar no que chega no aviso do Mercado Pago sem conferir na API dele (qualquer um poderia mandar um aviso falso).
- Membro que parou de pagar continuar com as vantagens; ou membro que pagou não receber.
- Endereço de assinante visível para quem não é Adm, ou guardado depois de não precisar mais.
- Chave do Mercado Pago no código, no chat ou em log.

## MagCoin

- Segunda moeda no **mesmo livro-caixa** da Grana: a tabela ganha a coluna `moeda` (`grana` | `magcoin`), e a conta
  ganha `usuarios.magcoin` com a regra do banco `magcoin >= 0`. Tudo o que protege a Grana vale igual: linha nunca
  editada, referência única por (conta, moeda, tipo, referência), saldo mudado na mesma transação, conferência no Painel.
- Tipos novos: `pagamento` (crédito de um pacote), `mensalidade` (as MagCoins do mês do membro), `estorno`.
- **Compra com MagCoin** usa a mesma tela da loja: além dos 4 preços em Grana, o item mostra "Para sempre: N MagCoins".
  O item vai para o baú sem prazo (`expira_em` vazio). Item que já é para sempre não pode ser comprado de novo.

## Pagamentos (Mercado Pago)

- **Pacotes**: Checkout Pro. O site cria um pedido (`pedidos`: conta, pacote, valor, estado), pede ao Mercado Pago a
  página de pagamento com `external_reference` = id do pedido, e leva o jogador para lá (PIX ou cartão).
- **Aviso de pagamento** (`POST /api/pagamentos/mercadopago`): o site confere a assinatura do aviso (chave secreta do
  webhook) e **busca o pagamento na API do Mercado Pago** pelo id. Só credita se o pagamento estiver `approved`, o
  `external_reference` for um pedido aberto e o valor bater com o pacote. A referência da linha é o id do pagamento:
  o mesmo aviso duas vezes credita uma vez.
- O jogador volta para o site numa tela "pagamento em análise / aprovado"; o crédito vem do aviso, não da volta.
- **Estorno ou contestação** (`refunded`, `charged_back`): tira as MagCoins daquele pagamento até o saldo zerar. Se não
  der para tirar tudo, a conta aparece no Painel ADM para o Adm decidir. Nada é apagado.

## Membros e Premium (assinaturas)

- Cada nível é um **plano de assinatura** no Mercado Pago (cobrança mensal automática, cartão). O jogador assina pela
  página de apoio; pode cancelar no site a qualquer momento.
- Tabela `assinaturas`: conta, nível, id da assinatura no Mercado Pago, estado, `pago_ate`.
- A cada **mensalidade aprovada** (conferida na API, como os pacotes): `pago_ate` = data do pagamento + 1 mês + 3 dias
  de folga; credita as MagCoins do mês (referência = id do pagamento); no Premium, dá para sempre os itens marcados
  como lançamento e conta um mês para os envios.
- As vantagens valem enquanto `pago_ate` não passou. Cancelou ou parou de pagar: vale até o fim do que já pagou.
- Trocar de nível: cancela a assinatura atual e assina a nova (o que já foi pago vale até o fim).
- **Grana a mais** entra no cálculo da Grana da partida: `floor(xp / 10 × (1 + bônus))`, com o nível do dia da partida.
- **Etiqueta `[APOIADOR]`** e **selo**: entram nos visuais. A etiqueta comprada na loja, se estiver em uso, tem
  prioridade; senão aparece a de apoiador.
- **Itens liberados enquanto for membro** (a cor da Prata, a moldura exclusiva Ouro): aparecem no baú como "do
  membro", sem prazo próprio, e somem do uso quando a assinatura acaba.
- **Itens de lançamento**: o catálogo marca itens com `lancamento: true`. Hoje: o mutante Blindado.

## Produtos em casa (Premium)

- A cada **2 mensalidades pagas** do Premium, nasce um envio pendente para aquela conta.
- O assinante cadastra o **endereço** na página de apoio (nome de quem recebe, CEP, rua, número, complemento, bairro,
  cidade, UF, telefone para a transportadora). Só a própria pessoa e o Adm veem.
- Painel ADM, parte **Envios**: os pendentes com endereço; o Adm marca "enviado" com o código de rastreio. O assinante
  vê no site que o pacote saiu e o código.
- O endereço é apagado 90 dias depois do fim do Premium (a varredura do site cuida disso).

## Página de apoio

- `/apoio`, no menu da Magnata Shop ("Apoie o clube"): os três pacotes de MagCoin, os quatro níveis lado a lado como a
  tabela acima, perguntas frequentes (como pagar, como cancelar, quando chega a MagCoin, o que é item de lançamento).
- Quem já é membro vê o nível, até quando vale, o botão de cancelar, e (no Premium) o endereço e os envios.

## Segurança

- Chaves do Mercado Pago (`MP_ACCESS_TOKEN`, `MP_WEBHOOK_SECRET`) só no `.env.local` do VPS, gravadas pelo dono com o
  script de segredos. Primeiro as de **teste**; as de produção só depois de tudo aprovado.
- O aviso de pagamento não confia no corpo: confere a assinatura e consulta a API.
- Todo crédito, estorno e envio vai para a auditoria.

## Testes que provam

- Pacote aprovado credita uma vez, mesmo com o aviso repetido; pendente ou recusado não credita.
- Valor diferente do pacote ou pedido de outra conta não credita.
- Aviso com assinatura errada é recusado sem consultar nada.
- Estorno tira as MagCoins; sem saldo, zera e aparece no Painel.
- Compra com MagCoin dá o item para sempre e não deixa saldo negativo.
- Mensalidade aprovada estende `pago_ate`, credita as MagCoins do mês uma vez e (Premium) dá os itens de lançamento.
- Vantagens somem depois de `pago_ate`.
- Bônus de Grana certo por nível.
- Envio nasce a cada 2 mensalidades do Premium; endereço só para a pessoa e o Adm; apagado depois de 90 dias.

## Ordem

1. Banco e regras (MagCoin, pedidos, assinaturas, envios) com testes.
2. Integração com o Mercado Pago em **modo de teste** (o dono gera as chaves de teste).
3. Página de apoio, compra com MagCoin na loja, Painel (Envios, relatório de vendas).
4. Teste completo com o pagamento de mentira do Mercado Pago (PIX e cartão de teste, assinatura de teste).
5. Com o OK do dono: chaves de produção e publicar.

## Decisões minhas (o dono pode mudar)

- 3 dias de folga depois do vencimento da mensalidade, para o cartão ter tempo de passar.
- O envio nasce a cada 2 mensalidades pagas (e não no primeiro mês), para ninguém assinar um mês só para receber.
- A etiqueta comprada tem prioridade sobre a `[APOIADOR]`.
- Endereço apagado 90 dias depois do fim do Premium.
- O pacote de MagCoin é pago uma vez (PIX ou cartão); as assinaturas são mensais no cartão, que é o que o Mercado Pago
  aceita para cobrança automática.
