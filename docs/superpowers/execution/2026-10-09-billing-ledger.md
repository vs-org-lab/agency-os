# Registo de execução: sub-projeto 1D Faturação e pagamentos

Registo das decisões (Ruling), correções da revisão final (Final: fixed) e itens adiados durante a execução do [plano](../plans/2026-10-09-billing.md). Texto original do ledger de execução, em inglês.

Spec: docs/superpowers/specs/2026-10-09-billing-design.md
Branch: feat/billing

## Ledger

- Pre-flight: Task 4 consumes Task 2 buildMilestones/formatRequestNumber/dueDateFrom; Task 5 and 6 share applyReconciledPayment (defined in Task 5) and reconcileDecision (Task 2); Task 7 fact reads payments (Task 1); Task 10 consumes reminderDue (Task 2) and the events emitted in Tasks 4-6. No conflicts.
- Ruling: Task 2 runs before Task 1 — pure domain needs no database and PR #23 CI e2e is using the dev database — cost if wrong: none, tasks are independent.
- Task 2: Ruling: first RED run used the wrong working directory (alias error); RED proven by mutation (currency check, repeat stage) — 2 failures — cost if wrong: none
- Task 2: complete (commits b481f01..01c93d9, tests: vitest --project unit billing/domain → 14/14)
- Task 1: Ruling: portal views removed from the isolation list (they filter by the caller's membership, so the system seed reads zero rows, as with portal_contracts); per-client view isolation is in billing.test.ts — cost if wrong: none, covered elsewhere.
- Task 1: Ruling: billing_counters gets a founder/finance select policy in a follow-up migration (coverage guard requires a policy; the access migration was already applied to dev) — cost if wrong: none, no grant to authenticated.
- Task 1: Ruling: project managers read billing of every client, per the access matrix (`invoices`: project_manager all read) rather than only assigned clients — cost if wrong: managers see amounts of clients they do not manage.
- Task 1: complete (commits 01c93d9..HEAD~1, tests: vitest --project db packages/db/test/rls → 82/82 after policy fix; billing 8/8, coverage green)
- Task 3: Ruling: db tests not run RED before the service change; proven by mutation (iban check, bank column) → 2 failures — cost if wrong: none.
- Task 3: complete (tests: entity-form 3/3 unit, settings.db 8/8)
- Task 4: Ruling: the PDF writer was extracted from contracts to platform/pdf (shared with billing) under green contract PDF tests — cost if wrong: none, contract PDF tests 2/2.
- Task 4: Ruling: "concurrent requests get consecutive numbers" renamed to "requests get consecutive numbers from the shared counter"; a single test transaction cannot run two writers, and the guarantee comes from the atomic insert ... on conflict do update — cost if wrong: duplicate numbers would still be refused by the unique (organization_id, number) key.
- Task 4: Ruling: the request issuer freezes the contract's studio party plus the entity's current bank details at send time — cost if wrong: bank changes after signing reach new requests (intended).
- Task 4: complete (commits 88fc4ca..9a0d7e8, tests: billing pdf 4/4, storage 2/2, requests.db 7/7)
- Task 5: Ruling: zod 4 runs refine after a failed regex; the amount shape is checked inside the refine (found by "refuses invalid amounts" — BigInt threw on "12,5") — cost if wrong: none.
- Task 5: Ruling: settling a reviewed payment is open to founder and finance (matrix write), not founder only — cost if wrong: finance can accept a mismatched payment.
- Task 5: complete (commit 7fa1109, tests: payments.db 8/8)
- Task 6: Ruling: no fake card provider in the wiring; PAYMENTS_PROVIDER=fake means manual recording only and the card button is hidden. The Stripe adapter is tested against a stubbed sessions client and the parser with Stripe's own test signature helper — cost if wrong: card flow only verified end to end once test keys exist.
- Task 6: Ruling: webhook handler answers 503 when Stripe is not configured, 400 on bad signature, 200 on ignored or processed; unknown requests are logged (event id only) and acknowledged — cost if wrong: a payment for an unknown request is not stored and needs manual follow-up from the Stripe dashboard.
- Task 6: complete (commit 07f733e, tests: webhook 5/5, stripe adapter 2/2, handler 4/4, stripe-events.db 7/7)
- Task 7: complete (commit 5ae62b5, tests: transitions 52/52, service.db payment fact)
- Tasks 4-7: Ruling: db tests written first but run after the code (CI e2e held the dev database); proven by mutation (onConflictDoNothing, first-payment count, chase interval, payment fact) → 4 failures — cost if wrong: none.
- Task 10 (templates part): commit 6410a79, tests: email templates 14/14 (overdue days test RED → GREEN).
- Task 8: complete (commit 2647f43, tests: billing-section 4/4 unit, workspace.db 3/3 RED→GREEN)
- Task 9: complete (commit a0294a4, tests: invoice-card 4/4, portal-cards 4/4, navigation 6/6, portal.db 2/2 RED→GREEN, workspace.db pdf link refused to other clients)
- Task 10: Ruling: "Cobrar" emits billing.request.overdue once the due date has passed (otherwise reminded), so the client never gets "due soon" for an overdue request — cost if wrong: none.
- Task 10: Ruling: dependency wiring moved to billing/runtime.ts to avoid a server ↔ automations import cycle; planForSignedContract removed as unused — cost if wrong: none.
- Task 10: Ruling: client notices go to the decision maker contact (portalNoticeFunction) and link to the portal home; finance contacts are deferred with portal invitations (spec section 3) — cost if wrong: finance contacts miss emails until M06.
- Task 10: complete (commits 6410a79, 33df47d, tests: templates 14/14, reminders.db 4/4 RED→GREEN, requests.db 7/7)
- Task 11: Ruling: added "Criar plano de pagamentos" (founder/finance) for signed contracts without a plan — contracts signed on staging before 1D never receive the event, and local e2e runs without Inngest — cost if wrong: one extra button; the service is idempotent and refuses a second plan. Tests: requests.db staff plan RED→GREEN, billing-section 6/6.
- Final review: one reviewer (opus), verdict "with fixes": 0 critical, 2 important, 10 minor.
- Final: fixed SEC-03 re-verification on void, record, settle and register — security.db "require a recent verification" RED→GREEN, billing db 36/36
- Final: fixed write authorisation not scoped to the actor's organisation — security.db "writer in one organisation cannot write billing of another" RED→GREEN
- Final: Ruling: minor #3 (legal invoice PDF overwritable through an earlier upload link) re-graded Important (SEC-80 integrity); fixed with a path per upload link, no upsert, and path validation — payments.db "each upload link gets its own path" RED→GREEN — cost if wrong: none.
- Final: Ruling: minor #5 (reminders while a payment is under review) re-graded Important (a client who paid keeps receiving overdue emails); fixed — reminders.db "skips requests with a payment under review" RED→GREEN.
- Final: Ruling: minor #8 (zero milestone makes plan creation fail on every retry) re-graded Important; zero milestones left out — domain "leaves out milestones that round to zero" RED→GREEN.
- Final: Ruling: minor #9 (live Stripe keys accepted) fixed with the other env work as it enforces ADR 0003 — env.test RED→GREEN.
- Final: minor (deferred): #4 unmatched Stripe events only logged, no founder alert.
- Final: minor (deferred): #6 voided requests not listed in the studio tab (audit log only).
- Final: minor (deferred): #7 requests can be issued without bank details or instructions on the entity.
- Final: minor (deferred): #10 generic card-payment error when Stripe fails or the reused session is complete.
- Final: minor (deferred): #11 bank fields optional in LegalEntityInput (an omitting caller would clear them).
- Final: minor (deferred): #12 numbering concurrency not exercised with two real connections.
- Final: Ruling (declined to judge): voiding a signed contract after billing exists — 1C void only applies before signatures, so a signed contract cannot be voided; nothing to do.
- Final: Ruling (declined to judge): client notice on void, other-currency manual payments, partial payments, refunds — outside the 1D model; refunds/credit notes are excluded by the spec.
