# Sub-projeto 2F.3 — Brand Hub: domínio do cliente e manual em PDF — Plano de implementação

> **Para agentes:** SUB-SKILL OBRIGATÓRIA: usar `superpowers:subagent-driven-development` ou `superpowers:executing-plans` para executar este plano tarefa a tarefa. Os passos usam caixas (`- [ ]`) para acompanhamento.

**Objetivo:** ligar o Brand Hub publicado a um subdomínio do cliente, verificado por DNS e só depois da aprovação do cliente, e gerar o manual completo da marca em PDF.

**Arquitetura:**

- Uma tabela `brand_hub_domains` guarda o domínio de cada hub. O serviço `domains` verifica o TXT com `node:dns/promises` e liga o domínio ao projeto Vercel do site pela API REST.
- Em dev e no e2e, `DOMAIN_PROVIDER=fake` substitui o DNS e a Vercel.
- O site deteta que corre num domínio do cliente e pede o hub por anfitrião. O CORS e o regresso restrito passam a aceitar os domínios ligados.
- O manual é gerado com `pdf-lib` a partir da publicação e guardado no Storage por publicação.

**Stack:** a do 2F.2, mais `node:dns/promises` e o `pdf-lib` já instalado. Sem dependências novas.

**Spec:** [docs/superpowers/specs/2026-10-14-brand-hub-domain-manual-design.md](../specs/2026-10-14-brand-hub-domain-manual-design.md)

## Restrições globais

- As dos planos anteriores: TDD; inglês no código e PT-PT na documentação; migrações com dry-run; sem custo; sem linhas de atribuição a IA; escapes, barras invertidas e regex só com a ferramenta Edit; fronteira de módulos; segredos nunca mostrados.
- **Valores do spec:**
  - **domínio:** subdomínio com pelo menos três partes, até 253 caracteres, partes de 1 a 63 caracteres; registos `TXT _agency-os.<endereço>` (código de 32 caracteres) e `CNAME <endereço>` para `cname.vercel-dns.com`;
  - **estados:** `pending`, `verified`, `connected`;
  - **verificação:** 10 por hub em 15 minutos (`hub_domain_check`);
  - **manual:** embebe no máximo 40 MB de imagens; links de 15 minutos; ficheiro `<cliente>-manual-de-marca.pdf`; guardado em `hubs/<hub>/manual/<publicação>.pdf`;
  - **variáveis:**
    - OS: `BRAND_HUB_VERCEL_PROJECT_ID`, `BRAND_HUB_VERCEL_TEAM_ID`, `BRAND_HUB_VERCEL_TOKEN` e `DOMAIN_PROVIDER=fake`;
    - site: `NEXT_PUBLIC_SITE_HOST`.
- **Recusas dos serviços:** `not_found`, `invalid_input`, `invalid_state`, `rate_limited`, `not_approved`, `unavailable` e `provider_error`.

## Foco de revisão

1. **Regresso restrito para o domínio ligado de outro hub:** recusado, sem token. Teste na Task 4 (`restricted access returns to the hub's own connected domain only`).
2. **Ligar sem aprovação do cliente, ou com o domínio ainda `pending`:** recusado com `not_approved` ou `invalid_state`, sem chamar a Vercel. Teste na Task 3 (`connecting needs a verified domain and an approved hub`).
3. **Pedido por domínio `pending` ou `verified` (não ligado):** 404, sem revelar o hub. Teste na Task 4 (`domains answer only once connected`).
4. **Manual de um hub com imagens WebP, SVG e acima de 40 MB:** o PDF abre, as imagens que não cabem aparecem pelo nome, sem erro. Teste na Task 5 (`unsupported and oversized images are listed by name`).
5. **Endereços estranhos** (`Marca.Cliente.COM.`, `https://marca.cliente.com`, `cliente.com`, `127.0.0.1`, `localhost`, partes com `_`): normalizados quando possível e recusados nos restantes casos. Teste na Task 2 (`hostnames are normalised or refused`).

---

### Task 1: Esquema do domínio

**Ficheiros:**

- `packages/db/src/schema/brand-hub.ts`:
  - enum `brand_hub_domain_status`;
  - tabela `brandHubDomains`;
  - throttle `hub_domain_check` no enum existente.
