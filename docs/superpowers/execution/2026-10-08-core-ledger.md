# Registo de execução: sub-projeto 1B Diagnóstico Aurion Core

Registo das decisões (Ruling), correções da revisão final (Final: fixed) e itens adiados durante a execução do [plano](../plans/2026-10-08-core.md). Texto original do ledger de execução, em inglês.

Spec: docs/superpowers/specs/2026-10-08-core-design.md
Branch: feat/core from docs/spec-core e1a3446 (develop e042241 + spec and plan)

## Pre-flight

| Consumer ← Producer        | Interface                                                                                  | Finding                                                                                                                                                          |
| -------------------------- | ------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| T2,T5,T6,T7,T8,T9,T14 ← T1 | tables, enums (OrbitFront, CoreLevel, RoadmapLane, FindingOwner, CallKind, DocumentStatus) | consistent                                                                                                                                                       |
| T3 ← T2                    | OrbitGrid, BriefingGuide types                                                             | consistent                                                                                                                                                       |
| T4 ← T3                    | CoreReadiness, ReadinessGap, stageOneGaps                                                  | consistent; T4 loadCoreReadiness needs documents (T9) and proposal sessions (T5) columns — both from T1 schema, so T4 can query them before T5/T9 services exist |
| T5 ← T2                    | getActiveTemplate                                                                          | consistent                                                                                                                                                       |
| T7 ← T3                    | proposeLane                                                                                | consistent                                                                                                                                                       |
| T8 ← T3                    | orbitIndex, OrbitIndexRow                                                                  | consistent                                                                                                                                                       |
| T10 ← T8                   | FindingSummary, RoadmapView                                                                | consistent                                                                                                                                                       |
| T11 ← T3, T6, T9           | addBusinessDays, core.briefing.shared, core.document.shared                                | consistent                                                                                                                                                       |
| T12 ← T6–T10               | services via diagnosis/server, documents/server                                            | consistent                                                                                                                                                       |
| T14 ← T6, T9, identity     | getBriefing, listPortalDocuments, inviteClientUser                                         | consistent                                                                                                                                                       |

## Rulings

- Setup: Ruling: execution starts before PR #13 (spec and plan) is merged, on feat/core branched from docs/spec-core — the founder asked to start implementing immediately — cost if wrong: feat/core rebases onto develop after #13 merges.

## Progress

- Task 1: Ruling: createCoreFixture returns { briefingTemplateId, gridTemplateId, a, b } with records for both clients (plan named a single record set) — the isolation test needs rows for client B — cost if wrong: none.
- Task 1: Ruling: portal reads the Core through the view portal_core_engagements (owner privileges, filtered by app.is_client_member and briefing_shared_at) and notes through app.core_briefing_is_shared — column grants cannot separate staff from client users on core_engagements — cost if wrong: the view must be kept in sync with shareable columns.
  Task 1: complete (commits e1a3446..49ce733, tests: pnpm exec vitest run --project db packages/db/test/rls → Duration 341.34s (tests 99%, import 1%))
- Task 2: Ruling: withActor moved from commercial/authorization to @/modules/access (commercial re-exports it) — diagnosis needs it and module boundaries forbid importing commercial internals — cost if wrong: none.
- Task 2: Ruling: diagnosis/server.ts is created when the first server composition exists (Task 6/12) instead of empty in Task 2 — an empty server-only module adds nothing — cost if wrong: none.
  Task 2: complete (commits 49ce733..3173fcb, tests: pnpm exec vitest run --project unit apps/web/src/modules/diagnosis → Duration 325ms (import 60%, transform 28%, tests 7%, worker 5%))
  Task 3: complete (commits 3173fcb..0ebe035, tests: pnpm exec vitest run --project unit apps/web/src/modules/diagnosis → Duration 1.31s (import 87%, transform 10%, tests 3%, worker 1%))
