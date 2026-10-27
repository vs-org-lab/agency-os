# Sub-projeto 3D — Saúde e marcos — Plano de implementação

**Objetivo:** health score por cliente no dashboard da sala, a partir de quatro sinais, e a tarefa da caixa de celebração no aniversário de cada ano de parceria.

**Arquitetura:**

- Um módulo novo, `apps/web/src/modules/health`, com o domínio puro dos sinais e do score, um leitor que junta as quatro consultas e o varrimento das renovações.
- O score não é guardado. Só os aniversários tratados ficam em `client_milestones`, para serem idempotentes.

**Stack:** a existente, sem dependências novas.

**Spec:** [docs/specs/2026-10-15-health-milestones-design.md](../specs/2026-10-15-health-milestones-design.md)

## Restrições globais

- As dos planos anteriores: TDD; inglês no código e PT-PT na documentação; migrações com dry-run; sem custo; ficheiros pela ferramenta Write (nada de backticks em `node -e`); fronteira de módulos; segredos nunca mostrados.
- **Valores do spec:**
  - **janelas:** pagamentos 12 meses; aprovações e respostas 6 meses; respostas até 14 dias;
  - **escalas:** aprovação 3 dias → 100, 14 dias → 0; resposta 24 h → 100, 168 h → 0; lineares entre os dois;
  - **score:** média arredondada dos sinais com dados; níveis `healthy` ≥ 75, `attention` 50–74, `at_risk` < 50; sem sinais → `null`;
  - **renovação:** tarefa "Enviar caixa de celebração da renovação", vencimento a 7 dias, gestor único ou sem responsável; notas "Caixa de celebração da renovação: monumento, carta, espumante ou alternativa sem álcool." e, com Brand Hub publicado, " Incluir o manual impresso do Brand Hub.";
  - **varrimento:** `milestones-renewal-sweep`, `TZ=Europe/Lisbon 15 8 * * *`, aniversários dos últimos 7 dias, clientes `active`;
  - **datas:** as de Lisboa.
- **Acesso ao score:** quem lê a sala (`roomActor(..., 'read')`) e lê faturação (`canReadBilling`); os outros recebem `null`.

## Foco de revisão

1. **Pagamento feito no próprio dia do vencimento, já depois da meia-noite UTC no verão:** conta pela data de Lisboa. Teste na Task 3 (`payments count on the Lisbon payment date`).
2. **Comentários internos:** nunca contam como pergunta da equipa nem como resposta do cliente. Teste na Task 3 (`only visible team comments and client replies count`).
3. **Aprovação pendente há muito tempo:** conta com os dias decorridos e baixa o sinal. Teste na Task 3 (`pending approvals count with their elapsed days`).
4. **Métrica que desce e valor pior que a linha de base:** progresso 0, nunca negativo. Teste na Task 2 (`outcome progress works in either direction and never goes below zero`).
5. **Aniversário a 29 de fevereiro e varrimento corrido duas vezes:** em anos não bissextos o aniversário é a 28 de fevereiro; uma tarefa por ano. Teste na Task 2 (`anniversaries in the last 7 days, 29 February on the 28th`) e na Task 4 (`the renewal sweep creates one task per client and year`).

---

### Task 1: Esquema

**Ficheiros:** `packages/db/src/schema/milestones.ts`, o enum `client_milestone_kind` (`renewal_anniversary`) em `enums.ts`, a migração gerada (`pnpm generate --name client_milestones`) com RLS e grants à mão, e `packages/db/test/rls/milestones.test.ts`.

**Interfaces:**

- `client_milestones`: `id`, `organization_id`, `client_id` (FK composta com `clients`), `kind`, `year` integer (≥ 1), `task_id` (FK para `tasks`, `set null`), `created_at`; único (`client_id`, `kind`, `year`).
- RLS de leitura com `app.can_read_rooms(organization_id, client_id)`; sem escrita para `authenticated`.

**Passos:**

- [ ] Testes: `room readers read milestones, other clients nothing`; `one milestone per client, kind and year`; `authenticated users cannot write milestones`.
- [ ] FALHA → esquema → gerar → SQL à mão → dry-run mostrado → push → PASSA → commit.

### Task 2: Domínio

**Ficheiros:** `modules/health/domain/{signals.ts,score.ts,anniversaries.ts}` com testes.

**Interfaces:**

- `type Signal = { score: number; detail: SignalDetail }` com `SignalDetail` = `{ kind: 'payments'; onTime: number; total: number } | { kind: 'approvals'; medianDays: number } | { kind: 'responses'; medianHours: number } | { kind: 'outcome'; progress: number; expected: number }`.
- `median(values: number[]) → number | null`.
- `paymentsSignal(requests: { dueDate: string; paidOn: string | null }[]) → Signal | null`.
- `approvalsSignal(days: number[]) → Signal | null`.
- `responsesSignal(hours: number[]) → Signal | null`.
- `outcomeSignal(input: { baseline; target; latest: number | null; createdOn; deadline; today; guarantee: { status; reason } }) → Signal | null` (sem valor → `null`).
- `healthScore(signals: (Signal | null)[]) → { score: number | null; level: 'healthy' | 'attention' | 'at_risk' | null }`.
- `renewalsDue(firstSignedOn: string, today: string) → { year: number; on: string }[]`: aniversários de anos ≥ 1 com data em (hoje − 7 dias, hoje].

