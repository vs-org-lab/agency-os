# Sub-projeto 2F.2 — Brand Hub: site publicado e acessos — Plano de implementação

> **Para agentes:** SUB-SKILL OBRIGATÓRIA: usar `superpowers:subagent-driven-development` ou `superpowers:executing-plans` para executar este plano tarefa a tarefa. Os passos usam caixas (`- [ ]`) para acompanhamento.

**Objetivo:** um site estático para todos os Brand Hubs publicados, num segundo projeto Vercel, com os modos público, palavra-passe e restrito (tokens emitidos pelo OS), downloads e imagens sem metadados.

**Arquitetura:**

- O `HubView` e os esquemas do instantâneo passam para o pacote `@agency-os/brand-hub-view`, usado pela web e pelo site.
- O OS ganha:
  - colunas de acesso no hub;
  - um serviço `access` (slug, modo, palavra-passe com scrypt, tokens HMAC);
  - uma API pública só de leitura com CORS (`/api/public/hubs/[slug]`, `/zip`, `/unlock`);
  - a página `hub-access` para o modo restrito.
- `apps/brand-hub` continua uma exportação estática: uma página cliente lê o `slug` do caminho e pede tudo à API do OS.
- Ao confirmar um ficheiro, os metadados das imagens são removidos por código próprio.

**Stack:** a do 2F.1. Usa `node:crypto` (scrypt, HMAC) e nenhuma dependência nova; o `client-zip` já existe.

**Spec:** [docs/superpowers/specs/2026-10-14-brand-hub-site-design.md](../specs/2026-10-14-brand-hub-site-design.md)

## Restrições globais

- As dos planos anteriores: TDD; inglês no código e PT-PT na documentação; migrações com dry-run; sem custo; sem linhas de atribuição a IA; escapes, barras invertidas e regex só com a ferramenta Edit; fronteira de módulos; segredos nunca mostrados.
- **Valores do spec:**
  - `slug` `^[a-z0-9-]{3,60}$`;
  - palavra-passe de 10 a 128 caracteres;
  - 5 tentativas por hub e IP em 15 minutos;
  - token válido 7 dias com palavra-passe e 12 horas restrito;
  - links de 15 minutos;
  - modo por omissão `restricted`;
  - variáveis:
    - OS: `BRAND_HUB_SITE_URL`, `BRAND_HUB_SITE_ORIGINS`, `BRAND_HUB_TOKEN_SECRET`;
    - site: `NEXT_PUBLIC_OS_URL`;
    - GitHub: `BRAND_HUB_VERCEL_PROJECT_ID`.
- **Recusas:**
  - serviços: `not_found`, `invalid_input`, `invalid_state`, `rate_limited`;
  - API: 401, 404 e 429.

## Foco de revisão

1. **Token adulterado, expirado, de outro hub ou anterior a uma mudança de acesso:** recusado com 401, sem mostrar nada do hub. Teste na Task 3 (`tokens fail when tampered, expired, for another hub or an older access version`).
2. **Regresso do `hub-access` para uma origem não configurada** (`return=https://evil.example/`): recusado, sem token. Teste na Task 4 (`restricted access only returns to configured origins`).
3. **Pedido à API de um hub com palavra-passe, sem token:** a resposta 401 não traz o instantâneo, nomes de ficheiros nem links. Teste na Task 4 (`locked hubs leak nothing`).
4. **JPEG com EXIF de GPS, PNG com `tEXt` e WebP com `EXIF`:** saem sem esses blocos e continuam a abrir; um ficheiro truncado ou estranho não rebenta a confirmação e fica como veio. Teste na Task 5 (`metadata is stripped and malformed files pass through`).
5. **`slug` com maiúsculas, acentos, espaços ou repetido:** normalizado ao gerar e recusado ao editar quando inválido ou já usado. Teste na Task 3 (`slugs are generated unique and validated on edit`).

---

### Task 1: Pacote do renderizador

**Ficheiros:**

- `packages/brand-hub-view/` com `package.json`, `tsconfig.json`, `src/{index.ts,hub-view.tsx}` e `src/domain/{blocks,design,snapshot,contrast}.ts`, movidos de `apps/web/src/modules/brand-hub/domain` e `apps/web/src/components/brand-hub/hub-view.tsx`;
- os testes movidos com eles;
- `apps/web` passa a depender de `@agency-os/brand-hub-view`; o módulo `brand-hub` e os componentes reexportam ou importam dele;
- `transpilePackages` no `next.config` da web e do site.

