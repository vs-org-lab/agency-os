# Sub-projeto 3B.2 — Retainers: faturação mensal

| Campo                   | Valor                                                                                          |
| ----------------------- | ---------------------------------------------------------------------------------------------- |
| Data                    | 2026-10-15                                                                                     |
| Estado                  | Aprovado (luz verde permanente do fundador)                                                    |
| Vaga                    | 3 (3A Dinheiro → 3B.1 Retainers → **3B.2 Retainers: faturação mensal** → 3C …)                 |
| Módulos                 | M05 (RF-040 recorrente), M12, C-10 (faturação), P-10 (suspensão), P-06                         |
| Documentação de produto | `01` (RF-040, RF-043, M12), `04` (RN-30, RN-33, RN-60 a RN-62), `07` (AUT-18 a AUT-20), `08`   |
| Depende de              | [1D Faturação](2026-10-09-billing-design.md), [3B.1 Retainers](2026-10-15-retainers-design.md) |

## 1. Objetivo

Cobrar o retainer todos os meses e cobrar o pedido extra aprovado, com os pedidos de pagamento do 1D: a mesma numeração, o mesmo PDF, os mesmos lembretes, o Stripe ou o registo manual, e o mesmo separador Faturas no portal. Com um pagamento em atraso há mais de 30 dias, o cliente deixa de poder fazer pedidos novos (RN-62).

## 2. Decisões

1. **Um pedido de pagamento tem uma origem.** Até aqui, todo o pedido vinha de uma prestação do contrato. Passa a vir de uma de três origens:
   - uma prestação (`milestone_id`), como no 1D;
   - um mês de retainer (`retainer_id` e `retainer_month`);
   - um pedido extra aprovado (`retainer_id` e `retainer_extra_request_id`).

   A base de dados exige exatamente uma origem. Um mês de retainer e um pedido extra têm no máximo um pedido de pagamento cada. Anular o pedido de um mês ou de um extra quer dizer "não se cobra": o OS não o volta a emitir.

2. **As partes vêm de um contrato assinado do cliente.** O cliente não tem morada nem dados fiscais próprios no OS. Os dados fixados no pedido vêm de um contrato assinado, como no 1D:
   - o emissor e os dados bancários: a entidade do contrato;
   - o cliente: os dados da proposta aceite;
   - o idioma do pedido: o do contrato.

   O contrato escolhido é o do negócio do projeto do retainer, se estiver assinado; senão, o contrato assinado mais recente do cliente. O pedido fica ligado ao negócio desse contrato (`deal_id` continua obrigatório). Sem contrato assinado, o OS não emite e o C-10 diz porquê.

3. **O mês é cobrado no próprio mês, inteiro.** Um varrimento diário às 07:00 de Lisboa emite, para cada retainer ativo, o pedido do mês corrente se ainda não existir e se o mês não for anterior ao início. Não há proração: o início já é sempre o primeiro dia de um mês. O valor é o valor mensal no momento da emissão; uma alteração do valor conta a partir do pedido seguinte. Meses anteriores ao primeiro varrimento não são emitidos.
4. **O pedido extra é cobrado quando o decisor o aprova.** A emissão acontece na mesma transação da decisão, pelo valor e moeda orçados. Se nesse momento não houver contrato assinado, o varrimento diário emite-o quando passar a haver.
5. **O vencimento é o do 1D:** 7 dias depois da emissão. Os lembretes (AUT-19), o email do pedido (AUT-18) e a conciliação (AUT-20, RN-33) não mudam.
6. **Só as prestações movem o pipeline.** O pagamento de um pedido de retainer marca o pedido como pago e emite `billing.payment.received`, mas não conta para a passagem de 2.1 para 2.2 nem toca em prestações.
7. **Designação do pedido, no idioma do contrato:**
   - mês: "Retainer Essencial · outubro de 2026" / "Retainer Essencial · October 2026";
   - extra: "Pedido extra: Campanha de Natal" / "Extra request: Campanha de Natal".
8. **Suspensão (RN-62).** Se o cliente tiver um pedido de pagamento enviado com vencimento há mais de 30 dias, o P-10 mostra o aviso de suspensão e esconde o formulário, e o serviço recusa pedidos novos com `suspended`. O consumo registado pela equipa e as decisões sobre pedidos extra já orçados continuam.
9. **Onde a equipa trabalha os pedidos do retainer:** numa secção Faturação no C-10, para quem lê faturação (fundador, finanças, gestor de projeto). Mostra os pedidos dos meses e dos extras com as mesmas ações do separador Faturação do negócio: cobrar, anular, registar pagamento, conciliar e registar a fatura legal. Escrevem o fundador e as finanças. O bloco do pedido é extraído do separador do negócio para um componente partilhado.

