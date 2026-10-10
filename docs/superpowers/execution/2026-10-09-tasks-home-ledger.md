# Registo de execução: sub-projeto 2B Tarefas, Início e atualizações

Registo das decisões (Ruling), correções da revisão final (Final: fixed) e itens adiados durante a execução do [plano](../plans/2026-10-09-tasks-home.md). Texto original do ledger de execução, em inglês.

Spec: docs/superpowers/specs/2026-10-09-tasks-home-design.md
Branch: feat/tasks

## Ledger

- Pre-flight: Task 3 consumes Task 1 tables; Task 4 consumes Task 2 sortByUrgency and Task 3 listTasks plus rooms/billing/commercial readers; Task 6 consumes Task 2 taskGroup and Task 3 services. No conflicts.
- Task 2: complete (commit fb9cb9f, tests: tasks domain 5/5 RED→GREEN)
- Task 1: complete (tasks RLS 5/5 RED→GREEN after migrations applied to dev; isolation 34/34)
- Task 3: complete (tasks service db 5/5; options test added in Task 6 scope ran GREEN without an observed RED because the dev DB was busy with PR #27 e2e)
- Task 4: Ruling: receivable exposed as amountMinor bigint per currency; billing-less case tested with the freelancer because the access matrix gives project managers billing read — cost if wrong: one test fixture swap
- Task 4: Ruling: commercial loadToday removed; the studio home reuses listTodayItems — cost if wrong: none, it had no other caller
- Task 4: complete (studio home db 4/4 after fixing the test to move the phase back to in_progress as decideApproval does; home components 4/4 RED→GREEN)
- Task 5: Ruling: feed message keys use short names (proposal_accepted…) because next-intl forbids dots in keys; approval entries link to the room, others to the deal for pipeline readers — cost if wrong: copy only
- Task 5: complete (feed db 2/2, studio-feed component 2/2 RED→GREEN)
- Task 6: Ruling: filter parsing and the Lisbon date moved to domain/filter.ts with unit tests so pages never pass malformed ids to the uuid casts — cost if wrong: none
- Task 6: Ruling: editing covers title, notes, assignee and date; client and subtasks stay as created, matching updateTask — cost if wrong: a later edit form for subtasks
- Task 6: complete (components 4/4, navigation 15/15, filter 3/3 RED→GREEN; unit suite 561/561)
- Task 7: complete (e2e tasks.spec 1/1 locally with axe on home, /tasks, room tasks and /updates; authentication, accessibility and rooms e2e 19/19)
- Final review: opus reviewer, With fixes (2 critical, 2 important, 9 minor)
- Final: fixed TASK_FUNCTIONS imported but never served — inngest functions.test.ts RED→GREEN, unit 566/566
- Final: fixed assignee read path without MFA or active membership — rls tasks 'assignees without mfa or an active membership read nothing' RED→GREEN after migration 20261010010727 (dry-run then applied to dev), rls tasks 6/6
- Final: fixed freelancer feed showing proposal, contract and payment events — feed 'freelancers see approvals but no commercial or billing events' RED→GREEN, feed 3/3
- Final: fixed assignee re-validated on every edit, edit shown on tasks the reader cannot edit, assignee choices not matching the client — service 'a task stays editable after its assignee leaves the client' and 'lists whether the reader may edit each task' RED→GREEN, options clientIds RED→GREEN, components 'offers edit and delete only on tasks the reader may edit' and 'task form offers only people who may take the chosen client task' RED→GREEN; db 21/21
- Final: Ruling: reviewer minor 7 (deleteTask without UI) re-graded Important — spec §4 says founders and assigned managers delete; delete added behind the edit disclosure with canEdit — 'managers delete tasks in their clients only' pins the service — cost if wrong: none
- Final: minor (deferred): Hoje not scoped to the reader for late steps and change requests (founders and finance see the whole studio)
- Final: minor (deferred): kickoff dates from job run time instead of projects.starts_on; 24h arithmetic near DST
- Final: minor (deferred): task.updated audit stores free-text notes; status, item and kickoff changes not audited
- Final: minor (deferred): "Nova tarefa" quick action shown to readers who cannot create tasks
- Final: minor (deferred): e2e does not assert indicators; no home db test for undated tasks
- Final: minor (deferred): no domain_events index for the feed query and no retention; done task list unbounded
- Final: minor (deferred): task_items.organization_id has no consistency check against its task
- Final: minor (deferred): task completion checkbox labelled with the title only
- Final: fixed declined-to-judge TaskFilters GET action without locale prefix — action now built with getPathname for the page locale; e2e submits the status filter and lands on /tasks?status=done
