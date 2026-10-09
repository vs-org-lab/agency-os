# Sub-projeto 2A — Projetos, salas e processo — Plano de implementação

> **Para agentes:** SUB-SKILL OBRIGATÓRIA: usar `superpowers:subagent-driven-development` ou `superpowers:executing-plans` para executar este plano tarefa a tarefa. Os passos usam caixas (`- [ ]`) para acompanhamento.

**Objetivo:** depois do primeiro pagamento, o cliente passa a ter uma sala com projetos. Cada projeto tem um processo de fases e passos, atualizações e aprovação de fases no portal, e o pipeline acompanha o processo de 2.3 a 2.9.

**Arquitetura:**

- Módulo novo `apps/web/src/modules/rooms`: domínio puro (modelo, regras de fases e passos, Plano), serviços, portal, estúdio e automações.
- Depende de `commercial/server` (mudança de etapa, emails); nunca o contrário.
- O pipeline lê o facto "a etapa é conduzida pelo processo" a partir do ator.
- O projeto nasce de `commercial.deal.stage_changed` para 2.2.
- As leituras do portal passam por vistas `security_barrier`. "Ver como cliente" aplica os mesmos filtros às tabelas base, com igualdade testada.

**Stack:** a do 1D; sem dependências novas.

**Spec:** [docs/superpowers/specs/2026-10-09-rooms-process-design.md](../specs/2026-10-09-rooms-process-design.md)

## Restrições globais

- As dos planos anteriores:
  - TDD;
  - inglês no código e PT-PT na documentação;
  - migrações com dry-run antes de aplicar ao dev, e nunca com o e2e do CI a usar a base de dados;
  - sem custo;
  - sem linhas de atribuição a IA em commits e PR.
- Valores do spec:
  - modelo "Orbit" com 6 fases e os códigos da tabela da secção 2 do spec;
  - atualizações até 5000 caracteres;
  - lembrete da aprovação aos 2 dias e alerta à equipa aos 5;
  - um projeto por negócio, no máximo.
- Tudo é interno por defeito (RN-50). Só o decisor aprova; pedir alterações exige comentário.
- Eventos: `rooms.project.created`, `rooms.step.shared`, `rooms.update.published`, `rooms.approval.requested`, `rooms.approval.decided`.
- Regras de recusa: `previous_phase_open`, `steps_open`, `approval_required`, `comment_required`, `process_driven`.

## Foco de revisão

1. **Item interno visível ao cliente:** um passo ou uma atualização interna nunca aparecem no portal nem na pré-visualização. Teste na Task 6 (`preview equals the portal and hides internal items`).
2. **Decisão de aprovação repetida** (duplo clique, dois separadores): um único efeito. Teste na Task 5 (`deciding twice keeps the first decision`).
3. **Evento de 2.2 repetido:** um único projeto por negócio. Teste na Task 3 (`the 2.2 event creates one project`).
4. **Operacional ou finanças do cliente a aprovar:** recusado. As finanças do cliente não veem a sala. Teste na Task 5 (`only the decision maker decides`) e na Task 1 (`client finance never reads rooms`).
5. **Gestor a mover o negócio em 2.3–2.9 à mão:** recusado (`process_driven`); o fundador pode. Teste na Task 4.

---

### Task 1: Esquema e acesso

**Ficheiros:**

- `packages/db/src/schema/{enums,rooms}.ts` (+ `index.ts`, tipos);
- migração gerada `<ts>_rooms.sql`;
- migração de acesso `<ts>_rooms_access.sql`;
- `fixtures.ts` (`createRoomFixture`);
- `packages/db/test/rls/rooms.test.ts` e `isolation.test.ts` (+).

**O que muda:**

- Enums novos:
  - `project_status`: `active`, `paused`, `completed`, `cancelled`;
  - `phase_status`: `pending`, `in_progress`, `awaiting_approval`, `done`;
  - `step_status`: `todo`, `in_progress`, `done`;
  - `update_visibility`: `internal`, `client`;
  - `update_kind`: `manual`, `project_started`, `step_shared`, `phase_done`, `approval_decided`;
  - `approval_subject`: `phase`;
  - `approval_status`: `pending`, `approved`, `changes_requested`, `withdrawn`.
- Tabelas da secção 5 do spec, com chaves compostas cliente↔organização e projeto↔cliente:
  - `process_templates` tem `key` (texto), `name`, `version`, `definition` (jsonb), `is_active` e `is_default`;
  - únicos: `(org, key, version)`, ativa por `(org, key)` e uma por defeito por organização;
  - `projects.deal_id` é único quando não é nulo;
  - um `pending` por objeto em `approvals`.