**Passos:**

- [ ] Mover os ficheiros e os testes, ajustar os imports e correr os testes movidos no pacote (PASSA).
- [ ] Suite unitária da web e dos componentes `brand-hub` → PASSA. `pnpm typecheck` e `pnpm lint` → commit.

### Task 2: Esquema de acesso

**Ficheiros:**

- `packages/db/src/schema/{enums,brand-hub}.ts`;
- a migração `<ts>_brand_hub_access_modes.sql`;
- o enum `throttle_kind` ganha `hub_unlock`;
- a fixture `createBrandHubFixture`;
- `packages/db/test/rls/brand-hub.test.ts`.

**O que muda:**

- `brand_hubs` ganha:
  - `slug text unique`;
  - `access_mode app.brand_hub_access_mode not null default 'restricted'`;
  - `password_hash text`;
  - `access_version int not null default 1`;
  - `CHECK` do `slug` e `CHECK ((access_mode = 'password') = (password_hash is not null))`.
- `brand_hub_assets` ganha `metadata_stripped_at timestamptz`.
- A migração preenche o `slug` dos hubs existentes a partir do nome do cliente (`regexp_replace` com acentos removidos por `translate`), com sufixo numérico em caso de repetição, e depois torna-o `not null`.
- A fixture dá `slug` `cliente-a` e `cliente-b` aos hubs.

**Passos:**

- [ ] Teste: `hubs carry a unique slug and a password hash only in password mode` (a inserção repetida e a inconsistência falham).
- [ ] FALHA → esquema e migração (dry-run, aplicar ao dev) → PASSA → commit.

### Task 3: Serviço de acesso e tokens

**Ficheiros:**

- `modules/brand-hub/domain/{slug,tokens}.ts` (+ testes no `domain.test.ts`);
- `modules/brand-hub/sharing.ts` (+ `sharing.db.test.ts`);
- `createBrandHub` gera o `slug`;
- ação de auditoria `brand_hub.access_changed`.

**Interfaces:**

- `slugify(name: string): string`: minúsculas, sem acentos, não alfanuméricos passam a `-`, sem `-` repetidos nem nas pontas, de 3 a 60 caracteres (completa com `hub` quando é curto).
- `uniqueSlug(tx, base): Promise<string>`: `base`, depois `base-2`, `base-3` e seguintes.
- `signHubToken(input: { hubId; mode: 'password' | 'restricted'; version: number; expiresAt: Date }, secret): string` e `verifyHubToken(token, secret, now): { hubId; mode; version } | null`. O formato é `base64url(payload).base64url(hmac)`, com comparação em tempo constante.
- `hashPassword(password): Promise<string>` (scrypt N=16384, sal de 16 bytes, formato `scrypt$salt$hash`) e `verifyPassword(password, stored): Promise<boolean>`.
- `updateHubSharing(claims, { hubId; slug; mode; password?: string }, deps) → { ok: true } | NotFound | { ok: false; rule: 'invalid_input' | 'invalid_state' }`:
  - só `canPublish`;
  - um `slug` repetido dá `invalid_state`;
  - `password` é obrigatória ao entrar no modo palavra-passe e opcional depois, para a manter;
  - sobe a `access_version` quando o modo ou a palavra-passe mudam;
  - não precisa de publicar.
- `loadHubSharing(claims, clientId, deps) → { slug; mode; hasPassword: boolean; siteUrl: string | null; published: boolean } | null`. O `siteUrl` é `BRAND_HUB_SITE_URL/<slug>/`.

**Passos:**

- [ ] Testes:
  - `slugs are generated unique and validated on edit` (foco 5);
  - `tokens fail when tampered, expired, for another hub or an older access version` (foco 1, verificação com a versão atual na Task 4);
  - `passwords are hashed and verified`;
  - `only publishers change sharing and changes raise the access version`.
- [ ] FALHA → implementar → PASSA → commit.

### Task 4: API pública e entrada restrita

**Ficheiros:**

- `modules/brand-hub/public.ts` (+ `public.db.test.ts`);
- `app/api/public/hubs/[slug]/route.ts`, `.../zip/route.ts`, `.../unlock/route.ts`;
- `app/[locale]/hub-access/[slug]/page.tsx`;
- `platform/cors.ts`, com `corsHeaders(origin, allowed)` e a resposta a `OPTIONS`;
- env `BRAND_HUB_*` em `platform/env`.

