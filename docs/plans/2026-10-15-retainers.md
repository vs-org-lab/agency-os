# Sub-projeto 3B.1 — Retainers: limites, consumo e pedidos extra — Plano de implementação

**Objetivo:** retainer por projeto com limites mensais e transporte de saldo, consumo visível à equipa e ao cliente, pedidos do cliente que viram tarefa ou pedido extra aprovado no portal, avisos de 80% e 100% e tarefa de revisão anual.

**Arquitetura:**

- Um módulo novo, `apps/web/src/modules/retainers`.
- O disponível de cada limite é calculado no domínio a partir do consumo do mês anterior.
- Os pedidos extra usam a tabela `approvals` do 2D com o sujeito novo `retainer_extra`. Aparecem na lista de "Aprovações" do portal com ligação ao P-10, onde o decisor decide, como o Brand Hub faz.
- Os avisos seguem o padrão de eventos e funções Inngest do 1D. A revisão é um varrimento diário.

**Stack:** a existente, sem dependências novas.

**Spec:** [docs/specs/2026-10-15-retainers-design.md](../specs/2026-10-15-retainers-design.md)

## Restrições globais

- As dos planos anteriores: TDD; inglês no código e PT-PT na documentação; migrações com dry-run; sem custo; nada de backticks em `node -e` nem heredocs longos (usar a ferramenta Write para ficheiros); fronteira de módulos; segredos nunca mostrados.
- **Valores do spec:**
  - **tipos:** `content_pieces`, `campaigns`, `maintenance_hours`, `automations`;
  - **limites e quantidades:** numeric(6,1) > 0;
  - **transporte:** até 20% do limite, só do mês anterior e sem acumular;
  - **avisos:** 80 e 100;
  - **revisão:** 60 dias antes;
  - **estados:** retainer `active`/`ended`; pedido extra `requested` → `quoted` → `approved`/`declined`;
  - **tier:** 1 a 40 caracteres;
  - **mês:** o de Lisboa, guardado como o primeiro dia (`YYYY-MM-01`).
- **Acesso:**
  - **escrever no retainer, consumo e orçamento:** quem escreve na sala (`roomActor(..., 'write')`);
  - **ler:** `can_read_rooms`;
  - **freelancers:** leem o consumo sem o valor mensal;
  - **portal:** o decisor e o operacional pedem e veem; só o decisor decide os pedidos extra.
- **Recusas:** `not_found`, `invalid_input`, `invalid_state` e `limit_reached`.

## Foco de revisão

1. **Transporte quando o mês anterior foi pago só com extra:** o consumo extra não conta para o limite, logo o transporte usa só o consumo dentro do limite. Teste na Task 2 (`extra work does not count against the limit or the carry`).
2. **Dois pedidos do cliente em simultâneo que juntos passam o disponível:** só o que cabe vira tarefa; o outro vira pedido extra. Usar `select … for update` no retainer. Teste na Task 4 (`concurrent requests never exceed the allowance`).
3. **Decisor de outro cliente, ou o operacional, a decidir um pedido extra:** recusado com `not_found`. Teste na Task 4 (`only the client's decision maker decides an extra request`).
4. **Aviso de 80% e 100% no mesmo registo** (de 70% para 105%): os dois avisos, cada um uma vez. Teste na Task 5 (`one usage crossing both thresholds sends both alerts once`).
5. **Retainer com início a meio do mês ou data de revisão já passada ao criar:** o início é normalizado ao primeiro dia; a revisão no passado é recusada. Teste na Task 3 (`retainer dates are normalised and validated`).

---

### Task 1: Esquema

**Ficheiros:**

- `packages/db/src/schema/retainers.ts`;
- enums em `enums.ts`: `retainer_limit_kind`, `retainer_status`, `retainer_extra_status`, e `retainer_extra` em `approval_subject`;
- a migração gerada, com RLS, grants e vistas do portal escritos à mão;
- `packages/db/test/rls/retainers.test.ts`;
- `createRetainerFixture(sql, world)` em `fixtures.ts`: um retainer no projeto da sala A, com limites de `content_pieces` 4 e `maintenance_hours` 10, consumo de 2 peças no mês corrente e um pedido extra `requested`.