- Funções de acesso:
  - `app.can_read_rooms(org, client)`: fundador e finanças em todos os clientes; gestor e freelancer atribuídos;
  - `app.can_write_rooms(org, client)`: fundador e gestor atribuído.
- RLS só de leitura; as escritas passam pelos serviços.
- Vistas do portal da secção 5, filtradas por `is_client_member(client, ['decision_maker','operational'])` e pela visibilidade.

**Passos:**

- [ ] Escrever os testes:
  - `founder and finance read every room`;
  - `manager and freelancer read assigned clients only`;
  - `decision maker and operational read only client-visible items`;
  - `client finance never reads rooms`;
  - `nobody writes room rows directly`;
  - isolamento.
- [ ] Correr e ver FALHA → esquema e migrações (dry-run, aplicar ao dev) → PASSA → commit.

### Task 2: Domínio do processo

**Ficheiros:** `modules/rooms/domain/{template,phases,steps,plan}.ts` (+ testes), `modules/rooms/templates/defaults.ts`.

**Interfaces:**

- Tipos:
  - `ProcessDefinition = { phases: Array<{ name: string; requiresApproval: boolean; codeOnStart: PipelineCode | null; codeOnDone: PipelineCode | null; steps: Array<{ name: string; visibleToClient: boolean; chained: boolean }> }> }`;
  - `validateProcessDefinition(value: unknown): { ok: true; definition: ProcessDefinition } | { ok: false; issues: string[] }`. Regras: 1 a 12 fases, 1 a 30 passos por fase, nomes de 1 a 120 caracteres, códigos só da etapa `orbit`, e o primeiro passo de uma fase nunca é ligado.
- `ORBIT_PROCESS: ProcessDefinition` (secção 2 do spec), com passos em pt-PT.
- `canStartPhase(phases, position)`: `{ ok: true } | { ok: false; rule: 'previous_phase_open' }`.
- `canCompletePhase(phase, steps, approval)`: `{ ok: true } | { ok: false; rule: 'steps_open' | 'approval_required' }`.
- `nextChainedStep(steps, doneStepId)`: `StepRef | null`. Devolve o passo seguinte da mesma fase, só se for `chained`.
- `planWeeks(phases, today)`: `Array<{ phaseId: string; startWeek: number; endWeek: number }>`, para a vista Plano.

**Passos:**

- [ ] Escrever os testes:
  - `orbit default is valid`;
  - `rejects codes outside orbit`;
  - `first step cannot be chained`;
  - `next phase waits for the previous one`;
  - `phase with approval waits for it`;
  - `chained step follows the done one`;
  - `plan weeks cover the phase dates`.
- [ ] Correr e ver FALHA → implementar → PASSA → commit.

### Task 3: Modelos e criação de projetos

**Ficheiros:**

- `modules/rooms/templates/service.ts`;
- `modules/rooms/projects.ts` (+ `.db.test.ts`);
- `modules/rooms/{index,server,runtime}.ts`;
- Definições › Modelos (`settings/templates`), com a secção "Processos", o editor de fases e passos e o teste;
- mensagens `rooms.*` e `settings.templates.process.*`.

**Interfaces:**

- `activeProcessTemplates(tx, organizationId)`: cria o "Orbit" por defeito no primeiro uso.
- `publishProcessTemplate(claims, { key, name, definition, makeDefault })`: só o fundador; cria uma versão nova ativa.
- `createProject(claims | 'system', { clientId, dealId?, templateKey?, name? }, deps)`:
  - devolve `{ ok: true; projectId } | { ok: false; rule: 'not_found' | 'deal_has_project' }`;
  - copia fases e passos;
  - publica a atualização `project_started` (visível);
  - emite `rooms.project.created`.
- `createProjectForDeal(dealId, deps)`: idempotente; usado pela automação no 2.2.

**Passos:**

- [ ] Escrever os testes:
  - `the 2.2 event creates one project`;
  - `the copy does not change when the template changes`;
  - `only founder publishes templates`;
  - `manager creates a project for an assigned client`;
  - `editor adds and removes phases and steps`.
- [ ] Correr e ver FALHA → implementar → PASSA → commit.

### Task 4: Fases, passos e pipeline

**Ficheiros:**

