# Registo de execução: sub-projeto 1A Comercial

Registo completo das decisões (Ruling), descobertas corrigidas (Final: fixed) e itens adiados durante a execução do [plano](../plans/2026-10-07-commercial.md). Texto original do ledger de execução, em inglês.

Spec: docs/superpowers/specs/2026-10-07-commercial-design.md
Branch: feat/commercial from develop a03ef3d

## Rulings

- Setup: Ruling: one branch feat/commercial with one commit series per task and a single PR after the final review, instead of a branch and PR per task — matches the foundation execution and keeps the RLS coverage test green only once Tasks 1 and 2 land together — cost if wrong: a larger PR to review.

## Pre-flight

| Consumer ← Producer        | Interface                                                                                                  | Finding                                                                             |
| -------------------------- | ---------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| T2 ← T1                    | tables, enums                                                                                              | consistent                                                                          |
| T4 ← T3                    | evaluateTransition, PendingModule, TransitionRefusal                                                       | consistent; actor union 'system' / 'founder' / 'staff' mapped from StageActor in T4 |
| T7 ← T4, T5, T6            | applyStageChange, scoreApplication, answersSchemaFor, assessSubmission, consumeThrottle                    | consistent                                                                          |
| T9 ← T6, T7                | submitApplication, signToken('apply_thanks')                                                               | consistent                                                                          |
| T11 ← T10                  | Interval                                                                                                   | consistent                                                                          |
| T12 ← T4, T6, T10, T11     | applyStageChange, signToken('booking_link'), computeAvailableSlots, getHostCalendar, markConnectionRevoked | consistent                                                                          |
| T13 ← T8, T11, T12         | renderEmail, emailPort, nextAllowedSendTime, newManageToken, getHostCalendar                               | consistent                                                                          |
| T14–T19 ← T3, T4, T12, T13 | changeDealStage, updateDealTracking, bookCall, follow-ups                                                  | T15 manual scheduling needs a user-actor booking path; ruled at T15                 |

## Tasks

- Task 1: Ruling: drizzle-kit emitted the timeline_kind column type without the app schema; the generated migration is corrected by hand to "app"."timeline_kind" (snapshot already correct) — the push fails otherwise — cost if wrong: none.
- Task 1: Ruling: submission_throttle unique key includes organization_id — throttle windows stay per organization — cost if wrong: none.
  Task 1: complete (commits a03ef3d..1148496, tests: pnpm test:db packages/db/test/schema.test.ts → Duration 30.60s (tests 98%, import 2%, transform 1%))
- Task 6: Ruling: the new variables are parsed by a separate commercialEnv() instead of extending serverEnv() — existing deployments keep signing in until the workflows gain the variables in Tasks 20 and 21 — cost if wrong: none.
- Task 6: Ruling: consumeThrottle takes the secret and hashes the key itself — callers cannot store a raw IP or email by mistake — cost if wrong: none.
- Task 2: Ruling: createCommercialFixture returns { formId, a, b } with contact, deal, call and application per client instead of { dealA, dealB, callA, contactA } — the isolation test needs rows for both clients in every new table — cost if wrong: none.
- Task 2: Ruling: isolation test wraps each table probe in a savepoint — a permission error aborts the transaction and the new tables follow domain_events — cost if wrong: none.
  Task 2: complete (commits 1148496..ef953c7, tests: pnpm test:db packages/db/test/rls/commercial.test.ts packages/db/test/rls/coverage.test.ts → Duration 121.51s (tests 99%, import 1%))
- Task 3: Ruling: transitions check structure (next, stage link, step back) before module gating — an impossible jump such as 0.1 → 2.5 reports not_allowed instead of a misleading module_pending — cost if wrong: none.
- Task 3: Ruling: X.1 and X.2 may move to any other X state, not only reopen — a paused deal can be closed as lost in one step — cost if wrong: one extra transition allowed.
- Task 4: Ruling: PipelineDeps gains an optional flush (default requestFlush) and StageChangeResult includes not_found — tests run without Inngest; a missing deal is reported, not thrown — cost if wrong: none.
- Task 6: note: throttle.db.test.ts was written before throttle.ts but its RED run was not observed separately (unit RED covered the other protection files); it passed 4/4 after implementation.