- Migração gerada, com a política RLS de leitura e os grants escritos à mão.
- `packages/db/test/rls/brand-hub-domains.test.ts`.

**Interfaces:**

- **Produz:** `brandHubDomains` com `id`, `organizationId`, `hubId` (único, cascade), `hostname` (único, CHECK `^(?=.{1,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.){2,}[a-z]{2,63}$`), `verificationCode`, `status` (por omissão `pending`), `verifiedAt`, `connectedAt`, `createdBy`, `createdAt` e `updatedAt`.
- **RLS:** `select` para `app.is_org_staff(organization_id)`, com o mesmo predicado de `brand_hubs`; sem `insert`, `update` nem `delete` para `authenticated`.

**Passos:**

- [ ] Testes:
  - `staff of the organisation read domains, other organisations and clients do not`;
  - `hostnames are unique across hubs and must be well formed`;
  - `authenticated users cannot write domains`.
- [ ] FALHA → esquema e `pnpm db:generate` → ajustar a migração → `npx supabase db push --dry-run` mostrado → push para dev → PASSA → commit.

### Task 2: Endereço, DNS e Vercel

**Ficheiros:**

- `modules/brand-hub/domain/hostname.ts` (+ teste);
- `platform/vercel-domains.ts` (+ teste);
- `platform/domain-provider.ts`, com a versão real e a `fake` (+ teste);
- `platform/env.ts`: `parseDomainProviderEnv`.

**Interfaces:**

- `normaliseHostname(input: string) → string | null`:
  - minúsculas, sem esquema, sem caminho e sem ponto final;
  - `null` se não cumprir a regra da Task 1 ou se for um IP.
- `type DomainProvider`:
  - `txtRecords(name) → Promise<string[][] | null>` (`null` quando o nome não existe);
  - `addDomain(host) → Promise<{ ok: true } | { ok: false; message: string }>`;
  - `removeDomain(host) → Promise<void>`;
  - `domainConfigured(host) → Promise<boolean>`.
- `createVercelDomains({ projectId, teamId, token }, fetcher = fetch)`:
  - `POST /v10/projects/{p}/domains?teamId=` com o corpo `{ name }`;
  - `DELETE /v9/projects/{p}/domains/{host}?teamId=` (um 404 conta como removido);
  - `GET /v6/domains/{host}/config?teamId=` → `!misconfigured`.
- `domainProvider(): DomainProvider | null`:
  - `fake` quando `DOMAIN_PROVIDER=fake`;
  - real com `resolveTxt` quando as três variáveis existem;
  - `null` nos outros casos.
- **Versão `fake`:** `txtRecords` devolve `[[FAKE_TXT]]` para nomes em `*.verified.test` e `null` para os restantes. O serviço da Task 3 aceita `FAKE_TXT`, exportado, como código certo só quando o provider é o `fake`.

**Passos:**

- [ ] Testes:
  - `hostnames are normalised or refused` (foco 5);
  - `vercel requests carry the team, the token and the domain`;
  - `vercel errors become messages and a missing domain counts as removed`;
  - `the fake provider verifies only verified.test names`;
  - `the provider is null without configuration`.
- [ ] FALHA → implementar → PASSA → commit.

### Task 3: Serviço de domínios

**Ficheiros:**

- `modules/brand-hub/domains.ts` (+ `domains.db.test.ts`);
- `BrandHubDeps.domains?: DomainProvider` em `access.ts`;
- `testing.ts`: `memoryDomainProvider(records)`, que regista as chamadas;
- `server.ts`: exportar as funções com `deps()`.

**Interfaces:**

- `type HubDomainView = { hostname; status; verificationName: '_agency-os.<host>'; verificationCode; cnameTarget: 'cname.vercel-dns.com'; configured: boolean | null; available: boolean }`.
- `loadHubDomain(claims, hubId, deps) → HubDomainView | null | NotFound`:
  - autorizado por `canPublish`;
  - `configured` só é lido quando o estado é `connected`;
  - `available` é falso sem `deps.domains`.
- `setHubDomain(claims, { hubId, hostname }, deps) → { ok: true } | NotFound | invalid_input | unavailable`:
  - substitui o domínio anterior e chama `removeDomain` se ele estava `connected`;
  - código novo de 32 caracteres com `randomBytes(24).toString('base64url')`;
  - um nome já usado por outro hub dá `invalid_input`.
