# Registo de execução: fundação da plataforma

Registo completo das decisões (Ruling), descobertas corrigidas (Finding fixed) e itens adiados durante a execução do [plano](../plans/2026-10-06-platform-foundation.md). Texto original do ledger de execução, em inglês.

Spec: docs/superpowers/specs/2026-10-06-platform-foundation-design.md

## Pre-flight

- T4→T5/T6/T7/T8: DbTransaction, withTestTransaction, createFixtureWorld, asUser produced in T4; consumers match.
- T7→T8/T13: withSystemContext produced in T7, consumed by T8 (outbox) and T13 (invitations). Order fixed in plan.
- T7→T9: getVerifiedClaims (T7) consumed by getActor (T9). Matches.
- T9→T12/T13/T15: Actor, authorize, getActor. Matches.
- T6→T12/T13/T14: recordAudit(tx, entry). Matches.
- T11→T13: validatePassword reasons match setPassword error union.
- T3→T12: Locale type. Matches.

## Rulings

- Setup: Ruling: single branch feat/platform-foundation for Tasks 1–18 instead of one branch per task — executing-plans reviews one branch at the end and CI only exists from Task 18 — cost if wrong: one larger PR to review.
- Setup: Ruling: plan headings renamed "Tarefa N" → "Task N" — execution scripts parse "Task N" — cost if wrong: none.

## Progress

- Task 1: Ruling: TypeScript 6.0.3 instead of 7.x and ESLint 9.39.5 instead of 10 — typescript-eslint supports TS <6.1 and eslint-plugin-react supports ESLint ≤9 — cost if wrong: upgrade later when plugins support them.
- Task 1: Ruling: vitest.workspace.ts replaced by root vitest.config.ts with projects `unit` and `db` — workspace files are deprecated in Vitest 5 — cost if wrong: none.
- Task 1: Ruling: lint runs as a single root `eslint .` instead of per-package turbo task — one flat config covers the repo — cost if wrong: slower lint on a large repo.
  Task 1: complete (commits 64cc17c..cba572f, tests: pnpm test → Duration 2.45s (tests 87%, import 12%, transform 1%))
- Task 2: Ruling: shadcn resolved the `utils` alias to the npm package "cn"; package removed and imports pointed to @agency-os/ui/lib/utils — avoids an unvetted dependency — cost if wrong: none.
- Task 2: Ruling: shadcn-appended sidebar colour variables discarded; sidebar colours map to 05 tokens in @theme — 05 forbids colours outside tokens — cost if wrong: none.
- Task 2: Ruling: hard-coded accessibility strings in dialog, sheet and sidebar became required props (closeLabel, mobileTitle, mobileDescription, label) — RNF-05 forbids literal text — cost if wrong: callers must pass translations.
- Task 2: Ruling: sidebar widths set to 240px / 64px (mobile 288px) — separador 05 values — cost if wrong: none.
- Task 2: Ruling: shadcn's `accent` utility maps to surface-muted (hover surface); brand blue is `brand`, `ring` and `--accent` CSS var — keeps 05 "item ativo: surface-muted" and focus in Aurion Blue — cost if wrong: rename of one utility.
- Task 2: Ruling: base tsconfig declares types ["node"] — TypeScript 6 no longer auto-includes @types — cost if wrong: none.
- Task 2: Ruling: turbo agentGuidance disabled and generated AGENTS.md removed — CLAUDE.md is the single agent guide — cost if wrong: none.
  Task 2: complete (commits cba572f..28df3d6, tests: pnpm test → Duration 2.50s (tests 85%, import 12%, transform 3%, worker 1%))
- Task 3: Ruling: next-intl with localePrefix 'as-needed' (pt-PT served without prefix, /en prefixed) — cleaner URLs for the default locale — cost if wrong: one routing option.
- Task 3: Ruling: Portuguese regional variants from Accept-Language (pt, pt-BR) map to pt-PT; profile/organization values must match exactly — only pt-PT is offered — cost if wrong: Brazilian users see pt-PT copy.
- Task 3: Ruling: added requireLocale() and typed next-intl AppConfig (Messages, Locale) — unknown keys fail at compile time — cost if wrong: none.
- Task 3: Ruling: minimal proxy.ts with next-intl created now; Task 10 extends it — /[locale] routes need it — cost if wrong: none.
  Task 3: complete (commits 28df3d6..9e2805e, tests: pnpm test → Duration 2.52s (tests 77%, import 15%, transform 6%, worker 1%))