## PAUSE (2026-10-07, at the founder's request)

State when paused:

- Committed: Tasks 1 and 2 (ledger lines above).
- Done but NOT yet committed (all green, files in working tree):
  - Task 3: pipeline/codes.ts, codes.test.ts, transitions.ts, transitions.test.ts, i18n messages (commercial.pipeline.*) — 50 unit tests pass.
  - Task 4: pipeline/service.ts, service.db.test.ts, commercial/timeline.ts, audit/actions.ts, events/emit.ts, packages/db/src/index.ts (type exports) — 7/7 db tests pass.
  - Task 5: applications/form-definition.ts(+test), default-form.ts, scoring.ts(+test) — unit tests pass.
  - Task 6: platform/signed-token.ts(+test), protection/{bot-checks,personal-email,throttle}.ts(+tests), platform/env.ts (commercialEnv), .env.example; .env.local gained PUBLIC_LINK_SECRET, PUBLIC_ORGANIZATION_SLUG, APP_BASE_URL — unit 10/10, throttle db 4/4.
- In progress: Task 7 (applications/forms.ts, submit.ts, submit.db.test.ts). Last run: 8/9 pass; failing test "stores form version, score, knockouts, source and consent timestamp" — read .superpowers/sdd/2026-10-07-commercial/t7.log and debug (systematic-debugging) before continuing.

Resume steps:

1. Commit Tasks 3, 4, 5, 6 as separate commits with the plan's messages and run task-done for each.
2. Fix the Task 7 failure, run submit.db.test.ts, commit, task-done.
3. Continue with Task 8.

## PAUSE 2 (2026-10-07, before a PC restart)

Changes since PAUSE 1 (all on disk, nothing committed yet; Bash was unavailable because the auto-mode classifier returned no verdict):

- Task 7 failure diagnosed: the test compared `consent_at.toISOString()` but the test connection returns timestamptz as a string. Test fixed to `new Date(application?.consent_at ?? 0).toISOString()`. Code unchanged. Rerun `pnpm test:db apps/web/src/modules/commercial/applications/submit.db.test.ts` — expected 9/9.
- Task 8 tests written (RED not yet run): apps/web/src/modules/email/templates.test.ts, quiet-hours.test.ts, smtp.test.ts, capture.db.test.ts.
  Interfaces fixed by these tests:
  - templates.ts: `EMAIL_TEMPLATE_KEYS`, `EmailTemplateKey`, `EmailParams` (map key → params), `renderEmail(key, locale, params)` → `{ subject, html, text }`; exactly one `<a ` per HTML (meet link rendered as text, not an anchor); params escaped; copy in i18n `email.*` via next-intl `createTranslator` with onError throwing.
  - quiet-hours.ts: `nextAllowedSendTime(now, timeZone)` (08:00–20:00 local, unknown zone falls back to Europe/Lisbon; uses @date-fns/tz, to install now — ruling: installed in Task 8 rather than Task 10) and `senderName(fullName, agencyName)` ("Vladimir, Aurion"; blank name → agency only).
  - smtp.ts: `type MailTransport = { sendMail(options): Promise<unknown> }`; `createSmtpEmailPort(config, createTransport?)`; sends `{ from: { name, address: user }, to, subject, html, text }`.
  - capture.ts: `createCaptureEmailPort(contexts)` inserting into captured_emails.
  - `OutgoingEmail` includes `organizationId: string | null`.
- Dependencies still to install for Task 8: nodemailer, @types/nodemailer, date-fns, @date-fns/tz (apps/web).

## Update after restart (shell still blocked by the auto-mode classifier)

Written without being able to run anything (RED for these tests was NOT observed; run them first and record the outcome honestly):

- Task 8 implementation: email/port.ts, smtp.ts, capture.ts, quiet-hours.ts, templates.ts, server.ts, index.ts; platform/env.ts gained emailEnv() (EMAIL_TRANSPORT smtp | capture with SMTP__). Copy for email._ lives in scratchpad messages-t8.json — merge with scratchpad add-messages.mjs (`node add-messages.mjs messages-t8.json`) before running templates.test.ts.
- Task 10 tests and implementation: commercial/booking/slots.ts and slots.test.ts.
- Still to install: nodemailer, @types/nodemailer, date-fns, @date-fns/tz in apps/web.