- `verifyHubDomain(claims, hubId, deps) → { ok: true } | { ok: false; rule: 'not_found' | 'rate_limited' | 'invalid_state' | 'unavailable' } | { ok: false; rule: 'invalid_input'; reason: 'missing' | 'mismatch' }`:
  - `consumeThrottle` com `kind 'hub_domain_check'`, chave `hubId`, limite 10 e janela de 900 s.
- `connectHubDomain(claims, hubId, deps) → { ok: true } | ... | { ok: false; rule: 'not_approved' } | { ok: false; rule: 'provider_error'; message }`:
  - exige o estado `verified`, `publishedPublicationId` e `approvedPublicationId`;
  - grava `connected` só depois de a Vercel aceitar o domínio.
- `removeHubDomain(claims, hubId, deps) → { ok: true } | NotFound | unavailable`.

**Passos:**

- [ ] Testes:
  - `publishers set a domain and others cannot`;
  - `a hostname used by another hub is refused`;
  - `verification passes only with the right code` (certo, errado, ausente);
  - `verification attempts are limited`;
  - `connecting needs a verified domain and an approved hub` (foco 2);
  - `a refused connection keeps the domain verified with the message`;
  - `changing or removing a connected domain removes it from vercel`;
  - `without a provider domains are unavailable`.
- [ ] FALHA → implementar → PASSA → commit.

### Task 4: Hub por domínio, CORS e regresso

**Ficheiros:**

- `modules/brand-hub/public.ts`;
- `app/api/public/domains/[host]/route.ts`;
- `app/api/public/hubs/respond.ts`;
- `public.db.test.ts`.

**Interfaces:**

- `readPublicHubByDomain(host, token, deps) → (PublicHubResult & { slug }) | { status: 404 }`:
  - só para domínios `connected`;
  - reutiliza `readPublicHub` pelo `slug` do hub;
  - o 401 também leva o `slug`.
- `siteOrigins(deps) → Promise<string[]>`: `BRAND_HUB_SITE_ORIGINS` mais `https://<host>` de cada domínio ligado.
- `siteResponse` e `sitePreflight` passam a `async` e usam `siteOrigins`. As rotas do 2F.2 fazem `await`.
- `allowedReturn(returnTo, hub, deps)`: aceita a origem do site ou `https://<domínio ligado deste hub>`.

**Passos:**

- [ ] Testes:
  - `domains answer only once connected` (foco 3);
  - `a connected domain opens its hub with the slug, also when locked`;
  - `connected domains are allowed origins`;
  - `restricted access returns to the hub's own connected domain only` (foco 1).
- [ ] FALHA → implementar → PASSA → commit.

### Task 5: Manual em PDF

**Ficheiros:**

- `modules/brand-hub/domain/manual-pdf.ts` (+ teste);
- `modules/brand-hub/manual.ts` (+ `manual.db.test.ts`);
- `app/api/public/hubs/[slug]/manual/route.ts`;
- `hubManualAction` em `app/[locale]/brand-hub-actions.ts`;
- `server.ts`.

**Interfaces:**

- `buildManualPdf({ clientName, publishedAt, snapshot, accent, images: Map<assetId, { bytes; mimeType }> }) → Promise<Uint8Array>`:
  - usa o `PdfWriter` de `platform/pdf.ts`, alargado com `image(bytes, mimeType)` e `swatch(hex, label)`;
  - estrutura: capa, índice e uma secção por página, com os blocos do spec 8.
- `manualFileName(clientName) → string`: `<slug do cliente>-manual-de-marca.pdf`, com o `slugify` do 2F.2.
- `hubManual(hubId, publicationId, deps) → { url; fileName }`:
  - devolve o ficheiro guardado em `hubs/<hub>/manual/<publicação>.pdf` se já existir;
  - senão, gera-o com as imagens JPEG e PNG da publicação, lidas do Storage até 40 MB no total, e faz o `upload`;
  - devolve um link de 15 minutos.
- `LibraryStorage.exists(path) → Promise<boolean>`: novo, na interface e nas implementações; `download` já existe.
- `publicHubManual(slug, token, deps)`: a autorização do `publicHubZip` → `{ status: 200; url; fileName } | 401 | 404`.
- `portalHubManual(claims, clientId, deps)`: a autorização do `brandHubZip` do 2F.1.

