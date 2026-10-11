# Registo de execução: sub-projeto 2E.2 Documentos da sala

Registo das decisões (Ruling), correções da revisão final (Final: fixed) e itens adiados durante a execução do [plano](../plans/2026-10-11-room-documents.md). Texto original do ledger de execução, em inglês.

Spec: docs/superpowers/specs/2026-10-11-room-documents-design.md
Branch: feat/room-documents

## Ledger

- Pre-flight: T3 consumes T2 documentLink/statusAfterNewVersion and T1 tables; T4 consumes T2 documentActions; T5 consumes T4 withdraw rules (pending approval) and T1 document_version subject; T7 consumes T2 documentActions and T5 approvals; T8 consumes T7 views. No conflicts.
- Task 1: Ruling: versions carry their own kind so a CHECK can require url for figma/link and storage_path for pdf/file — cost if wrong: a redundant column
- Task 1: Ruling: fixture timestamps use now() in SQL — postgres-js keeps the parameter type of the first call (null) and refused a Date afterwards — cost if wrong: none
- Task 1: complete (RLS 3/3 RED (fixture missing) → GREEN after migrations dry-run and applied; isolation + coverage 47/47)
- Task 2: complete (domain 3/3 RED (modules missing) → GREEN)
- Task 3: Ruling: portal_project_documents also shows documents ever approved (approved_at), so a reopened document keeps its approved version visible to the client (spec decision 3, RN-20); added as migration project_documents_history — the first view hid reopened documents — cost if wrong: none
- Task 3: Ruling: the quota counts room document files ready or uploading; the quota test passed at first run because the change preceded it, verified by mutation (document rows excluded → test fails) — cost if wrong: none
- Task 3: Ruling: stale document uploads are not swept yet; the reservation by declared size still caps them — sweep added with the automations in Task 6 — cost if wrong: reserved space held until the sweep exists
- Task 3: complete (versions 5/5 RED (module missing, history view) → GREEN)
- Task 4: Ruling: 'a new version withdraws the pending approval' is covered by Task 3's 'a new version keeps the document state rules' (pending approval withdrawn on a new shared version) — cost if wrong: none
- Task 4: complete (lifecycle 3/3 RED (module missing) → GREEN; project-documents db 8/8)
- Task 5: Ruling: the notice, portal and template changes were written before their tests first ran (the run failed on the missing approvals module); the template test passed at first run — cost if wrong: an unproven branch in the subject mapping
- Task 5: Ruling: "Rever documento" notes carry the document title and the comment; due in two Lisbon days like the extra-round task — cost if wrong: copy change
- Task 5: Ruling: ClientPendingApproval gains documentId alongside versionId instead of reusing versionId — cost if wrong: none
- Task 5: complete (approvals 6/6 RED (module missing) → GREEN; templates and proofing components 32/32)
- Task 6: Ruling: the stale-upload sweep for document versions (deferred in Task 3) lands here as documents-stale-uploads, hourly — cost if wrong: none
- Task 6: Ruling: a client comment attaches to the latest version shown to the client, a team comment to the current version — cost if wrong: none
- Task 6: complete (comments 4/4 RED (module missing) → GREEN; templates 22/22 and registry 1/1 RED → GREEN)
- Task 7: Ruling: the staff comment order test sorts by body — comments seeded in one transaction share created_at — cost if wrong: none
- Task 7: Ruling: Core presentations are read under the caller row level security on documents (pipeline readers), so freelancers see none — cost if wrong: none
- Task 7: complete (readers 5/5 RED (module missing) → GREEN)
- Task 8: Ruling: uploads are orchestrated in client components (RoomDocumentControls, NewRoomDocument) from server actions, because the bytes go straight to storage — cost if wrong: none
- Task 8: Ruling: Core presentations show as read-only cards without a link; the pipeline keeps their page — cost if wrong: one extra navigation for the team
- Task 8: Ruling: P-03 reuses ApprovalDecision from the phases with decideDocumentAction — cost if wrong: none
- Task 8: complete (components 5/5 and navigation 16/16 RED → GREEN; full unit 647/647; typecheck and lint clean)
- Task 9: Ruling: no e2e seed change — the spec drives the UI from a fresh seeded room — cost if wrong: none
- Task 9: complete (documents e2e 1/1 first run; library, proofing, delivery 4/4)
- Final review: opus fresh reviewer — 0 critical, 5 important, 9 minor; all five Review Focus items hold
- Final: fixed remove deleting a document approved between load and delete — "removing refuses a document approved after it was loaded" RED→GREEN; lockDocument (SELECT … FOR UPDATE) inside the removal transaction
- Final: fixed a new link version writing a stale status and the approval/version lock-order inversion — "a new link version reads the document state under its lock" RED→GREEN; applyNewVersion and every mutation lock the document first; decide locks the document before the approval
- Final: fixed late upload confirmations replacing a newer current version — "a late upload never replaces a newer current version" RED→GREEN; applyNewVersion only advances to a higher number
- Final: fixed an unguarded rejection removing a ready file — "a confirmation that loses the race never removes a ready file" RED→GREEN; guarded UPDATE … WHERE uploading RETURNING before removing; an accept that updates nothing returns not_found
- Final: fixed the reopened document showing the client a withdrawn version labelled draft — "a reopened document shows the client the approved version until the next is shared" RED→GREEN; approved_version_id column (backfilled from approvals), portal view maps a reopened draft to approved and its approved version, withdraw clears shared_at of a non-approved current version, client comments go to the shown version; migrations dry-run and applied to dev; project-documents db 31/31, unit 647/647
- Final: Ruling: withdraw stays allowed on a reopened document (status with_client after an earlier approval) — RN-21 protects the approved version, which stays approved and visible; only the newer, unapproved version goes back to draft — cost if wrong: a team could pull a shared new version the client already saw
- Final: minor (deferred): a failed or rejected first upload leaves an empty draft document; retrying "Novo documento" duplicates it
- Final: minor (deferred): a rejected version's signed upload link can still place an object that is neither counted nor swept
- Final: minor (deferred): concurrent new versions race on max(number)+1 only when no lock is held (new versions now lock the document first)
- Final: minor (deferred): a new version on a shared document is shown to the client without a new email
- Final: minor (deferred): withdrawn approvals keep subject ids of removed documents' versions
- Final: minor (deferred): read-only staff see a comment form that always fails
- Final: minor (deferred): external links with userinfo (user:pass@host) are accepted
- Final: minor (deferred): the staff "Vista pelo cliente" badge reflects shared_at only
- Final: minor (deferred): the portal does not mark which version the client approved