**Interfaces:**

- As tabelas e colunas do spec §5, com:
  - FK (`project_id`, `client_id`) para `projects`;
  - unique (`project_id`) em `retainers`;
  - FKs com `client_id` em todas as filhas;
  - CHECKs: `starts_on` é dia 1; `month` é dia 1; `quantity > 0`; `monthly_limit > 0`; `monthly_fee >= 0`; `threshold in (80,100)`.
- **RLS:** select de `retainers`, `retainer_limits`, `retainer_usage`, `retainer_extra_requests` e `retainer_alerts` com `app.can_read_rooms(organization_id, client_id)`. Em `retainers`, `monthly_fee` fica sem grant de coluna para `authenticated`. A equipa lê o valor pelo serviço, depois de autorizar.
- **Vistas** (`security_barrier`, filtro `app.is_client_member(client_id, array['decision_maker','operational'])`):
  - `portal_retainers`: id, client_id, project_id, tier, starts_on, status;
  - `portal_retainer_limits`;
  - `portal_retainer_usage`: sem `recorded_by`;
  - `portal_retainer_extra_requests`: com o orçamento.

**Passos:**

- [ ] Testes:
  - `room readers read retainers, other clients and outsiders nothing`;
  - `the monthly fee is not readable through row access`;
  - `portal views show the client's own retainer to its decision maker and operational only`;
  - `months and quantities are checked`;
  - `authenticated users cannot write retainers`.
- [ ] FALHA → esquema → `pnpm generate --name retainers` → SQL à mão → `npx supabase db push --dry-run` mostrado → push → PASSA → coverage → commit.

### Task 2: Domínio

**Ficheiros:** `modules/retainers/domain/{allowance.ts,months.ts,kinds.ts}` com testes.

**Interfaces:**

- `firstOfMonth(date: string) → string`, `previousMonth(month) → string` e `lisbonMonth(now: Date) → string`.
- `allowance({ limit, usedLastMonth, firstMonth }) → { carry; available }`:
  - `carry = firstMonth ? 0 : min(0.2 × limit, max(0, limit − usedLastMonth))`;
  - arredondado a uma casa decimal.
- `limitState({ limit, carry, used }) → { available; used; remaining; percent }`.
- `crossedThresholds(before: number, after: number, available: number) → (80 | 100)[]`.
- `RETAINER_LIMIT_KINDS`.

**Passos:**

- [ ] Testes:
  - `the first month has no carry`;
  - `at most 20% of the limit carries over`;
  - `an exhausted month carries nothing`;
  - `extra work does not count against the limit or the carry` (foco 1, garantido pelo chamador; o teste fixa a assinatura `usedLastMonth`);
  - `hours keep one decimal`;
  - `thresholds crossed by one entry` (70→85 dá [80]; 70→105 dá [80,100]; 85→90 dá []).
- [ ] FALHA → implementar → PASSA → commit.

### Task 3: Retainer e consumo da equipa

**Ficheiros:**

- `modules/retainers/{access.ts,retainers.ts,usage.ts,readers.ts,testing.ts,server.ts,index.ts}`;
- os testes `retainers.db.test.ts` e `usage.db.test.ts`;
- as ações de auditoria `retainer.saved`, `retainer.usage_recorded` e `retainer.usage_deleted`.

**Interfaces:**

- `RetainersDeps = { contexts; now?; flush? }`.
- `saveRetainer(claims, { clientId, projectId, tier, monthlyFee, currency, startsOn, reviewOn, status?, limits: { kind; monthlyLimit }[] })`:
  - devolve `{ ok: true; id } | NotFound | invalid_input`;
  - só para quem escreve na sala;
  - o projeto tem de ser do cliente;
  - normaliza `startsOn` ao dia 1;
  - `reviewOn` tem de ser posterior a hoje e a `startsOn`;
  - os limites substituem os anteriores, sem tipos repetidos, entre 1 e 4 limites;
  - mudar `reviewOn` limpa `review_alerted_for`.