- `modules/rooms/process.ts` (+ `.db.test.ts`);
- `commercial/pipeline/{transitions,service}.ts` (+ testes);
- mensagens `pipeline.refusals.process_driven`.

**Interfaces:**

- `startPhase(claims, { phaseId }, deps)`: passa a primeira etapa ainda não iniciada a `in_progress` e move o negócio para `codeOnStart`.
- `completePhase(claims, { phaseId }, deps)`: move o negócio para `codeOnDone` e publica `phase_done`.
- `setStepStatus(claims, { stepId, status }, deps)`:
  - o freelancer só mexe nos seus passos;
  - ao ficar `done`, `nextChainedStep` passa a `in_progress`;
  - se o passo for visível, fica `sent_at` e há `step_shared` e `rooms.step.shared`;
  - voltar a `in_progress` depois de enviado marca `reopened_after_sent` (RN-43).
- `updateStep(claims, { stepId, assigneeId?, dueOn?, visibleToClient? })`.
- `updatePhase(claims, { phaseId, dueOn })`: a data prevista da fase, que alimenta o Plano e o fim previsto do projeto.
- Pipeline:
  - `TransitionActor` mantém-se;
  - `evaluateTransition` recusa `process_driven` para `staff` em avanços de 2.2 a 2.9 e permite o sistema e o fundador;
  - 2.10 dá `module_pending` com o módulo `approvals` (mensagem `pipeline.modules.approvals`).

**Passos:**

- [ ] Escrever os testes:
  - `starting a phase moves the deal to its code`;
  - `previous phase must be done`;
  - `phase with open steps cannot complete`;
  - `chained visible step is shared once`;
  - `reopening a shared step flags it`;
  - `freelancer changes only own steps`;
  - `manager cannot move 2.3 to 2.4 by hand`;
  - `founder can`.
- [ ] Correr e ver FALHA → implementar → PASSA → commit.

### Task 5: Atualizações e aprovações de fase

**Ficheiros:** `modules/rooms/{updates,approvals}.ts` (+ `.db.test.ts`).

**Interfaces:**

- `publishUpdate(claims, { projectId, body, milestone, visibility })`:
  - 1 a 5000 caracteres;
  - emite `rooms.update.published` quando a atualização é visível.
- `requestPhaseApproval(claims, { phaseId }, deps)`:
  - exige os passos feitos;
  - a fase passa a `awaiting_approval`;
  - emite `rooms.approval.requested`.
- `decideApproval(claims, { approvalId, decision: 'approved' | 'changes_requested', comment })`:
  - só o decisor do cliente;
  - `changes_requested` exige comentário;
  - aprovar conclui a fase pelo mesmo caminho de `completePhase` (o ator é o sistema);
  - pedir alterações devolve a fase a `in_progress`;
  - publica `approval_decided` e emite `rooms.approval.decided`.
- `withdrawApproval(claims, { approvalId })`: só a equipa e só com o pedido pendente.

**Passos:**

- [ ] Escrever os testes:
  - `only the decision maker decides`;
  - `changes need a comment`;
  - `approval completes the phase and moves to 2.4`;
  - `deciding twice keeps the first decision`;
  - `internal update is not published to the client`.
- [ ] Correr e ver FALHA → implementar → PASSA → commit.

### Task 6: Leituras da sala, do portal e da pré-visualização

**Ficheiros:** `modules/rooms/{room,portal,preview}.ts` (+ `.db.test.ts`).

**Interfaces:**

- `getRoom(tx, clientId, projectId?)`: `RoomView`, com projetos, projeto selecionado, fases com passos, cartão, atualizações e aprovações. Leitura sob RLS da equipa.
- `getClientRoom(tx, clientId, projectId?)`: `ClientRoomView`, pelas vistas do portal.
- `getRoomPreview(tx, clientId, projectId?)`: `ClientRoomView`, com os filtros das vistas aplicados às tabelas base.

**Passos:**

- [ ] Escrever os testes:
  - `preview equals the portal and hides internal items`;
  - `room shows the project selector with two projects`;
  - `operational reads the room without approvals actions`.
- [ ] Correr e ver FALHA → implementar → PASSA → commit.

### Task 7: Sala no estúdio

**Ficheiros:**

- `app/[locale]/(workspace)/c/[clientId]/{layout,page,actions}.tsx`;
- `c/[clientId]/updates/page.tsx`;
- `c/[clientId]/preview/page.tsx`;
- componentes `room/{process-board,plan-view,project-card,update-composer,update-feed,approval-panel}.tsx` (+ testes);
- `components/shell/navigation.ts` (separadores da sala);
- mensagens `rooms.*`.

