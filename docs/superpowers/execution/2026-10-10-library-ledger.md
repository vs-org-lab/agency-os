# Registo de execução: sub-projeto 2E.1 Biblioteca

Registo das decisões (Ruling), correções da revisão final (Final: fixed) e itens adiados durante a execução do [plano](../plans/2026-10-10-library.md). Texto original do ledger de execução, em inglês.

Spec: docs/superpowers/specs/2026-10-10-library-design.md
Branch: feat/library-documents

## Ledger

- Pre-flight: T3 produces libraryWriter/LibraryDeps consumed by T4/T5; T4 produces files consumed by T5/T6 (FileView kinds match LibraryFileKind); T6 consumes portal_library_files from T1. No conflicts.
- Task 1: Ruling: RED for the RLS tests was observed on the missing fixture export before the schema existed; the env-less first run was discarded — cost if wrong: none, the tests then failed on a real assertion (freelancer assignment) before passing
- Task 3: Ruling: folder implementation was written before its tests were run; verified instead by a mutation check (access and depth rules disabled → 2 tests fail) — cost if wrong: an untested branch in folders.ts
- Task 1: complete (commits 1519956..d9be37a, tests: pnpm test:db packages/db/test/rls/library.test.ts packages/db/test/rls/isolation.test.ts → Duration 860.99s (tests 100%))
- Task 2: complete (commits d526a11..d9be37a, tests: npx vitest run --project unit apps/web/src/modules/library → Duration 245ms (transform 56%, import 28%, tests 8%, worker 8%))
- Task 5: Ruling: getStaffLibrary/getPortalLibrary(tx, …) became loadLibrary(claims, input, source, deps) — permissions need libraryWriter, which runs outside the read transaction — cost if wrong: a rename in later tasks
- Task 5: Ruling: written before its tests ran; mutation check (portal read from the tables, zip ceiling disabled) → 2 tests fail
- Task 5: Ruling: kind filters image/video/document span the whole project like search, not only the current folder — a filter is most useful as a project-wide view — cost if wrong: one condition
- Task 3: complete (commits 860c7f1..131ecf5, tests: pnpm test:db apps/web/src/modules/library/folders.db.test.ts → Duration 63.41s (tests 92%, import 5%, transform 3%))
- Task 4: complete (commits 6fbd8b4..131ecf5, tests: pnpm test:db apps/web/src/modules/library/files.db.test.ts → Duration 62.19s (tests 92%, import 5%, transform 3%))
- Task 6: Ruling: updates-files tests look updates up by body, not by created_at — inside one test transaction every now() is equal — cost if wrong: none
- Task 7: Ruling: uploads happen only inside a folder; the library root shows "Abra ou crie uma pasta" — files always live in a folder (spec 2) and a root upload would need a separate root-creation path — cost if wrong: one extra click for the team
- Task 7: Ruling: grid thumbnails load the file itself for images up to 5 MB, larger images keep the icon — Supabase image transformations are a paid feature (ADR 0003) — cost if wrong: heavier grid on slow connections
- Task 7: Ruling: file downloads go through GET /api/library/files/[fileId] (authorise, then 302 to a 15-minute link), like proofs — usable from server and client components without threading actions — cost if wrong: none
- Task 7: Ruling: attachment_hidden is handled in the composer instead of ROOM_ERRORS — ROOM_ERRORS types other namespaces (rooms.delivery.errors) — cost if wrong: none
- Task 7: Ruling: added download_failed for a ZIP whose files fail to fetch — upload_failed copy would mislead — cost if wrong: none
- Task 5: complete (commits d9be37a..2d1674f, tests: pnpm test:db apps/web/src/modules/library/readers.db.test.ts → Duration 71.56s (tests 93%, import 4%, transform 2%))
- Task 6: complete (commits 131ecf5..2d1674f, tests: pnpm test:db apps/web/src/modules/rooms/updates-files.db.test.ts → Duration 41.08s (tests 88%, import 10%, transform 2%))
- Task 7: complete (commits 214ac94..433b5db, tests: pnpm test → Duration 30.55s (import 48%, environment 33%, tests 13%, transform 5%, worker 1%))
- Task 8: complete (commits 2d1674f..433b5db, tests: npx playwright test e2e/library.spec.ts --project desktop → 1 passed (1.3m))
- Final review: opus fresh reviewer — 1 critical, 2 important, 9 minor; all five Review Focus items hold
- Final: fixed quota bypass (declared sizes unchecked, waiting uploads uncounted, no lock, unconfirmed objects kept) — "a confirmed upload must match its declared size", "uploads still waiting count against the quota", "stale uploads are removed with their stored objects" RED→GREEN; per-organisation advisory lock in fitsStorage; hourly library-stale-uploads function (registry test RED→GREEN); files db 9/9
- Final: fixed folder names with separators, dots or control characters reaching the browser ZIP (zip-slip) — "folder names cannot carry path separators, dots or control characters", "zip path segments cannot escape the archive", control characters in upload paths RED→GREEN; library_*_name_safe CHECK constraints (migration dry-run and applied to dev); folders db 6/6, domain 7/7
- Final: fixed proof uploads not counted against the 900 MB organisation ceiling — "a proof that would pass the organisation storage ceiling is refused" RED→GREEN; proofing files db 5/5; full unit 637/637
- Final: minor (deferred): an upload link stays valid for ~2 h after a rejection, and objects can be orphaned when signing fails mid-batch, a root turns internal before an operational confirm, or storage removal fails after the DB commit (the hourly sweep covers uploads still waiting)
- Final: minor (deferred): any ISO-BMFF ftyp header is accepted as video/mp4 (HEIC, AVIF, M4A)
- Final: minor (deferred): Office manifest searched only in the first 64 KB; generators that write it late are refused
- Final: minor (deferred): large ZIPs fetch entries sequentially with 15-minute links and hold the archive in memory (.blob())
- Final: minor (deferred): grid thumbnails cost a route round trip each and are never cached
- Final: minor (deferred): one bad path refuses a whole upload batch while earlier batches stay committed; .DS_Store and Thumbs.db count as refused
- Final: minor (deferred): parallel folder uploads creating overlapping subfolders in different order can deadlock (40P01) and show a generic failure
- Final: minor (deferred): MAX_UPDATE_ATTACHMENTS defined in rooms/updates.ts and library/domain/limits.ts
- Final: minor (deferred): stored objects keep the client's content type; ZIP manifest links are signed without download, so a verified SVG opened from one renders inline on the Supabase origin
- Final: Ruling: agent role excluded from library reads by can_read_project, as in every earlier module — project-wide policy, not 2E.1 — cost if wrong: agents cannot read the library until the access helper changes
- Final: Ruling: uploader names shown to clients through portal_library_files, following the portal views of earlier modules — cost if wrong: a product decision to revisit
