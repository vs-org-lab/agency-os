# Sub-projeto 3C — Resultado e garantia — Plano de implementação

**Objetivo:** resultado acordado por projeto com evolução e condições do cliente, avaliação da garantia no prazo, contagem dos meses da garantia e visão do cliente no P-10.

**Arquitetura:**

- Um módulo novo, `apps/web/src/modules/outcomes`, no padrão do `retainers`: domínio puro, serviço por `roomActor`, leitores da equipa e do portal, varrimento Inngest e avisos por `alertClientTeam`.
- A decisão da garantia vive numa só função (`decideGuarantee`), chamada pelo varrimento e pela decisão da última condição, que grava o estado e emite `outcomes.guarantee.decided` uma vez por decisão.
- O gráfico é um componente SVG próprio, usado no C-11 e no P-10.

**Stack:** a existente, sem dependências novas.

**Spec:** [docs/specs/2026-10-15-outcome-guarantee-design.md](../specs/2026-10-15-outcome-guarantee-design.md)

## Restrições globais

- As dos planos anteriores: TDD; inglês no código e PT-PT na documentação; migrações com dry-run; sem custo; ficheiros pela ferramenta Write (nada de backticks em `node -e`); fronteira de módulos; segredos nunca mostrados.
- **Valores do spec:**
  - **métrica** 1 a 80; **unidade** até 20; **fonte** 1 a 120; **descrição da condição** 1 a 200; **nota** até 500;
  - **números:** numeric(14,2), `baseline <> target`;
  - **condições por defeito:** `access` "Acessos entregues em 5 dias úteis", `approvals` "Aprovações dentro do prazo", `media_budget` "Orçamento de media acordado";
  - **estados da condição:** `pending`, `met`, `failed` (falhada exige nota);
  - **garantia:** `pending`, `not_activated` (`target_met` | `conditions_failed`), `active`, `closed` (`target_met` | `months_used`); meses 0 a 3;
  - **varrimento:** `outcomes-sweep`, `TZ=Europe/Lisbon 30 6 * * *`;
  - **tarefa:** "Decidir as condições do resultado de <cliente>", ao gestor único (`soleClientManager`) ou sem responsável, com vencimento a 3 dias;
  - **datas:** as de Lisboa (`lisbonDay`).
- **Acesso:** ler com `roomActor(..., 'read')`; escrever com `roomActor(..., 'write')`; portal pelas vistas, decisor e operacional.
- **Recusas:** `not_found`, `invalid_input`, `invalid_state`.

## Foco de revisão

1. **Valor registado depois do prazo:** não conta para "meta atingida até ao prazo"; conta para fechar uma garantia ativa. Teste na Task 2 (`only values up to the deadline decide the guarantee`) e na Task 3 (`a value reaching the target closes an active guarantee`).
2. **Editar o resultado depois de a garantia ser decidida:** métrica, linha de base, meta e prazo ficam bloqueados (`invalid_state`); a fonte e a unidade podem mudar. Teste na Task 3 (`a decided guarantee locks the agreed result`).
3. **Mudar uma condição depois de a garantia ser decidida:** recusado com `invalid_state`. Teste na Task 3 (`conditions are final once the guarantee is decided`).
4. **Varrimento corrido duas vezes:** cada decisão e cada tarefa uma só vez; os meses não andam para trás. Teste na Task 4 (`the sweep decides once and counts months idempotently`).
5. **Métrica que desce** (por exemplo, custo por lead) e **valor igual à meta:** meta atingida nos dois sentidos. Teste na Task 2 (`targets are reached in either direction, including exactly`).

---

### Task 1: Esquema

**Ficheiros:**

- `packages/db/src/schema/outcomes.ts` e os enums em `enums.ts` (`guarantee_status`, `guarantee_reason`, `outcome_condition_kind`, `outcome_condition_status`); exportado em `schema/index.ts`;
- a migração gerada (`pnpm generate --name outcomes`) com RLS, grants e vistas escritos à mão;
- `packages/db/test/rls/outcomes.test.ts`;
- `createOutcomeFixture(sql, world)` em `fixtures.ts`: no projeto da sala A, métrica "Leads por mês", unidade "leads", linha de base 40, meta 60, prazo daqui a 90 dias, fonte "Google Analytics", as três condições por defeito `pending` e um valor de 45 há 30 dias. Devolve `{ rooms, outcomeId, conditionIds: { access; approvals; mediaBudget }, measurementId }`.

