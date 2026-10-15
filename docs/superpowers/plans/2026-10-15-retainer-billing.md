# Sub-projeto 3B.2 — Retainers: faturação mensal — Plano de implementação

> **Para agentes:** SUB-SKILL OBRIGATÓRIA: usar `superpowers:subagent-driven-development` ou `superpowers:executing-plans` para executar este plano tarefa a tarefa. Os passos usam caixas (`- [ ]`) para acompanhamento.

**Objetivo:** cobrar cada mês do retainer e cada pedido extra aprovado com os pedidos de pagamento do 1D, e suspender os pedidos do cliente com um pagamento em atraso há mais de 30 dias (RN-62).

**Arquitetura:**

- `payment_requests` passa a ter uma origem: prestação, mês de retainer ou pedido extra.
- O 1D ganha uma emissão genérica (`issuePaymentRequest`) e a escolha do contrato que fixa as partes (`signedContractFor`). As prestações passam a usá-la sem mudar de comportamento.
- O módulo `retainers` emite o mês por um varrimento diário e o extra na aprovação, e mostra os pedidos no C-10 com o bloco de pedido do separador Faturação, extraído para um componente partilhado.

**Stack:** a existente, sem dependências novas.

**Spec:** [docs/superpowers/specs/2026-10-15-retainer-billing-design.md](../specs/2026-10-15-retainer-billing-design.md)

## Restrições globais

- As dos planos anteriores: TDD; inglês no código e PT-PT na documentação; migrações com dry-run; sem custo; sem atribuição a IA; ficheiros pela ferramenta Write; fronteira de módulos (o `retainers` usa o `billing` só pelo `index.ts` e pelo `server.ts`); segredos nunca mostrados.
- **Valores do spec:**
  - **varrimento:** `TZ=Europe/Lisbon 0 7 * * *`, função `retainers-billing`;
  - **vencimento:** `REQUEST_DUE_DAYS` (7) do 1D;
  - **designação pt-PT:** `Retainer {tier} · {mês} de {ano}` (mês por extenso em minúsculas) e `Pedido extra: {descrição}`;
  - **designação en:** `Retainer {tier} · {Month} {year}` e `Extra request: {description}`;
  - **suspensão:** um pedido `sent` com `due_date` anterior a hoje − 30 dias (31 dias de atraso suspende, 30 não);
  - **mês:** o de Lisboa, `YYYY-MM-01`.
- **Acesso:**
  - **ler a faturação do retainer:** `can_read_billing` (fundador, finanças, gestor de projeto);
  - **escrever:** `can_write_billing` (fundador, finanças), pelas ações existentes do 1D;
  - **portal:** sem mudanças.
- **Recusas novas:** `suspended` em `requestWork`.

## Foco de revisão

1. **Varrimento corrido duas vezes no mesmo dia, ou em paralelo:** um só pedido por mês. Teste na Task 3 (`the sweep issues the month once even when run twice`).
2. **Extra aprovado sem contrato assinado:** a decisão é registada; o pedido é emitido pelo varrimento quando houver contrato. Teste na Task 3 (`an approved extra without a signed contract is billed by the sweep later`).
3. **Retainer numa moeda diferente da do contrato:** o pedido usa o valor e a moeda do retainer; os dados bancários continuam os da entidade. Teste na Task 3 (`the month is billed in the retainer's currency`).
4. **Pedido de um mês anulado:** não volta a ser emitido. Teste na Task 3 (`a voided month is not billed again`).
5. **Pagamento de um pedido de retainer num negócio ainda em 2.1:** o negócio não se move e nenhuma prestação muda. Teste na Task 2 (`a retainer payment leaves the deal and its milestones alone`).

---

### Task 1: Esquema

**Ficheiros:**

- `packages/db/src/schema/billing.ts`;
- a migração gerada (`pnpm generate --name retainer_billing`) com o CHECK e os únicos escritos à mão se o gerador não os produzir;
- `packages/db/test/rls/retainer-billing.test.ts`;
- `createRetainerBillingFixture(sql, world)` em `fixtures.ts`: `createRetainerFixture` mais o contrato do negócio do cliente A assinado com os dados do cliente na proposta (como `createDeliveryFixture`), e o projeto do retainer ligado a esse negócio (`projects.deal_id`). Devolve `{ retainer: RetainerFixture; dealId; contractId }`.

**Interfaces:**

- `payment_requests`:
  - `milestone_id` opcional;
  - `retainer_id uuid`, `retainer_month date`, `retainer_extra_request_id uuid`;
  - FKs (`retainer_id`, `client_id`) → `retainers` (id, client_id) e (`retainer_extra_request_id`, `client_id`) → `retainer_extra_requests` (id, client_id), `on delete restrict`;
  - CHECK `payment_requests_origin`: `num_nonnulls(milestone_id, retainer_month, retainer_extra_request_id) = 1 and (retainer_month is null or (retainer_id is not null and extract(day from retainer_month) = 1)) and (retainer_extra_request_id is null or retainer_id is not null)`;
  - únicos: `payment_requests_retainer_month_key` (`retainer_id`, `retainer_month`) e `payment_requests_retainer_extra_key` (`retainer_extra_request_id`).