Resume order after restart:

1. `git status` to confirm the uncommitted files listed in PAUSE 1 and PAUSE 2 are present.
2. Commit Tasks 3–6 (separate commits), task-done each.
3. Rerun Task 7 tests → commit → task-done.
4. Task 8: install deps, run RED, implement, GREEN, commit.
   Task 3: complete (commits ef953c7..e44628d, tests: pnpm test apps/web/src/modules/commercial/pipeline packages/i18n → Duration 1.22s (import 58%, transform 28%, worker 8%, tests 7%))
   Task 5: complete (commits a100972..e44628d, tests: pnpm test apps/web/src/modules/commercial/applications → Duration 659ms (import 85%, transform 11%, tests 2%, worker 1%))
   Task 4: complete (commits 9845adf..a3e949f, tests: pnpm test:db apps/web/src/modules/commercial/pipeline/service.db.test.ts → Duration 63.96s (tests 79%, import 20%, transform 1%))
   Task 6: complete (commits e44628d..a3e949f, tests: pnpm test:db apps/web/src/modules/commercial/protection/throttle.db.test.ts → Duration 20.23s (tests 96%, import 3%, transform 1%))

- Task 7: Ruling: the consent timestamp assertion compares new Date(value) because the test connection returns timestamptz as text — the code was correct — cost if wrong: none.
  Task 7: complete (commits a3e949f..04ec9bc, tests: pnpm test:db submit.db.test.ts → 9/9 pass)
- Task 8: Ruling: emailEnv() is a separate accessor (EMAIL_TRANSPORT smtp | capture), like commercialEnv(); it was committed with Task 6's env.ts — foundation flows do not require the new variables — cost if wrong: none.
- Task 8: Ruling: date-fns, @date-fns/tz and @dnd-kit/core were installed with nodemailer in the Task 8 commit — one install during the shell outage recovery — cost if wrong: none.
- Task 8: note: email tests were written before the implementation but their RED run could not be observed (shell blocked); GREEN afterwards: unit 20/20 with slots, capture.db 1/1.
  Task 8: complete (commits 04ec9bc..d3b1996, tests: pnpm test apps/web/src/modules/email → pass; capture.db 1/1)
- Task 10: note: slots.test.ts was written before slots.ts; RED not observed for the same reason; GREEN afterwards.
  Task 10: complete (commits d3b1996..5285922, tests: pnpm test apps/web/src/modules/commercial/booking → pass)
- Task 9: in progress — security-headers embed rule done (RED observed, 9/9 GREEN), uncommitted.
- Task 9: Ruling: next.config sets agentRules: false and the generated apps/web/AGENTS.md and CLAUDE.md are not kept — the root CLAUDE.md is the single source of project guidance — cost if wrong: none.
- Task 9: Ruling: the module boundary lint rule accepts @/modules/<name>/server as a second public entry point — client components import the isomorphic index while server compositions stay behind server-only — cost if wrong: none.
- Task 9: Ruling: no (public)/layout.tsx — the public frame is a PublicFrame component rendered by each page, because layouts do not receive searchParams and ?embed=1 hides the header — cost if wrong: none.
- Task 9: Ruling: the consent text names the privacy policy without a link — the policy page belongs to the site, which does not exist yet; tracked in STATUS — cost if wrong: the link is added when the site publishes the policy.
  Task 9: complete (commits 5285922..e739ce9, tests: pnpm test apps/web/src/platform apps/web/src/app → Duration 5.20s (tests 44%, import 23%, environment 21%, transform 11%, worker 1%))
- Task 11: Ruling: calendar settings use calendarEnv() (CALENDAR_PROVIDER fake by default, google requires GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET) and the OAuth state cookie is a signed token of purpose google_oauth — consistent with the other link tokens — cost if wrong: none.
- Task 11: Ruling: getHostCalendar falls back to the first active founder when commercial_settings has no host — the fake calendar and a fresh organization still have a host for calls — cost if wrong: none.
  Task 11: complete (commits e739ce9..9a82eea, tests: pnpm test apps/web/src/modules/commercial/calendar → Duration 326ms (import 41%, transform 28%, tests 27%, worker 4%))
  (connections.db.test.ts 6/6 in t11.log)