**Interfaces:**

- As tabelas e os CHECKs do spec §4, com FKs compostas com `client_id` (`projects`, `project_outcomes`), únicos `project_outcomes(project_id)`, `project_outcomes(id, client_id)` e `outcome_measurements(outcome_id, measured_on)`.
- RLS de leitura com `app.can_read_rooms`; sem grants de escrita.
- Vistas (`security_barrier`, decisor e operacional):
  - `portal_project_outcomes`: id, client_id, project_id, metric, unit, baseline, target, deadline, data_source, guarantee_status, guarantee_reason, activated_on, months_used;
  - `portal_outcome_conditions`: id, outcome_id, client_id, kind, description, status, recorded_on;
  - `portal_outcome_measurements`: id, outcome_id, client_id, measured_on, value.

**Passos:**

- [ ] Testes:
  - `room readers read outcomes, other clients and outsiders nothing`;
  - `portal views show the client's outcome without internal notes`;
  - `the guarantee state is consistent` (motivo errado, `activated_on` em `pending`, meses 4 recusados);
  - `one value per date and baseline different from target`;
  - `authenticated users cannot write outcomes`.
- [ ] FALHA → esquema → gerar → SQL à mão → dry-run mostrado → push → PASSA → commit.

### Task 2: Domínio

**Ficheiros:** `modules/outcomes/domain/{guarantee.ts,months.ts}` com testes.

**Interfaces:**

- `direction(baseline: number, target: number) → 'up' | 'down'`.
- `reachesTarget(outcome: { baseline: number; target: number }, value: number) → boolean`.
- `targetReachedBy(outcome, measurements: { measuredOn: string; value: number }[], deadline: string) → boolean`: só valores com `measuredOn <= deadline`.
- `evaluateAtDeadline({ targetReached: boolean; conditions: ('pending' | 'met' | 'failed')[] }) → { status: 'not_activated'; reason: 'target_met' | 'conditions_failed' } | { status: 'active' } | { status: 'pending' }` pela ordem do spec §2.5.
- `fullMonthsSince(activatedOn: string, today: string) → number`: meses de calendário completos (o dia do mês de hoje tem de alcançar o da ativação; no fim de um mês curto conta o último dia), limitado a 3.

**Passos:**

- [ ] Testes:
  - `targets are reached in either direction, including exactly` (40→60: 60 sim, 59 não; 20→10: 10 sim, 11 não);
  - `only values up to the deadline decide the guarantee`;
  - `the deadline evaluation follows the spec order` (meta atingida ganha a condição falhada; condição falhada ganha a pendente; pendente fica `pending`; todas cumpridas ativa);
  - `full months since activation, capped at 3` (2026-01-31 → 2026-02-28 é 1; 2026-01-15 → 2026-02-14 é 0; 2026-01-15 → 2026-05-20 é 3).
- [ ] FALHA → implementar → PASSA → commit.

### Task 3: Serviço

**Ficheiros:**

- `modules/outcomes/{access.ts,outcomes.ts,conditions.ts,measurements.ts,guarantee.ts,readers.ts,portal.ts,testing.ts,server.ts,index.ts}`;
- os testes `outcomes.db.test.ts` e `guarantee.db.test.ts`;
- as ações de auditoria `outcome.saved`, `outcome.condition_recorded`, `outcome.measurement_recorded` e `outcome.guarantee_decided`;
- o evento `outcomes.guarantee.decided` em `events/emit.ts`.

**Interfaces:**

