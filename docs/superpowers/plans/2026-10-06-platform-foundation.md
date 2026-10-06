# Fundação da plataforma — Plano de implementação

> **Para agentes:** SUB-SKILL OBRIGATÓRIA: usar `superpowers:subagent-driven-development` ou `superpowers:executing-plans` para executar este plano tarefa a tarefa. Os passos usam caixas (`- [ ]`) para acompanhamento.

**Objetivo:** entregar a base técnica do Agency OS: monorepo, isolamento entre clientes, autenticação, autorização, auditoria, eventos, design system, idiomas e CI/CD até staging.

**Arquitetura:** monólito modular em Next.js 16 sobre Supabase. A autorização tem duas barreiras: `authorize()` na aplicação e RLS na base de dados, com cada pedido de utilizador a correr numa transação com o papel `authenticated` e as claims verificadas. Eventos de domínio saem por outbox para o Inngest.

**Stack:** pnpm, Turborepo, TypeScript 5 (estrito), Next.js 16 (App Router), React 19, Tailwind CSS 4, shadcn/ui, next-intl 4, Drizzle ORM 0.45 e drizzle-kit, postgres.js, Supabase (Auth, Postgres 17, CLI), Inngest 4, Sentry 11, Zod 4, Vitest 5, Playwright e axe.

**Spec:** [docs/superpowers/specs/2026-10-06-platform-foundation-design.md](../specs/2026-10-06-platform-foundation-design.md)

## Restrições globais