- Task 4: Ruling: RLS enabled on every foundation table in the first migration (deny-all until Task 5 policies) — Supabase exposes public tables through the Data API without RLS — cost if wrong: none.
- Task 4: Ruling: composite foreign keys (client_id, organization_id) → clients(id, organization_id) on client_memberships and client_staff_assignments — prevents cross-organization rows at the database level — cost if wrong: one extra unique index.
- Task 4: Ruling: enums live in schema `app`; tables in `public` — plan references app.org_role and app.actor_kind — cost if wrong: none.
- Task 4: Ruling: DATABASE_DIRECT_URL uses the Supavisor session pooler (port 5432) instead of db.<ref>.supabase.co — direct host is IPv6-only on the free plan — cost if wrong: none for tests and migrations.
- Task 4: Ruling: migrations applied with `supabase db push --db-url` from .env.local instead of `supabase link` password prompt — non-interactive — cost if wrong: none.
- Task 4: Ruling: password in .env.local URL-encoded by script (contains special characters) — required for connection URLs — cost if wrong: none.
  Task 4: complete (commits a43bff3..7274086, tests: pnpm test:db → Duration 16.25s (tests 99%))
- Task 4: Ruling: config.toml auth hardening (signup off, password ≥12, secure password change, TOTP enroll/verify on) added after the task line; hosted dev/staging receive it via `supabase config push` in Task 12 — config.toml only drives local/CI — cost if wrong: hosted projects keep public signup until Task 12 (no app exists yet).
- Task 4: Ruling: config pushed to hosted dev immediately (signup off, password ≥12) instead of waiting for Task 12 — closes public sign-up on dev now — cost if wrong: none. Staging receives the same push in Task 19.
- Task 5: Ruling: every privilege revoked from anon, authenticated and service_role, then granted per table and per column — Supabase defaults gave anon/authenticated TRUNCATE, which bypasses RLS — cost if wrong: new columns need explicit grants.
- Task 5: Ruling: profile column grants limit self-update to full_name and locale — prevents a client promoting themselves to kind=internal — cost if wrong: none.
- Task 5: Ruling: extra helper functions app.is_assigned_staff, app.is_client_member, app.is_client_of_organization, app.can_see_profile (security definer) — policies cannot query RLS-protected tables without recursion — cost if wrong: none.
- Task 5: Ruling: domain_events gets a restrictive deny-all policy (plus no grants) — satisfies the coverage rule "at least one policy" while denying all users — cost if wrong: none.
- Task 5: Ruling: test files grouped as rls/isolation, rls/access, rls/coverage instead of one file per table — same cases, less fixture duplication — cost if wrong: none.
- Task 5: Ruling: project_manager and decision_maker may only create client memberships with status 'invited' — activation happens through the invitation flow (system context) — cost if wrong: none.
  Task 5: complete (commits cd8aa3c..65b6467, tests: pnpm test:db → Duration 148.76s (tests 100%))
- Task 6: Ruling: truncate blocked by a statement trigger in addition to update/delete — postgres retains TRUNCATE as table owner — cost if wrong: none.
- Task 6: Ruling: app.record_audit rejects authenticated callers without a membership (org or client, active or invited) in the target organization, and coerces actor_kind to user/agent when a JWT is present — prevents forged entries in other tenants — cost if wrong: none.
- Task 6: Ruling: recordAudit accepts DbExecutor (Database | DbTransaction) and tests use testDatabase(sql), a Drizzle instance over the rolled-back test transaction — one transaction for fixtures and code under test — cost if wrong: none.
- Task 6: Ruling: web DB tests use the *.db.test.ts suffix and run in the `db` Vitest project — keeps `pnpm test` free of network access — cost if wrong: none.
  Task 6: complete (commits 65b6467..8511a7d, tests: pnpm vitest run --project db packages/db/test/audit-append-only.test.ts apps/web/src/modules/audit → Duration 30.22s (tests 96%, import 3%, transform 1%))
