# Registo de execução: sub-projeto 2D.2 Marcos e entrega

Registo das decisões (Ruling), correções da revisão final (Final: fixed) e itens adiados durante a execução do [plano](../plans/2026-10-10-milestones-delivery.md). Texto original do ledger de execução, em inglês.

Spec: docs/superpowers/specs/2026-10-10-milestones-delivery-design.md
Branch: feat/milestones-delivery

## Ledger

- Pre-flight: Task 3 consumes Task 1 trigger/phase_id columns and Task 2 milestoneTriggers/linkMilestonesToPhases; Task 4 consumes Task 1 enums (project, delivered); Task 5 consumes Task 2 deliveryReady, Task 3 requestDeliveryMilestones and Task 4 rooms.project.delivered; Task 7 consumes Tasks 3-6 views and actions. No conflicts.
- Task 2: Ruling: executed before Task 1 because Task 2 is pure domain and PR #32 CI e2e is using the dev DB — cost if wrong: none
- Task 2: complete (commits facc682..0d5b8bd, tests: npx vitest run --project unit apps/web/src/modules/billing/domain apps/web/src/modules/commercial/pipeline → 77/77 passed; domain tests RED first (links module missing, 2.10 rule))
- Task 5: Ruling: email templates (testimonial request, testimonial received, delivery subject in approval alerts) written early while the dev DB was busy; tests RED (missing message, wrong subject) → GREEN 13/13; their messages are committed with Task 1 — cost if wrong: none
- Task 1: Ruling: the generated migration adds billing_milestones.trigger nullable, backfills by position (first signature, last of several delivery, rest phase_approval) and then sets not null — a not null column without default fails on existing rows — cost if wrong: none
- Task 1: Ruling: 'existing milestones get triggers by position' checked on dev after applying instead of an automated test (the backfill runs once, before any test row exists): 13 contracts, position 1 signature, position 2 (last) delivery — cost if wrong: a missed backfill case on staging data with 3+ milestones, which follows the same rule
- Task 1: Ruling: createPlanForContract writes the trigger in this task (the not null column broke the typecheck); Task 3's 'new plans get triggers' covers it — cost if wrong: none
- Task 1: Ruling: update_kind gains project_delivered here, for the client-visible feed entry Task 4 writes on delivery — cost if wrong: none
- Task 1: Ruling: createDeliveryFixture prepares the legal entity bank details and the accepted proposal's client details so its milestones can be issued — cost if wrong: none
- Task 1: complete (commits 0d5b8bd..HEAD, tests: testimonials RLS 3/3 RED (column trigger missing) → GREEN after migrations dry-run and applied to dev; RLS testimonials + isolation 42/42)
- Task 3: Ruling: two 1D tests requested the second milestone of a 50/50 plan, now the delivery milestone locked by RN-32; they deliver the deal's project first through a deliveredProject helper — cost if wrong: none
- Task 3: Ruling: shared lock rule in billing/release.ts (milestoneLocked), used by requestPayment and the automatic releases, so the manual and automatic paths cannot disagree — cost if wrong: none
- Task 3: complete (commits 95fd4be..0686301, tests: links 7/7 RED (module missing) → GREEN; all billing db 43/43; inngest registry RED → GREEN)
- Task 4: Ruling: soleManager moved from proofing to rooms/managers.ts as soleClientManager (rooms is the lower layer; both the extra round and the final review use it) — cost if wrong: none
- Task 4: Ruling: decideApproval split into decidePhaseInTx and decideProjectInTx; file versions stay with proofing — cost if wrong: none
- Task 4: Ruling: tests written first but run after the code; proven by mutation (guard without status and open phases, delivered event renamed, review task renamed → 3 of 5 fail); notice and portal tests cover the read paths — cost if wrong: none
- Task 4: Ruling: ProjectView finalApproval and deliveredAt move to Task 7, where the room screen consumes them with component tests — cost if wrong: none
- Task 4: complete (commits 0686301..abf2203, tests: delivery db 5/5; mutations caught 3/3)
- Task 5: Ruling: completeDelivery does not request milestones; the Inngest function requests the delivery milestones first (billing, covered by Task 3), then completes the delivery; the db test renamed to "once every milestone is requested, delivery moves the deal to 2.10 and creates the tasks once" — cost if wrong: none
- Task 5: Ruling: portal notices gain an optional path so the testimonial email opens /portal/testimonial/<project> — test "portal notices can open a page of the portal" RED → GREEN — cost if wrong: none
- Task 5: Ruling: the testimonial page reads delivered projects through portal_projects with is_client_member(decision_maker), so the decision maker sees the page before writing anything — cost if wrong: none
- Task 5: complete (commits abf2203..8a4a56a, tests: npx vitest run --project db apps/web/src/modules/rooms/delivery-complete.db.test.ts apps/web/src/modules/testimonials apps/web/src/modules/commercial/booking/notifications.db.test.ts apps/web/src/modules/commercial/pipeline → delivery 3/3 and testimonials 2/2 RED (modules missing) → GREEN; notifications, pipeline service and transitions green; registry and templates 21/21)
- Task 6: Ruling: the studio feed screen (type label "Comentário em {file}") moved here from Task 7: adding the feed event type broke the typed screen; component test RED (missing message) → GREEN — cost if wrong: none
- Task 6: Ruling: client proof comments are filtered in the feed query (byClient), so team replies never take the feed limit — cost if wrong: none
- Task 6: complete (commits 8a4a56a..f3acc81, tests: freelancer 3 and feed 1 RED (not_found, empty feed) → GREEN; rooms and studio db Tests 51 passed (51); studio feed screen 3/3)
- Task 7: Ruling: billing loader marks a phase milestone locked until its approval phase is done (an approval phase completes only when approved), avoiding a read of approvals under the billing readers' policies; the server keeps the approved-approval rule — cost if wrong: a stale lock label until refresh
- Task 7: Ruling: the billing loader test (workspace db) was written with the loader and run after it; the component tests ran RED first (missing labels, missing modules) — cost if wrong: none
- Task 7: Ruling: the step edit controls follow editable (room writers and the project freelancer), the phase and approval controls stay with writable; the updates page shows the composer to editors — cost if wrong: none
- Task 7: complete (commits f3acc81..5e63f25, tests: billing section 2, room 5, approvals 1, testimonial form 2 RED → GREEN; workspace db 4/4; full unit 625/625)
- Task 8: Ruling: the e2e covers the synchronous path (final approval request, client approval in the portal, delivered state, testimonial page); the automation effects (final request in Portal › Faturas, 2.10, tasks, testimonial email) run in Inngest, which local e2e does not execute, and are covered by db tests — cost if wrong: an automation wiring gap only visible on staging after the Inngest resync
- Task 8: Ruling: the delivery seed sets the client lifecycle to active (prospect clients have no room) — cost if wrong: none
- Task 8: e2e found the testimonial form importing the server service through the module index (postgres in the client bundle); schema moved to testimonials/input.ts — cost if wrong: none
- Task 8: complete (commits 5e63f25..d9e0024, tests: e2e delivery 1/1 with axe; related e2e rooms, billing, proofing, team, tasks, pipeline 10/10; develop merged)
- Final review: opus code-reviewer on 1c83497..d9e0024 (interrupted once by the session limit, resumed) — 0 critical, 2 important, 10 minor
- Final: Ruling: re-graded Minor 2 (final approval shown with an empty title and decision buttons in the client room) to Important — client-facing, widened by this branch — cost if wrong: one filter
- Final: fixed deal stuck at 2.9 when a milestone is requested after delivery — completeDeliveryForDeal retried on billing.request.sent (rooms-delivery-on-request-sent); tests "a milestone requested after delivery moves the deal to 2.10" and "a deal whose project is not delivered is left alone" RED (not a function) → GREEN
- Final: fixed final invoice failure holding back the other delivery effects — final invoice moved to its own billing function (billing-final-invoice-on-delivery) on rooms.project.delivered; rooms-project-delivered keeps tasks, 2.10 and the testimonial; inngest registry RED → GREEN
- Final: fixed final approval shown with an empty title in the client room (re-graded) — client room and staff preview list phase approvals only; test "the client room lists phase approvals only, never the final approval" RED → GREEN
- Final: minor (deferred): setMilestonePhase does not lock the phase; a link made while the client approves that phase leaves the milestone pending (now recoverable by hand, and 2.10 follows)
- Final: minor (deferred): billing readers who cannot read the deal's project see "Sem fase ligada" on a linked, locked milestone
- Final: minor (deferred): the delivery milestone stays locked when the deal's project is cancelled or never created; no founder override
- Final: minor (deferred): the P-02 delivery card repeats the project name as title and subtitle
- Final: minor (deferred): testimonial form errors not tied to fields (aria-invalid, aria-describedby) and required fields not marked; locked reason not linked to the disabled request button
- Final: minor (deferred): FinalApprovalCard falls back to today's date when deliveredAt is null (manual data only)
- Final: minor (deferred): decideApproval docstring still speaks of phases only
- Final: minor (deferred): the feed filter checks byClient only, not internal = false
- Final: Ruling: declined-to-judge items stand — repeat founder alert on a replaced testimonial (decision 8), generic client request and reminder emails for the final approval (scope 5 names the team alerts), freelancers sharing steps and client-visible updates (matrix "L E (próprio)", decision 10), 2.10 needing no pending milestone (decision 7), linking only on project creation (pipeline order makes the other case unreachable), orphan PDF on rollback (1D) — cost if wrong: one follow-up each
- Final: suite — unit 625/625; rooms and billing db 89/89