- `OutcomesDeps = { contexts; now?; flush? }`.
- `saveOutcome(claims, { clientId, projectId, metric, unit, baseline, target, deadline, dataSource }) → { ok: true; id } | NotFound | invalid_input | invalid_state`:
  - só para quem escreve na sala; o projeto é do cliente;
  - criar exige prazo depois de hoje e cria as três condições por defeito;
  - editar: com a garantia `pending`, um prazo alterado tem de ficar depois de hoje; com a garantia decidida, mudar métrica, linha de base, meta ou prazo dá `invalid_state` (foco 2).
- `addCondition(claims, { outcomeId, description }) → OK | NotFound | invalid_input | invalid_state` (kind `other`).
- `recordCondition(claims, { conditionId, status: 'met' | 'failed' | 'pending', note? }) → OK | NotFound | invalid_input | invalid_state`: `recorded_on` é hoje; `failed` sem nota dá `invalid_input`; com a garantia decidida dá `invalid_state` (foco 3); se o prazo já passou e já não há condições pendentes, chama `decideGuarantee` na mesma transação.
- `recordMeasurement(claims, { outcomeId, measuredOn, value, note? }) → OK | NotFound | invalid_input`: data não futura; a mesma data substitui o valor; com a garantia `active` e a meta atingida, fecha-a com `target_met` pela `decideGuarantee`.
- `decideGuarantee(tx, outcomeId, today) → GuaranteeDecision | null`: com o resultado bloqueado (`for update`), aplica o spec §2.5 e §2.6 e devolve a decisão nova, ou `null` se nada mudou; cada decisão nova grava, audita e emite `outcomes.guarantee.decided` (`{ outcomeId, status, reason }`).
- `loadStaffOutcome(claims, clientId) → StaffOutcomeView | null`: `{ canWrite; projects; proposalGuarantee: string | null; outcome: { …, guarantee } | null; conditions; measurements }` (a garantia da proposta vem do contrato assinado do negócio do projeto).
- `loadPortalOutcome(claims, clientId) → PortalOutcomeView | null` pelas vistas.
- `hasOutcome(claims, clientId) → boolean` para o menu.

**Passos:**

- [ ] Testes:
  - `writers create the outcome with the three client conditions`;
  - `outcome input is validated` (prazo passado, meta igual à linha de base, projeto de outro cliente, freelancer `not_found`);
  - `a decided guarantee locks the agreed result` (foco 2);
  - `a failed condition needs a note`;
  - `conditions are final once the guarantee is decided` (foco 3);
  - `deciding the last condition after the deadline decides the guarantee`;
  - `one value per date replaces the previous one`;
  - `a value reaching the target closes an active guarantee` (foco 1);
  - `the staff and portal views show the outcome, the portal without notes`.
- [ ] FALHA → implementar → PASSA → commit.

### Task 4: Varrimento e avisos

**Ficheiros:** `modules/outcomes/{sweep.ts,automations.ts}`, registo em `app/api/inngest/functions.ts`, o template `founder.outcome_guarantee` em `email/templates.ts` e o seu teste, as mensagens (pt-PT e en), e `sweep.db.test.ts`.

**Interfaces:**

- `sweepOutcomes(today: string, deps) → Promise<{ decided: number; tasks: number }>`, um resultado por transação, com falhas registadas sem parar os outros:
  - `pending` com o prazo passado → `decideGuarantee`; se ficar `pending` com condições por decidir e `conditions_task_for` diferente do prazo, cria a tarefa e grava `conditions_task_for`;
  - `active` → `decideGuarantee` atualiza `months_used` e fecha aos 3.
- `OUTCOME_FUNCTIONS`: `outcomes-sweep` (cron das restrições) e `outcomes-guarantee-decided` (evento), que avisa com `alertClientTeam` o template `founder.outcome_guarantee` com `{ clientName, metric, status, reason, outcomeUrl }`.
- Assunto pt-PT: "Garantia de {clientName}: {status, select, not_activated {não ativada} active {ativada} other {encerrada}}"; en equivalente.

**Passos:**

