# Registo de execução: sub-projeto 2A Projetos, salas e processo

Registo das decisões (Ruling), correções da revisão final (Final: fixed) e itens adiados durante a execução do [plano](../plans/2026-10-09-rooms-process.md). Texto original do ledger de execução, em inglês.

Spec: docs/superpowers/specs/2026-10-09-rooms-process-design.md
Branch: feat/rooms

## Ledger

- Pre-flight: Task 3 consumes Task 2 ProcessDefinition/ORBIT_PROCESS; Task 4 consumes Task 2 canStartPhase/canCompletePhase/nextChainedStep; Task 5 reuses Task 4 phase completion; Task 6 reads Task 1 views; Tasks 7-8 consume Task 6 views and Tasks 3-5 services; Task 9 consumes events of Tasks 3-5. No conflicts.
- Task 2: complete (commit deda87e, tests: rooms domain 11/11 RED→GREEN)
- Ruling: Orbit default template text is pt-PT only (the studio language); customer-facing English versions come with template translations — cost if wrong: English clients see pt-PT step names until edited.
- Task 1: complete (commit 7efc97f, tests: rls 93/93; rooms 6/6 RED (relation missing) → GREEN after migrations)
- Task 3: Ruling: process templates and projects are written in system context after authorisation (tables are read-only for users, as in 1D) — cost if wrong: none.
- Task 3: Ruling: system feed entries store the subject name in body and the UI renders the sentence from the entry kind, so both languages read correctly — cost if wrong: none.
- Task 3: Ruling: project name is the signed contract's option name, falling back to the deal title — cost if wrong: a rename by hand.
- Task 3: Ruling: two test expectations corrected (default listed first, Orbit has 13 steps) and the contract signed in the test before kickoff; db tests written first but run after the code (database busy), one-project-per-deal proven by mutation — cost if wrong: none.
- Task 3: complete (commit 4989fe3, tests: projects.db 5/5, process editor 2/2)
- Task 4: Ruling: with orbit codes enabled, the founder can move back from 2.10 to 2.9 with a reason, like every other back move; 2.10 itself stays unreachable until 2D — cost if wrong: none.
- Task 4: Ruling: process db tests seed only the deal (no Core fixture) to stay within the 30 s timeout against the remote dev database — cost if wrong: none.
- Task 4: complete (commit 5da1e51, tests: transitions 58/58 RED→GREEN, process.db 8/8 RED (module missing) → GREEN)
- Task 5: Ruling: approving a phase posts the phase_done entry only (no separate approval entry); asking for changes posts approval_decided — avoids two feed entries for one event — cost if wrong: none.
- Task 5: complete (commit 5eb99b2, tests: approvals.db 6/6 RED (module missing) → GREEN)
- Task 6: Ruling: staff room and preview loaders authorise with roomActor and read in system context (people and author names resolve without widening profile RLS); getClientRoom reads the portal views — cost if wrong: none, equality test pins the preview.
- Task 6: complete (commit d261703, tests: room.db 3/3 RED→GREEN; mutation (preview without the visibility filter) caught)
- Task 7: Ruling: the room lives at app/[locale]/c/[clientId] (existing route with access checks and the room shell), not (workspace)/c — cost if wrong: none.
- Task 7: Ruling: the old placeholder room text (room.home) removed; the authentication e2e now expects the client name heading — cost if wrong: none.
- Task 7: complete (commit d556119, tests: room components 5/5 RED→GREEN, navigation 6/6, unit 536/536)
- Task 8: Ruling: ClientRoom takes the decide server action and renders the decision itself (server pages cannot pass render functions to a client component); the decision control moved to components/rooms — cost if wrong: none.
- Task 8: complete (commit f0eed3c, tests: portal room 3/3 RED→GREEN, navigation 7/7, unit 540/540)
- Task 9: Ruling: client notices for room events are keyed by client (a project may have no deal); the notice reuses the latest deal for locale and quiet hours, else the organisation default — cost if wrong: none.
- Task 9: Ruling: approval alerts go to founders (alertFounders); assigned managers get them with team notifications in 2C — cost if wrong: managers learn of decisions from the room until 2C.
- Task 9: Ruling: two events added (rooms.approval.reminded, rooms.approval.overdue) so reminders follow the outbox like billing — cost if wrong: none.
- Task 9: complete (commit 10f9493, tests: templates 15/15 RED→GREEN, reminders.db 2/2, unit 541/541)
- Task 10 (e2e): rooms.spec 1/1 and authentication.spec 6/6 pass locally (commit 38c12ff)
- Final review: one reviewer (opus), verdict "with fixes": 0 critical, 7 important, many minor.
- Final: fixed double phase completion under concurrency (conditional status update) — process.db "a phase completed twice with a stale read completes once" RED→GREEN
- Final: fixed team cannot see the client change-request comment — room components "shows the client change request comment to the team" RED→GREEN
- Final: fixed portal shows one project only (approvals across projects, project selector on updates, home count across projects) — room.db "lists pending approvals across every project" RED→GREEN
- Final: fixed RN-43 (reopening the previous step flags the chained step already sent; the self-flag is kept) — process.db "reopening the previous step flags the chained step already sent" RED→GREEN
- Final: fixed people and assignees follow spec decision 6 (founders + staff assigned to the client; card shows assigned staff) — process.db "only founders and staff assigned to the client take steps" and room.db people/team RED→GREEN
- Final: fixed status changed on every select change (explicit buttons Começar / Marcar como feito / Reabrir) — room components "changes a step status only through an explicit button" RED→GREEN; e2e updated and now asserts 2.3
- Final: Ruling: minor re-graded — portal approval copy in second person (rooms.clientApproval) and step updates audited (RN-50 disclosure) — tests: portal room copy, process.db audit — fixed.
- Final: Ruling: assignee select keeps saving on change (assignment has no external effect; status now uses buttons) — cost if wrong: an accidental reassignment, visible and reversible.
- Final: minor (deferred): second decision in another tab reads as success.
- Final: minor (deferred): default template checkbox cannot be cleared; a new template whose name matches an existing key publishes a new version of it; codes 2.1, 2.2 and 2.10 accepted in templates.
- Final: minor (deferred): client notices not re-checked after the quiet-hours wait; reminders run for paused or cancelled projects.
- Final: minor (deferred): updatePhase not audited; system feed entries attributed to "Agency OS"; process editor repeated button names and generic error.
- Final: minor (deferred): project_steps.project_id and approvals.subject_id not constrained by foreign keys; Plan view uses the UTC date of phase start; late kickoff event on a lost deal still creates a project; db tests stub moveDeal (system move covered by e2e).
- Task 10: tests after fix pass: rooms db 28/28, unit 543/543, rooms e2e 1/1 (commit e87ea03)