- Node.js 22 LTS; pnpm com `packageManager` fixado no `package.json` raiz; versões fixadas pelo `pnpm-lock.yaml`.
- TypeScript `strict: true`, `noUncheckedIndexedAccess: true`. Sem `any` explícito.
- Código, identificadores, commits e comentários em inglês; sem comentários de processo ("fixed", "updated", "as requested").
- Commits em Conventional Commits, terminados com `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Uma tarefa = um branch `feat/*`, `chore/*` ou `ci/*` a partir de `develop`, com PR para `develop`.
- Identificadores UUID v4 (`gen_random_uuid()`); nenhum identificador sequencial exposto.
- Nenhum valor de cor, tamanho ou duração fora dos tokens do separador 05.
- Nenhum texto visível escrito nos componentes; tudo em `packages/i18n` (`pt-PT` padrão, `en`).
- O nome do produto e da agência não aparece no código: vem de `messages.app.name` e de `organizations.portal_branding`. A agência pode mudar de nome; o logótipo e as cores mantêm-se.
- Variáveis de ambiente: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY`, `DATABASE_URL` (pooler de transações, porta 6543), `DATABASE_DIRECT_URL` (porta 5432, só migrações e testes), `SESSION_ACTIVITY_SECRET` (32 bytes, base64), `INNGEST_EVENT_KEY`, `INNGEST_SIGNING_KEY`, `NEXT_PUBLIC_SENTRY_DSN`, `SENTRY_AUTH_TOKEN`, `SENTRY_ORG=aurion-j4`, `SENTRY_PROJECT=javascript-nextjs`.
- Valores do spec: palavra-passe mínima de 12 caracteres; inatividade interna de 8 horas; reautenticação após 15 minutos; outbox com 10 tentativas máximas e agendamento a cada 5 minutos; layout com barra lateral de 240/64 px e barra superior de 48 px.

## Foco de revisão

1. **Utilizador com pertença `revoked` ou entidade com `archived_at`:** deve perder o acesso imediatamente. Testes na Task 5 (`revoked membership loses access`, `archived client is invisible`).
2. **Token com `aal1` de um utilizador interno que também é utilizador de cliente:** não lê tabelas internas, mas mantém o acesso à sala. Teste na Task 5 (`dual-role user without mfa keeps client access only`).
3. **Pedido de link mágico com email em maiúsculas ou com espaços:** é normalizado antes da verificação de tipo interno, para que um email interno nunca receba link. Teste na Task 12 (`normalises email before internal check`).
4. **API Have I Been Pwned indisponível ou lenta:** a definição de palavra-passe não pode ficar bloqueada nem aceitar em silêncio. Timeout de 3 segundos e recusa com mensagem "tente novamente". Teste na Task 11 (`rejects with retryable error when hibp times out`).
5. **Relógio do cookie de atividade adulterado ou no futuro:** a assinatura falha ou a data é inválida, logo a sessão termina. Teste na Task 10 (`rejects tampered or future activity cookie`).

---

## Mapa de ficheiros

```
.gitattributes, .nvmrc, package.json, pnpm-workspace.yaml, turbo.json, .env.example
packages/config/            tsconfig.base.json, eslint.config.js, prettier.config.js
packages/ui/                src/styles/tokens.css, src/styles/globals.css, src/components/*, src/brand/symbol.tsx
packages/i18n/              src/messages/pt-PT.json, src/messages/en.json, src/locale.ts, src/format.ts
packages/db/                src/schema/*.ts, src/sql/*.sql, src/testing/*.ts, drizzle.config.ts
supabase/                   config.toml, migrations/*.sql, seed.sql
apps/web/src/platform/      db.ts, supabase-server.ts, session.ts, activity-cookie.ts, security-headers.ts, logger.ts
apps/web/src/modules/access/        matrix.ts, authorize.ts, scope.ts, index.ts
apps/web/src/modules/audit/         record.ts, actions.ts, index.ts
apps/web/src/modules/events/        emit.ts, dispatch.ts, inngest.ts, index.ts
apps/web/src/modules/identity/      password-policy.ts, hibp.ts, sign-in.ts, magic-link.ts, mfa.ts, reauth.ts, invitations.ts, sessions.ts, index.ts
apps/web/src/modules/organizations/ queries.ts, index.ts
apps/web/src/app/[locale]/          (auth)/*, (studio)/*, (portal)/*, layout.tsx, not-found.tsx
apps/web/src/proxy.ts
apps/web/scripts/                   bootstrap-founder.ts, seed-e2e.ts
apps/web/e2e/                       *.spec.ts
apps/brand-hub/
.github/workflows/                  ci.yml, deploy-staging.yml, dependabot.yml (em .github/)
```

---

### Task 1: Monorepo e configuração partilhada

**Ficheiros:**

- Criar: `package.json`, `pnpm-workspace.yaml`, `turbo.json`, `.nvmrc` (`22`), `.gitattributes` (`* text=auto eol=lf`), `packages/config/{package.json,tsconfig.base.json,eslint.config.js,prettier.config.js}`, `vitest.workspace.ts`
- Teste: `packages/config/test/config.test.ts`

**Interfaces:**

- Produz: scripts raiz `build`, `dev`, `lint`, `typecheck`, `format`, `format:check`, `test`, `test:db`, executados pelo Turborepo; `@agency-os/config` exporta `eslint.config.js` (flat config) e `tsconfig.base.json`.

- [ ] **Passo 1:** escrever `config.test.ts`: `tsconfig.base.json has strict and noUncheckedIndexedAccess`; `eslint config forbids explicit any` (executa o ESLint sobre uma string com `any` e espera um erro de `@typescript-eslint/no-explicit-any`); `eslint forbids deep imports between modules` (um import de `@/modules/identity/hibp` a partir de outro módulo dá erro de `no-restricted-imports`; `@/modules/identity` é permitido).
- [ ] **Passo 2:** `pnpm vitest run packages/config` deve FALHAR (ficheiros inexistentes).
- [ ] **Passo 3:** criar os ficheiros. ESLint com `typescript-eslint` strict, `eslint-plugin-import` (`import/no-cycle`), `react/jsx-no-literals` só para `apps/*/src/**/*.tsx` e `packages/ui/**/*.tsx`. Prettier: `printWidth 100`, `singleQuote true`, `trailingComma all`.
- [ ] **Passo 4:** `pnpm install && pnpm test && pnpm lint && pnpm format:check` deve PASSAR.
- [ ] **Passo 5:** `git add -A && git commit -m "chore: scaffold monorepo with shared configuration"`

---

### Task 2: Aplicação web, tokens e tema

**Ficheiros:**

- Criar: `apps/web` (Next.js 16, App Router, `src/`, sem `create-next-app` de exemplo), `packages/ui/src/styles/tokens.css`, `packages/ui/src/styles/globals.css`, `packages/ui/components.json`, `packages/ui/src/components/{button,input,label,form,card,badge,dialog,dropdown-menu,sidebar,tooltip,sonner,skeleton,input-otp}.tsx` (via `shadcn add`), `packages/ui/src/theme/theme-provider.tsx`, `packages/ui/src/brand/symbol.tsx`
- Teste: `packages/ui/test/tokens.test.ts`

**Interfaces:**

- Produz: `@agency-os/ui` com os componentes acima; `ThemeProvider` (next-themes, `attribute="class"`, `defaultTheme="system"`); `BrandSymbol({ className, title }: { className?: string; title?: string })` que desenha `assets/brand/symbol.svg` com `fill="currentColor"`.

- [ ] **Passo 1:** escrever `tokens.test.ts`, que lê `tokens.css` e verifica:
  - `defines every token from design system 05 in light and dark`, para cada token: `canvas`, `surface`, `surface-muted`, `border`, `border-strong`, `text`, `text-secondary`, `text-tertiary`, `primary`, `primary-foreground`, `accent`, `link`, `gold`, `neutral`, `info`, `success`, `warning`, `danger` e os respetivos `-bg`.
  - `light canvas is #FBFBFB and dark canvas is #0A0F15`.
  - `accent is #0A7FD1 light and #4FA8EC dark`.
  - `text contrast is at least 4.5:1 against surface in both themes` (cálculo WCAG no teste, sobre `text`, `text-secondary`, `text-tertiary` e os cinco estados).
  - `durations fast, base and slow are 120ms, 180ms and 240ms`.
  - `radii are 6, 8, 12 and 16 px`.
- [ ] **Passo 2:** `pnpm --filter @agency-os/ui test` deve FALHAR.
- [ ] **Passo 3:** escrever `tokens.css` com os valores exatos do separador 05 (`:root` claro, `.dark` escuro) e mapeá-los com `@theme inline` do Tailwind 4. A escala tipográfica (`caption` a `brand-display`) também vai para `@theme`. Fontes Inter, Space Mono e Fraunces por `next/font/google` no `layout.tsx`, expostas como `--font-sans`, `--font-mono` e `--font-display`. Com `@media (prefers-reduced-motion: reduce)`, todas as durações passam a `0ms`.
- [ ] **Passo 4:** `pnpm --filter @agency-os/ui test && pnpm build` deve PASSAR.
- [ ] **Passo 5:** commit `feat(ui): add design tokens, theme and base components`.

---

### Task 3: Idiomas

**Ficheiros:**

- Criar: `packages/i18n/src/{locale.ts,format.ts,messages/pt-PT.json,messages/en.json}`, `apps/web/src/i18n/{routing.ts,request.ts}`
- Teste: `packages/i18n/test/{locale.test.ts,messages.test.ts,format.test.ts}`

