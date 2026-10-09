# Sub-projeto 1D — Faturação e pagamentos

| Campo                   | Valor                                                                                                                         |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| Data                    | 2026-10-09                                                                                                                    |
| Estado                  | Aprovado (luz verde permanente do fundador, 2026-10-09)                                                                       |
| Vaga                    | 1 (1A Comercial → 1B Diagnóstico → 1C Documentos e contratos → **1D Faturação**)                                              |
| Módulos                 | M05 Faturação e pagamentos (RF-040 a RF-046), M06 (P-06 Faturas)                                                              |
| Documentação de produto | `docs/product/01` (M05), `02` (S-10, P-06), `04` (RN-04, RN-30 a RN-34), `07` (AUT-12, 13, 18 a 20), `08` (matriz, SEC-81, 82) |
| Depende de              | [1C Proposta, contrato e assinatura](2026-10-09-contracts-design.md), decisão de pagamentos de 2026-10-09 em `docs/STATUS.md` |

## 1. Objetivo

Cobrar o que o contrato diz. O OS cria o plano de pagamentos a partir da opção assinada e emite pedidos de pagamento não fiscais. Recebe os pagamentos pelo Stripe ou regista-os à mão (transferência, Multicaixa Express). Guarda a fatura legal emitida fora do OS e, com o primeiro pagamento, leva o negócio de 2.1 a 2.2.

## 2. Decisões

1. **O OS nunca emite faturas legais** (RN-30). Emite **pedidos de pagamento** com numeração própria (`PP-2026-0001`) e a menção "Documento não fiscal". A fatura legal (fatura-recibo) é emitida no software certificado pela AT, em Portugal, ou no Portal do Contribuinte da AGT, em Angola. Depois é **registada** no OS com número, data e PDF.
2. **Stripe para EUR, GBP e USD.** "Pagar com cartão" abre uma sessão Stripe Checkout alojada, e o aviso assinado do Stripe concilia o pagamento. **O kwanza não passa pelo Stripe:** o cliente paga por transferência ou Multicaixa Express, com os dados bancários e as instruções da entidade, e o pagamento é registado à mão.
3. **Os dados bancários pertencem à entidade emissora.** O IBAN, o BIC/SWIFT, o banco e as instruções locais aparecem em todos os pedidos dessa entidade.
4. **O fornecedor de pagamentos fica atrás de uma porta** (`stripe` ou `fake`; por defeito `fake`). Sem chaves, o botão de cartão não aparece e tudo funciona com registo manual. Até ao lançamento usa-se só o modo de teste do Stripe ([ADR 0003](../../decisions/0003-zero-cost-until-launch.md)).
5. **A integração por API com o software certificado** (InvoiceXpress ou Moloni) fica para o lançamento. O 1D faz o registo manual da fatura legal.

## 3. Âmbito

### Incluído

1. Dados bancários e instruções de pagamento nas entidades emissoras (Definições › Organização).
2. Plano de pagamentos criado quando o contrato fica assinado, com uma prestação por passo do plano da opção (designação, percentagem, valor).
3. Pedido da primeira prestação criado e enviado ao cliente na assinatura (AUT-12). As seguintes são pedidas pelo fundador ou pelas finanças.
4. Separador **Faturação** no negócio (S-10 resumido): prestações, pedidos, pagamentos e faturas legais. Ações:
   - "Pedir pagamento";
   - "Cobrar" (reenvia o aviso ao cliente, no máximo uma vez por dia);
   - "Registar pagamento";
   - "Conciliar" (para um pagamento por rever);
   - "Registar fatura legal";
   - "Anular pedido".
5. **Portal › Faturas** (P-06): pedidos em aberto e pagos, "Pagar com cartão" (Stripe), dados bancários e instruções, PDF do pedido e, quando registada, PDF da fatura legal.
6. PDF do pedido de pagamento com:
   - os dados das duas partes;
   - o valor e o vencimento;
   - os dados bancários e as instruções locais;
   - um código QR para a página de pagamento no portal.
7. Conciliação automática pelo aviso do Stripe (RN-33): o pedido, o valor e a moeda têm de coincidir; caso contrário, o pagamento fica "por rever". Cada aviso é processado uma única vez (SEC-82).
8. Lembretes (RF-045, AUT-19, RN-34):
   - ao cliente: 3 dias antes do vencimento, e 1, 7, 15 e 30 dias depois;
   - aos 15 e aos 30 dias de atraso, também alerta ao fundador; aos 30 sugere a pausa X.1, mas não a aplica;
   - uma verificação diária às 09:00 de Lisboa envia só o lembrete mais recente em falta, uma única vez.
