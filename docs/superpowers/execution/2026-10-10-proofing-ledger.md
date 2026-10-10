# Registo de execução: sub-projeto 2D.1 Proofing de ficheiros

Registo das decisões (Ruling), correções da revisão final (Final: fixed) e itens adiados durante a execução do [plano](../plans/2026-10-10-proofing.md). Texto original do ledger de execução, em inglês.

Spec: docs/superpowers/specs/2026-10-10-proofing-design.md
Branch: feat/proofing

## Ledger

- Pre-flight: Task 3 consumes Task 1 tables and Task 2 detectProofType; Task 4 consumes Task 1 approvals extensions and Task 2 parseAnchor/roundsStatus; Task 5 consumes Tasks 3-4 services; Task 6 consumes Task 5 views. No conflicts.
- Task 2: Ruling: executed before Task 1 because Task 2 is pure domain and the dev DB was in use by PR #30 CI e2e — cost if wrong: none
- Task 2: complete (proofing domain 4/4 RED (modules missing) → GREEN)
- Task 1: Ruling: no separate portal_proof_files view; portal_proof_versions carries the file title — cost if wrong: none
- Task 1: Ruling: projects.rounds_warned_limit added so the 80% warning goes once per limit (AUT-17); unapplied migrations regenerated to include it — cost if wrong: none
- Task 1: Ruling: portal_projects view gains revision_limit so the portal can show rounds used against the limit — cost if wrong: none
- Task 1: complete (proofing RLS 4/4 RED (relation missing) → GREEN after migrations dry-run and applied to dev; full RLS suite 113/113)
- Task 3: Ruling: PDF page count computed server-side with pdf-lib at confirmation instead of trusting a client value — cost if wrong: none
- Task 3: Ruling: db tests written first but first run after the code (DB busy with PR #30 CI); proven by mutation (accept any type → spoof test fails; skip write authorisation → freelancer test fails) — cost if wrong: none
- Task 3: complete (proof files db 4/4)
- Task 4: Ruling: file version decisions live in proofing (decideFileApproval) and rooms.decideApproval refuses non-phase subjects, avoiding a rooms→proofing import cycle; the portal routes by subject — cost if wrong: none
- Task 4: Ruling: a new confirmed version withdraws pending requests on older versions (spec decision 2) at confirmation time — cost if wrong: none
- Task 4: Ruling: 'the warning is emitted once' strengthened with a second decision past the threshold after the mutation (no once-per-limit guard) went undetected; RED with the mutation, GREEN with the code — cost if wrong: none
- Task 4: complete (review db 6/6; mutations caught for internal comments and once-per-limit warning)
- Task 5: Ruling: comments ordered by number then time (shared now() in test transactions exposed an arbitrary order; numbered order is also what the client reads) — cost if wrong: none
- Task 5: Ruling: approval alert templates take a subject (phase or file) and link file approvals to the proof page — cost if wrong: none
- Task 5: complete (views db 5/5, templates 11/11, inngest registry 1/1)
- Task 6: complete (proofing components 7/7 RED (modules missing) → GREEN; unit 594/594 with the known config timeout passing alone; lint clean)
- Task 7: Ruling: e2e found the CSP blocking signed storage images; img-src and media-src gain the Supabase origin and worker-src allows self and blob for pdf.js (test RED→GREEN) — cost if wrong: none
- Task 7: e2e proofing.spec 1/1 locally (first dev compile of the proof route exceeded 15 s once; rerun passed)
- Task 7: Ruling: hold to confirm (revoking access in the team and colleague screens, closing the 2C deferred minor) and the stateful action button (resending invitations) built as own implementations per the component plan the founder asked for; inventory created at components/INVENTORY.md — cost if wrong: two small components
- Final review: opus code-reviewer on 417e791..601555f — 0 critical, 10 important, 12 minor
- Final: Ruling: re-graded Minor 1 (HoldToConfirm animates under reduced motion), Minor 4 (resend success not announced, a regression) and Minor 8 (finance comments against spec decision 6) to Important — design-system rule, accessibility regression and authorisation — cost if wrong: three small fixes
- Final: fixed internal thread replies stored as public — team replies inside an internal thread stay internal + view test RED→GREEN (view filter verified by construction: the earlier view had no parent predicate)
- Final: fixed client notices about versions the client cannot see — clients hear only about versions they can open and threads they can read RED→GREEN
- Final: fixed older confirm withdrawing a newer request — confirming an older upload keeps the request on a newer version RED→GREEN
- Final: fixed uploading version blocking the previous request (server half) — a version still uploading does not block requesting the previous one RED→GREEN
- Final: fixed finance commenting — finance staff neither comment on proofs nor resolve comments RED→GREEN
- Final: portal proofs list (server half) — the portal lists every proof sent to the client, decided or not RED→GREEN; proofing db suite 21/21; migration 20261010123648 dry-run then applied to dev
- Final: fixed signed URL swap on every render — proof file route redirects readers to a fresh signed link that is never cached RED→GREEN (module missing), pages use /api/proofs/[versionId]/file
- Final: fixed stuck uploading version (UI half) — a failed upload is closed on the server so the version is not left uploading, the previous version can be sent for approval while a new one uploads RED→GREEN
- Final: fixed no portal route back to decided proofs — client proof list links every proof sent to the client with the state of its request RED→GREEN (module missing), navigation test RED→GREEN; portal nav Provas and /portal/proofs page
- Final: fixed pdf viewer stuck in failed on quick page turns — turning pages quickly cancels the render in progress instead of failing RED→GREEN (documents destroyed on unmount)
- Final: fixed no keyboard pin placement — places and moves a pin on an image with the keyboard RED→GREEN (shared PinSurface for image and pdf)
- Final: fixed HoldToConfirm unusable with screen readers — a click without a pointer hold asks for an explicit confirmation RED→GREEN
- Final: fixed HoldToConfirm animating under reduced motion (re-graded) — the fill takes its duration only from motion-safe styles RED→GREEN
- Final: fixed resend success not announced and focus dropped while pending (re-graded) — shows the pending label while running and the done label after (aria-disabled, status region) RED→GREEN
- Final: minor (deferred): HoldToConfirm starts on any mouse button (right-button hold revokes)
- Final: minor (deferred): ActionButton reset timer from a previous success can flip a second run back to idle
- Final: minor (deferred): version and comment numbering max+1 without a lock surfaces 23505 as a generic error under concurrency
- Final: minor (deferred): internal and public top-level comments share one numbering sequence, so the client sees gaps
- Final: minor (deferred): type sniffing checks container signatures only (any ftyp as mp4, any EBML as webm)
- Final: minor (deferred): createProofFile accepts a phase from another project of the same client (UI never sends phaseId)
- Final: minor (deferred): a Storage download failure is treated as a spoof and may leave an orphan object
- Final: minor (deferred): upload forms do not clear the file input after success
- Final: minor (deferred): one email per comment, no batching per version
- Final: Ruling: declined-to-judge items (upsert overwrite via x-upsert, pdf.js worker in a production build under CSP) — both are checked on staging before merge to main: an overwrite attempt with x-upsert true and opening a PDF proof — cost if wrong: a staging finding
- Final: Ruling: 80% threshold uses ceil as the plan fixes (limit 3 warns at round 3) — the spec says "ao chegar a 80%" and ceil is the conservative reading — cost if wrong: one rounding change
- Final: Ruling: re-requesting an approved or changes-requested version without a new upload stays allowed — the team may legitimately re-ask after talking with the client; rounds count only on change requests — cost if wrong: a guard in requestVersionApproval
- Final: suite — unit 607/608 (config eslint timeout under parallel load, 5/5 alone); db 492/501 on the shared dev DB: reminders and outbox failures traced to two pending e2e-studio approvals left by interrupted local e2e runs (seed now withdraws pending approvals in the e2e org; 16/16 after reseed), follow-up sweep and isolation timeouts are global sweeps over accumulated dev data (follow-ups 7/7 with a longer timeout, isolation passed alone); proofing db 21/21