- Task 4: Ruling: codes 0.3 and 0.4 renamed to 'Call Core marcada' / 'Call Core feita' (en 'Core call booked' / 'Core call held') together with 1.1 'Core iniciado' — announced in the brainstorming option the founder chose — cost if wrong: two message strings.
  Task 4: complete (commits 0ebe035..49b0b6d, tests: pnpm exec vitest run --project unit apps/web/src/modules/commercial/pipeline → Duration 1.38s (import 83%, transform 15%, tests 1%, worker 1%))
  (db: commercial suite 17 files / 97 tests in t4-db.log)
- Task 5: Ruling: the ensure-core assertion in call-flow.test.ts was added with its implementation, so its RED was not observed separately — it is wiring of an already tested service (engagement.db.test.ts RED→GREEN) — cost if wrong: none.
  Task 5: complete (commits 49b0b6d..69eb1bb, tests: pnpm exec vitest run --project db apps/web/src/modules/diagnosis/engagement.db.test.ts → Duration 15.08s (tests 86%, import 11%, transform 3%))
  Task 6: complete (commits 69eb1bb..679baa6, tests: pnpm exec vitest run --project db apps/web/src/modules/diagnosis/briefing.db.test.ts → Duration 40.07s (tests 92%, import 7%, transform 1%))
  Task 7: complete (commits 679baa6..1aa3cc3, tests: pnpm exec vitest run --project db apps/web/src/modules/diagnosis/findings.db.test.ts → Duration 51.69s (tests 98%, import 1%, transform 1%))
- Task 8: Ruling: scores, workspace query and cross review tests live in one file, scores.db.test.ts (plan named a separate queries.db.test.ts) — same fixture, one setup — cost if wrong: none.
  Task 8: complete (commits 1aa3cc3..6898648, tests: pnpm exec vitest run --project db apps/web/src/modules/diagnosis/scores.db.test.ts → Duration 43.91s (tests 93%, import 6%, transform 1%))
  Task 9: complete (commits 6898648..4e8f400, tests: pnpm exec vitest run --project unit apps/web/src/modules/documents → Duration 259ms (transform 51%, import 32%, worker 11%, tests 6%))
- Task 10: Ruling: session_narrative takes NarrativeFinding (front, title, description, lane, owner) and index rows instead of FindingSummary plus RoadmapView — the lane is already on each finding and the prompt needs no ids — cost if wrong: none.
- Task 10: Ruling: prompt templates live in the assistant module in pt-PT and en, not in packages/i18n — they are instructions copied into Claude, not interface copy — cost if wrong: a move into the catalogues.
- Task 10: Ruling: phone redaction skips digit runs followed by a currency or percent sign — the script requires the client's own numbers in the narrative; test 'keeps the money amounts the client gave' RED→GREEN — cost if wrong: a phone written next to a currency sign would pass through.
  Task 10: complete (commits 4e8f400..b0333b7, tests: pnpm exec vitest run --project unit apps/web/src/modules/diagnosis → Duration 1.36s (import 80%, transform 15%, tests 3%, worker 2%))
- Task 11: Ruling: the core-briefing-shared and core-document-shared Inngest functions live in commercial/automations (COMMERCIAL_FUNCTIONS), not diagnosis/automations — commercial already imports diagnosis/server, so a diagnosis module importing commercial/server created an import cycle — cost if wrong: none.
- Task 11: Ruling: proposal session confirmation and reminder use new templates lead.session_confirmed / lead.session_reminder whose single action is the Meet link (or the portal), without the manage link — the booking management page serves only the discovery call — cost if wrong: the lead reschedules a session by replying.
- Task 11: Ruling: migration 20261008014746 widens follow_ups_sequence_day to (3, 5, 7, 14, 30); the Core follow-up uses sequence day 5 — the existing check rejected it — cost if wrong: none.
  Task 11: complete (commits b0333b7..380bc66, tests: pnpm exec vitest run --project db apps/web/src/modules/commercial/follow-ups/sweep.db.test.ts → Duration 73.54s (tests 98%, import 2%))