9. Pipeline: 2.1 → 2.2 exige o primeiro pagamento conciliado (RN-04, AUT-13) e acontece sozinho quando ele chega. As etapas 2.3 e seguintes esperam pelas salas (Vaga 2).
10. Emails:
    - ao decisor do cliente, só com o link para o portal: pedido de pagamento disponível, lembrete antes do vencimento, pagamento em atraso, pagamento recebido;
    - ao fundador: pagamento recebido, pagamento por rever, atraso de 15 dias, atraso de 30 dias.

### Excluído (registado em `docs/STATUS.md`)

| Item                                                                            | Motivo                                                         | Volta quando                              |
| ------------------------------------------------------------------------------- | -------------------------------------------------------------- | ----------------------------------------- |
| Emissão da fatura legal por API (InvoiceXpress ou Moloni)                       | Serviço pago                                                   | Critérios de lançamento                   |
| Pedidos mensais do retainer e débito direto (RF-040 recorrente, RF-043)         | O acompanhamento mensal começa depois da entrega               | Retainers (M12)                           |
| Ligação da prestação à aprovação da fase (RN-32, AUT-16)                        | As fases e as aprovações chegam com as salas                   | Salas e processo (Vaga 2)                 |
| Convite ao portal, kickoff e kit de boas-vindas no primeiro pagamento (AUT-13)  | Dependem das salas e do processo                               | Salas e processo (Vaga 2)                 |
| Emails ao contacto de finanças do cliente                                       | Os utilizadores de finanças do cliente chegam com os convites   | Convites de utilizadores do cliente (M06) |
| Painel Dinheiro (S-09), despesas e subscrições                                  | Prioridade B3                                                  | Vaga 3                                    |
| Referências Multicaixa geradas por gateway (ProxyPay)                           | Exige empresa e banco angolanos                                | Empresa angolana constituída              |
| Notas de crédito                                                                | São emitidas no software certificado; o OS só anula pedidos    | Integração com o software certificado     |

## 4. Fluxo

1. **Assinatura completa (1C, AUT-12).** O evento `contracts.contract.signed` leva a faturação a:
   - criar o plano a partir da opção aceite;
   - criar o pedido da primeira prestação, com vencimento a 7 dias (uma única vez por contrato);
   - enviar ao decisor "Pedido de pagamento disponível", respeitando as horas de silêncio.
2. **Portal › Faturas.** O cliente vê o pedido e descarrega o PDF. Depois escolhe como pagar:
   - "Pagar com cartão", que abre o Stripe Checkout (EUR, GBP, USD);
   - transferência para os dados bancários;
   - em kwanzas, transferência ou Multicaixa Express, seguindo as instruções da entidade.
3. **Stripe.** O aviso assinado `checkout.session.completed` chega a `/api/stripe/webhook`.
   - Se o pedido, o valor e a moeda coincidem, o pagamento é registado e o pedido fica pago.
   - Caso contrário, o pagamento fica "por rever" e o fundador é alertado.
4. **Registo manual.** O fundador ou as finanças registam o pagamento recebido (meio, valor, data, referência). O registo fica auditado.
5. **Fatura legal.** Com o pedido pago, o fundador emite a fatura-recibo no software certificado ou no portal da AGT e regista-a no OS (emissor, número, data, PDF). O cliente vê-a no portal.
6. **Pipeline (AUT-13).** O primeiro pagamento conciliado move o negócio de 2.1 para 2.2 (ator: sistema).
7. **Prestações seguintes.** "Pedir pagamento" cria o pedido e envia-o. "Anular pedido" exige motivo e só é possível antes do pagamento.

## 5. Dados e acesso

| Tabela               | Campos principais                                                                                                                                                                                                                                                                         |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `legal_entities` (+) | banco, IBAN, BIC/SWIFT, instruções de pagamento locais                                                                                                                                                                                                                                    |
| `billing_counters`   | organização, ano, último número (numeração `PP-AAAA-NNNN` sem colisões em pedidos simultâneos)                                                                                                                                                                                             |
| `billing_milestones` | organização, cliente, negócio, contrato, posição (única por contrato), designação, percentagem, valor, moeda, estado (`pending`, `requested`, `paid`)                                                                                                                                      |
| `payment_requests`   | organização, cliente, negócio, prestação, número (único por organização), valor, moeda, vencimento, estado (`sent`, `paid`, `void`), dados da entidade e do cliente fixados, idioma, caminho do PDF, enviado em, pago em, anulado em e motivo, último lembrete, última cobrança               |
| `payments`           | organização, cliente, pedido, valor, moeda, meio (`stripe`, `bank_transfer`, `multicaixa`, `other`), referência, recebido em, estado (`reconciled`, `review`), registado por, evento do fornecedor (único)                                                                                 |
| `legal_invoices`     | organização, cliente, pedido (único), emissor (`at_certified`, `agt_portal`), número, data, caminho do PDF, registado por                                                                                                                                                                  |