- Task 12: Ruling: 'concurrent bookings for the same slot book only one' runs the two bookings one after the other — the rollback test harness shares one connection, so true parallelism cannot be reproduced; the guarantee comes from pg_advisory_xact_lock per host plus the re-check of the slot inside the transaction — cost if wrong: a race would surface only under real concurrency.
- Task 12: Ruling: the calendar event summary is '<organization> · <company>' and the description holds only the lead's own long-text answers (cost of inaction) — the lead is an attendee and must not see the score or internal notes — cost if wrong: the founder reads the score in the deal screen instead of the event.
- Task 12: Ruling: cancelling returns the deal to 0.2 only when it is still at 0.3 — a deal the founder already moved is not regressed by a lead cancellation — cost if wrong: none.
- Task 12: Ruling: sendCallConfirmation (rotating the manage token) is not part of bookCall; the email with the manage link is sent by the Task 13 automation on commercial.call.booked — the raw token is never persisted — cost if wrong: none.
  Task 12: complete (commits 9a82eea..ff4ca31, tests: pnpm test apps/web/src/components/public → Duration 3.14s (environment 41%, import 35%, tests 19%, transform 5%))
  (service.db.test.ts 10/10 in t12.log; manual browser check of apply → thanks A → book → confirmed against e2e-studio with the fake calendar)
- Task 13: Ruling: the application source now stores the visitor locale — lead emails (confirmation, reminders, cancellation, booking link) are sent in the language the lead applied in — cost if wrong: none.
- Task 13: Ruling: follow-ups use the highest threshold (3, 7, 14, 30) not yet created for the elapsed local days — a missed daily run still produces the follow-up the next day instead of skipping it — cost if wrong: none.
- Task 13: Ruling: alertNewApplication and remindPendingQueueB live in applications/alerts.ts with their own db tests (founder alert content and queue B reminder); their RED run was not observed because alerts.ts was written in the same step — GREEN afterwards.
- Task 13: Ruling: Inngest functions are thin compositions over tested services; they are verified by typecheck and by the dev endpoint reporting 15 functions (8 plus 7 failure handlers), not by unit tests — cost if wrong: a wiring error surfaces in staging.
  Task 13: complete (commits ff4ca31..3f8bce4, tests: pnpm exec vitest run --project unit follow-ups → Duration 208ms (transform 52%, import 31%, worker 10%, tests 6%))
  (db: sweep 5, anonymize 3, notifications 5 = 13/13 in t13.log; alerts 2 + submit 9 = 11/11 in t13b.log)
- Task 14: Ruling: the studio shows the commercial items through canSeePipeline(actor) (founder, project manager or finance with MFA) instead of authorize(actor, 'read', { type: 'pipeline' }) without a client — the matrix scope 'own' needs a client id, so authorize would hide the pipeline from managers; RLS still limits what they see — cost if wrong: none.
- Task 14: Ruling: the move dialog (Mover para…) is the single path for keyboard moves and for reasons; dragging to X.4 or back opens it pre-filled — one place validates the reason — cost if wrong: none.
- Task 14: Ruling: prospects are excluded in listVisibleClients and findVisibleClient, so the sidebar hides them and /c/[clientId] returns 404 through the existing room access check — cost if wrong: none.
- Task 14: note: the signed-in visual check of /pipeline is covered by the Task 20 end-to-end and axe runs (seeded founder with TOTP).
  Task 14: complete (commits 3f8bce4..a2d8bbf, tests: pnpm exec vitest run --project unit navigation board → Duration 4.03s (tests 37%, environment 31%, import 27%, transform 5%))
  (db: queries 6/6 in t14.log)