- [ ] Testes:
  - `the sweep activates the guarantee with every condition met`;
  - `the sweep does not activate when the target was met or a condition failed`;
  - `pending conditions at the deadline create one task`;
  - `the sweep decides once and counts months idempotently` (foco 4: duas corridas, um evento por decisão, meses 1 → 3 → `closed` com `months_used`);
  - template: `founder.outcome_guarantee renders every status in both locales`.
- [ ] FALHA → implementar → PASSA → commit.

### Task 5: C-11

**Ficheiros:**

- `components/outcomes/{outcome-chart.tsx,outcome-form.tsx,conditions.tsx,measurements.tsx,guarantee-card.tsx,outcome-screen.tsx,shared.ts}` e `outcome.test.tsx`;
- `app/[locale]/c/[clientId]/outcome/page.tsx` e `app/[locale]/outcome-actions.ts`;
- `components/shell/navigation.ts` (`outcome?: boolean`, item `/c/:id/outcome`, `shell.room.outcome` "Resultado", ícone `target`), `app-sidebar.tsx`, o layout da sala (`hasOutcome`) e `navigation.test.ts`;
- mensagens `outcomes.*` e `shell.room.outcome`.

**Interfaces:**

- `OutcomeChart({ baseline, target, unit, measurements, deadline })`: SVG com `role="img"` e `aria-label` "Evolução de {metric}: de {baseline} para a meta {target}"; linhas da linha de base e da meta; pontos por data; acompanhado de uma tabela com "Data" e "Valor".
- `OutcomeScreen({ clientId, view, actions })` com `OutcomeActions { save, addCondition, recordCondition, recordMeasurement }`; título h2 "Resultado"; secções h3 "Evolução", "Condições do cliente" e "Garantia".
- Textos da garantia: "Por decidir até {deadline}", "Não ativada: a meta foi atingida", "Não ativada: uma condição do cliente falhou", "Ativada a {date} · {months} de 3 meses usados", "Encerrada: a meta foi atingida", "Encerrada: os 3 meses foram usados".

**Passos:**

- [ ] Testes:
  - `the chart is described and its values are in a table`;
  - `writers create and edit the outcome`;
  - `conditions are marked met or failed, a failure asks for a note`;
  - `values are recorded by date`;
  - `the guarantee card states each status`;
  - `readers without write see no forms`;
  - navegação: `room navigation links the outcome when it exists or for writers`.
- [ ] FALHA → implementar → PASSA → lint e typecheck → commit.

### Task 6: P-10

**Ficheiros:** `components/outcomes/portal-outcome.tsx` e teste; `app/[locale]/portal/progress/page.tsx`; mensagens `outcomes.portal.*`.

**Interfaces:**

- `PortalOutcome({ view: PortalOutcomeView })`: h2 "Resultado acordado", o `OutcomeChart`, as condições com o estado e a data ("Cumprida a {date}", "Falhada a {date}", "Por registar"), e o cartão da garantia.
- O P-10 mostra o resultado e o retainer que existirem; o vazio "Ainda não há resultado nem retainer." só quando não há nenhum.

**Passos:**

- [ ] Testes:
  - `the client sees the outcome, its conditions and the guarantee`;
  - `progress shows the outcome without a retainer and the empty state without either` (teste da página com os carregadores simulados, ou dos dois componentes compostos).
- [ ] FALHA → implementar → PASSA → commit.

### Task 7: Ponta a ponta e documentação

**Ficheiros:** `apps/web/e2e/outcomes.spec.ts`, `docs/STATUS.md`.

**Passos:**

- [ ] E2E (cliente de `seedRoomProject`):
  - o fundador cria o resultado no C-11 (40 → 60 leads, prazo daqui a 30 dias), regista 45 e marca as três condições como cumpridas;
  - o decisor vê no P-10 o gráfico descrito, o valor 45 e as três condições cumpridas;
  - axe no C-11 e no P-10.
  - A ativação no prazo fica nos testes de base de dados da Task 4: o formulário recusa prazos passados, por isso o e2e não chega ao prazo sem mexer no relógio.
- [ ] `docs/STATUS.md`: linha do 3C e exclusões do spec §3.
- [ ] Suite inteira → PASSA → commit.