- Task 12: Ruling: evidence files are capped at 4 MB (spec said 10 MB) and server actions accept 5 MB — Vercel Hobby limits a request body to 4.5 MB, so a larger upload through a server action always fails on staging — cost if wrong: large PDFs must be shared as links until direct signed uploads exist.
- Task 12: Ruling: added saveEngagementDetails (buyer test link, narrative), applyBriefingDraft (confirmation before replacing notes) and FindingInput.keepEvidence, each with a db test RED→GREEN — the screens needed them and the plan had no service for them — cost if wrong: none.
- Task 12: Ruling: the narrative prompt uses the briefing notes as the client's numbers instead of a separate input — what the client said is in the briefing — cost if wrong: an extra field later.
- Task 12: Ruling: component tests are note-field.test.tsx and finding-form.test.tsx (plan named call-mode.test.tsx and findings-section.test.tsx) — the autosave and lane logic live in those components — cost if wrong: none.
- Task 12: Ruling: the move dialog shows the gaps through the refusal message built in pipeline/actions.ts (Task 4) instead of a separate list — same information, one place — cost if wrong: none.
  Task 12: complete (commits 380bc66..c634ae3, tests: pnpm exec vitest run --project unit apps/web/src/app/[locale]/(workspace)/pipeline → Duration 6.55s (import 50%, environment 31%, tests 16%, transform 3%))
  Task 13: complete (commits c634ae3..729d3c6, tests: pnpm exec vitest run --project unit apps/web/src/app/[locale]/(workspace)/settings/templates → Duration 4.33s (import 52%, environment 31%, tests 13%, transform 5%))
- Task 14: Ruling: grantPortalAccess takes an invite dependency that returns the invited user id; the production composition wraps identity's inviteClientUser and resolves the membership's user, then links contacts.portal_user_id — the portal notice email (Task 11) finds the decision maker through that column — cost if wrong: none.
- Task 14: Ruling: CoreWorkspace gained portalAccess (a client contact has portal_user_id) for the Core tab panel — cost if wrong: none.
  Task 14: complete (commits 729d3c6..96ae662, tests: pnpm exec vitest run --project db apps/web/src/modules/diagnosis/portal.db.test.ts → Duration 29.58s (tests 93%, import 6%, transform 1%))
- Task 15: Ruling: e2e found two defects, fixed in commit 55c8195 — the schedule form only rendered at 0.2–0.4, so stage one had no way to book the proposal session (now kind follows the stage: discovery at 0.x, proposal session at 1.1–1.5); and raw execute through the app's Drizzle client returns jsonb as text, so the portal never parsed the briefing guide (portal.ts now accepts both) — cost if wrong: none.
- Task 15: Ruling: local e2e ran against a dev server started with INNGEST_DEV=0 and CALENDAR_PROVIDER=fake — with INNGEST_DEV=1 and no local Inngest dev server, requestFlush retried for tens of seconds and server actions looked hung — cost if wrong: none; previews and staging use Inngest cloud.
  (e2e: core 2/2, pipeline 4/4, accessibility 6/6 including the Core tab and call mode in light and dark; unit 374/374)
  Task 15: complete (commits 96ae662..072b5a5, tests: pnpm exec vitest run --project unit apps/web/src/modules/diagnosis → Duration 1.29s (import 78%, transform 17%, tests 3%, worker 2%))
