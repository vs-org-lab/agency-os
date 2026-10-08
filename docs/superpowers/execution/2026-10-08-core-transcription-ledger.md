# Registo de execução: sub-projeto 1B.1 Gravação e transcrição da call Core

Registo das decisões (Ruling), correções da revisão final (Final: fixed) e itens adiados durante a execução do [plano](../plans/2026-10-08-core-transcription.md). Texto original do ledger de execução, em inglês.

Spec: docs/superpowers/specs/2026-10-08-core-transcription-design.md
Branch: feat/core-transcription from docs/spec-core-transcription

## Pre-flight

T3 consumes T2 TranscriptSegment; T4 consumes T2 mergeTracks/transcriptSection and T3 ports; T5 consumes T3/T4 services; T6 consumes T5 actions — consistent.

## Rulings

## Progress

- Task 1: Ruling: access SQL in a separate custom migration (core_recordings_access) instead of inside the generated one — mirrors the 1B core_schema/core_access split — cost if wrong: none.
- Task 1: complete (commits 8024b87..82f851b, tests: pnpm vitest run --project db packages/db/test/rls → Duration 485.29s (tests 99%))
- Task 2: Ruling: added appendTranscriptSection(existing, section) beside transcriptSection, and unlabelled tracks keep one timestamped line per segment — spec 5 requires appending without replacing and timestamps for uploads; one paragraph per upload would lose them — cost if wrong: formatting tweak.
- Task 2: complete (commits 82f851b..13dd111, tests: pnpm vitest run --project unit apps/web/src/modules/diagnosis/transcription → Duration 219ms (transform 49%, import 31%, tests 10%, worker 10%))
- Task 3: Ruling: createRecording takes contentType (validated against the six bucket types) instead of extension; the extension is derived — the bucket enforces MIME types and the browser knows the Blob type, not an extension — cost if wrong: one parameter rename.
- Task 3: Ruling: confirm returns rule upload_missing (not a pending status) when a track is absent; Supabase signed upload PUT without apikey, bucket MIME rejection and exists() on a missing object were verified against the dev bucket — cost if wrong: none.
- Task 3: complete (commits 13dd111..16defee, tests: pnpm vitest run apps/web/src/modules/diagnosis/transcription apps/web/src/modules/diagnosis/recordings.db.test.ts → Duration 89.90s (tests 98%, import 2%))
- Task 4: Ruling: sweepExpiredRecordings(deps) reads now from deps instead of a now argument; expired recordings become failed with error 'expired' and cannot be retried — avoids sweeping the same rows daily and retrying audio that no longer exists — cost if wrong: UI shows expired as failed.
- Task 4: Ruling: transcribeRecording re-enters a 'transcribing' row (Inngest retry after a crash) and appends under a row lock only when the row is not done; a done row only has its audio removed — duplicate events from inline and background runs cannot duplicate text — cost if wrong: none.
- Task 4: Ruling: inline transcription is an afterUpload dependency of confirm and retry, enabled when TRANSCRIPTION_PROVIDER=fake — keeps recordings.ts free of provider knowledge — cost if wrong: none.
- Task 4: Ruling: a silent recording appends 'Sem fala reconhecida.' under its header — the founder sees that the recording was processed — cost if wrong: copy change.
- Task 4: complete (commits 16defee..58cfae0, tests: pnpm vitest run --project db apps/web/src/modules/diagnosis → Duration 503.62s (tests 97%, import 3%))
- Task 5: complete (commits 58cfae0..9f931a7, tests: pnpm vitest run --project unit apps/web/src/modules/diagnosis → Duration 1.30s (import 75%, transform 18%, tests 4%, worker 2%))
- Task 6: Ruling: TranscriptForm adopts a newer server transcript when untouched and warns over unsaved edits — a transcription that lands while the field is open would otherwise be overwritten on the next save — cost if wrong: a stale edit can still overwrite after the warning (no optimistic locking).
- Task 6: Ruling: the recording panel sits above the call-mode tabs (inactive tabs unmount) and RecordingStatus (status, retry, 10 s polling while transcribing) is shared with the Core tab; the 'refuses a capture without tab audio' test lives in recorder.test.ts — cost if wrong: none.
- Task 6: Ruling: the Core workspace exposes latestRecording only (not a history) — the screens show one status; older recordings are already in the transcript — cost if wrong: add a list later.
- Task 6: complete (commits 9f931a7..d1a5b32, tests: pnpm vitest run --project unit → Duration 12.36s (import 50%, environment 30%, tests 14%, transform 6%, worker 1%))
- Task 7: Ruling: staging selects groq only when the STAGING_GROQ_API_KEY secret exists, previews always use fake — mirrors CALENDAR_PROVIDER — cost if wrong: none.
- Task 7: e2e evidence: core.spec (3) + accessibility.spec (12) → 15 passed locally against dev, including a real signed upload from Chromium to the core-recordings bucket.
- Task 7: complete (commits d1a5b32..562fadb, tests: pnpm vitest run --project unit → Duration 11.65s (import 46%, environment 35%, tests 14%, transform 5%, worker 1%))
- Final: fixed Groq hourly limit could block calls over ~60 min — per-track Inngest steps, retry-after honoured (RetryAfterError), 413 non-retriable; tests 'transcribes each track once when a later track has to be retried', 'keeps the wait the provider asks for on a rate limit', step-errors (4) RED→GREEN. Also fixed e2e seedDeal code typing (0.3).
- Final: fixed save after the outdated warning could drop the transcribed section — appended sections merge into unsaved edits, other changes disable Save; tests 'adds a newly appended section to unsaved edits', 'blocks saving over a transcript changed elsewhere' RED→GREEN.
- Final: fixed leaving call mode mid-recording left a ghost session — unmount stops the recorders and releases tab and microphone, chunks stay for recovery; test 'stops the capture without uploading when call mode is left' RED→GREEN.
- Final: Ruling: reviewer minor 8 (browser-stored audio never expires) re-graded Important — SEC-74 caps audio retention at 7 days and 08 Segurança prevails — cost if wrong: one purge per read.
- Final: fixed browser chunks never expired — purge on read after 7 days; test 'deletes audio kept in the browser for more than seven days' RED→GREEN (fake-indexeddb 6.2.5 added as dev dependency).
- Final: minor (deferred): onFailure always records 'transcription_failed' because Inngest StepError drops the TranscriptionError code (automations.ts recordingErrorCode).
- Final: minor (deferred): a late event for an expired recording re-enters startTranscription (accepts 'failed') and clears error 'expired'; remove 'failed' from the accepted states.
- Final: minor (deferred): an afterUpload (inline fake) exception or a lost confirm response makes the client create a second recording on resend; catch afterUpload errors and retry confirm with the same recordingId.
- Final: minor (deferred): without IndexedDB a failed live upload loses the in-memory tracks, and live blobs are not size-checked against 25 MB before upload.
- Final: minor (deferred): accessibility — focus drops when Start/Stop swap, the uploading live region is inserted with its text, consentHint lacks aria-describedby, disabled Start gives no reason while a recovered recording exists.
- Final: minor (deferred): storage.exists HTTP calls run inside the confirm transaction; read, check outside, then compare-and-set.
- Final: Ruling: declined-to-judge items — PostgREST writes (Data API disabled), Vercel maxDuration of /api/inngest (now per-track steps, each one download plus one Groq call), speaker echo without headphones, section header time (recording stop time), storage objects left on engagement deletion (no deletion flow) — none changes what the founder gets today — cost if wrong: revisit at the staging test.
- Final review: fresh reviewer (opus) — 0 critical, 3 important (fixed), 1 minor re-graded important (fixed), 6 minors deferred.