**Passos:**

- [ ] Testes:
  - `payments on time share, open overdue requests count as late`;
  - `approval and response scales are linear between their limits` (3 dias 100, 8,5 dias 50, 14 dias 0; 24 h 100, 96 h 50, 168 h 0);
  - `outcome progress works in either direction and never goes below zero` (foco 4; meta atingida pela garantia vale 100; esperado 0 vale 100);
  - `the score averages the signals with data` (níveis em 49, 50, 74, 75; tudo `null` dá `null`);
  - `anniversaries in the last 7 days, 29 February on the 28th` (foco 5; o próprio dia da assinatura não conta).
- [ ] FALHA → implementar → PASSA → commit.

### Task 3: Leitor da saúde

**Ficheiros:** `modules/health/{access.ts,health.ts,testing.ts,server.ts,index.ts}` e `health.db.test.ts`.

**Interfaces:**

- `HealthDeps = { contexts; now? }`.
- `loadClientHealth(claims, clientId, deps) → Promise<ClientHealthView | null>`: `null` sem leitura da sala ou sem `canReadBilling`; senão `{ score; level; signals: { payments; approvals; responses; outcome } }`, cada sinal `Signal | null`.
- As consultas (em contexto de sistema, depois de autorizado):
  - pedidos não anulados com vencimento em [hoje − 12 meses, hoje], com a data de pagamento em Lisboa;
  - aprovações do cliente pedidas nos últimos 6 meses, com a decisão ou hoje;
  - pares (comentário visível da equipa → primeira resposta visível do cliente na mesma versão de prova ou no mesmo documento, até 14 dias depois), de comentários da equipa dos últimos 6 meses; autor da equipa = `profiles.kind = 'internal'`, cliente = `'client'`;
  - o resultado mais recente do cliente, com o último valor.

**Passos:**

- [ ] Testes:
  - `the health of a client combines its four signals`;
  - `payments count on the Lisbon payment date` (foco 1);
  - `only visible team comments and client replies count` (foco 2);
  - `pending approvals count with their elapsed days` (foco 3);
  - `only billing readers of the room see the health` (freelancer e cliente `null`; finanças e fundador veem).
- [ ] FALHA → implementar → PASSA → commit.

### Task 4: Renovações

**Ficheiros:** `modules/health/{renewals.ts,automations.ts}`, registo em `app/api/inngest/functions.ts`, a ação de auditoria `client.renewal_due`, e `renewals.db.test.ts`.

**Interfaces:**

- `sweepRenewals(today: string, deps) → Promise<number>`: para cada cliente `active` com contrato assinado, o primeiro `signed_at` (data de Lisboa) dá os aniversários de `renewalsDue`; para cada um sem linha em `client_milestones`, cria a tarefa (no projeto mais recente do cliente, quando existe), a linha e a auditoria, numa transação por cliente.
- `MILESTONE_FUNCTIONS = [renewalSweep]`.

**Passos:**

- [ ] Testes:
  - `the renewal sweep creates one task per client and year` (foco 5; corrido duas vezes; gestor como responsável; vencimento a 7 dias);
  - `the box includes the printed manual when the client has a published Brand Hub`;
  - `archived clients and the signing day itself get no task`.
- [ ] FALHA → implementar → PASSA → commit.

### Task 5: Cartão no C-01

**Ficheiros:** `components/health/health-card.tsx` e teste; `app/[locale]/c/[clientId]/page.tsx`; mensagens `health.*`.

**Interfaces:**

- `HealthCard({ health: ClientHealthView })`: secção com o título h3 "Saúde"; o score e o nível ("Saudável", "Atenção", "Em risco") ou "Sem dados"; uma linha por sinal:
  - "Pagamentos em dia: {onTime} de {total} pedidos pagos a tempo";
  - "Tempo de aprovação: mediana de {days} dias";
  - "Tempo de resposta: mediana de {hours} horas";
  - "Evolução do resultado: {progress}% da meta com {expected}% do tempo";
  - "Sem dados" quando o sinal é `null`.
- O C-01 mostra o cartão abaixo do cabeçalho quando `loadClientHealth` não é `null`.

**Passos:**

- [ ] Testes: `the card shows the score, the level and each signal`; `levels at their limits and no data`.
- [ ] FALHA → implementar → PASSA → lint e typecheck → commit.

### Task 6: Ponta a ponta e documentação

**Ficheiros:** `apps/web/e2e/health.spec.ts`, `docs/STATUS.md`.

**Passos:**

- [ ] E2E (cliente de `seedDeliveredProject` ou `seedSignedContract` com um pedido pago): o fundador abre o C-01 e vê o cartão "Saúde" com o score e a linha dos pagamentos; axe no C-01.
- [ ] `docs/STATUS.md`: linha do 3D, exclusões do spec §3 e a linha do 3C em staging.
- [ ] Suite → PASSA → commit.