- `recordUsage(claims, { retainerId, kind, quantity, description, taskId? })`:
  - devolve `OK | NotFound | invalid_input | { ok: false; rule: 'limit_reached' }`;
  - mês corrente de Lisboa;
  - com o retainer bloqueado (`for update`), recusa se `used + quantity > available`;
  - emite `retainers.usage.recorded` com os limiares cruzados (Task 5).
- `deleteUsage(claims, usageId) → OK | NotFound`.
- `loadStaffRetainer(claims, clientId) → StaffRetainerView | null`:
  - `canWrite`, `canSeeFee`, `projects` (para criar);
  - `retainer` com o tier, a revisão, o estado e o valor só quando `canSeeFee`;
  - `limits[]` com o `limitState` do mês;
  - `usage[]` do mês e `extraRequests[]`;
  - `canSeeFee` para o fundador e o gestor (não freelancers).

**Passos:**

- [ ] Testes:
  - `room writers create and edit the retainer, others cannot`;
  - `retainer dates are normalised and validated` (foco 5);
  - `usage above the available is refused`;
  - `the staff view shows the month per limit and hides the fee from freelancers`;
  - `usage is audited and can be deleted`.
- [ ] FALHA → implementar → PASSA → commit.

### Task 4: Pedidos do cliente e pedidos extra

**Ficheiros:**

- `modules/retainers/{requests.ts,extras.ts,portal.ts}` com `requests.db.test.ts`;
- `modules/rooms/portal.ts`: `getClientApprovals` ganha o tipo `retainer_extra`, com a ligação a `/portal/progress`;
- `components/proofing/approvals-list.tsx`: o grupo "Pedidos extra" com a ligação;
- auditoria `retainer.requested`, `retainer.extra_quoted` e `retainer.extra_decided`.

**Interfaces:**

- `requestWork(claims, { retainerId, kind, description, quantity })`:
  - devolve `{ ok: true; outcome: 'task' | 'extra' } | NotFound | invalid_input`;
  - quem pede é o decisor ou o operacional do cliente (`is_client_member`);
  - com o retainer bloqueado: dentro do disponível, cria a tarefa (título "Pedido do cliente: <descrição>", atribuída a `soleClientManager`, `projectId` do retainer) e o consumo ligado; acima, cria o pedido extra `requested` e emite `retainers.extra.requested`.
- `quoteExtra(claims, { extraRequestId, amount, currency }) → OK | NotFound | invalid_input | invalid_state`:
  - só `requested`;
  - grava o orçamento, passa a `quoted` e cria a aprovação `retainer_extra` (subject = id do pedido, projeto do retainer);
  - emite o evento de aprovação pedida do 2D, para o email ao decisor.
- `decideExtra(claims, { extraRequestId, decision: 'approved' | 'declined' }) → OK | NotFound | invalid_state`:
  - só o decisor do cliente (`is_client_member(... decision_maker)`);
  - só `quoted`;
  - fecha a aprovação (`approved` ou `changes_requested` com o comentário "Recusado");
  - se aprovado, cria a tarefa e o consumo com `extra_request_id`.
- `loadPortalRetainer(claims, clientId) → PortalRetainerView | null`:
  - pelas vistas do portal;
  - limites com o estado do mês, pedidos extra e `decides`.

**Passos:**

- [ ] Testes:
  - `a request within the allowance becomes a task with its usage`;
  - `a request above it becomes an extra request`;
  - `concurrent requests never exceed the allowance` (foco 2: dois `requestWork` em paralelo com `Promise.all` sobre 3 de 4 peças usadas);
  - `quoting creates the approval and shows in the portal approvals`;
  - `approving creates the task and usage outside the limit; declining creates nothing`;
  - `only the client's decision maker decides an extra request` (foco 3);
  - `the portal view shows the month without the fee`.