**Conteúdo:**

- C-01:
  - fases à esquerda, com estado e ações "Começar fase", "Pedir aprovação" e "Concluir fase";
  - passos à direita, com estado, responsável, data, visível e ligado;
  - alternância Passos e Plano;
  - cartão do projeto.
- C-02: compositor (texto, marco, visibilidade com "Interno" por defeito) e feed.
- Botões "Ver como cliente" e "Novo projeto".
- Formulários com inputs controlados, `onSubmit` e `preventDefault`. As recusas aparecem com a mensagem da regra.

**Passos:**

- [ ] Escrever os testes:
  - `start phase shows the refusal reason`;
  - `update composer defaults to internal`;
  - `plan view lists weeks`;
  - `freelancer sees no phase actions`.
- [ ] Correr e ver FALHA → implementar → PASSA → commit.

### Task 8: Portal

**Ficheiros:**

- `app/[locale]/portal/{page,approvals/page,approvals/actions,updates/page}.tsx`;
- componentes `portal/room-cards.tsx` e `approval-decision.tsx` (+ testes);
- navegação do portal (Aprovações e Atualizações para decisor e operacional);
- mensagens `portal.room.*`.

**Conteúdo:**

- P-01 ganha a fase atual e o próximo passo, as aprovações pendentes e as três últimas atualizações.
- P-02: decisão com comentário obrigatório para alterações (botão bloqueado sem texto).
- P-05: o feed.

**Passos:**

- [ ] Escrever os testes:
  - `change request button stays disabled without a comment`;
  - `operational sees updates but no approve button`;
  - `home shows current phase and next step`.
- [ ] Correr e ver FALHA → implementar → PASSA → commit.

### Task 9: Emails e automações

**Ficheiros:**

- `modules/rooms/{automations,reminders}.ts` (+ `.db.test.ts`);
- `email/templates.ts` (+ testes);
- `commercial/booking/notifications.ts` (`PortalNoticeTemplate` +);
- `app/api/inngest/route.ts`.

**Funções Inngest:**

| Função                     | Disparo                                        | Ação                                                                                                                |
| -------------------------- | ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `rooms-project-on-kickoff` | `commercial.deal.stage_changed` com `to = 2.2` | `createProjectForDeal`                                                                                              |
| `rooms-update-published`   | `rooms.update.published`                       | `lead.room_update`                                                                                                  |
| `rooms-step-shared`        | `rooms.step.shared`                            | `lead.step_shared`                                                                                                  |
| `rooms-approval-requested` | `rooms.approval.requested`                     | `lead.approval_requested`                                                                                           |
| `rooms-approval-decided`   | `rooms.approval.decided`                       | `founder.approval_decided` aos fundadores e aos gestores atribuídos                                                 |
| `rooms-approval-reminders` | cron `TZ=Europe/Lisbon 0 9 * * *`              | Aos 2 dias, `lead.approval_reminder`; aos 5, `founder.approval_overdue`. Uma vez cada (`reminded_at`, `alerted_at`) |

**Passos:**

- [ ] Escrever os testes:
  - `templates render in both languages`;
  - `reminder at 2 days and alert at 5, once`;
  - `kickoff event creates one project`.
- [ ] Correr e ver FALHA → implementar → PASSA → commit.

### Task 10: Ponta a ponta, staging e documentação

**Ficheiros:** `apps/web/e2e/rooms.spec.ts`, `e2e/support/rooms.ts`, `docs/STATUS.md`, spec marcado como implementado, registo de execução em `docs/superpowers/execution/`.

**Fluxo do teste:**

1. Negócio em 2.2 com o projeto criado (a semente chama o serviço através da criação manual na sala).
2. Começar a Descoberta: o negócio passa a 2.3.
3. Concluir o primeiro passo: o passo ligado e visível aparece no portal.
4. Pedir a aprovação.
5. O decisor aprova com o portal: o negócio passa a 2.4.
6. A atualização aparece no feed.
7. Axe na sala, na pré-visualização e no portal.

**Passos:**

- [ ] Escrever e correr o teste ponta a ponta → corrigir → PASSA.
- [ ] Revisão final por um revisor novo.
- [ ] PR, CI e staging.
- [ ] Atualizar o STATUS.