- Sem mudanças de RLS, grants ou vistas.

**Passos:**

- [ ] Testes:
  - `a payment request has exactly one origin` (prestação + mês recusado; nenhum recusado; extra sem `retainer_id` recusado; mês no dia 2 recusado);
  - `a retainer month and an extra request are billed at most once`;
  - `the portal view does not expose the origin` (colunas de `portal_payment_requests` sem `retainer_id` nem `milestone_id`).
- [ ] FALHA → esquema → gerar → SQL à mão → `npx supabase db push --dry-run` mostrado → push → PASSA → testes do 1D (`apps/web/src/modules/billing`) verdes → commit.

### Task 2: Emissão genérica, partes e pagamento sem prestação

**Ficheiros:** `modules/billing/{requests.ts,parties.ts,payments.ts,index.ts}` e os testes `parties.db.test.ts` e `payments.db.test.ts`.

**Interfaces:**

- `type PaymentRequestOrigin = { kind: 'milestone'; milestoneId } | { kind: 'retainer_month'; retainerId; month } | { kind: 'retainer_extra'; retainerId; extraRequestId }`.
- `issuePaymentRequest(tx, input: { organizationId; clientId; dealId; contractId; label; amount; currency; origin: PaymentRequestOrigin }, deps: Pick<BillingDeps, 'storage' | 'appBaseUrl'>, now: Date) → Promise<string>`:
  - o corpo atual de `issueRequest` sem a mudança da prestação;
  - a auditoria `payment_request.sent` leva a origem nos metadados;
  - `issueRequest(tx, milestone, deps, now)` passa a chamá-la e depois marca a prestação `requested`.
- `signedContractFor(tx, { clientId; dealId: string | null }) → Promise<{ contractId; dealId; locale: Locale } | null>`: o contrato `signed` do negócio indicado, senão o `signed` mais recente do cliente (por `signed_at`), senão `null`. Só conta um contrato cuja proposta tem `client_details`.
- `applyReconciledPayment`: atualiza a prestação só com `milestone_id`; a contagem do primeiro pagamento para 2.1 → 2.2 conta só pedidos com `milestone_id`, e só corre para um pedido com prestação.
- Exportados em `index.ts`: `issuePaymentRequest`, `signedContractFor`, `REQUEST_DUE_DAYS`, `PaymentRequestOrigin`.

**Passos:**

- [ ] Testes:
  - `parties come from the project's deal contract, else the latest signed contract, else none`;
  - `a retainer payment leaves the deal and its milestones alone` (foco 5: negócio em 2.1, pedido de retainer pago por `recordPayment`, o negócio continua em 2.1 e as prestações não mudam);
  - os testes existentes de `requests.db.test.ts` e `payments.db.test.ts` continuam verdes (a emissão por prestação não muda).
- [ ] FALHA → implementar → PASSA → commit.

### Task 3: Faturação do retainer

**Ficheiros:**

- `modules/retainers/domain/labels.ts` com teste;
- `modules/retainers/billing.ts` e `billing.db.test.ts`;
- `modules/retainers/{access.ts,extras.ts,automations.ts,server.ts,testing.ts}`;
- `modules/billing/server.ts` (exporta `billingIssueDeps()` → `{ storage, appBaseUrl }`).

**Interfaces:**

- `retainerMonthLabel(locale: Locale, tier: string, month: string) → string` e `retainerExtraLabel(locale: Locale, description: string) → string`, com os textos das restrições globais.
- `RetainersDeps` ganha `billing: Pick<BillingDeps, 'storage' | 'appBaseUrl'>`; `retainerDeps(sql)` em `testing.ts` usa um armazenamento em memória.
- `issueRetainerRequests(tx, retainerId: string, today: string, deps: RetainersDeps) → Promise<{ months: number; extras: number }>`:
  - com o retainer bloqueado; sem contrato (`signedContractFor` com o `deal_id` do projeto) devolve zeros;
  - mês: se o retainer está `active`, `lisbonMonth` de hoje ≥ `starts_on` e não há pedido para (`retainer_id`, mês), emite pelo valor e moeda do retainer;
  - extras: cada pedido extra `approved` com orçamento e sem pedido de pagamento, em qualquer estado do retainer.
- `sweepRetainerBilling(today: string, deps) → Promise<number>`: corre `issueRetainerRequests` em cada retainer ativo ou com extras aprovados por emitir, um por transação, e devolve o número de pedidos emitidos.
- `decideExtra`: ao aprovar, chama `issueRetainerRequests` na mesma transação.
- `RETAINER_FUNCTIONS` ganha `retainers-billing` (cron das restrições globais) com `step.run` por varrimento e `requestFlush` no fim.

**Passos:**

