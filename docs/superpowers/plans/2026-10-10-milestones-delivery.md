# Sub-projeto 2D.2 — Marcos e entrega — Plano de implementação

> **Para agentes:** SUB-SKILL OBRIGATÓRIA: usar `superpowers:subagent-driven-development` ou `superpowers:executing-plans` para executar este plano tarefa a tarefa. Os passos usam caixas (`- [ ]`) para acompanhamento.

**Objetivo:** cada marco de faturação é libertado pela assinatura, pela aprovação da fase ligada ou pela entrega final; a aprovação final entrega o projeto, emite a fatura final, passa o negócio a 2.10 e trata do pós-entrega; o feed mostra os comentários dos clientes e o freelancer trabalha na sala do seu projeto.

**Arquitetura:**

- `billing_milestones` ganha `trigger` e `phase_id`; o módulo `billing` liga marcos a fases, recusa pedidos presos e emite pedidos por evento (AUT-16, fatura final).
- A aprovação final reutiliza `approvals` (`subject_type = 'project'`) e `rooms.decideApproval`; a entrega emite `rooms.project.delivered`, tratado por uma função Inngest com passos idempotentes (AUT-21).
- O testemunho é uma tabela nova com vista do portal; a passagem a 2.10 fica só para o sistema, com o facto `deliveryReady`.

**Stack:** a do 2D.1, sem dependências novas.

**Spec:** [docs/superpowers/specs/2026-10-10-milestones-delivery-design.md](../specs/2026-10-10-milestones-delivery-design.md)

## Restrições globais

- As dos planos anteriores: TDD; inglês no código e PT-PT na documentação; migrações com dry-run e nunca com o e2e do CI a usar a base de dados; sem custo; sem linhas de atribuição a IA.
- **Valores do spec:** gatilhos `signature`, `phase_approval`, `delivery`; tarefas "Rever entrega final" (gestor do cliente), "Enviar caixa de celebração" (fundador, 7 dias) e "Preparar proposta de ativação" (fundador, 14 dias); testemunho até 1000 caracteres; recusa `milestone_locked`.
- **Regras:** RN-32 (marco ligado só sai com a fase aprovada ou com a entrega); RN-04 (2.9 → 2.10 só pelo sistema, com o projeto entregue e sem marcos por pedir); RN-41 (pedir alterações exige comentário); RN-51 (freelancer sem valores e só no seu projeto); efeitos das automações uma única vez.

## Foco de revisão

1. **Fase aprovada com o evento entregue duas vezes (repetição do Inngest):** o pedido do marco sai uma vez. Teste na Task 3 (`approving the phase requests the linked milestone once`).
2. **Marco já pedido à mão antes da ligação automática:** a ligação ignora marcos que não estão pendentes. Teste na Task 3.
3. **Aprovação final pedida com uma fase por concluir ou com outro pedido pendente:** recusada. Teste na Task 4.
4. **Negócio fora de 2.9 na entrega (por exemplo, em pausa X.1):** a passagem é recusada sem erro e o resto da entrega acontece. Teste na Task 5.
5. **Freelancer de outro projeto do mesmo cliente:** não muda passos nem publica atualizações. Teste na Task 6.

---

### Task 1: Esquema, acesso e fixture

**Ficheiros:**

- `packages/db/src/schema/{enums,billing,rooms,testimonials,index}.ts`;
- migração gerada `<ts>_milestones_delivery.sql` (com o preenchimento dos marcos existentes) e migração de acesso `<ts>_milestones_delivery_access.sql`;
- `createDeliveryFixture` em `packages/db/src/testing/fixtures.ts`;
- `packages/db/test/rls/testimonials.test.ts` e o isolamento.

**O que muda:**