- Task 15: Ruling: getDealDetail lives in deal-detail.ts (not queries.ts) and the pipeline compositions in pipeline/studio.ts — queries.ts stays focused on the board and the heredoc append failed in this shell — cost if wrong: none.
- Task 15: Ruling: manual scheduling uses the acting user as host and creates the calendar event only when that user is the calendar host; the automation still sends the lead confirmation — cost if wrong: a manager-hosted call has no calendar event until 1D or M11.
  Task 15: complete (commits a2d8bbf..6a38621, tests: pnpm exec vitest run --project db calls contacts → Duration 73.86s (tests 95%, import 4%, transform 1%))
- Task 16: Ruling: a migration grants authenticated users update of review_decision, reviewed_at and reviewed_by on applications under can_write_pipeline — the review is recorded in the user context so the audit keeps the reviewer; Task 2 granted only select — cost if wrong: none.
  Task 16: complete (commits 6a38621..cf9df3e, tests: pnpm exec vitest run --project db review → Duration 47.20s (tests 96%, import 3%, transform 1%))
- Task 17: Ruling: converting a target inserts the prospect client with an application-generated id and no RETURNING — the clients select policy cannot see the row inside the inserting statement, so INSERT … RETURNING fails RLS for the founder — cost if wrong: none.
  Task 17: complete (commits cf9df3e..505b795, tests: pnpm exec vitest run --project db acquisition → Duration 20.45s (tests 95%, import 4%, transform 1%))
- Task 18: Ruling: the founder home now shows Today instead of the foundation empty state; the three foundation e2e checks expecting 'O estúdio está pronto' / 'The studio is ready' now expect 'Hoje' / 'Today' — cost if wrong: none.
  Task 18: complete (commits 505b795..6426446, tests: pnpm exec vitest run --project db today → Duration 23.98s (tests 96%, import 3%, transform 1%))
- Task 19: Ruling: getCommercialSettings returns the defaults without inserting a row when none exists — non-founders cannot insert under RLS; updateBookingSettings upserts — cost if wrong: none.
  Task 19: complete (commits 6426446..61f10ba, tests: pnpm exec vitest run --project db settings/service → Duration 24.62s (tests 96%, import 3%, transform 1%))
- Task 20: Ruling: the booking link carries the signed token in the query string (/apply/book?token=…) — the proxy matcher skips paths containing a dot, so a path token bypassed the locale middleware and returned 404; links.test.ts RED→GREEN — cost if wrong: none.
- Task 20: Ruling: the hourly application limit per IP is configurable (APPLY_IP_LIMIT_PER_HOUR, default 5); previews and local e2e raise it to 1000 because every test submits from one IP; staging and production keep 5 — cost if wrong: preview is exposed to more submissions per IP, with no real data.
- Task 20: Ruling: APP_BASE_URL falls back to https://VERCEL_URL when unset — preview URLs are only known after deploy — cost if wrong: none.
- Task 20: Ruling: the studio accessibility test runs with a 5-minute timeout (12 screens × 2 themes after one sign-in) and the board columns use text-secondary for counts and empty states (axe color-contrast) — cost if wrong: none.
  Task 20: complete (commits 61f10ba..953c52b, tests: pnpm exec vitest run --project unit booking/links → Duration 327ms (import 67%, transform 27%, worker 4%, tests 2%))
  (local e2e: full suite 27/29 then the 2 accessibility runs fixed → studio a11y 2/2; commercial-apply 5/5 and pipeline 4/4 green; preview run pending the PR)