**Interfaces:**

- Produz:
  - `type Locale = 'pt-PT' | 'en'`; `const defaultLocale: Locale = 'pt-PT'`.
  - `resolveLocale(input: { profile?: string | null; organization?: string | null; acceptLanguage?: string | null }): Locale`.
  - `formatMoney(amountMinor: bigint, currency: 'EUR' | 'GBP' | 'USD', locale: Locale): string`.
  - Rotas com prefixo `/[locale]`.

- [ ] **Passo 1:** testes:
  - `resolveLocale prefers profile, then organization, then accept-language, then pt-PT`.
  - `resolveLocale ignores unsupported values`.
  - `pt-PT and en have identical key sets`.
  - `no message value is empty`.
  - `formatMoney(123456n, 'EUR', 'pt-PT')` contém `1234,56` e `€`.
  - `formatMoney(123456n, 'GBP', 'en')` é `£1,234.56`.
- [ ] **Passo 2:** correr e confirmar FALHA.
- [ ] **Passo 3:** implementar. As mensagens iniciais cobrem `app.name`, `auth.*`, `shell.*`, `states.*`, `sessions.*`, `errors.*`; o texto final de cada ecrã é acrescentado na tarefa desse ecrã. `app.name` = "Agency OS" em ambos os idiomas.
- [ ] **Passo 4:** confirmar PASSA.
- [ ] **Passo 5:** commit `feat(i18n): add locale resolution, formatting and message catalogues`.

---

### Task 4: Esquema da base de dados e infraestrutura de testes

**Ficheiros:**

- Criar: `supabase/config.toml` (`supabase init`; `[auth] enable_signup = false`; `[auth.mfa.totp] enroll_enabled = true, verify_enabled = true`), `packages/db/src/schema/{enums.ts,organizations.ts,profiles.ts,memberships.ts,clients.ts,audit.ts,events.ts,index.ts}`, `packages/db/drizzle.config.ts` (`out: '../../supabase/migrations'`), `packages/db/src/testing/{db.ts,fixtures.ts,as-user.ts}`
- Gerar: `supabase/migrations/<timestamp>_foundation_schema.sql`
- Teste: `packages/db/test/schema.test.ts`

**Interfaces:**

- Produz:
  - Tabelas e colunas da secção 4 do spec, em snake_case, com chaves estrangeiras e índices em `organization_id`, `client_id` e `user_id`.
  - Unicidade em `(organization_id, user_id)` nas pertenças e em `(client_id, user_id)` nas pertenças de cliente.
  - `type DbTransaction`, exportado por `@agency-os/db`: transação Drizzle sobre postgres.js, usada por todas as funções que escrevem na base de dados.
  - `withTestTransaction<T>(fn: (sql: TransactionSql) => Promise<T>): Promise<void>`: abre uma transação e reverte sempre.
  - `createFixtureWorld(sql): Promise<World>`: cria uma organização, dois clientes (A e B), um fundador, um gestor atribuído a A, um freelancer atribuído a A, um financeiro, um decisor de A, um operacional de A e um financeiro de cliente de B, em `auth.users`, `profiles` e pertenças. Devolve os IDs.
  - `asUser(sql, userId: string, opts?: { aal?: 'aal1' | 'aal2' }): Promise<void>`: executa `set local role authenticated` e `set_config('request.jwt.claims', ..., true)` com `sub`, `role: 'authenticated'`, `aal` (padrão `aal2`) e `session_id`.

- [ ] **Passo 1:** testes:
  - `every foundation table exists with uuid primary key defaulting to gen_random_uuid`.
  - `audit_log has no updated_at and no archived_at`.
  - `organization_memberships rejects duplicate organization and user`.
- [ ] **Passo 2:** `pnpm test:db` deve FALHAR. Corre contra `DATABASE_DIRECT_URL`: projeto dev em local, `supabase start` em CI.
- [ ] **Passo 3:** escrever o esquema Drizzle e `pnpm --filter @agency-os/db generate`. Aplicar ao dev com `supabase link --project-ref ogmbcsxzmtyjteykgzkj && supabase db push`.
- [ ] **Passo 4:** confirmar PASSA.
- [ ] **Passo 5:** commit `feat(db): add foundation schema and database test harness`.

---

### Task 5: Funções de acesso e políticas RLS

**Ficheiros:**

- Criar: migração personalizada `supabase/migrations/<timestamp>_access_policies.sql` (gerada com `drizzle-kit generate --custom`; contém o esquema `app`, as funções e as políticas)
- Teste: `packages/db/test/rls/{organizations,profiles,memberships,clients,client-memberships,assignments,audit,events}.test.ts`, `packages/db/test/rls/coverage.test.ts`

**Interfaces:**

- Produz:
  - `app.is_mfa_verified() returns boolean`.
  - `app.has_org_role(org uuid, roles app.org_role[]) returns boolean`.
  - `app.is_org_member(org uuid) returns boolean`.
  - `app.has_client_access(client uuid) returns boolean`.
  - Todas `security definer`, `stable`, `set search_path = ''`, com `execute` concedido só a `authenticated`.
  - Políticas exatamente como na tabela da secção 5 do spec. Pertenças `revoked` e linhas com `archived_at` não contam.