- Enum `milestone_trigger` (`signature`, `phase_approval`, `delivery`); `project_status` ganha `delivered`; `approval_subject` ganha `project`.
- `billing_milestones.trigger milestone_trigger not null`, `phase_id uuid` com FK `(phase_id, client_id) → project_phases (id, client_id)` e `check (phase_id is null or trigger = 'phase_approval')`.
- Preenchimento: posição 1 → `signature`; a última, havendo mais de uma → `delivery`; as restantes → `phase_approval`.
- `projects.delivered_at timestamptz`.
- `testimonials`: organização, cliente, projeto (único), `author_id`, `body` (1–1000), `author_name`, `author_role`, `consent_publish boolean`, timestamps; RLS forçado com `app.can_read_project`; vista `portal_testimonials` (`security_barrier`) para o decisor do cliente; só leitura para `authenticated`.
- `createDeliveryFixture(sql, world)`: no cliente A, negócio em 2.9 com contrato assinado e três marcos (40 `signature` pedido, 30 `phase_approval` ligado à fase 1, 30 `delivery`), projeto `completed` com duas fases feitas (a 1 pede aprovação, aprovada).

**Passos:**

- [ ] Escrever os testes:
  - `team reads testimonials of readable projects only`;
  - `decision makers read their own testimonial only` (operacional e cliente B não leem);
  - `nobody writes testimonials directly`;
  - `existing milestones get triggers by position` (migração).
- [ ] Correr e ver FALHA → esquema e migrações (dry-run, aplicar ao dev) → PASSA → RLS e isolamento → commit.

### Task 2: Domínio

**Ficheiros:** `modules/billing/domain/plan.ts` (+ teste), `modules/billing/domain/links.ts` (+ teste), `modules/commercial/pipeline/transitions.ts` (+ teste).

**Interfaces:**

- `milestoneTriggers(count: number): MilestoneTrigger[]` — `[signature]`, `[signature, delivery]`, `[signature, phase_approval…, delivery]`.
- `linkMilestonesToPhases(milestones: { id: string; trigger: MilestoneTrigger; position: number; phaseId: string | null; status: string }[], phases: { id: string; position: number; requiresApproval: boolean }[]): { milestoneId: string; phaseId: string }[]` — marcos `phase_approval` pendentes e sem fase, por posição, às fases com aprovação ainda não usadas, por posição.
- `evaluateTransition`: `to === '2.10'` → staff recusa `process_driven`; sistema exige `facts.deliveryReady === true`, senão `delivery_pending`. `TransitionFacts` ganha `deliveryReady: boolean`.

**Passos:**

- [ ] Escrever os testes: `triggers follow the plan size`, `middle milestones link to approval phases in order`, `extra milestones stay unlinked`, `only the system delivers and only when ready`.
- [ ] Correr e ver FALHA → implementar → PASSA → commit.

### Task 3: Marcos ligados (RN-32, AUT-16)

**Ficheiros:** `modules/billing/{requests,links,automations,server,index}.ts` (+ `links.db.test.ts`, `requests.db.test.ts`); `api/inngest/functions.ts`.

**Interfaces:**

- `createPlanForContract` grava `trigger` com `milestoneTriggers`.
- `linkProjectPhases(projectId: string, deps: BillingDeps): Promise<{ linked: number }>` — sistema; projeto com negócio; aplica `linkMilestonesToPhases`.
- `setMilestonePhase(claims, input: { milestoneId: string; phaseId: string | null }, deps): Promise<{ ok: true } | NotFound | { ok: false; rule: 'invalid_state' | 'invalid_phase' }>` — escritores de faturação; marco `phase_approval` pendente; fase do projeto do negócio, com aprovação e ainda não feita.
- `requestPayment` recusa `milestone_locked`: `phase_approval` com fase por aprovar; `delivery` com o projeto não entregue.
- `requestMilestonesForPhase(phaseId: string, deps: BillingDeps): Promise<{ requested: string[] }>` e `requestDeliveryMilestones(projectId: string, deps: BillingDeps): Promise<{ requested: string[] }>` — sistema, `for update`, só marcos pendentes.
- Funções Inngest `billing-link-phases` (`rooms.project.created`) e `billing-milestones-on-phase-approved` (`rooms.approval.decided` com `decision = 'approved'`; a função lê a aprovação e só segue para `subject_type = 'phase'`).