- Task 21: Ruling: staging selects CALENDAR_PROVIDER=google only when STAGING_GOOGLE_CLIENT_ID exists, otherwise fake — staging keeps working before the founder creates the Google project — cost if wrong: none.
  Task 21: partial (commit 7e6b7e3 staging CI; Google Cloud project, Inngest staging sync and the founder's real test pending)

## Final review (a03ef3d..7e6b7e3)

- Final: fixed design finding: deal application quote side accent border removed (97e2c89).
- Final: fixed #1 Critical: call reminders never sent because wall-clock branches outside steps diverged on replay — reminders now always sleep and decide inside their step (reminderIsDue, 30 min grace); call-flow.test.ts replays the flow with a memoising fake step, RED (reminders []) → GREEN (c1a6dc5).
- Final: fixed #3: the booked-call automation syncs only calls whose host owns the connected calendar (syncPendingCall); db test (c1a6dc5).
- Final: fixed #4: sync failures mark the call failed instead of failing the run; a 404 on update recreates the event; attendees are omitted without an email; db tests (c1a6dc5). Ruling: db tests for syncPendingCall were written before the function and their RED was a missing export, not a behavioural failure.
- Final: fixed #7: a 401 is retried once with a fresh token; rate-limit 403 and repeated 401 are provider errors; only invalid_grant or a permission 403 revoke; google.test.ts RED → GREEN (c1a6dc5).
- Final: fixed #2: manage token is HMAC(PUBLIC_LINK_SECRET, "manage:" + callId); confirmation and reminder carry the same link; links.test.ts and notifications.db.test.ts RED → GREEN (aaffa25). Ruling: rotating PUBLIC_LINK_SECRET invalidates manage links already sent — cost if wrong: leads use the booking link instead.
- Final: fixed #6: moving a deal to X.3 or X.4 cancels its scheduled calls in the same transaction, emits commercial.call.cancelled with notifyLead false and the external event id; the automation deletes the event and skips the lead email; queue B rejection returns stage_refused and rolls back when the pipeline refuses; db tests RED → GREEN (2075b4e).
- Final: fixed #5: deal_stage_changes.sequence identity column orders the history (c914a7b, migration 20261007193703). Ruling: the tie could not be reproduced (Postgres returned the right row by chance); the regression test guards the behaviour. The migration is not yet applied to dev — the auto-mode classifier refused the push and it waits for the founder's authorisation.
- Final: fixed #8: anonymisation runs per client — all applications, contacts, deal titles, lost reasons, next steps, call notes and follow-up messages; db test RED → GREEN (4a9ee80). Ruling: the anonymize tests assert their own rows instead of the global count — the sweep is global and dev holds e2e leftovers.
- Final: fixed stale tests from the full db run: audit and outbox "foundation" assertions now check inclusion (commercial added actions and events); booking-link email expects /apply/book?token=. Pipeline failures in that run were network errors to the dev pooler (ENOTFOUND, CONNECTION_CLOSED).
- Final: fixed lint: e2e spec used an inline import() type (56b1307).
- Final: minor (deferred): re-application with an open deal sends a booking link that opens to "closed" and B re-applications land in queue B — gate on isNewDeal and current stage.
- Final: minor (deferred): recordCallOutcome does not check the call state and ignores refused stage changes.
- Final: minor (deferred): Google freeBusy and token refresh run inside the booking transaction.
- Final: minor (deferred): duplicate-contact protection relies on the throttle row lock; contact lookup without ordering.
- Final: minor (deferred): public booking GET calls freeBusy without throttle; invalid submissions skip the throttle; unknown answer keys accepted.
- Final: minor (deferred): consentTextVersion comes from the client.
- Final: minor (deferred): scheduleCallManually takes no host lock and no overlap check.
- Final: minor (deferred): hand-scheduled calls fall back to Europe/Lisbon instead of the settings time zone in emails.
- Final: minor (deferred): __Host- OAuth cookie deletion without Secure; connectGoogleAction lets a non-founder start consent.
- Final: minor (deferred): overlapping weekly windows produce duplicate slots.
- Final: minor (deferred): no cleanup of submission_throttle rows.
- Final: minor (deferred): nextStepOwnerUserId accepts users outside the organisation.
- Final: minor (deferred): eslint-config "forbids explicit any" unit test timed out once in the reviewer's run.
- Final: minor (deferred): deal_stage_changes.reason is append-only and can hold free text with personal data; anonymisation cannot clear it.
- Final: declined to judge, ruled: .bind arguments on public actions — every token is re-verified server side, no change. Inngest cancelOn on the same event that triggers the run — verify in staging with a real reschedule. x-forwarded-for trust on Vercel — Vercel overwrites the header, accepted. Hosted Supabase postgres and vault — covered by the staging calendar test. RN-11 contact overwrite — sanctioned by the spec. Booking-link email in quiet hours — solicited, no change. Follow-up sequence restart — spec silent, no change. Direct pipeline_code updates through RLS — moot while the Data API is off.