**Acesso**

- RLS forçado em todas as tabelas novas.
  - Leitura: fundador, finanças e gestor de projeto (`app.can_read_billing`), conforme a matriz `invoices`.
  - Escrita: fundador e finanças (`app.can_write_billing`).
- Portal: o decisor e as finanças do cliente leem os pedidos enviados e pagos e as faturas legais. A leitura passa por vistas que expõem só as colunas partilháveis. Pagar é a única ação do cliente.
- Pedidos, pagamentos e faturas legais são escritos por serviços em contexto de sistema, depois de autorizada a pessoa que faz o pedido. Depois de emitido o pedido, os valores e os dados fixados não mudam.

**Ficheiros e configuração**

- Os PDF dos pedidos e das faturas legais (até 10 MB) ficam no bucket privado `billing`. Só se acede a eles por URL assinada de curta duração, depois de verificado o acesso.
- Variáveis de ambiente: `PAYMENTS_PROVIDER` (`stripe` ou `fake`), `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`. Pelo SEC-81, ficam só em `.env.local` e nos segredos do GitHub e da Vercel.

**Eventos**

- `billing.request.sent`
- `billing.request.reminded`
- `billing.request.overdue`
- `billing.request.overdue_alert`
- `billing.payment.received`
- `billing.payment.review`

## 6. Erros e segurança

- O aviso do Stripe só é aceite com assinatura válida. O identificador do evento é único em `payments`, por isso um aviso repetido não cria um segundo pagamento (SEC-82).
- O pedido guarda o valor esperado. Um pagamento com outro valor ou outra moeda nunca é conciliado automaticamente (RN-33).
- O OS nunca vê dados de cartão, porque o Stripe Checkout é alojado pelo Stripe.
- Anular um pedido pago é recusado; a correção faz-se com nota de crédito no software certificado (RN-31).
- Freelancers e operacionais do cliente nunca veem valores, pedidos nem faturas (RN-51, matriz de `08`).
- Os registos não guardam dados pessoais. Os emails levam links para o portal, nunca anexos.

## 7. Testes

- **Unitários:**
  - divisão das prestações (arredondamento, kwanzas);
  - numeração `PP-AAAA-NNNN`;
  - calendário de lembretes;
  - verificação da assinatura do aviso do Stripe;
  - conciliação (pedido, valor, moeda);
  - PDF do pedido;
  - regras do pipeline para 2.2.
- **Base de dados:**
  - RLS e isolamento das tabelas e vistas novas, para cada papel: fundador, finanças, gestor, freelancer, decisor, finanças do cliente, operacional;
  - criação do plano na assinatura;
  - pedir e anular pedidos;
  - registo manual;
  - aviso repetido;
  - pagamento por rever;
  - fatura legal;
  - mudança para 2.2.
- **Ponta a ponta:** do contrato assinado ao pedido no portal, depois o registo manual do pagamento, o registo da fatura legal e o negócio em 2.2; axe nas páginas novas.

## 8. Critérios de aceitação

1. A assinatura completa cria o plano e envia o pedido da primeira prestação, com os dados bancários da entidade.
2. Um pagamento Stripe de teste é conciliado sozinho; um aviso repetido não o duplica.
3. Um pagamento manual fica registado e auditado, e o primeiro pagamento move o negócio para 2.2.
4. A fatura legal registada aparece no portal, e o OS nunca numera faturas legais.
5. Os lembretes saem nos dias certos e uma única vez; os atrasos de 15 e de 30 dias alertam o fundador.
6. Os testes de ponta a ponta e o axe passam em CI e em staging.

## 9. Riscos

| Risco                                          | Mitigação                                                                                               |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| Pedido de pagamento confundido com uma fatura  | "Documento não fiscal" no PDF e no portal; numeração própria `PP-`                                      |
| Aviso do Stripe falsificado ou repetido        | Assinatura obrigatória; evento único; pedido, valor e moeda conferidos                                  |
| Fatura legal esquecida                         | O pedido pago sem fatura legal fica destacado no separador Faturação                                    |
| Conta Stripe sem transferência bancária ativa  | Os dados bancários estão sempre no pedido, e a transferência regista-se à mão                           |