- [ ] **Passo 1:** testes, um ficheiro por tabela, sempre com `createFixtureWorld` + `asUser`:
  - `client A user cannot select, update or delete client B rows` (para cada tabela com `client_id`).
  - `founder without mfa sees no internal rows` (`aal1`).
  - `dual-role user without mfa keeps client access only`.
  - `revoked membership loses access`.
  - `archived client is invisible`.
  - `manager sees only assigned clients`.
  - `decision maker can invite colleague to own client only`.
  - `operational cannot insert client memberships`.
  - `no authenticated user can read domain_events`.
  - `only founder reads audit_log`.
  - `coverage.test.ts`: `every public table with organization_id or client_id has rls enabled and at least one policy`, consultando `pg_class.relrowsecurity` e `pg_policies`.
- [ ] **Passo 2:** confirmar FALHA.
- [ ] **Passo 3:** escrever a migração. Ativar `force row level security` em todas as tabelas.
- [ ] **Passo 4:** `supabase db push` para o dev e confirmar PASSA.
- [ ] **Passo 5:** commit `feat(db): enforce tenant isolation with rls policies`.

---

### Task 6: Registo de auditoria só de escrita

**Ficheiros:**

- Criar: migração `<timestamp>_audit_append_only.sql`, `apps/web/src/modules/audit/{record.ts,actions.ts,index.ts}`
- Teste: `packages/db/test/audit-append-only.test.ts`, `apps/web/src/modules/audit/record.test.ts`

**Interfaces:**

- Produz:
  - `app.record_audit(p_organization uuid, p_action text, p_resource_type text, p_resource_id uuid, p_client uuid, p_metadata jsonb, p_ip inet, p_user_agent text, p_actor_kind app.actor_kind) returns uuid` (`security definer`; `actor_user_id` = `auth.uid()`; `actor_kind = 'system'` só quando não há `auth.uid()`).
  - `AUDIT_ACTIONS`, constante com `auth.sign_in`, `auth.sign_out`, `auth.mfa_failed`, `auth.mfa_enrolled`, `invitation.created`, `invitation.accepted`, `membership.changed`, `session.revoked`, `password.changed`.
  - `recordAudit(tx: DbTransaction, entry: AuditEntry): Promise<string>`.

- [ ] **Passo 1:** testes:
  - `update on audit_log fails for every role including postgres` (o gatilho levanta exceção).
  - `delete on audit_log fails for every role`.
  - `authenticated cannot insert directly`.
  - `record_audit sets actor from jwt`.
  - `recordAudit rejects unknown action at type level and runtime`.
- [ ] **Passo 2:** confirmar FALHA.
- [ ] **Passo 3:** revogar `update` e `delete` a `public`, `authenticated`, `anon` e `service_role`; criar o gatilho `before update or delete` que levanta exceção; implementar `recordAudit`.
- [ ] **Passo 4:** confirmar PASSA.
- [ ] **Passo 5:** commit `feat(audit): add append-only audit log`.

---

### Task 7: Contextos de base de dados e cliente Supabase no servidor

**Ficheiros:**

- Criar: `apps/web/src/platform/{db.ts,supabase-server.ts,session.ts}`
- Modificar: `packages/config/eslint.config.js` (bloquear `withSystemContext` em `apps/web/src/app/**`)
- Teste: `apps/web/src/platform/db.test.ts`

**Interfaces:**

- Produz:
  - `type VerifiedClaims = { sub: string; aal: 'aal1' | 'aal2'; session_id: string; amr: { method: string; timestamp: number }[]; role: 'authenticated' }`.
  - `withUserContext<T>(claims: VerifiedClaims, fn: (tx: DbTransaction) => Promise<T>): Promise<T>`.
  - `withSystemContext<T>(fn: (tx: DbTransaction) => Promise<T>): Promise<T>`.
  - `createSupabaseServerClient(): Promise<SupabaseClient>`: `@supabase/ssr` com cookies `httpOnly: true`, `secure: true`, `sameSite: 'lax'`.
  - `getVerifiedClaims(): Promise<VerifiedClaims | null>`: usa `supabase.auth.getClaims()`, que verifica a assinatura por JWKS.

- [ ] **Passo 1:** testes:
  - `withUserContext runs as authenticated with given claims` (verifica `current_user` e `auth.uid()`).
  - `withUserContext cannot read other client rows` (com o mundo de fixtures).
  - `withSystemContext bypasses rls`.
  - `eslint rejects importing withSystemContext from app directory`.
- [ ] **Passo 2:** confirmar FALHA.
- [ ] **Passo 3:** implementar com postgres.js (`prepare: false` para o pooler) e Drizzle.
- [ ] **Passo 4:** confirmar PASSA.
- [ ] **Passo 5:** commit `feat(platform): add user and system database contexts`.

---

### Task 8: Outbox de eventos e Inngest

**Ficheiros:**

- Criar: `apps/web/src/modules/events/{emit.ts,dispatch.ts,inngest.ts,index.ts}`, `apps/web/src/app/api/inngest/route.ts`
- Teste: `apps/web/src/modules/events/{emit.test.ts,dispatch.test.ts}` (base de dados real, Inngest simulado)

**Interfaces:**

- Consome: `withSystemContext` (Task 7).
- Produz:
  - `DOMAIN_EVENTS`, constante com `identity.user.invited`.
  - `emit(tx, event: { type: DomainEventType; organizationId: string; clientId?: string; payload: unknown }): Promise<string>`.
  - `dispatchPending(deps: { send: (events: { id: string; name: string; data: unknown }[]) => Promise<void>; batchSize?: number }): Promise<{ dispatched: number; failed: number }>`.
  - A função Inngest `outbox-dispatch` corre com `cron: '*/5 * * * *'` e com o evento `outbox/flush`.
  - `requestFlush(): Promise<void>`, chamado depois do commit.

