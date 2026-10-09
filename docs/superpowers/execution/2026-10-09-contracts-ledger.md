# Registo de execução: sub-projeto 1C Proposta, contrato e assinatura

Registo das decisões (Ruling), correções da revisão final (Final: fixed) e itens adiados durante a execução do [plano](../plans/2026-10-09-contracts.md). Texto original do ledger de execução, em inglês.

Spec: docs/superpowers/specs/2026-10-09-contracts-design.md
Branch: feat/contracts from docs/spec-contracts

## Pre-flight

T3 consumes T2 validateTemplate/defaults; T4 consumes T1 tables and T3 entities; T5 consumes T2 renderContract/contractHash and T3 activeContractTemplate; T6 consumes T2 sameSigner/contractHash and commercial applyStageChange; T7 reads contracts table from T1; T8 consumes T4–T6 events — consistent.

## Rulings

- Setup: Ruling: spec approval taken from the founder standing green light of 2026-10-09 ("Tens luz verde para avançar tudo") — the founder asked not to be stopped for approvals — cost if wrong: rework after the founder reads the spec.

## Progress

- Task 1: Ruling: contracts and signatures are read-only for authenticated users; generation, acceptance, signing and voiding run in services that authorise the caller and write as the system — keeps immutable texts out of user-writable grants — cost if wrong: none.
- Task 1: complete (commits 77becbe..7485c02, tests: pnpm vitest run --project db packages/db/test → 10 files, 91 passed)
- Task 2: Ruling: the 20 template fields carry the Portuguese names of the spec; a payment plan has 1 to 6 integer steps summing to 100, and the last instalment absorbs rounding — cost if wrong: none.
- Task 2: complete (commits 7485c02..ab505fb, tests: pnpm vitest run --project unit apps/web/src/modules/contracts → 12 passed)
- Task 3: Ruling: ContractTemplateEditor tests were written first but only run after the component existed; RED was then proven by removing the component (module not found) — a process slip, the assertions were checked against real output — cost if wrong: weaker evidence for the editor tests.
- Task 3: Ruling: issuing entities live in a new Settings › Organização tab; the first entity becomes the default and archiving the default promotes the oldest remaining one — cost if wrong: one click to change the default.
- Task 3: complete (commits ab505fb..620d11f, tests: db settings.db.test.ts → 6 passed; unit app+contracts → 61 passed)
- Task 4: Ruling: a deal has one current proposal (the latest not withdrawn); saving replaces its options while it is a draft, and a sent or accepted proposal is locked — keeps a single source for the portal — cost if wrong: no proposal history beyond withdrawn ones.
- Task 4: Ruling: sending requires the founder, stage 1.6, portal access and a validity date not in the past; managers prepare drafts — cost if wrong: none.
- Task 4: complete (commits 620d11f..f5a5b62, tests: db proposals.db.test.ts → 7 passed; unit app → 53 passed)
- Task 5: Ruling: the decision maker check reads the proposal through the portal_proposals view in the user context, then generation runs in a system transaction that locks the proposal row; an accepted proposal returns its open contract (idempotent) — cost if wrong: none.
- Task 5: Ruling: the signer email comes from the client contact linked to the accepting portal user — no auth schema read needed — cost if wrong: empty email on the signature page when the contact has none.
- Task 5: Ruling: the portal shows the proposal as a card on the home page and a /portal/proposal page; no new navigation item — cost if wrong: one nav entry later.
- Task 5: complete (commits f5a5b62..6c235dd, tests: db acceptance.db.test.ts → 6 passed; unit app → 57 passed)
- Task 6: Ruling: the getPortalContract test ran after its implementation; RED was proven by mutation (expectedSigner forced to null fails the test) and GREEN restored — process slip, evidence checked — cost if wrong: weaker evidence for one read.
- Task 6: Ruling: only the decision maker who accepted the proposal signs for the client (accepted_by), and the founder signs for the studio as the entity representative; the typed name must match that person — cost if wrong: another decision maker cannot sign without voiding and re-accepting.
- Task 6: Ruling: completion (PDF render, upload, status, move to 2.1) runs inside the second signature's system transaction; the move is injected as moveDeal and a refused transition is logged, never failing the signature — cost if wrong: a deal left outside 2.1 after a valid signature, visible in the log.
- Task 6: Ruling: voiding returns the proposal to sent with the acceptance cleared, so the client accepts again and a new contract is generated — cost if wrong: none.
- Task 6: Ruling: pdf-lib 1.17.1 (MIT) with the standard Helvetica fonts; characters outside WinAnsi are replaced — cost if wrong: unusual characters print as ?.
- Task 6: complete (commits 6c235dd..72be276, tests: db signing.db.test.ts → 10 passed; unit apps/web/src → 417 passed)
- Task 7: Ruling: the Orbit stage is enabled for 2.1 only; any other Orbit target (forward or back) returns module_pending billing until 1D, and only 2.2 to 2.1 back moves are allowed — cost if wrong: none while no deal can reach 2.2.
- Task 7: complete (commits 72be276..5767f45, tests: unit commercial → 108 passed; db pipeline service.db.test.ts → 13 passed)
- Task 8: Ruling: contract automations live in the contracts module and reuse the exported commercial helpers (portalNoticeFunction with quiet hours, alertFounders, failureHandler); commercial never imports contracts — cost if wrong: none.
- Task 8: complete (commits 5767f45..0788af7, tests: unit full → 76 files, 451 passed; db notices.db.test.ts → 2 passed; email templates → 13 passed)
- Task 9: Ruling: the contract e2e seeds its own client, decision maker and issuing entity instead of creating the entity through the UI — the shared e2e client allows one open deal and entities would pile up per run; the entity UI is covered by unit and db tests — cost if wrong: the settings page has no browser test.
- Task 9: e2e evidence: contracts.spec → 1 passed (founder sends, client accepts and signs, founder signs, deal at 2.1, PDF 200 on both sides, axe on portal pages); full local run 30 passed + commercial-apply 6 passed with CI-equivalent env (PUBLIC_ORGANIZATION_SLUG=e2e-studio, APPLY_IP_LIMIT_PER_HOUR=1000); the earlier local failures came from .env.local pointing public applications at aurion-creative, which has no booking host.
- Task 9: complete (commits 91f1e1a..7968154, tests: playwright contracts.spec.ts → 1 passed; commercial-apply.spec.ts → 6 passed)
- Final review: two fresh reviewers (opus), backend and interface — 0 critical; backend 4 important, interface 6 important; all important enter the fix pass.
- Final: minor (deferred): validity and expiry compare UTC dates, not Europe/Lisbon (one-hour window around midnight).
- Final: minor (deferred): acceptance and change requests do not re-check validity and status after the FOR UPDATE lock.
- Final: minor (deferred): server action arguments are not parsed with zod before .trim() (non-string input gives a 500).
- Final: minor (deferred): the PDF does not hard-break single words wider than the page.
- Final: minor (deferred): the 12-month Core rule only applies from 0.4, and 0.4 to 2.1 is unreachable until repeat-client proposals exist.
- Final: minor (deferred): concurrent contract template publishes can hit the version unique key as a 500.
- Final: minor (deferred): renderContract leaves unknown fields as literal text instead of throwing.
- Final: minor (deferred): a double-clicked first draft save could create two drafts for one deal (no partial unique index on proposals.deal_id).
- Final: minor (deferred): change requests have no rate limit; each emails every founder.
- Final: minor (deferred): founder alert params are cast with as never instead of a per-template type.
- Final: minor (deferred): authenticated keeps an UPDATE grant on proposals.status and sent_at (services enforce the founder rule).
- Final: minor (deferred): comma parsing replaces only the first comma; cleared number inputs snap to 0; default option and payment names follow the UI locale, not the contract locale; the validity date input has no min.
- Final: minor (deferred): withdraw and change-request failures show generic copy; withdraw and archive act without confirmation.
- Final: minor (deferred): radio-card accessible names include the whole card; aria-label on role-less divs; 32px remove buttons on mobile; a misplaced doc comment in the template editor.
- Final: minor (deferred): e2e selectors not exact, client PDF only checked for visibility, no axe on studio sections and settings pages, seeded e2e data never cleaned.
- Final: fixed proposals acceptable and contracts signable on closed or paused deals — acceptance and signing require stage 1.6; tests 'a closed deal refuses acceptance', 'a closed deal refuses the signature' RED→GREEN.
- Final: fixed client typed fields could inject headings or clauses — control characters collapsed to spaces in acceptSchema; test 'keeps client typed fields on a single line' RED→GREEN.
- Final: fixed studio party not frozen with the contract — contracts.studio_details snapshot (migration with backfill) used by signing, PDF and the studio view; test 'keeps the studio party of the contract when the entity changes later' RED→GREEN.
- Final: fixed security matrix gaps — tests 'client finance and staff see nothing in the portal views', 'client finance users cannot accept', 'completion moves the deal to 2.1 through the pipeline rules' added (behaviour already correct, green on first run); contracts db suite 44/44.
- Final: fixed new entity form could duplicate entities — form clears after a successful create; test 'clears a new entity after saving so a second click cannot duplicate it' RED→GREEN.
- Final: fixed change requests hidden while editing — ChangeRequests rendered in both modes; test 'keeps the client change requests in view while editing the draft' RED→GREEN.
- Final: fixed studio did not show an expired proposal — Expirada badge and hint; test 'flags a sent proposal past its validity' RED→GREEN.
- Final: fixed portal home blank with an expired proposal and contract card without status — ProposalHomeCard with open, expired and contract stages (to_sign, waiting_studio, signed), used on the home and the accepted proposal page; portal-cards tests RED (module missing)→GREEN.
- Final: fixed editor and void flow test gaps — tests for removing an option, comma decimals, empty scope lines, retainer toggles, the void flow, signature status and the signed PDF link (behaviour already correct, green on first run).
- Final: fix pass verification — unit 79 files / 466 passed; contracts db 44 passed; e2e contracts + core 5 passed.