**Passos:**

- [ ] Testes unitários:
  - `the manual has a cover, an index and one section per page`, reabrindo o PDF com `PDFDocument.load` e contando as páginas;
  - `jpeg and png images are embedded`;
  - `unsupported and oversized images are listed by name` (foco 4);
  - `portuguese text is kept`.
- [ ] Testes de base de dados:
  - `the manual is generated once per publication and reused`;
  - `a new publication gets a new manual`;
  - `the manual follows the hub access mode`;
  - `the portal manual needs the client's people`.
- [ ] FALHA → implementar → PASSA → commit.

### Task 6: Painel do domínio e manual no portal

**Ficheiros:**

- `components/brand-hub/domain-panel.tsx` (+ testes), dentro do `sharing-panel.tsx`;
- ações `setHubDomainAction`, `verifyHubDomainAction`, `connectHubDomainAction` e `removeHubDomainAction`;
- a página do hub da sala carrega o `loadHubDomain`;
- `hub-downloads.tsx`: o botão "Manual completo (PDF)" usa uma prop `onManual`;
- mensagens em `brandHub.domain.*` e `brandHub.downloads.manual` nos dois idiomas.

**Interfaces:** o painel recebe `HubDomainView | null` e as ações. O botão de copiar copia os valores dos registos.

**Passos:**

- [ ] Testes:
  - `the panel shows the records to create while pending`;
  - `verification errors explain the missing or different record`;
  - `connecting explains the client approval when the hub is not approved` (RN-81);
  - `a connected domain shows waiting for DNS until configured`;
  - `unavailable without configuration`;
  - `the portal offers the manual`.
- [ ] FALHA → implementar → PASSA → commit.

### Task 7: O site no domínio e o manual

**Ficheiros:**

- `apps/brand-hub/src/site/api.ts`:
  - `loadHubByDomain(host, token)`;
  - `manual(slug, token) → { status: 200; url; fileName } | { status: 401 | 404 | 'error' }`.
- `apps/brand-hub/src/site/hub-site.tsx`: a origem do hub;
- `apps/brand-hub/src/site/site-downloads.tsx`: o botão do manual;
- `apps/brand-hub/src/app/page.tsx`: lê `NEXT_PUBLIC_SITE_HOST`.

**Interfaces:**

- `HubSite` recebe `siteHost: string`:
  - `location.host === siteHost` ou `localhost:*`: o `slug` vem do caminho;
  - outro anfitrião: `loadHubByDomain(location.host)`, e o `slug` devolvido serve o desbloqueio, o ZIP, o manual e a chave do token.

**Passos:**

- [ ] Testes em `hub-site.test.tsx`:
  - `on the site host the slug comes from the path`;
  - `on a client domain the hub loads by host and unlocks by its slug`;
  - `the manual downloads with the token`.
- [ ] FALHA → implementar → PASSA → commit.

### Task 8: Configuração, CI e ponta a ponta

**Ficheiros:**

- `.github/workflows/deploy-preview.yml` e `deploy-staging.yml`:
  - o OS no preview recebe `DOMAIN_PROVIDER=fake`;
  - o OS no staging recebe as variáveis `BRAND_HUB_VERCEL_*` (segredos `BRAND_HUB_VERCEL_TEAM_ID` e `BRAND_HUB_VERCEL_TOKEN` copiados do `.env.local` sem os mostrar);
  - o site recebe `NEXT_PUBLIC_SITE_HOST`.
- O e2e local corre o OS com `DOMAIN_PROVIDER=fake`.
- `apps/web/e2e/brand-hub-domain.spec.ts`.
- `docs/STATUS.md`: exclusões e estado.

**Passos:**

- [ ] O e2e segue o percurso do spec:
  - a equipa indica `marca.verified.test`, verifica e vê o bloqueio do RN-81;
  - o decisor aprova no portal; a equipa liga o domínio e vê "a aguardar DNS" desaparecer com o `fake`;
  - o visitante do site descarrega o manual e recebe um PDF.
  - axe no painel.
- [ ] Toda a suite local (unitária, base de dados, e2e) → PASSA → commit.