- [ ] FALHA → implementar → PASSA → commit.

### Task 5: Avisos e revisão

**Ficheiros:**

- `modules/retainers/{alerts.ts,review.ts,automations.ts}` com `alerts.db.test.ts`;
- templates `lead.retainer_threshold`, `founder.retainer_threshold` e `founder.retainer_extra_requested` em `email/templates.ts`, com mensagens nos dois idiomas;
- registo de `RETAINER_FUNCTIONS` no servidor Inngest.

**Interfaces:**

- `pendingAlerts(retainerId, month, deps) → { kind; threshold }[]`: os limiares cruzados ainda sem linha em `retainer_alerts`; grava as linhas no mesmo passo.
- A função `retainers-usage-alerts`, sobre `retainers.usage.recorded`:
  - envia `lead.retainer_threshold` ao decisor do cliente e `founder.retainer_threshold` aos fundadores e ao gestor da sala;
  - parâmetros: cliente, tipo, percentagem e link do C-10 ou do P-10.
- A função `retainers-extra-requested` envia `founder.retainer_extra_requested`.
- `sweepRetainerReviews(today, deps) → number`:
  - retainers `active` com `review_on − 60 dias ≤ today` e `review_alerted_for` diferente de `review_on`;
  - cria a tarefa "Rever o retainer de <cliente>" para o gestor e grava `review_alerted_for`.
- O cron é `TZ=Europe/Lisbon 0 8 * * *`.

**Passos:**

- [ ] Testes:
  - `one usage crossing both thresholds sends both alerts once` (foco 4);
  - `alerts reset each month`;
  - `the review task is created once per review date`;
  - `a new review date allows a new task`;
  - os templates renderizam nos dois idiomas, com testes unitários dos templates.
- [ ] FALHA → implementar → PASSA → commit.

### Task 6: C-10

**Ficheiros:**

- `app/[locale]/c/[clientId]/retainer/page.tsx`;
- `app/[locale]/retainer-actions.ts`;
- `components/retainers/`: `retainer-form.tsx`, `limit-bars.tsx`, `usage-form.tsx`, `extra-requests.tsx` e `retainer.test.tsx`;
- a navegação da sala ganha "Retainer" quando `hasRetainer`, calculado no layout da sala;
- mensagens `retainers.*` em PT-PT e EN.

**Passos:**

- [ ] Testes:
  - `the bars show used, carry and available per limit`;
  - `usage above the available shows the extra request hint`;
  - `quoting an extra request sends the amount`;
  - `freelancers see no fee and no write actions`;
  - `the room nav shows Retainer only when there is one`.
- [ ] FALHA → implementar → PASSA → commit.

### Task 7: P-10

**Ficheiros:**

- `app/[locale]/portal/progress/page.tsx` e `actions.ts`;
- `components/retainers/portal-retainer.tsx` (+ teste);
- "Progresso" no menu do portal para quem lê a sala.

**Passos:**

- [ ] Testes:
  - `the client sees the month per limit`;
  - `a request reports a task or an extra request`;
  - `the decision maker approves or declines a quoted extra; the operational sees it only`.
- [ ] FALHA → implementar → PASSA → commit.

### Task 8: CI, ponta a ponta e documentação

**Ficheiros:**

- `apps/web/e2e/retainers.spec.ts`, com a tag `@captured-email` se ler emails capturados, e sem tag caso contrário;
- `docs/STATUS.md`.

**Passos:**

- [ ] **E2E:**
  - o fundador cria o retainer com 2 peças;
  - o decisor pede 1 peça → tarefa;
  - pede 2 → pedido extra;
  - o fundador orça 150 EUR;
  - o decisor aprova no P-10;
  - a tarefa aparece e o consumo extra aparece fora do limite;
  - axe no C-10 e no P-10.
- [ ] Suite inteira → PASSA → commit.