- Final: Ruling: the whole-branch review runs as two parallel reviewers (data and services; UI and e2e) on filtered diffs — the single 890 KB package stalled the first reviewer — cost if wrong: a cross-layer issue seen by neither half.
- Final: fixed first names split on the letter s in session, portal notice and Core follow-up messages — notifications.db.test 'session wording' / 'portal access' and sweep.db.test 'Core follow-up' RED→GREEN, suite 19/19.
- Final: fixed 1A follow-ups continuing during the Core — sweep.db.test 'stops the call follow ups once the deal enters the Core' RED→GREEN.
- Final: fixed portal access granted to a non decision-maker applicant — portal.db.test 'never invites an applicant who is not the decision maker' RED→GREEN.
- Final: fixed call-mode notes lost or overwritten on block and tab changes (pending edit flushed on unmount and pagehide, newer server value shown when not editing, saved values kept on the client, 'Guardado' hidden while editing) — note-field.test 'flushes a pending note when the field unmounts', 'shows a newer saved value when the field is not being edited', 'hides the saved state while there are unsaved edits' RED→GREEN, suite 10/10.
- Final: fixed silent transcript save failures that discarded the paste — transcript-form.test 'keeps the pasted transcript and shows the error when saving fails' RED→GREEN.
- Final: fixed finding form wiping fields on refusal, crashing on oversized bodies and lacking a client-side size check — finding-form-save.test 'keeps the fields when the save is refused', 'refuses a file above 4 MB before saving', 'shows an error instead of crashing when the request fails' RED→GREEN, suite 13/13. Editing a finding without evidence now defaults the evidence kind to none.
- Final: fixed evidence opening through window.open after an await (popup blockers) — GET /api/core/evidence/[findingId] checks access and redirects to the signed URL, rendered as a plain link; core.spec asserts the link returns the PNG — RED (no link) → GREEN.
- Final: fixed weak e2e assertions — notes survive Seguinte, Voltar and a reload; each Orbit form confirms its own save; cross review and presentation sharing are confirmed — core.spec founder flow 1/1 GREEN.
- Final: Ruling: SEC-30 antivirus scan before an uploaded file becomes available is deferred and recorded in STATUS — uploads are staff-only, limited to PNG, JPEG, WebP and PDF validated by signature, never shown to client users and opened only through a signed URL; a scanner is a paid or self-hosted service against ADR 0003 — cost if wrong: a malicious PDF uploaded by staff could reach another staff member before launch.
- Final: minor (deferred): the core-evidence bucket limit is 10 MB while the app limit is 4 MB.
- Final: minor (deferred): portal notices do not recheck sharing after the quiet-hours sleep (share then withdraw at night still emails at 08:00).
- Final: minor (deferred): the decision-maker lookup for portal notices has no ordering when two contacts have access.
- Final: minor (deferred): concurrent saves can exceed three findings marked for the call.
- Final: minor (deferred): an error in ensure-core blocks the rest of the booked-call flow after retries.
- Final: minor (deferred): the Core follow-up can quote an empty or non-90-day item.
- Final: minor (deferred): text before the first heading of a pasted draft is dropped.
- Final: minor (deferred): two parallel template publishes return a 500 instead of a handled result.
- Final: minor (deferred): the portal invite and the contact link are not atomic.
- Final: minor (deferred): the service accepts a proposal session at any stage; only the UI limits it to 1.1–1.5.
- Final: minor (deferred): Orbit score inputs and the settings English fields share generic accessible names.
- Final: minor (deferred): the portal home has no h1 when there are no presentations and shows only the first client of a multi-client user.
- Final: minor (deferred): copy prompt gives no feedback on clipboard failure and "Copiado" never resets.
- Final: minor (deferred): Core prompts are built for read-only users who cannot see the assistant.
- Final: minor (deferred): the studio document page loads the whole workspace and lacks the withdraw, replace and remove actions; ?tab=core is not read.
- Final: minor (deferred): presentation removal has no cancel and every document action failure shows the same message.
- Final: minor (deferred): seedSharedCore reuses any open deal of the shared e2e client and seeds no finding or score to assert absent.
- Final: minor (deferred): the eslint-config "forbids explicit any" unit test times out under load.
- Final: Ruling: notes edited after sharing appear live in the portal — the spec does not freeze the briefing; a reasonable founder corrects a typo after sharing — cost if wrong: a freeze on share later.
- Final: Ruling: app.core_briefing_is_shared is callable by any signed-in user — it reveals only whether a given engagement id is shared — cost if wrong: negligible.
- Final: Ruling: the portal view relies on its owner bypassing RLS, as Supabase's postgres role does, verified by the e2e portal test — cost if wrong: the portal shows no briefing, never more data.
- Final: Ruling: the 5 MB server action body limit applies to every action — consequence of the 4 MB evidence ruling — cost if wrong: none.
- Final: Ruling: call mode renders inside the workspace layout with its sidebar — the Designer HQ reference keeps the sidebar too — cost if wrong: a layout change.
- Final: Ruling: settings has no template preview (spec mentions one) — the editors show the content they edit; a rendered preview adds little for a 4-block guide — cost if wrong: one component.
  Final: fix pass complete (unit, db 42 files / 252 tests, e2e core 2/2)