- [ ] **Passo 1:** testes:
  - `event emitted in rolled back transaction is never dispatched`.
  - `committed event is dispatched once across two concurrent dispatchers` (`FOR UPDATE SKIP LOCKED`).
  - `send receives domain event id as idempotency id`.
  - `failed send increments attempts and stores last_error`.
  - `event becomes failed after 10 attempts and reports to sentry` (Sentry simulado).
- [ ] **Passo 2:** confirmar FALHA.
- [ ] **Passo 3:** implementar.
- [ ] **Passo 4:** confirmar PASSA.
- [ ] **Passo 5:** commit `feat(events): add transactional outbox dispatched through inngest`.

---

### Task 9: Matriz de acesso e `authorize`

**Ficheiros:**

- Criar: `apps/web/src/modules/access/{matrix.ts,authorize.ts,scope.ts,index.ts}`
- Teste: `apps/web/src/modules/access/{matrix.test.ts,authorize.test.ts}`

**Interfaces:**

- Produz:
  - `type Role = 'founder' | 'project_manager' | 'freelancer' | 'finance' | 'agent' | 'decision_maker' | 'operational' | 'client_finance'`.
  - `type Resource = 'pipeline' | 'rooms' | 'commercial_values' | 'invoices' | 'library' | 'brand_hub' | 'vault' | 'users' | 'audit_log'`.
  - `type Action = 'read' | 'write' | 'approve' | 'draft' | 'pay' | 'publish' | 'invite'`.
  - `type Scope = 'all' | 'own' | 'own_room'`.
  - `type Actor = { userId: string; organizationId: string; roles: Role[]; mfaVerifiedAt: Date | null }`.
  - `type ResourceRef = { type: Resource; clientId?: string }`.
  - `type AccessContext = { assignedClientIds: ReadonlySet<string>; memberClientIds: ReadonlySet<string> }`.
  - `authorize(actor: Actor, action: Action, resource: ResourceRef, ctx: AccessContext): { allowed: true } | { allowed: false; reason: 'forbidden' }`.
  - `loadAccessContext(tx: DbTransaction, actor: Actor): Promise<AccessContext>` em `scope.ts`.
  - `getActor(): Promise<Actor | null>` em `scope.ts`: combina `getVerifiedClaims` (Task 7) com as pertenças ativas do utilizador; `mfaVerifiedAt` vem da entrada `totp` de `amr`.

- [ ] **Passo 1:** testes:
  - `matrix.test.ts` com um caso por célula da matriz do separador 08. Exemplos: `freelancer has no access to commercial_values`; `client_finance reads invoices of own room and can pay`; `agent can only draft on pipeline`; `project_manager writes rooms only for assigned clients`; `operational writes library only for own room`; `nobody but founder reads audit_log`.
  - `authorize.test.ts`: `unknown role is denied`; `unknown action is denied`; `own scope without clientId is denied`; `founder is allowed everything except actions not in matrix`.
- [ ] **Passo 2:** confirmar FALHA.
- [ ] **Passo 3:** escrever `matrix.ts` como `Record<Resource, Partial<Record<Role, ReadonlyArray<{ action: Action; scope: Scope }>>>>`, transcrevendo o separador 08 célula a célula. Os requisitos de MFA e motivo do cofre ficam fora da matriz, na função que os aplica.
- [ ] **Passo 4:** confirmar PASSA.
- [ ] **Passo 5:** commit `feat(access): add permission matrix and authorize`.

---

### Task 10: Proxy, cabeçalhos de segurança e inatividade

**Ficheiros:**

- Criar: `apps/web/src/proxy.ts`, `apps/web/src/platform/{security-headers.ts,activity-cookie.ts}`
- Teste: `apps/web/src/platform/{security-headers.test.ts,activity-cookie.test.ts}`

**Interfaces:**

- Produz:
  - `buildSecurityHeaders(nonce: string): Headers`.
  - `signActivity(at: Date, secret: string): string`.
  - `verifyActivity(value: string | undefined, secret: string, now: Date): { valid: true; at: Date } | { valid: false }`.
  - `isInactive(at: Date, now: Date, limitMs = 8 * 60 * 60 * 1000): boolean`.
  - O cookie chama-se `__Host-activity`.

- [ ] **Passo 1:** testes:
  - `csp contains nonce, default-src self, frame-ancestors none, object-src none`.
  - `hsts max-age is at least 31536000 with includeSubDomains`.
  - `includes nosniff, strict-origin-when-cross-origin referrer and restrictive permissions-policy`.
  - `activity cookie round-trips`.
  - `rejects tampered or future activity cookie`.
  - `isInactive is false at 7h59m and true at 8h01m`.
- [ ] **Passo 2:** confirmar FALHA.
- [ ] **Passo 3:** implementar com HMAC-SHA256 (`node:crypto`, comparação com `timingSafeEqual`). O `proxy.ts`:
  1. Gera o nonce e aplica os cabeçalhos.
  2. Resolve o idioma pelo next-intl.
  3. Atualiza a sessão Supabase.
  4. Para sessões internas, termina a sessão se `isInactive` for verdadeiro, ou se o cookie for inválido ou não existir depois do login.
  5. Renova o cookie no máximo uma vez por minuto.
- [ ] **Passo 4:** confirmar PASSA.
- [ ] **Passo 5:** commit `feat(platform): add security headers and inactivity timeout`.

---

### Task 11: Política de palavra-passe e Have I Been Pwned

**Ficheiros:**

- Criar: `apps/web/src/modules/identity/{password-policy.ts,hibp.ts}`
- Teste: `apps/web/src/modules/identity/{password-policy.test.ts,hibp.test.ts}`