- Task 7: Ruling: contexts are created by createDbContexts(db); exported withUserContext/withSystemContext bind to the shared database — lets tests run the real code inside a rolled-back transaction — cost if wrong: none.
- Task 7: Ruling: test file named platform/db.db.test.ts (needs the database) instead of db.test.ts — db test convention from Task 6 — cost if wrong: none.
- Task 7: Ruling: session cookie `secure` is true in production only — Safari rejects Secure cookies on http://localhost — cost if wrong: none; production unaffected.
- Task 7: Ruling: added platform/env.ts (zod-validated environment) and createSupabaseAdminClient — needed by invitations (Task 13) and to fail fast on missing configuration — cost if wrong: none.
- Task 7: Ruling: next.config loads the repository-root .env.local via @next/env — single local env file for app, tests and migrations — cost if wrong: none.
- Task 7: Ruling: withUserContext validates claims with zod (uuid sub and session_id, role authenticated) before setting them — prevents malformed claims reaching the database — cost if wrong: none.
  Task 7: complete (commits 8511a7d..2619853, tests: pnpm vitest run --project db apps/web/src/platform → Duration 11.37s (tests 94%, import 5%, transform 1%))
- Task 8: Ruling: added SQL function app.emit_event (security definer, membership check like record_audit) — authenticated users have no privileges on domain_events, so emit must work from user transactions without direct table access — cost if wrong: none.
- Task 8: Ruling: dispatcher exposed as createOutboxDispatcher({ contexts, send, reportFailure, batchSize, maxAttempts }) plus dispatchPending() bound to Inngest — replaces plan's dispatchPending(deps) so tests inject a real database and fake sender — cost if wrong: none.
- Task 8: Ruling: outbox tests commit rows on the dev database (concurrency needs separate connections) and delete their own events and organizations in afterEach — cost if wrong: leftover rows if a run is killed mid-test.
- Task 8: Ruling: failure reporting logs structured JSON until Task 17 wires Sentry into reportFailure — Sentry is installed in Task 17 — cost if wrong: alerts only in logs until Task 17.
- Task 8: Ruling: outbox-dispatch function runs with concurrency limit 1; attempts increment on success too (attempt count = number of sends) — cost if wrong: none.
- Task 8: Ruling: ESLint import-x now uses eslint-import-resolver-typescript — no-cycle crashed on the @/ alias — cost if wrong: none.
  Task 8: complete (commits 2619853..bd94621, tests: pnpm vitest run --project db apps/web/src/modules/events → Duration 16.77s (tests 94%, import 5%, transform 1%))
- Task 9: Ruling: AccessContext carries clientRoles: Map<clientId, ClientRole[]> instead of memberClientIds, and Actor.roles holds internal roles plus 'agent' only — a set of client roles would leak decision_maker powers from client A into client B — cost if wrong: none.
- Task 9: Ruling: matrix follows 08 literally: project_manager has no permission on `users` (spec section 6 allowed assigned managers to invite client users); open question recorded in STATUS — 08 prevails on security — cost if wrong: managers cannot invite client users until the founder decides.
- Task 9: Ruling: `write` implies `draft`; agent permissions are the intersection of the agent row and the connecting user's roles; internal roles count only with mfaVerifiedAt set — mirrors 08 ("agente nunca tem mais permissões") and the RLS MFA barrier — cost if wrong: none.
- Task 9: Ruling: getActor lives in access/actor.ts (server-only) and is exported from the module index; Vitest aliases server-only to an empty module — keeps module boundary rule — cost if wrong: none.
- Task 9: Ruling: actor resolves to the earliest active internal organization membership, else the earliest active client membership — single-organization foundation; organization switching arrives with M22 — cost if wrong: multi-organization users see only their first organization until M22.
  Task 9: complete (commits bd94621..eeee78f, tests: pnpm vitest run --project unit apps/web/src/modules/access → Duration 274ms (transform 56%, import 28%, tests 10%, worker 6%))
- Task 10: Ruling: added Supabase custom access token hook app.custom_access_token_hook adding claim user_kind (internal|client), enabled in config.toml and pushed to dev — proxy must tell internal sessions apart without a database query (SEC-03 applies to internal sessions) — cost if wrong: none; staging receives it in Task 19.
- Task 10: Ruling: activity cookie signature binds the Supabase session_id (signActivity(at, secret, sessionId)) and accepts 60s clock skew — prevents replaying one session's cookie on another — cost if wrong: none.
- Task 10: Ruling: cookie name `__Host-activity` on https, `activity` on http (localhost) — __Host- requires Secure — cost if wrong: none.
- Task 10: Ruling: pages render dynamically and read x-nonce from headers; ThemeProvider receives the nonce — nonce CSP cannot be served from static HTML — cost if wrong: no static caching of HTML pages.
- Task 10: Ruling: style-src allows 'unsafe-inline' — next/font and component libraries inject inline styles; script-src stays nonce + strict-dynamic — cost if wrong: weaker protection against CSS injection only.
- Task 10: Ruling: next.config forces loadEnvConfig(repoRoot, …, forceReload=true) — Next caches its own apps/web env load, so the root .env.local was ignored at runtime — cost if wrong: none.
- Task 10: Verified on `next start`: CSP, HSTS, nosniff, X-Frame-Options, Referrer-Policy, Permissions-Policy present; 10/10 scripts carry the header nonce. Inactivity redirect is unit-tested; end-to-end coverage arrives in Task 20.
  Task 10: complete (commits eeee78f..e7ca0b5, tests: pnpm vitest run --project unit apps/web/src/platform → Duration 273ms (transform 48%, import 27%, tests 17%, worker 7%))