**Interfaces:**

- `readPublicHub(slug, token: string | null, deps) → { status: 200; hub: { snapshot; clientName; publishedAt; assetUrls: Record<string, string> } } | { status: 401; mode: 'password' | 'restricted'; clientName } | { status: 404 }`:
  - hub publicado;
  - `public`, ou token válido para o hub, o modo atual e a `access_version` atual;
  - `assetUrls` só com os ficheiros do instantâneo, em links de 15 minutos.
- `publicHubZip(slug, token, pageId | null, deps)`: o mesmo manifesto do 2F.1 (`downloadEntries`), com a mesma autorização.
- `unlockHub(slug, password, ip, deps) → { ok: true; token } | { ok: false; rule: 'not_found' | 'invalid_input' | 'rate_limited' }`:
  - `consumeThrottle` com `kind 'hub_unlock'`, chave `hubId:ip`, limite 5 e janela de 900 s, chamado antes de verificar;
  - token válido 7 dias.
- `issueRestrictedToken(claims, slug, returnTo, deps) → { ok: true; redirect: string } | NotFound | { ok: false; rule: 'invalid_input' }`:
  - a origem de `returnTo` tem de estar em `BRAND_HUB_SITE_ORIGINS`;
  - aceita o decisor ou o operacional do cliente (`is_client_member`) ou quem edita (`hubEditor`);
  - o hub tem de estar em modo restrito;
  - token de 12 horas;
  - `redirect` é `returnTo` com `#token=<token>`.
- Rotas:
  - `GET` lê `Authorization: Bearer`; `POST /unlock` lê o JSON;
  - o IP vem de `x-forwarded-for`;
  - CORS para as origens permitidas;
  - `Cache-Control: no-store`.

**Passos:**

- [ ] Testes:
  - `unpublished hubs are not found`;
  - `locked hubs leak nothing` (foco 3);
  - `a valid token or a public hub opens the publication with published assets only`;
  - `tokens from an older access version are refused`;
  - `the right password unlocks and attempts are limited`;
  - `restricted access admits the client's people and editors only`;
  - `restricted access only returns to configured origins` (foco 2);
  - unitário de CORS.
- [ ] FALHA → implementar → PASSA → commit.

### Task 5: Imagens sem metadados

**Ficheiros:**

- `modules/brand-hub/domain/strip-metadata.ts` (+ testes com amostras construídas em código);
- `LibraryStorage.upload(path, bytes, contentType)` na interface, no Supabase (`upsert: true`) e nas memórias de teste;
- `confirmHubAsset` grava os bytes limpos, o tamanho novo e o `metadata_stripped_at`;
- `sweepHubAssets` ganha o tratamento único dos ficheiros prontos sem `metadata_stripped_at` (até 20 por execução).

**Interfaces:** `stripImageMetadata(bytes: Uint8Array, mimeType: string): Uint8Array`:

- JPEG: remove os segmentos APP1, APP13 e COM antes do SOS;
- PNG: remove os blocos `eXIf`, `tEXt`, `iTXt` e `zTXt`;
- WebP: remove os blocos `EXIF` e `XMP `, limpa as flags no `VP8X` e corrige o tamanho RIFF;
- para outros tipos ou uma estrutura inválida, devolve os bytes como vieram.

**Passos:**

- [ ] Testes:
  - `metadata is stripped and malformed files pass through` (foco 4);
  - `confirmed hub images are stored without metadata` (base de dados, com a memória de Storage);
  - `the sweep strips images uploaded before this change`.
- [ ] FALHA → implementar → PASSA → commit.

### Task 6: Painel Partilha

**Ficheiros:**

- `components/brand-hub/sharing-panel.tsx`, como terceiro separador do painel lateral, só com `canPublish`;
- ações `saveHubSharingAction` em `brand-hub-actions.ts`;
- a página da sala lê `loadHubSharing`;
- mensagens `brandHub.sharing.*` nos dois idiomas.

**O painel mostra:**

- o endereço do site e Copiar;
- o `slug`;
- o modo, em três opções com uma frase cada;
- a palavra-passe, só no modo palavra-passe, com "deixe em branco para manter";
- o aviso "Publique para o site ficar disponível" enquanto não houver publicação;
- Guardar.

**Passos:**

- [ ] Testes de componentes:
  - `the sharing panel shows the site address and asks for a password only in password mode`;
  - `the sharing tab is hidden from freelancers`.