## 3. Âmbito

### Incluído

- **Dados:** origem do pedido de pagamento (prestação, mês de retainer ou pedido extra) com as restrições de unicidade e de origem única.
- **Lógica:**
  - emissão genérica de pedidos no 1D, usada pelas prestações e pelo retainer;
  - escolha do contrato que fixa as partes;
  - emissão do mês e dos extras aprovados, com auditoria;
  - pagamento de pedidos sem prestação, sem efeito no pipeline;
  - suspensão de pedidos do cliente (RN-62).
- **Automação:** varrimento diário `retainers-billing` às 07:00 de Lisboa.
- **Ecrãs:**
  - C-10: secção Faturação com os pedidos do retainer e o aviso de falta de contrato;
  - P-10: aviso de suspensão;
  - P-06: sem mudanças; os pedidos do retainer aparecem pela vista existente.
- **E2E:** o decisor aprova um pedido extra orçado e vê o pedido de pagamento em Faturas no portal; a equipa vê-o na Faturação do C-10.

### Excluído (registado em `docs/STATUS.md`)

| Item                                                    | Motivo                                               | Quando      |
| ------------------------------------------------------- | ---------------------------------------------------- | ----------- |
| Débito direto (RF-043)                                  | Exige um serviço de pagamentos com SEPA              | Pedido real |
| Emissão de meses anteriores ao primeiro varrimento      | O mês corrente cobre o uso normal                    | Pedido real |
| Proração de meses incompletos                           | O retainer começa sempre no primeiro dia de um mês   | Pedido real |
| Pedidos do retainer no separador Faturação do negócio   | A secção Faturação do C-10 é o sítio do retainer     | Pedido real |
| Dados fiscais e morada do cliente sem contrato assinado | O contrato assinado já os tem para os clientes do OS | Pedido real |

## 4. Dados e acesso

- `payment_requests`:
  - `milestone_id` passa a opcional;
  - novas colunas `retainer_id`, `retainer_month` (date) e `retainer_extra_request_id`, com chaves estrangeiras compostas com `client_id` para `retainers` e `retainer_extra_requests`;
  - CHECK: exatamente uma de `milestone_id`, `retainer_month` e `retainer_extra_request_id`; `retainer_month` e `retainer_extra_request_id` exigem `retainer_id`; `retainer_month` é o primeiro dia de um mês;
  - únicos: (`retainer_id`, `retainer_month`) e `retainer_extra_request_id`.
- **Acesso:** sem mudanças. A leitura continua com `app.can_read_billing` e o portal continua com `portal_payment_requests`, que não expõe a origem.
- **Eventos:** os do 1D (`billing.request.sent`, `billing.payment.received` e restantes). Sem eventos novos.

## 5. Testes

- **Unitários:**
  - designação do mês e do extra em pt-PT e en;
  - a secção Faturação do C-10 (lista, aviso sem contrato, ações só para quem escreve);
  - o aviso de suspensão no P-10.
- **Base de dados:**
  - restrições: origem única, mês no primeiro dia, um pedido por mês e por extra;
  - escolha do contrato: o do negócio do projeto, o mais recente do cliente, nenhum;
  - varrimento: emite o mês corrente uma vez; não emite antes do início, nem num retainer terminado, nem num mês anulado; emite extras aprovados por emitir;
  - aprovar um pedido extra emite o pedido de pagamento na mesma transação;
  - o pagamento de um pedido de retainer marca-o como pago e não move o negócio de 2.1;
  - RN-62: com um pedido em atraso há 31 dias, o pedido do cliente é recusado com `suspended`; a 30 dias não;
  - o C-10 mostra a faturação só a quem lê faturação.
- **E2E:** o percurso do âmbito, com axe no C-10 e em Faturas do portal.

## 6. Critérios de aceitação

1. Cada retainer ativo com contrato assinado tem um pedido de pagamento por mês, a partir do mês de início, emitido uma única vez.
2. Cada pedido extra aprovado tem um pedido de pagamento pelo valor orçado.
3. Os pedidos do retainer seguem o 1D em numeração, PDF, lembretes, pagamento e portal, e não mexem no pipeline nem nas prestações.
4. Com um pagamento em atraso há mais de 30 dias, o cliente não consegue fazer pedidos novos no P-10.
5. Freelancers e operacionais do cliente continuam sem ver valores nem pedidos de pagamento.