- [ ] Testes:
  - `labels name the month and the extra in each locale` (pt-PT: `Retainer Essencial · outubro de 2026`; en: `Retainer Essencial · October 2026`; `Pedido extra: Campanha de Natal`; `Extra request: Campanha de Natal`);
  - `the sweep issues the month once even when run twice` (foco 1; o pedido tem `retainer_month`, o valor 1500.00 EUR, vencimento a 7 dias e o PDF guardado);
  - `the month is not billed before the start or after the end`;
  - `a voided month is not billed again` (foco 4);
  - `the month is billed in the retainer's currency` (foco 3: retainer em USD com contrato em EUR);
  - `a retainer without a signed contract is not billed`;
  - `approving an extra request bills its quote at once`;
  - `an approved extra without a signed contract is billed by the sweep later` (foco 2).
- [ ] FALHA → implementar → PASSA → commit.

### Task 4: Suspensão (RN-62)

**Ficheiros:** `modules/billing/overdue.ts` (exportado em `index.ts`), `modules/retainers/{requests.ts,portal.ts}`, `components/retainers/portal-retainer.tsx`, `app/[locale]/retainer-actions.ts` e as mensagens.

**Interfaces:**

- `clientPaymentsSuspended(tx, clientId: string, today: string) → Promise<boolean>`: existe um pedido `sent` do cliente com `due_date < today − 30 dias`.
- `requestWork` devolve `{ ok: false; rule: 'suspended' }` antes de bloquear o retainer.
- `PortalRetainerView` ganha `suspended: boolean`; o P-10 mostra `retainers.portal.suspended` e não mostra o formulário quando é `true`.
- Mensagens (pt-PT e en):
  - `retainers.portal.suspended`: "Há um pagamento em atraso há mais de 30 dias. Os pedidos novos ficam suspensos até ser regularizado." / "A payment is more than 30 days overdue. New requests are on hold until it is settled.";
  - `retainers.errors.suspended`: o mesmo texto.

**Passos:**

- [ ] Testes:
  - `requests are suspended by a payment more than 30 days overdue` (31 dias recusa com `suspended`; 30 dias aceita; um pedido pago ou anulado não suspende);
  - `the portal view reports the suspension`;
  - P-10: `a suspended client sees the notice instead of the form`.
- [ ] FALHA → implementar → PASSA → commit.

### Task 5: Faturação no C-10

**Ficheiros:**

- `components/billing/request-block.tsx` (o `RequestBlock` e o seu `Feedback`, extraídos de `billing-section.tsx`, que passa a importá-lo);
- `modules/billing/workspace.ts` (exporta `paymentRequestViews(tx, requests, today)`, usado por `getDealBilling`);
- `modules/retainers/billing-view.ts` e `server.ts`;
- `components/retainers/retainer-billing.tsx` com teste;
- `app/[locale]/c/[clientId]/retainer/page.tsx`;
- mensagens `retainers.billing.*`.

**Interfaces:**

- `loadRetainerBilling(claims, clientId, deps) → Promise<RetainerBillingView | null>`: `null` para quem não lê faturação ou sem retainer; `RetainerBillingView = { canWrite: boolean; contractMissing: boolean; requests: (PaymentRequestView & { label: string; origin: 'month' | 'extra' })[] }`, do mais recente para o mais antigo.
- `RetainerBilling({ view, actions: BillingActions })`: título `retainers.billing.title` ("Faturação"), aviso `retainers.billing.noContract` ("Sem contrato assinado com este cliente: o OS não emite os pedidos do retainer."), vazio `retainers.billing.empty` ("Ainda não há pedidos de pagamento."), um `RequestBlock` por pedido com a designação; as ações são as de `pipeline/[dealId]/billing/actions.ts`.
- O C-10 mostra a secção abaixo dos pedidos extra quando `loadRetainerBilling` não é `null`.

**Passos:**

- [ ] Testes:
  - `billing-section.test.tsx` continua verde;
  - `the retainer billing lists month and extra requests with their actions`;
  - `without a signed contract the team is told why nothing is billed`;
  - `a reader without write sees no actions`;
  - DB: `only billing readers load the retainer billing` (freelancer `null`, gestor só leitura, finanças escrita).
- [ ] FALHA → implementar → PASSA → lint e typecheck → commit.

### Task 6: Ponta a ponta e documentação

**Ficheiros:**

- `apps/web/e2e/support/retainers.ts`: `seedRetainerClient(organizationId)` sobre `seedSignedContract`, com um projeto ligado ao negócio, um retainer de 2 peças e um pedido extra `requested`; devolve `{ clientId; decisionMakerEmail; extraDescription }`;
- `apps/web/e2e/retainer-billing.spec.ts`;
- `docs/STATUS.md`.

**Passos:**

- [ ] E2E:
  - o fundador orça o pedido extra a 150 EUR no C-10;
  - o decisor aprova no P-10;
  - o decisor vê em Faturas do portal o pedido "Pedido extra: …" de 150,00 €;
  - o fundador vê o mesmo pedido na Faturação do C-10 com "Registar pagamento";
  - axe no C-10 e em Faturas do portal.
- [ ] `docs/STATUS.md`: linha do 3B.2 e exclusões do spec §3.
- [ ] Suite inteira → PASSA → commit.