- [ ] FALHA → implementar → PASSA → commit.

### Task 7: O site

**Ficheiros:** `apps/brand-hub/`:

- `src/app/page.tsx`, com o cliente `HubSite`;
- `src/site/{api.ts,hub-site.tsx,password-gate.tsx,restricted-gate.tsx,site-downloads.tsx,token-store.ts}`;
- `src/i18n.ts`, com as mensagens `brandHub` do pacote i18n em pt-PT;
- `vercel.json`, que reescreve `/:path*` para `/index.html`;
- dependências: `@agency-os/brand-hub-view`, `@agency-os/i18n`, `next-intl`, `client-zip`;
- testes (`vitest`, jsdom, `fetch` simulado);
- o teste de configuração continua a exigir a exportação estática.

**Comportamento:**

- O `slug` é o primeiro segmento do caminho.
- Ao abrir, um `#token=` no endereço é guardado e apagado do endereço.
- O site pede `/api/public/hubs/<slug>` com o token guardado:
  - 200: mostra o `HubView` com `assetUrl` a partir de `assetUrls`, os downloads por página e "Descarregar todos os ativos";
  - 401 em modo `password`: mostra o formulário; uma palavra-passe errada dá "Palavra-passe incorreta" e o 429 dá "Demasiadas tentativas";
  - 401 em modo `restricted`: mostra "Entrar com a conta da empresa", que leva a `<OS>/pt-PT/hub-access/<slug>?return=<endereço>`;
  - 404: "Este Brand Hub não existe ou ainda não foi publicado";
  - enquanto carrega, mostra um esqueleto;
  - um 401 com um token guardado apaga-o.

**Passos:**

- [ ] Testes:
  - `the site renders a public hub with its downloads`;
  - `a password unlocks the hub and a wrong one is refused`;
  - `restricted hubs send visitors to the OS and keep the returned token`;
  - `unknown hubs say so`;
  - `a stale token is dropped`.
- [ ] FALHA → implementar → PASSA → `pnpm --filter brand-hub build` produz `out/` → commit.

### Task 8: Alojamento, CI e ponta a ponta

**Ficheiros:**

- `.github/workflows/{deploy-preview,deploy-staging}.yml`;
- `apps/web/e2e/support/hub-site-server.ts`, um servidor Node que serve `apps/brand-hub/out` com recurso a `index.html` e reencaminha `/os/*` para `E2E_BASE_URL` com o cabeçalho de bypass;
- `apps/web/e2e/brand-hub-site.spec.ts`;
- `playwright.config.ts`: o `webServer` do site em `:3001`, construído com `NEXT_PUBLIC_OS_URL=http://localhost:3001/os`.

**Passos:**

- [ ] **Projeto Vercel:**
  - criar `agency-os-brand-hub` pela API (`POST /v11/projects`, framework Next.js, `rootDirectory` `apps/brand-hub`) com o `VERCEL_TOKEN` e a equipa de `VERCEL_ORG_ID`;
  - guardar o id em `BRAND_HUB_VERCEL_PROJECT_ID`;
  - gerar `PREVIEW_BRAND_HUB_TOKEN_SECRET` e `STAGING_BRAND_HUB_TOKEN_SECRET` (32 bytes aleatórios) diretamente para `gh secret set`, sem os mostrar.
- [ ] **Preview do OS:** `--env BRAND_HUB_TOKEN_SECRET`, `BRAND_HUB_SITE_ORIGINS=http://localhost:3001` e `BRAND_HUB_SITE_URL=http://localhost:3001`.
- [ ] **Staging:**
  - job "Brand hub staging", depois do OS, que constrói o site com `NEXT_PUBLIC_OS_URL=<url de staging do OS>` e faz deploy `--prebuilt` para o projeto novo;
  - o OS de staging recebe as variáveis `BRAND_HUB_*` com a origem do site.
- [ ] **`brand-hub-site.spec.ts`:**
  - semear um hub publicado (com a missão e um logótipo) em modo palavra-passe;
  - o visitante abre `/<slug>/` no site, tenta uma palavra-passe errada, entra com a certa, vê a missão e descarrega o pacote de logótipo;
  - mudar o hub para restrito: o decisor entra pelo OS e regressa ao site, que mostra o hub;
  - axe no site.
- [ ] Local → PASSA → `STATUS.md` (linha do 2F.2, exclusões, risco da proteção da Vercel em staging) e spec "Implementado" → commit.