**Passos:**

- [ ] Escrever os testes:
  - `new plans get triggers`;
  - `project creation links middle milestones to approval phases` e `linking skips milestones no longer pending`;
  - `manual request is refused until the linked phase is approved` e `delivery milestone waits for the final approval`;
  - `approving the phase requests the linked milestone once` (duas chamadas, um pedido);
  - `billing writers move a pending milestone to another approval phase` (fase de outro projeto ou já feita → `invalid_phase`; marco pedido → `invalid_state`; freelancer → `not_found`);
  - registo das duas funções no teste do Inngest.
- [ ] Correr e ver FALHA → implementar → PASSA → commit.

### Task 4: Aprovação final

**Ficheiros:** `modules/rooms/{approvals,notices,portal,views,index,server}.ts` (+ `delivery.db.test.ts`), `modules/rooms/templates/*` dos avisos de aprovação.

**Interfaces:**

- `requestFinalApproval(claims, input: { projectId: string }, deps: RoomsDeps): Promise<{ ok: true; approvalId: string } | NotFound | { ok: false; rule: 'invalid_state' }>` — `app.can_write_rooms`; projeto `completed`, sem pedido `project` pendente ou aprovado; emite `rooms.approval.requested`.
- `decideApproval` trata `subject_type = 'project'`: aprovada → projeto `delivered`, `delivered_at`, atualização visível ao cliente `project_delivered`, evento `rooms.project.delivered { projectId }`; alterações pedidas → tarefa `FINAL_REVIEW_TASK = 'Rever entrega final'` ao gestor do cliente com o comentário na descrição; `rooms.approval.decided` como hoje.
- `approvalNotice` e os templates ganham o assunto `delivery` ("entrega final"); `getClientApprovals` devolve `kind: 'delivery'`; `ProjectView` ganha `finalApproval: { id; status } | null` e `deliveredAt`.

**Passos:**

- [ ] Escrever os testes:
  - `final approval needs every phase done` (fase por concluir → `invalid_state`; pedido pendente → devolve o mesmo; já aprovado → `invalid_state`);
  - `approving the final approval delivers the project once`;
  - `changes on the final approval create the review task`;
  - `final approval alerts name the delivery`;
  - `the portal lists the final approval under delivery`.
- [ ] Correr e ver FALHA → implementar → PASSA → commit.

### Task 5: Entrega e testemunho (AUT-21)

**Ficheiros:** `modules/rooms/delivery.ts` (+ teste), `modules/rooms/automations.ts`, `modules/commercial/pipeline/service.ts`, `modules/testimonials/{service,portal,notices,index,server}.ts` (+ `testimonials.db.test.ts`), templates `lead.testimonial_request` e `founder.testimonial_received` (+ testes).

**Interfaces:**

- `applyStageChange` carrega `deliveryReady` para `to === '2.10'`: projeto do negócio `delivered` e nenhum marco do negócio `pending`.
- `completeDelivery(projectId: string, deps: DeliveryDeps): Promise<{ moved: boolean; tasks: number }>` — tarefas `CELEBRATION_TASK = 'Enviar caixa de celebração'` (descrição com o conteúdo de RF-161, 7 dias) e `ACTIVATION_TASK = 'Preparar proposta de ativação'` (14 dias), ao fundador, criadas uma vez por projeto; move o negócio para 2.10 com `actor: 'system'` e devolve `moved: false` quando a passagem é recusada.
- Função Inngest `rooms-project-delivered`: passos `request-delivery-milestones` (`requestDeliveryMilestones`), `complete-delivery`, `testimonial-request` (email ao decisor com quiet hours, link `/portal/testimonial/<projectId>`).
- `submitTestimonial(claims, input: { projectId: string; body: string; authorName: string; authorRole: string; consentPublish: boolean }, deps): Promise<{ ok: true } | NotFound | { ok: false; rule: 'invalid_input' }>` — só o decisor do cliente, projeto `delivered`; upsert por projeto; emite `testimonials.received`, que avisa o fundador (`founder.testimonial_received`).
- `getClientTestimonial(tx, projectId): Promise<{ projectName: string; testimonial: TestimonialView | null } | null>` pela vista.

