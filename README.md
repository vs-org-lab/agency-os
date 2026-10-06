# Agency OS

Internal operating platform for the agency: studio for the team, rooms per client and a client portal.

## Repository layout

| Path              | Contents                                                               |
| ----------------- | ---------------------------------------------------------------------- |
| `apps/web`        | Next.js application: studio, rooms, portal, API, authentication        |
| `apps/brand-hub`  | Static Brand Hub site (exported, no server)                            |
| `packages/db`     | Drizzle schema, test harness; migrations live in `supabase/migrations` |
| `packages/ui`     | Design tokens, theme and shadcn/ui components                          |
| `packages/i18n`   | pt-PT and en message catalogues, locale and money formatting           |
| `packages/config` | Shared TypeScript, ESLint and Prettier configuration                   |
| `supabase`        | Supabase CLI configuration, SQL migrations, email templates            |
| `docs`            | Product documentation, specs, plans, decisions and project status      |

## Prerequisites

- Node.js 22 and pnpm 12 (`npm i -g pnpm@12`)
- Supabase CLI via `npx supabase` (no Docker required; development uses the hosted dev project)
- Access to the Supabase, Vercel, Sentry and Inngest accounts listed in `docs/STATUS.md`

## First run

```bash
pnpm install
cp .env.example .env.local        # fill in the dev project values
cp supabase/.env.example supabase/.env
pnpm test                         # unit tests
pnpm test:db                      # database and RLS tests against the dev project
pnpm dev                          # http://localhost:3000
```

Create the first founder account. `--deliver email` sends the Supabase invitation email; `--deliver link` prints a single-use invitation link instead (use it while the project relies on Supabase's default SMTP, which only delivers to organization members):

```bash
pnpm --filter web bootstrap:founder --email <email> --name "<full name>" --organization "<organization>" \
  --redirect-url https://<app-host>/accept-invitation --deliver link
```

## Commands

| Command                                                | Purpose                                                     |
| ------------------------------------------------------ | ----------------------------------------------------------- |
| `pnpm dev`                                             | Run the apps in development mode                            |
| `pnpm build`                                           | Build every app                                             |
| `pnpm typecheck` / `pnpm lint` / `pnpm format:check`   | Static checks                                               |
| `pnpm test`                                            | Unit and component tests                                    |
| `pnpm test:db`                                         | Database, RLS and integration tests (`DATABASE_DIRECT_URL`) |
| `pnpm --filter @agency-os/db generate`                 | Generate a migration from the Drizzle schema                |
| `pnpm --filter @agency-os/db generate:custom`          | Create an empty SQL migration (functions, policies)         |
| `npx supabase db push --db-url "$DATABASE_DIRECT_URL"` | Apply migrations to the dev project                         |
| `pnpm --filter web e2e:seed` / `pnpm --filter web e2e` | Seed test users and run Playwright                          |
| `pnpm --filter web icons:generate`                     | Regenerate PWA icons from `assets/brand/symbol.svg`         |

## Branches and delivery

- `main` is production (deployment enabled at launch), `develop` deploys to staging.
- Work happens on `feat/*`, `fix/*`, `chore/*`, `ci/*` and `docs/*` branches merged into `develop` through pull requests.
- Every pull request runs types, lint, unit, database and RLS tests, build, dependency audit, secret scan, static analysis and a Conventional Commits title check, then deploys a protected Vercel preview and runs the end-to-end and accessibility suite against it.
- Merges into `develop` apply migrations to staging before deploying the code, then run the end-to-end suite.
- Commits follow [Conventional Commits](https://www.conventionalcommits.org/).

## Guidelines

- Engineering rules: [CLAUDE.md](CLAUDE.md)
- Project status, deferred items and launch criteria: [docs/STATUS.md](docs/STATUS.md)
- Architecture decisions: [docs/decisions](docs/decisions)