**Interfaces:**

- Produz:
  - `validatePassword(password: string, deps: { isPwned: (p: string) => Promise<boolean> }): Promise<{ ok: true } | { ok: false; reason: 'too_short' | 'pwned' | 'check_unavailable' }>`.
  - `isPwnedPassword(password: string, fetchImpl?: typeof fetch): Promise<boolean>`: pede `GET https://api.pwnedpasswords.com/range/{5 primeiros caracteres do SHA-1, em maiúsculas}` com o cabeçalho `Add-Padding: true` e timeout de 3000 ms.

- [ ] **Passo 1:** testes:
  - `rejects 11 characters and accepts 12`.
  - `sends only the five character prefix` (o pedido simulado nunca contém o hash completo).
  - `detects pwned suffix and ignores padded zero-count entries`.
  - `rejects with retryable error when hibp times out` (devolve `check_unavailable`).
- [ ] **Passo 2:** confirmar FALHA.
- [ ] **Passo 3:** implementar.
- [ ] **Passo 4:** confirmar PASSA.
- [ ] **Passo 5:** commit `feat(identity): add password policy with breached password check`.

---

### Task 12: Entrada, link mágico, MFA e reautenticação

**Ficheiros:**

- Criar: `apps/web/src/modules/identity/{sign-in.ts,magic-link.ts,mfa.ts,reauth.ts}`, `apps/web/src/app/[locale]/(auth)/{sign-in,magic-link,mfa/enroll,mfa/verify}/page.tsx` e as respetivas `actions.ts`
- Teste: `apps/web/src/modules/identity/{sign-in.test.ts,magic-link.test.ts,mfa.test.ts,reauth.test.ts}`

**Interfaces:**

- Consome: `createSupabaseServerClient`, `getVerifiedClaims`, `recordAudit`.
- Produz:
  - `signInWithPassword(input: { email: string; password: string }): Promise<{ next: 'mfa_enroll' | 'mfa_verify' } | { error: 'invalid_credentials' }>`.
  - `requestMagicLink(input: { email: string; locale: Locale }): Promise<{ sent: true }>`: devolve sempre `{ sent: true }`.
  - `enrollTotp(): Promise<{ factorId: string; qrCodeSvg: string; secret: string }>`.
  - `verifyTotp(input: { factorId: string; code: string }): Promise<{ ok: true } | { error: 'invalid_code' }>`.
  - `requireRecentMfa(claims: VerifiedClaims, now: Date, maxAgeMs = 15 * 60 * 1000): { ok: true } | { ok: false; reason: 'reauthentication_required' }`.
  - Rota de callback `app/[locale]/(auth)/callback/route.ts`.

- [ ] **Passo 1:** testes com o cliente Supabase simulado:
  - `wrong password returns invalid_credentials without revealing account existence`.
  - `internal user without factor is sent to enrollment`.
  - `magic link is not sent to internal email but response is identical`.
  - `normalises email before internal check`.
  - `requireRecentMfa accepts totp at 14m59s and rejects at 15m01s`.
  - `requireRecentMfa rejects when amr has no totp`.
  - `sign in, mfa failure and enrollment are audited`.
- [ ] **Passo 2:** confirmar FALHA.
- [ ] **Passo 3:** implementar a lógica e os ecrãs, com componentes de `@agency-os/ui`, `InputOTP` para o código e textos em `auth.*`. Os ecrãs são construídos depois de carregar a skill `ui-ux-pro-max` para padrões de formulários de autenticação; os tokens do separador 05 prevalecem.
- [ ] **Passo 4:** confirmar PASSA.
- [ ] **Passo 5:** commit `feat(identity): add password, magic link and totp authentication`.

---

### Task 13: Convites e fundador inicial

**Ficheiros:**

- Criar: `apps/web/src/modules/identity/invitations.ts`, `apps/web/src/app/[locale]/(auth)/{accept-invitation,set-password}/page.tsx`, `apps/web/scripts/bootstrap-founder.ts`
- Teste: `apps/web/src/modules/identity/invitations.test.ts`, `packages/db/test/invitations.test.ts`

**Interfaces:**

- Consome: `authorize`, `withUserContext`, `withSystemContext`, `emit`, `recordAudit`, `validatePassword`.
- Produz:
  - `inviteTeamMember(actor, input: { email: string; role: 'project_manager' | 'freelancer' | 'finance'; fullName: string }): Promise<{ membershipId: string }>`.
  - `inviteClientUser(actor, input: { clientId: string; email: string; role: 'decision_maker' | 'operational' | 'client_finance'; fullName: string }): Promise<{ membershipId: string }>`.
  - `acceptInvitation(claims): Promise<void>`: passa a pertença de `invited` a `active`.
  - `setPassword(input: { password: string }): Promise<{ ok: true } | { error: 'too_short' | 'pwned' | 'check_unavailable' }>`.
  - Script `pnpm --filter web bootstrap:founder --email <e> --name <n> --organization <nome>`, idempotente.

- [ ] **Passo 1:** testes:
  - `only founder invites team members`.
  - `decision maker invites only to own client and only client roles`.
  - `invite creates invited membership, emits identity.user.invited and audits invitation.created`.
  - `accepting activates membership once`.
  - `set password rejects pwned password`.
  - `bootstrap is idempotent` (correr duas vezes cria uma única organização e um único fundador).