- Task 11: Ruling: password length counts Unicode code points ([...password].length), and HIBP failures (timeout, network, non-2xx) raise BreachCheckUnavailableError mapped to check_unavailable — emoji passwords must not pass with fewer than 12 characters; failures never silently accept — cost if wrong: none.
  Task 11: complete (commits e7ca0b5..03ce3e5, tests: pnpm vitest run --project unit apps/web/src/modules/identity → Duration 268ms (transform 44%, import 26%, tests 22%, worker 8%))
- Task 12: Ruling: identity functions take an injected IdentityDeps (auth port, lookupUserKind, audit, startActivity, magicLinkRedirectUrl); createIdentityDeps wires Supabase, system-context lookup by email and user-context audit — unit tests use a fake Supabase auth — cost if wrong: none.
- Task 12: Ruling: signInWithPassword returns next 'done' for client users without a factor; verifyTotp takes mode 'enroll' | 'verify'; enrollTotp returns qrCode (Supabase data URL) instead of qrCodeSvg — clients may hold passwords later and enrolment must be audited distinctly — cost if wrong: none.
- Task 12: Ruling: failed password attempts are not written to audit_log (no authenticated actor or organization); Supabase Auth logs keep them — record_audit requires a member — cost if wrong: failed sign-ins visible only in Supabase logs.
- Task 12: Ruling: platform/request.ts (secure detection shared by proxy and server actions) and mfa/safe-next-path.ts were written with their tests in the same step, not test-first — deviation from TDD on two small helpers; both have tests covering open-redirect and header cases — cost if wrong: none observed.
- Task 12: Ruling: QR code rendered on a white background (bg-white) in both themes — authenticator apps need a light quiet zone to scan — cost if wrong: one colour outside the 05 tokens.
- Task 12: Ruling: magic-link requests for internal or unknown emails return immediately without a provider call — identical response body; a small timing difference remains — cost if wrong: an attacker could time responses to distinguish client emails.
- Task 12: Ruling: additional_redirect_urls set to http://localhost:3000/** and pushed to dev; staging URL added in Task 19 — required for magic links and invitations — cost if wrong: none.
- Task 12: Verified on `next start`: /sign-in, /en/sign-in, /magic-link render; inactivity notice shows; /mfa/* redirect to /sign-in without a session. Full sign-in flows are covered by Playwright in Task 20.
  Task 12: complete (commits 03ce3e5..2bec0d5, tests: pnpm vitest run --project unit apps/web → Duration 1.03s (import 46%, transform 38%, tests 11%, worker 4%))
- Task 13: Ruling: invitations take a Session { claims, actor } plus InvitationDeps { contexts, admin, invitationRedirectUrl }; membership rows are inserted in the inviter's user context so RLS re-checks the permission; only the invitee profile is created in system context — second barrier on every invitation — cost if wrong: none.
- Task 13: Ruling: authorization follows matrix 08 (users.invite: founder all, decision_maker own_room); results are { membershipId } | { error: 'forbidden' | 'invalid_input' } instead of thrown errors — cost if wrong: none.
- Task 13: Ruling: re-inviting an existing member returns the existing membership without a new event or audit entry — idempotent invitations — cost if wrong: no resend of the email on re-invite.
- Task 13: Ruling: custom email templates (token_hash links, scanner-safe accept page) are kept in supabase/templates but disabled in config.toml — Supabase rejects template changes on the free plan with the default SMTP; added to launch criteria — cost if wrong: until launch, invite links use Supabase's default implicit flow (tokens in URL fragment, consumed on first GET).
- Task 13: Ruling: accept-invitation reads the default invite fragment in the browser, clears it from the URL and posts the tokens to a server action that calls setSession; token_hash path also supported — required by the default template — cost if wrong: none.
- Task 13: Ruling: set-password returns update_failed when Supabase rejects the update and audits password.changed on success; after setting it, users without aal2 continue to /mfa/enroll — cost if wrong: none.
- Task 13: Ruling: bootstrap script runs with tsx --conditions=react-server so server-only modules load outside Next; founder is created with status invited and receives the invitation email — cost if wrong: none.
- Task 13: Ruling: invitation-fragment.ts test written before implementation; admin.ts adapter has no unit test (thin wrapper over Supabase admin API) and is exercised by e2e in Task 20 — cost if wrong: adapter bugs surface in e2e instead of unit tests.
  Task 13: complete (commits 2bec0d5..75ecab6, tests: pnpm vitest run --project db apps/web/src/modules/identity → Duration 44.67s (tests 97%, import 2%, transform 1%))
- Task 14: Ruling: studio and portal are real path segments (/studio, /portal) instead of route groups — two route groups cannot both serve /settings/sessions; matches resolveHome('/studio' | '/portal') in Task 15 — cost if wrong: none.
- Task 14: Ruling: app.list_my_sessions returns last_active_at (refreshed_at, else updated_at) instead of updated_at — clearer meaning — cost if wrong: none.
- Task 14: Ruling: revoking the current session signs the browser out locally and redirects to /sign-in; the sessions screen also hosts "change password", which ends every session (signOut global) after auditing — SEC-05 — cost if wrong: none.
- Task 14: Verified: postgres can select and delete auth.sessions on hosted Supabase (plan risk did not materialise).
  Task 14: complete (commits 75ecab6..ec694d1, tests: pnpm vitest run --project db packages/db/test/sessions.test.ts apps/web/src/modules/identity/sessions.db.test.ts → Duration 25.06s (tests 94%, import 5%, transform 1%))
- Task 15: Ruling: routes follow docs/product/02 instead of the plan — studio at "/", rooms at "/c/[clientId]", team settings at "/settings/...", portal at "/portal"; resolveHome returns '/sign-in' | '/mfa/verify' | '/' | '/portal' — 02 prevails on "onde cada coisa vive" — cost if wrong: none.
- Task 15: Ruling: navigation lists only routes that exist in the foundation (Início, client list, Definições › Sessões; room Dashboard) — links to unbuilt modules would 404 — cost if wrong: none; modules add their entries.
- Task 15: Ruling: sidebar width/collapse test passed before shell implementation because Task 2 set 240/64 px and shadcn persists sidebar_state; kept as a regression test — cost if wrong: none.
- Task 15: Ruling: theme and locale selectors are radio groups (arrow-key navigation) instead of dropdown menus — accessible, testable without pointer emulation — cost if wrong: none.
- Task 15: Ruling: user avatar uses initials (no generic icon) per Taste skill; Inter and Lucide kept because 05 prevails over Taste's defaults — cost if wrong: none.
- Task 15: Ruling: localized catch-all [locale]/[...rest] calls notFound(); localized not-found content streams in the RSC payload (SSR body empty) — verified in payload; visual confirmation in Task 20 — cost if wrong: unknown URLs show Next's default 404 text.
- Task 15: Ruling: organization queries test written immediately after the code (not test-first) — small read helpers — cost if wrong: none observed.
- Task 15: Ruling: visual review of the shell with the design skills is deferred to Task 20, when Playwright and seeded users allow screenshots of signed-in screens — cost if wrong: layout issues found later.
- Task 15: Verified on `next start` without a session: /, /en, /portal, /settings/sessions, /c/:id redirect to the localized /sign-in.
  Task 15: complete (commits ec694d1..f645362, tests: pnpm test → Duration 4.81s (environment 35%, import 34%, tests 21%, transform 9%, worker 1%))
- Task 16: Ruling: PWA icons generated by scripts/generate-icons.ts (resvg) from assets/brand/symbol.svg — light symbol (#ECEFF3) on dark canvas (#0A0F15), regular icons with 18% padding, maskable with 28% (safe zone) — committed as static files — cost if wrong: regenerate with `pnpm --filter web icons:generate`.
- Task 16: Ruling: manifest name comes from the pt-PT catalogue (app.name); theme and background colour use the dark canvas token value — the manifest is not locale-aware — cost if wrong: none.
- Task 16: Ruling: brand-hub test asserts the static-export configuration (output 'export', trailingSlash, unoptimized images); the build step verifies out/ is produced (verified: index.html, 404.html, no server output) — a full next build inside the unit suite would be too slow — cost if wrong: none.
- Task 16: Ruling: brand-hub copy lives in src/content.ts (pt-PT only) until hub content comes from published snapshots (M10) — cost if wrong: none.
  Task 16: complete (commits f645362..5f90d0e, tests: pnpm vitest run --project unit apps/web/src/app/manifest.test.ts apps/brand-hub → Duration 241ms (transform 56%, import 28%, worker 10%, tests 6%))
- Task 17: Ruling: Sentry without Session Replay or the feedback widget (both in Sentry's default snippet) — they would record client content; sendDefaultPii false, beforeSend scrubEvent removes cookies, auth headers, bodies, query strings, user email/IP and emails in messages — SEC-60/RGPD — cost if wrong: less debugging context.
- Task 17: Ruling: Sentry is disabled when NEXT_PUBLIC_SENTRY_DSN is empty; tunnelRoute /monitoring (already excluded by the proxy, so CSP needs no Sentry domain); source maps deleted after upload; Sentry telemetry off — cost if wrong: none.
- Task 17: Ruling: instrumentation files live in apps/web/src (src/ layout); withSentryConfig imported from @sentry/nextjs/config (v11) — cost if wrong: none.
- Task 17: Ruling: outbox failures now go to logger.error and Sentry.captureMessage (replaces the Task 8 console fallback); global-error renders pt-PT copy with an English line from the catalogues — global-error sits outside the i18n provider — cost if wrong: none.
- Task 17: Verified: app starts with Sentry disabled; /monitoring returns 404 without a DSN at build time (expected). Error delivery is verified on staging (acceptance criterion 13, Task 19).
  Task 17: complete (commits 5f90d0e..b363566, tests: pnpm vitest run --project unit apps/web/src/platform → Duration 309ms (transform 41%, import 34%, tests 15%, worker 9%))
- Task 18: Ruling: Semgrep runs from the official container with registry packs p/typescript, p/react, p/secrets via CLI flags instead of a .semgrep.yml (a local file cannot include registry packs); p/nextjs replaced by p/react — cost if wrong: fewer Next-specific rules.
- Task 18: Ruling: PR title check is its own workflow (triggered on edited) so title edits do not re-run the full pipeline — cost if wrong: none.
- Task 18: Ruling: CI database job starts Supabase with only db and auth (all other services excluded with -x) — GoTrue is required for auth.sessions/MFA tables; others waste minutes — cost if wrong: none.
- Task 18: Ruling: GitHub Environments are unavailable for private repositories on the Free plan; deploy secrets are repository secrets prefixed PREVIEW_ and STAGING_ — cost if wrong: secrets are not scoped per environment until GitHub Team.
- Task 18: Ruling: supabase/config.toml auth URLs use env(AUTH_SITE_URL) and env(AUTH_REDIRECT_URLS), read from supabase/.env locally and from workflow env in CI/staging — config push per environment — cost if wrong: none.
- Task 18: Verified on PR #3 (run 37514312919): quality, database (14 files), build, security (audit 0 vulnerabilities, TruffleHog 0 secrets, Semgrep 111 rules 0 findings) and PR title all passed.
- Task 18: Verified gate: commit 724f70b with a failing unit test made 'Types, lint and unit tests' fail (run 37514799591); reverted.
- Task 18: Ruling: a failed git revert (no global git identity) led to an amend of the gate commit; repaired with reset --soft to origin and a new removal commit (cefa4c8) — no force push — cost if wrong: none.
  Task 18: complete (commits b363566..65ae39e, tests: pnpm test → Duration 4.43s (import 34%, environment 32%, tests 22%, transform 10%, worker 2%))
- Task 19: Ruling: Vercel project rootDirectory set to apps/web via API and Vercel commands run from the repository root — prebuilt deploys from apps/web could not upload pnpm workspace files outside the folder — cost if wrong: none.
- Task 19: Ruling: preview/staging stay behind Vercel Authentication (default); an automation bypass secret (VERCEL_AUTOMATION_BYPASS_SECRET) was generated for Playwright — staging is team-only until launch — cost if wrong: clients cannot open staging without a team account.
- Task 19: Finding fixed: `supabase projects api-keys` masks secret keys unless --reveal; the masked dev/staging secret keys stored earlier were replaced (admin API now 200 for both) — undetected by unit tests because invitations use a fake admin port — cost if wrong: none now.
- Task 19: Finding fixed: [auth.email] enable_signup controls the whole email provider (it disabled email sign-in); restored to true. Public sign-up stays blocked by [auth] enable_signup = false — verified: POST /auth/v1/signup → 422 signup_disabled — cost if wrong: none.
- Task 19: Ruling: staging deploy (push to develop) and acceptance criteria 12–13 are verified after PR #3 merges into develop; preview deploy and e2e verified pre-merge on the PR — workflow_dispatch needs the workflow on the default branch and staging receives code only through develop — cost if wrong: staging issues surface after merge.
- Task 20: Ruling: e2e runs against the freshly deployed preview (dev Supabase) on every PR and against staging after each develop deploy, instead of staging only — earlier feedback before merge — cost if wrong: two seeded test organisations (dev and staging).
- Task 20: Ruling: acceptance criteria 6 (reauthentication after 15 min) and 7 (8 h inactivity) stay covered by unit tests — no critical action exists in the foundation and the activity cookie is HMAC-signed, so neither can be driven from a browser without weakening the code — cost if wrong: no browser-level proof until the first critical action (M05/M21).
- Task 20: Finding fixed (security): getClaims verifies the JWT locally, so a revoked session kept access until token expiry (≤1 h). getVerifiedClaims now requires the session row in auth.sessions (not expired) — e2e "revoking a session signs that browser out" passes — cost if wrong: one indexed query per request.
- Task 20: Finding fixed (UI): tailwind-merge treated design-system font sizes (text-label, text-body…) as colours and dropped button text colours (invisible "Alterar e terminar sessões" label). cn() now registers the 05 type scale — cost if wrong: none.
- Task 20: Finding fixed: sessions recorded the server's user agent ("node"); the server Supabase client now forwards the browser User-Agent and client IP, and the sessions screen shows "Browser · System" — cost if wrong: none.
- Task 20: Finding fixed: apps/brand-hub/out (static export) had been committed in Task 16; untracked and `out/` added to .gitignore.
- Task 20: Ruling: accessibility checks emulate reduced motion so colour transitions do not produce false contrast failures — cost if wrong: none (reduced motion is a supported mode).
- Task 20: Visual review (Taste/Impeccable "Operate", 05 prevails) from screenshots: sign-in, studio, room, sessions (dark), portal (360 px). Fixed weak selected state of theme/locale toggles in dark mode (ring-border-strong). No other issues.
- Task 20: Verified locally against dev Supabase: 16/16 e2e (desktop + mobile accessibility).
- Infra: git push hung on git-credential-manager waiting for interactive login; git now uses `gh auth git-credential`.
- Task 19: Finding fixed: Vercel Hobby blocked CLI deployments whose git commit author is not a team member (deployment stayed "Building…" until timeout); deployments now run without git metadata and the deploy step has a 10-minute timeout — cost if wrong: Vercel dashboard does not show commit links.
- Task 19: Finding fixed: serverEnv() parsed process.env dynamically; NEXT_PUBLIC_* values are inlined at build and absent from the Vercel runtime, so server code depending on serverEnv failed on deployments. serverEnv reads each variable explicitly and deployments also pass the public values at runtime — cost if wrong: none.
- Task 19: Ruling: rejected sign-ins log the provider error code (no email) as auth.sign_in_rejected — operability — cost if wrong: none.
- Task 19/20: Verified on PR #3 head 81cacc2: CI green, Vercel preview deployed, e2e 16/16 passed against the preview (run 37535444890).
- Task 21: Verified: clean clone (pnpm install --frozen-lockfile, typecheck, lint, build) passes locally; vitest fails to start only when cloned under the 147-character scratchpad path (Windows MAX_PATH); CI runners perform a clean install on every run and pass.
- Task 21: Acceptance evidence recorded in docs/STATUS.md; criteria 12–13 pending the merge into develop; criterion 11 partial until GitHub Team enables branch protection.
  Task 19: complete (commits 38b2b8a..81cacc2, tests: pnpm test → Duration 4.18s (import 33%, environment 32%, tests 22%, transform 10%, worker 2%))
  Task 20: complete (commits 38b2b8a..81cacc2, tests: pnpm test → Duration 4.16s (import 33%, environment 32%, tests 22%, transform 10%, worker 2%))
  Task 21: complete (commits 38b2b8a..81cacc2, tests: pnpm test → Duration 4.03s (import 33%, environment 32%, tests 22%, transform 12%, worker 2%))
- Final: correction to Task 13 ruling — the admin.ts adapter and the default-template fragment path are NOT exercised by e2e (the e2e invitation creates the membership with SQL and generateLink).
- Final: Ruling: reviewer finding 8 (real invitation module not driven by e2e) — no UI exists yet to invite through the module; e2e through inviteTeamMember/createSupabaseAdminPort arrives with the team-management screen (M20, Vaga 2); recorded as deferred in STATUS — cost if wrong: an admin-API regression (like the masked key) is caught only manually until M20.
- Final review: fresh reviewer (Opus) on 64cc17c..81cacc2 — verdict "with fixes", 0 Critical, 8 Important, 17 Minor.
- Final: fixed open redirect via tab/newline in next — safe-next-path.test.ts (tab, newline, CR, encoded backslash) RED→GREEN, unit 184/184.
- Final: fixed archived organization/client still granting access — access.test.ts "archived organization loses access…", "archived client blocks membership listing and invitations…", scope.db.test.ts archived cases RED→GREEN; migration 20261006215709_archive_access_checks; db 77/77.
- Final: fixed Data API bypass of session revocation/inactivity — probe with user token 200 → [api] enabled = false pushed to dev → 503 PGRST002 (RED→GREEN by probe); staging receives it on deploy.
- Final: fixed account actions accepting aal1 when a factor exists — account-assurance.test.ts RED→GREEN; applied to revoke session, change password, set password.
- Final: fixed invitations of existing accounts never activating — authentication.test.ts "activates pending invitations before auditing the sign-in" RED→GREEN; activation on password sign-in and callback.
- Final: fixed Sentry leaking auth tokens in URLs — sentry-scrub.test.ts url cases RED→GREEN; beforeSendTransaction and beforeBreadcrumb added.
- Final: fixed SEC-13 gate missing from staging — deploy-staging isolation-gate job (local Supabase + pnpm test:db) required before migrate.
- Final: suites after fix pass — unit 184/184, db 77/77, local e2e 16/16, lint/format/typecheck/build clean.
- Final: minor (deferred): requestFlush() never called after commit; events wait for the 5-minute cron.
- Final: minor (deferred): profile/organization locale not applied (resolveLocale unused).
- Final: minor (deferred): internal users read their own organization_memberships rows at aal1.
- Final: minor (deferred): assigned PM can set client membership status to active directly.
- Final: minor (deferred): loadAccessContext drops client memberships from other organizations (multi-org).
- Final: minor (deferred): proxy reads SESSION_ACTIVITY_SECRET without validation.
- Final: minor (deferred): inactivity redirect loses the locale prefix.
- Final: minor (deferred): /api routes are outside the proxy inactivity check.
- Final: minor (deferred): TOTP enrolment runs on page render; verified-factor users get an error instead of a redirect.
- Final: minor (deferred): callback accepts type=invite (now activates memberships through acceptInvitationForUser).
- Final: minor (deferred): secrets interpolated into workflow command lines; move to env variables.
- Final: minor (deferred): GitHub Actions and the Semgrep image are not pinned to SHAs/digests.
- Final: minor (deferred): Playwright traces with typed test passwords are uploaded on failure.
- Final: minor (deferred): no ALTER DEFAULT PRIVILEGES revoke for future public tables; coverage test does not check grants or tables without organization_id/client_id.
- Final: minor (deferred): bootstrap-founder defaults --redirect-url to localhost.
- Final: minor (deferred): x-forwarded-for trusted and cast to inet; malformed header outside Vercel fails sign-in.
- Final: minor (deferred): Vercel/Sentry/Supabase admin adapter not covered end-to-end (finding 8).

## After merge

- Staging: first run (37544468185) applied migrations and config but `vercel alias set` failed with "User not found" (team token); alias now assigned through the Vercel REST API (PR #4).
- Ruling: client invitations restricted to founder and decision maker in RLS and spec (ADR 0006); reviewer minor "PM can activate memberships" resolved by the same change.
- Feature: `bootstrap:founder --deliver link` prints a single-use invitation link; founder for "Aurion Creative" created on dev.
- Verified: staging run 37545807184 — isolation gate 78/78, migrations, deploy, e2e 16/16 against staging.
- Verified: client error on staging accepted by the Sentry tunnel (HTTP 200); dashboard confirmation pending with the founder (auth token lacks read scope).