**Passos:**

- [ ] Escrever os testes:
  - `delivery requests the final milestone, moves the deal to 2.10 and creates the tasks once`;
  - `a paused deal stays where it is and the tasks are still created`;
  - `the deal cannot reach 2.10 with a milestone still pending`;
  - `decision makers leave and replace a testimonial` (operacional → `not_found`; projeto não entregue → `not_found`; texto acima de 1000 → `invalid_input`);
  - templates e registo da função no teste do Inngest.
- [ ] Correr e ver FALHA → implementar → PASSA → commit.

### Task 6: Feed e escrita do freelancer

**Ficheiros:** `modules/studio/feed.ts` (+ teste), `modules/rooms/{authorize,process,updates}.ts` (+ testes de processo e atualizações).

**Interfaces:**

- `FEED_EVENT_TYPES` ganha `proofing.comment.added`, só com `byClient = true` e `internal = false`; `href` para `/c/<cliente>/proofs/<versão>`; `FeedEntry` ganha `subjectName` (título do ficheiro).
- `projectEditor(contexts, claims, clientId, projectId): Promise<Actor | null>` — `can_write_rooms` ou freelancer com `can_read_project`. Usado por `setStepStatus`, `updateStep` e `publishUpdate`; fases, aprovações e projeto continuam com `roomActor(..., 'write')`.
- `ProjectView` ganha `editable: boolean` para o caller.

**Passos:**

- [ ] Escrever os testes: `the feed shows client comments on proofs and not team comments`, `the project freelancer moves steps and publishes updates`, `a freelancer of another project of the client cannot`, `the freelancer still cannot start phases or request approvals`.
- [ ] Correr e ver FALHA → implementar → PASSA → commit.

### Task 7: Interface

**Ficheiros:**

- `app/[locale]/(workspace)/pipeline/[dealId]/billing/{billing-section,actions}.tsx` (coluna "Liberta em", escolha da fase, motivo do bloqueio);
- `app/[locale]/c/[clientId]/room/{plan-view,process-board,update-composer}.tsx` e ações (pedir aprovação final, estado entregue, controlos do freelancer conforme `editable`);
- `components/proofing/approvals-list.tsx` (grupo "Entrega");
- `app/[locale]/portal/testimonial/[projectId]/{page,actions}.tsx` e `components/testimonials/testimonial-form.tsx`;
- `components/studio/*` do feed (comentário do cliente);
- mensagens PT-PT e EN.

**Passos:**

- [ ] Escrever os testes de componentes: `milestones show what releases them and why they are locked`, `billing writers pick the phase of a pending milestone`, `the plan offers the final approval when every phase is done`, `a delivered project shows its date`, `approvals group the delivery`, `the testimonial form sends text, name, role and consent`, `the feed names the commented file`, `freelancers get step and update controls on their project only`.
- [ ] Correr e ver FALHA → implementar → PASSA → lint e tipos → commit.

### Task 8: Ponta a ponta e documentação

**Ficheiros:** `apps/web/e2e/delivery.spec.ts`, `e2e/support/rooms.ts` (projeto com negócio, contrato e marcos), `docs/STATUS.md`.

**Passos:**

- [ ] `the team requests the final approval and the client's approval delivers the project`: as fases concluídas pelo fixture, a equipa pede a aprovação final, o decisor aprova no portal, o projeto aparece entregue na sala, o pedido final aparece em Portal › Faturas e o testemunho abre a partir do link; axe na sala, em P-02 e na página do testemunho.
- [ ] Correr local (com `e2e:seed`) → PASSA → STATUS (2D.2 e itens excluídos do spec com gatilho) → commit.