- [ ] **Passo 2:** confirmar FALHA.
- [ ] **Passo 3:** implementar com `supabase.auth.admin.inviteUserByEmail` dentro de `withSystemContext`, depois de `authorize` no contexto do utilizador.
- [ ] **Passo 4:** confirmar PASSA.
- [ ] **Passo 5:** commit `feat(identity): add invitations and founder bootstrap`.

---

### Task 14: Sessões ativas

**Ficheiros:**

- Criar: migração `<timestamp>_session_functions.sql`, `apps/web/src/modules/identity/sessions.ts`, `apps/web/src/app/[locale]/(studio)/settings/sessions/page.tsx` e `apps/web/src/app/[locale]/(portal)/settings/sessions/page.tsx` (partilham um componente)
- Teste: `packages/db/test/sessions.test.ts`, `apps/web/src/modules/identity/sessions.test.ts`

**Interfaces:**

- Produz:
  - `app.list_my_sessions() returns table(id uuid, created_at timestamptz, updated_at timestamptz, user_agent text, ip inet, aal text, is_current boolean)`.
  - `app.revoke_my_session(p_session uuid) returns boolean`.
  - `listSessions(claims)`, `revokeSession(claims, sessionId)`, `changePassword(claims, input)`: terminam todas as sessões com `signOut({ scope: 'global' })`.

- [ ] **Passo 1:** testes:
  - `lists only own sessions and marks current`.
  - `cannot revoke another user's session` (devolve `false` e nada é apagado).
  - `revoking a session audits session.revoked`.
  - `changing password ends all sessions and audits password.changed`.
- [ ] **Passo 2:** confirmar FALHA.
- [ ] **Passo 3:** implementar. Se o papel dono da função não puder apagar em `auth.sessions` no Supabase alojado, parar e registar a alternativa em `docs/STATUS.md` antes de continuar.
- [ ] **Passo 4:** confirmar PASSA.
- [ ] **Passo 5:** commit `feat(identity): add active sessions management`.

---

### Task 15: Layout da aplicação, estados e encaminhamento

**Ficheiros:**

- Criar: `packages/ui/src/components/states/{empty-state,loading-state,error-state,blocked-state}.tsx`, `apps/web/src/app/[locale]/(studio)/{layout.tsx,page.tsx}`, `apps/web/src/app/[locale]/(portal)/{layout.tsx,page.tsx}`, `apps/web/src/app/[locale]/not-found.tsx`, `apps/web/src/components/shell/{app-sidebar,top-bar,theme-toggle,locale-switcher}.tsx`, `apps/web/src/modules/organizations/{queries.ts,index.ts}`
- Teste: `apps/web/src/components/shell/*.test.tsx` (Testing Library), `apps/web/src/app/routing.test.ts`

**Interfaces:**

- Consome: `getActor`, `withUserContext`, `ThemeProvider`.
- Produz:
  - `resolveHome(actor: Actor | null): '/sign-in' | '/studio' | '/portal'`.
  - `AppSidebar({ level: 'studio' | 'room', clientId?: string })`.
  - Os quatro componentes de estado com `title`, `description` e `action?`.

- [ ] **Passo 1:** testes:
  - `internal actor goes to studio, client actor to portal, anonymous to sign-in`.
  - `room level sidebar shows back to all clients link`.
  - `sidebar collapses to 64px and persists preference`.
  - `theme toggle switches between light, dark and system`.
  - `not found and forbidden render the same page`.
  - `state components render translated title`.
- [ ] **Passo 2:** confirmar FALHA.
- [ ] **Passo 3:** implementar com shadcn `Sidebar`. Larguras e alturas vêm dos tokens. O estúdio e o portal mostram `EmptyState`. Carregar as skills `design-taste-frontend` e `impeccable` para rever o layout final; os tokens e princípios do separador 05 prevalecem.
- [ ] **Passo 4:** confirmar PASSA.
- [ ] **Passo 5:** commit `feat(shell): add application shell, state components and routing`.

---

### Task 16: PWA e esqueleto do Brand Hub

**Ficheiros:**

- Criar: `apps/web/src/app/manifest.ts`, `apps/web/public/icons/{icon-192.png,icon-512.png,maskable-512.png}` (gerados a partir de `BrandSymbol` sobre `#0A0F15`), `apps/brand-hub` (Next.js com `output: 'export'`, página única com `EmptyState`)
- Teste: `apps/web/src/app/manifest.test.ts`, `apps/brand-hub/test/export.test.ts`

**Interfaces:**

- Produz: o manifesto com `name` vindo de `app.name`, `display: 'standalone'`, `theme_color` e `background_color` dos tokens `canvas`.

- [ ] **Passo 1:** testes:
  - `manifest has name, standalone display, 192 and 512 icons and maskable icon`.
  - `brand hub build produces static out directory without server functions`.
- [ ] **Passo 2:** confirmar FALHA.
- [ ] **Passo 3:** implementar.
- [ ] **Passo 4:** confirmar PASSA.
- [ ] **Passo 5:** commit `feat: add pwa manifest and brand hub skeleton`.

---

### Task 17: Observabilidade

**Ficheiros:**

- Criar: `apps/web/{instrumentation.ts,instrumentation-client.ts,sentry.server.config.ts,sentry.edge.config.ts}`, `apps/web/src/platform/{logger.ts,sentry-scrub.ts}`
- Teste: `apps/web/src/platform/{logger.test.ts,sentry-scrub.test.ts}`

**Interfaces:**

- Produz:
  - `logger.info|warn|error(message: string, fields?: Record<string, unknown>)`: escreve uma linha JSON com `level`, `message`, `timestamp` e `requestId`.
  - `scrubEvent(event: ErrorEvent): ErrorEvent`.

- [ ] **Passo 1:** testes:
  - `scrub removes authorization and cookie headers, emails and request bodies`.
  - `logger never serialises fields named password, token, secret or code`.
- [ ] **Passo 2:** confirmar FALHA.
- [ ] **Passo 3:** seguir as instruções de https://skills.sentry.dev/instrument para o Next.js com `sendDefaultPii: false`, `beforeSend: scrubEvent`, DSN da região EU e `tracesSampleRate` a 0.1.
- [ ] **Passo 4:** confirmar PASSA.
- [ ] **Passo 5:** commit `feat(platform): add sentry and structured logging`.

---

### Task 18: Pipeline de pull request

**Ficheiros:**

- Criar: `.github/workflows/ci.yml`, `.github/dependabot.yml`, `.semgrep.yml` (regras `p/typescript`, `p/nextjs`, `p/secrets`)
- Teste: um PR de verificação com um teste a falhar propositadamente, depois revertido

**Interfaces:**

- Produz:
  - Jobs `quality` (typecheck, lint, format:check, unit), `database` (`supabase start`, `supabase db reset`, `pnpm test:db`), `build`, `security` (Semgrep, TruffleHog `--only-verified`, `pnpm audit --audit-level high`) e `pr-title` (`amannn/action-semantic-pull-request`).
  - Configuração `concurrency: { group: ci-${{ github.ref }}, cancel-in-progress: true }`.

- [ ] **Passo 1:** abrir um PR com um teste unitário a falhar; o job `quality` deve FALHAR.
- [ ] **Passo 2:** reverter; todos os jobs devem PASSAR.
- [ ] **Passo 3:** o Dependabot fica com atualizações semanais para `npm` e `github-actions`, agrupadas por minor e patch.
- [ ] **Passo 4:** commit `ci: add pull request pipeline and dependabot`.

---

### Task 19: Deploy de preview e de staging

**Ficheiros:**

- Criar: `.github/workflows/deploy-preview.yml`, `.github/workflows/deploy-staging.yml`, `apps/web/vercel.json` (`regions: ["dub1"]`)
- Configuração externa (com o fundador): GitHub Environments `preview` e `staging` com os segredos da lista de restrições globais e `VERCEL_TOKEN`, `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID`, `SUPABASE_ACCESS_TOKEN`, `SUPABASE_DB_PASSWORD`; projeto Vercel criado com `vercel link`; integração Inngest e Vercel ativa.

**Interfaces:**

- Produz:
  - Em PR: `vercel pull`, `vercel build` e `vercel deploy --prebuilt`, com o URL comentado no PR.
  - Em push para `develop`: `supabase link --project-ref yjbdsaygzrgxsclfyegp`, `supabase db push`, depois o deploy de staging, depois `sentry-cli sourcemaps upload`, depois a Tarefa 20.

- [ ] **Passo 1:** um PR de teste recebe o comentário com o URL de preview, e a página de entrada abre.
- [ ] **Passo 2:** o merge em `develop` aplica as migrações no staging antes do deploy (verificar a ordem dos passos no log).
- [ ] **Passo 3:** um erro provocado num endpoint temporário de staging aparece no Sentry em menos de 5 minutos; remover o endpoint a seguir.
- [ ] **Passo 4:** commit `ci: add preview and staging deployments`.

---

### Task 20: Testes de ponta a ponta e acessibilidade

**Ficheiros:**

- Criar: `apps/web/playwright.config.ts`, `apps/web/e2e/{founder-sign-in,invitation,client-magic-link,sessions,theme-and-locale,accessibility}.spec.ts`, `apps/web/scripts/seed-e2e.ts`
- Modificar: `.github/workflows/deploy-staging.yml` (job `e2e` depois do deploy)

**Interfaces:**

- Consome: `bootstrap:founder`, a API de administração (`auth.admin.generateLink`) para obter links mágicos e de convite sem caixa de correio, e `otplib` para gerar códigos TOTP a partir do segredo do utilizador de teste.
- Produz: `seed-e2e.ts`, idempotente, que cria a organização de teste, um cliente e os utilizadores de teste em staging.

- [ ] **Passo 1:** escrever os testes que implementam os critérios de aceitação 5 a 9 do spec, incluindo:
  - `founder signs in with password and totp`.
  - `invited manager sets password, enrols totp and reaches studio`.
  - `client signs in with magic link and reaches portal`.
  - `critical action asks for new code after 15 minutes` (relógio do browser avançado com `page.clock`).
  - `revoking a session signs that browser out`.
  - `every foundation screen has no serious or critical axe violations in light and dark at 360 and 1440 px`.
- [ ] **Passo 2:** correr contra staging e confirmar que PASSAM.
- [ ] **Passo 3:** commit `test(e2e): add foundation end-to-end and accessibility suite`.

---

### Task 21: Documentação de desenvolvimento e fecho

**Ficheiros:**

- Modificar: `README.md` (pré-requisitos, `.env.local`, comandos, ligação ao projeto dev, fluxo de branches), `.env.example`, `docs/STATUS.md`

- [ ] **Passo 1:** numa cópia limpa do repositório, seguir apenas o README até `pnpm dev` funcionar contra o projeto dev.
- [ ] **Passo 2:** verificar os 13 critérios de aceitação do spec, um a um, e registar no `STATUS.md` a evidência de cada um (teste ou execução de CI).
- [ ] **Passo 3:** mover a fundação para "Feito"; registar desvios ao spec e itens adiados descobertos durante a execução.
- [ ] **Passo 4:** commit `docs: document development setup and close foundation`.
