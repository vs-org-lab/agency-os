# Sub-projeto 2F.1 — Brand Hub: editor, publicação e portal — Plano de implementação

> **Para agentes:** SUB-SKILL OBRIGATÓRIA: usar `superpowers:subagent-driven-development` ou `superpowers:executing-plans` para executar este plano tarefa a tarefa. Os passos usam caixas (`- [ ]`) para acompanhamento.

**Objetivo:** um Brand Hub por cliente com páginas e blocos, design próprio e ficheiros verificados; publicação em instantâneo imutável; P-08 no portal com downloads por página e de todos os ativos; aprovação pelo decisor e aviso de publicação.

**Arquitetura:**

- Novo módulo `apps/web/src/modules/brand-hub`:
  - domínio puro: esquemas zod dos blocos e do design, páginas padrão, instantâneo, nomes dos downloads e contraste;
  - serviços, leitores, avisos e automações;
  - cinco tabelas com RLS forçado e duas vistas do portal;
  - escrita só por serviços em contexto de sistema, depois da autorização: `roomActor` para escrever e publicar, freelancer de um projeto do cliente para editar.
- Cada alteração bloqueia a linha do hub (`lockHub`) e incrementa `draft_revision`.
- Publicar copia o rascunho para `brand_hub_publications.snapshot`. O portal só lê esse instantâneo.
- O renderizador `HubView` é puro, para o 2F.2 o reutilizar no site: recebe o instantâneo e `assetUrl(assetId)`.

**Stack:** a do 2E.2, sem dependências novas (`client-zip` já existe).

**Spec:** [docs/superpowers/specs/2026-10-11-brand-hub-editor-design.md](../specs/2026-10-11-brand-hub-editor-design.md)

## Restrições globais

- **As dos planos anteriores:**
  - TDD: o teste é visto a falhar antes do código;
  - inglês no código e PT-PT na documentação;
  - migrações com dry-run; o e2e do CI nunca usa a base de dados de dev;
  - sem custo;
  - sem linhas de atribuição a IA;
  - escapes `\u…` e barras invertidas só com a ferramenta Edit;
  - fronteira de módulos: só `@/modules/<nome>` e `@/modules/<nome>/server`.
- **Valores do spec:**
  - nove chaves padrão: `strategy`, `gallery`, `logo`, `typography`, `color`, `photography`, `layout`, `brand_objects`, `resources`;
  - limites:
    - títulos de página 1–80; 30 páginas por hub; 40 blocos por página;
    - texto: título até 120, corpo até 5000;
    - estratégia: seis campos até 2000 cada;
    - legenda até 200;
    - galeria até 24 imagens;
    - variante do logótipo até 80;
    - cores: até 24 amostras; nome até 40; notas até 80; hex `#RRGGBB`;
    - fonte: família até 80; até 10 pesos; exemplo até 200;
    - downloads: até 50 ficheiros;
    - 300 ficheiros por hub;
  - tipos de ficheiro aceites: PNG, JPEG, WebP, GIF, SVG, WOFF2, WOFF, OTF, TTF, PDF, ZIP;
  - 50 MB por ficheiro;
  - links de 15 minutos;
  - tarefa "Rever Brand Hub" ao gestor do cliente, com prazo de 2 dias;
  - email `lead.brand_hub_published`;
  - sujeito de aprovação `brand_hub_publication`.
- **Recusas:** `not_found`, `invalid_input`, `invalid_state`, `invalid_file`, `storage_full`, `comment_required`, `limit_reached`, `nothing_to_publish`, `zip_too_large`.
- **Regras:**
  - RN-80: só a publicação é visível e descarregável;
  - RN-82: ZIP da publicação com nomes padronizados;
  - RN-41: pedir alterações exige comentário;
  - SEC-30: cada ficheiro é verificado;
  - SEC-32: os downloads usam links que expiram;
  - SEC-41: só os ficheiros do hub entram no hub.

## Foco de revisão

1. **Bloco com um `assetId` de outro hub, de outro cliente, removido ou ainda a carregar, ou uma imagem que é PDF:** é recusado com `invalid_input`. Teste na Task 3 (`blocks only reference ready assets of their hub`).
2. **Editar depois de publicar:** o portal continua a mostrar exatamente o instantâneo. Remover um ficheiro publicado não o apaga do Storage enquanto a publicação o usar. Testes na Task 5 (`the snapshot stays fixed after edits`) e na Task 4 (`the sweep keeps assets of the current publication`).
3. **Cliente que pede um ficheiro do rascunho, por id direto ou pelo manifesto:** não o recebe. Teste na Task 7 (`clients only reach published assets`).
4. **Duas publicações em simultâneo, ou uma edição durante a publicação:** os números das publicações são seguidos e sem repetição, e o instantâneo é consistente. Teste na Task 5 (`concurrent publishes get consecutive numbers`).
5. **HTML ou `javascript:` no texto ou nos campos de um bloco:** é guardado como texto e mostrado escapado, sem `dangerouslySetInnerHTML` nem links gerados a partir do conteúdo. Teste na Task 8 (`hub view renders text as text`).

---

### Task 1: Esquema, acesso e fixture

**Ficheiros:**

- `packages/db/src/schema/{enums,brand-hub,index}.ts` e os tipos em `packages/db/src/index.ts`;
- a migração gerada `<ts>_brand_hub.sql` e a de acesso `<ts>_brand_hub_access.sql`;
- `createBrandHubFixture` em `fixtures.ts` e no índice de testing;
- `packages/db/test/rls/brand-hub.test.ts` e o teste de isolamento.

**O que muda:**

- **Enums:**
  - `brand_hub_page_kind` (`standard`, `custom`);
  - `brand_hub_standard_key` (as nove chaves);
  - `brand_hub_block_type` (`text`, `strategy`, `image`, `gallery`, `logo`, `colors`, `typeface`, `downloads`);
  - `approval_subject` ganha `brand_hub_publication`;
  - o estado do carregamento reutiliza `library_file_status`.
- **Tabelas:** as do spec (secção 4), com:
  - FKs compostas `(client_id, organization_id)` e `(hub_id, client_id)` em cascata;
  - `unique (client_id)` em `brand_hubs`, `unique (hub_id, standard_key)` e `unique (hub_id, number)`;
  - `CHECK`: `standard_key` presente se e só se `kind = 'standard'`; título 1–80; `size_bytes > 0`; nome seguro, como em `library_files`;
  - `published_publication_id` e `approved_publication_id` com `on delete set null`;
  - `design` por omissão: superfície `#FFFFFF`, painel `#F5F5F4`, texto `#1C1917`, texto secundário `#57534E`, acento `#1C1917`, divisor `#E7E5E4`, `soft`, mosaicos `on`, layout `sidebar`.
- **Acesso:**
  - RLS forçado nas cinco tabelas. A leitura é `app.can_read_rooms(organization_id, client_id)`, ou freelancer (`app.has_org_role(..., 'freelancer')`) com um projeto do cliente em `app.can_read_project`.
  - Vista `portal_brand_hub_publications`: a publicação igual a `published_publication_id`, para o decisor e o operacional (`app.is_client_member`) de um cliente ativo. Expõe `id`, `client_id`, `number`, `snapshot`, `published_at` e `approved` (igual a `approved_publication_id`).
  - Vista `portal_brand_hub_assets`: `id`, `client_id`, `name`, `mime_type`, `size_bytes` e `storage_path` dos ficheiros cujo id consta do `snapshot->'assets'` da publicação da vista anterior.
- **`createBrandHubFixture(sql, world)`:**
  - cliente A, hub com as nove páginas;
  - um bloco `strategy` preenchido;
  - um ficheiro pronto `logo.svg`, usado num bloco `logo` publicado;
  - um ficheiro pronto `draft.png` só no rascunho, depois da publicação 1;
  - `draft_revision` acima da revisão publicada;
  - cliente B, hub sem publicação.

**Passos:**

- [ ] Testes:
  - `team reads hubs of readable rooms only`: o financeiro da equipa e o freelancer de outro cliente não leem nada;
  - `clients read the current publication and its assets only`: o rascunho é invisível, `draft.png` é invisível, o cliente financeiro não lê nada e o hub B não tem linhas;
  - `nobody writes hubs directly`.
- [ ] FALHA → esquema e migrações (dry-run, aplicar ao dev) → PASSA → isolamento → commit.

### Task 2: Domínio

**Ficheiros:** `modules/brand-hub/domain/{design,blocks,pages,snapshot,downloads,contrast}.ts` (+ `domain.test.ts`).

**Interfaces:**

- `hubDesignSchema` (zod) e `type HubDesign = { colors: { surface; panel; text; textMuted; accent; divider }; corners: 'soft' | 'square'; logoTiles: boolean; layout: 'sidebar' | 'topbar' | 'split' | 'compact' }`, mais `DEFAULT_HUB_DESIGN`.
- `blockContentSchema(type: BrandHubBlockType)` e `type BlockContent<T>`, com os limites das restrições globais:
  - `logo.background`: `light`, `dark` ou `accent`;
  - `downloads.items`: `{ assetId; label (1–80) }[]`.
- `blockAssetIds(type, content): { assetId: string; image: boolean }[]`: os ficheiros que o bloco referencia e se têm de ser imagem.
- `STANDARD_PAGES: { key: BrandHubStandardKey; title: string }[]`:
  - as nove, por ordem, com os títulos `Estratégia`, `Galeria`, `Logótipo`, `Tipografia`, `Cor`, `Fotografia`, `Layout`, `Objetos de marca` e `Recursos`;
  - `starterBlocks(key)`: Estratégia → `strategy` vazio; Logótipo → `logo` sem ficheiro; Cor → `colors` vazio; Tipografia → `typeface` vazio; as restantes → `text` vazio. Um bloco sem ficheiro tem `assetId: null` e não se mostra no portal.
- `buildSnapshot(input: { design; pages: { id; kind; standardKey; title; hidden; blocks: { id; type; content }[] }[]; assets: { id; name; mimeType; sizeBytes }[] }): HubSnapshot`:
  - guarda as páginas não ocultas, por ordem, com o número `01`, `02` e seguintes;
  - `assets` só com os ficheiros referenciados por essas páginas;
  - `HubSnapshot = { design; pages: { id; number; title; standardKey; blocks }[]; assets: { id; name; mimeType; sizeBytes }[] }`.
- `downloadEntries(snapshot, input: { clientName: string; pageId: string | null }): { assetId: string; path: string }[]`:
  - uma página: `<cliente>-<página>-<nome>` na raiz;
  - todos os ativos: pasta `<número> <página>/`, com o mesmo nome;
  - segmentos com `safeZipSegment` e nomes repetidos desambiguados com `zipEntryNames`.
- `contrastWarning(design): boolean`: texto contra superfície abaixo de 4,5:1.

**Passos:**

- [ ] Testes:
  - `design and block content are validated against the spec limits`: hex inválido, 25 cores, corpo com 5001 caracteres, tipo desconhecido;
  - `standard pages come in order with starter blocks`;
  - `snapshots drop hidden pages and unused assets`;
  - `download names are standardised per page and for all assets`;
  - `low contrast designs are flagged`.
- [ ] FALHA → implementar → PASSA → commit.

### Task 3: Hub, páginas e blocos

**Ficheiros:** `modules/brand-hub/{access,hubs,pages,blocks,testing}.ts` (+ `hubs.db.test.ts`); ações de auditoria `brand_hub.*`.

**Interfaces:**

- `BrandHubDeps = { contexts; storage: LibraryStorage; flush?: () => Promise<void>; now?: () => Date }`.
- `hubEditor(claims, clientId, deps): Promise<{ actor: Actor; canPublish: boolean } | null>`:
  - `roomActor(..., 'write')` dá `canPublish: true`;
  - o freelancer com um projeto do cliente (`app.can_read_project` num projeto desse cliente) dá `canPublish: false`.
- `lockHub(tx, hubId): Promise<LockedHub | null>`: `select … for update`, com `draftRevision` e `publishedRevision` (da publicação atual).
- `touchHub(tx, hubId, now)`: incrementa `draft_revision` e grava `draft_updated_at`.
- `createBrandHub(claims, { clientId }, deps) → { ok: true; hubId } | NotFound | { ok: false; rule: 'invalid_state' }`: só `canPublish`; cria o hub com as nove páginas e os blocos de partida; com um hub existente devolve `invalid_state`.
- Páginas, cada uma bloqueia e toca o hub:
  - `addHubPage(claims, { hubId; title })`;
  - `renameHubPage(claims, { pageId; title })`;
  - `setHubPageHidden(claims, { pageId; hidden })`;
  - `moveHubPage(claims, { pageId; direction: 'up' | 'down' })`;
  - `removeHubPage(claims, { pageId })`, só `custom`;
  - recusas: `limit_reached` acima de 30 páginas, `invalid_state` ao remover uma página padrão.
- Blocos:
  - `addHubBlock(claims, { pageId; type })`, com o conteúdo vazio do tipo;
  - `updateHubBlock(claims, { blockId; content: unknown })`;
  - `moveHubBlock(claims, { blockId; direction })`;
  - `removeHubBlock(claims, { blockId })`;
  - o conteúdo é validado por `blockContentSchema`;
  - cada `blockAssetIds` tem de ser um ficheiro do mesmo hub, `ready`, sem `removed_at`, e imagem quando pedido;
  - recusas: `invalid_input`, ou `limit_reached` acima de 40 blocos.
- `updateHubDesign(claims, { hubId; design: unknown })`: validado por `hubDesignSchema`.

**Passos:**

- [ ] Testes:
  - `creating a hub makes the nine pages once`;
  - `pages are added, renamed, hidden, moved and removed within limits`;
  - `blocks are validated and ordered`;
  - `blocks only reference ready assets of their hub` (foco 1);
  - `every edit raises the draft revision`;
  - `freelancers edit but cannot create hubs`: o freelancer de outro cliente, o financeiro e o cliente recebem `not_found`.
- [ ] FALHA → implementar → PASSA → commit.

### Task 4: Ficheiros

**Ficheiros:** `modules/brand-hub/{storage,assets}.ts` (+ `assets.db.test.ts`); `modules/library/quota.ts` passa a contar os ficheiros do hub.

**Interfaces:**

- `requestHubAssetUpload(claims, { hubId; name; sizeBytes }, deps) → { ok: true; assetId; uploadUrl } | NotFound | { ok: false; rule: 'invalid_input' | 'storage_full' | 'limit_reached' }`:
  - o nome passa por `isSafeName`; o tamanho vai de 1 a `MAX_LIBRARY_BYTES`;
  - a extensão tem de estar na lista do spec;
  - até 300 ficheiros ativos;
  - `fitsStorage`;
  - caminho `brand-hub/{org}/{client}/{asset}`.
- `confirmHubAsset(claims, { assetId }, deps) → { ok: true } | NotFound | { ok: false; rule: 'invalid_file' }`:
  - o tamanho tem de ser igual ao declarado e `detectLibraryType` tem de dar um tipo da lista do spec;
  - as atualizações são guardadas (`where upload_status = 'uploading'`): uma recusa só remove o objeto se a atualização afetou a linha.
- `removeHubAsset(claims, { assetId }, deps)`:
  - grava `removed_at`;
  - tira o ficheiro dos blocos do rascunho: remove o item, ou põe `assetId: null`;
  - toca o hub.
- `sweepHubAssets(deps): Promise<{ closed: number; deleted: number }>`:
  - carregamentos `uploading` mais antigos do que `STALE_UPLOAD_MS` → `rejected`, e o objeto é removido;
  - ficheiros com `removed_at` fora do `snapshot->'assets'` da publicação atual → o objeto é removido e a linha é apagada.
- A quota soma `brand_hub_assets` com `upload_status in ('ready', 'uploading')` que ainda existem, incluindo os removidos ainda não apagados.

**Passos:**

- [ ] Testes:
  - `assets are verified on confirmation`: um PNG verdadeiro fica pronto; um `.png` com bytes de PDF dá `invalid_file`; um `.exe` é recusado logo no pedido;
  - `hub assets count against the organisation quota`;
  - `removing an asset clears it from draft blocks`;
  - `the sweep keeps assets of the current publication` (foco 2);
  - `a late confirmation never removes a settled file`.
- [ ] FALHA → implementar → PASSA → commit.

### Task 5: Publicação e aviso

**Ficheiros:** `modules/brand-hub/{publish,notices,automations}.ts` (+ `publish.db.test.ts`); evento `brand_hub.published`; template `lead.brand_hub_published` nos dois idiomas; `PortalNoticeTemplate`; registo Inngest.

**Interfaces:**

- `publishBrandHub(claims, { hubId }, deps) → { ok: true; publicationId; number } | NotFound | { ok: false; rule: 'nothing_to_publish' }`:
  - só `canPublish`;
  - `lockHub`; sem alterações (`draftRevision === publishedRevision`) devolve `nothing_to_publish`;
  - insere `number = max + 1` e `revision = draftRevision`, com `buildSnapshot` lido dentro da mesma transação;
  - atualiza `published_publication_id`;
  - retira o pedido de aprovação pendente da publicação anterior (`status = 'withdrawn'`);
  - auditoria `brand_hub.published`; evento `brand_hub.published { hubId, publicationId }`.
- Função Inngest `brand-hub-published-notice`: envia `lead.brand_hub_published` ao decisor e aos operacionais, com `path: /hub` e as horas de silêncio, com os passos em linha, como no 2E.2.
- Função `brand-hub-asset-sweep`, cron `TZ=Europe/Lisbon 40 * * * *`, que chama `sweepHubAssets`.
- `BRAND_HUB_FUNCTIONS`, registado em `api/inngest/functions.ts`.

**Passos:**

- [ ] Testes:
  - `publishing freezes a snapshot of the draft`;
  - `the snapshot stays fixed after edits` (foco 2);
  - `publishing without changes is refused`;
  - `concurrent publishes get consecutive numbers` (foco 4, duas transações em paralelo);
  - `freelancers cannot publish`;
  - `a new publication withdraws the pending approval`;
  - `the published notice reaches decision makers and operational users after quiet hours`;
  - registo das duas funções;
  - templates nos dois idiomas.
- [ ] FALHA → implementar → PASSA → commit.

### Task 6: Aprovação

**Ficheiros:** `modules/brand-hub/approvals.ts` (+ `approvals.db.test.ts`); `modules/rooms/{notices,portal}.ts` (assunto `brand_hub`, grupo `brand_hub` em `getClientApprovals`).

**Interfaces:**

- `requestHubApproval(claims, { hubId }, deps) → { ok: true; approvalId } | NotFound | { ok: false; rule: 'invalid_state' }`:
  - só `canPublish`;
  - exige uma publicação atual ainda não aprovada e sem pedido pendente;
  - o sujeito é a publicação atual;
  - `approvals.project_id` é obrigatório: usa o projeto não cancelado mais recente do cliente; sem projeto, a recusa é `invalid_state`;
  - emite `rooms.approval.requested`.
- `decideHubApproval(claims, { approvalId; decision; comment }, deps) → { ok: true; status } | NotFound | { ok: false; rule: 'comment_required' | 'invalid_input' }`:
  - bloqueia primeiro o hub e depois a aprovação;
  - só o decisor decide;
  - aprovado → `approved_publication_id`;
  - alterações → tarefa `REVIEW_HUB_TASK = 'Rever Brand Hub'` ao `soleClientManager`, com o comentário e prazo de 2 dias em Lisboa;
  - uma decisão repetida devolve o estado atual;
  - emite `rooms.approval.decided`.
- `approvalNotice` devolve `subject: 'brand_hub'` com `roomUrl` `/c/{client}/hub`.
- `getClientApprovals` devolve `kind: 'brand_hub'`.

**Passos:**

- [ ] Testes:
  - `the team asks the decision maker to approve the current publication`;
  - `approving records the approved publication once`;
  - `changes need a comment and create the review task`;
  - `operational users cannot decide`;
  - `hub approvals appear under brand hub in the portal`;
  - `approval notices name the brand hub`.
- [ ] FALHA → implementar → PASSA → commit.

### Task 7: Leitores, downloads e rota de ficheiros

**Ficheiros:** `modules/brand-hub/{views,readers,zip,server,index}.ts` (+ `readers.db.test.ts`); `app/api/brand-hub/assets/[assetId]/route.ts`.

**Interfaces:**

- `loadHubEditor(claims, clientId, deps): Promise<HubEditorView | null>`:
  - `{ hub: null; canCreate }`, ou o hub com o design, as páginas e os blocos, os ficheiros ativos (`id`, `name`, `mimeType`, `sizeBytes`, `status`) e `unpublishedChanges`;
  - `lastPublishedAt`, `approval: 'none' | 'pending' | 'approved' | 'changes_requested'`, `canPublish` e `contrastWarning`.
- `loadHubPreview(claims, clientId, deps): Promise<HubSnapshot | null>`: `buildSnapshot` do rascunho, só para quem edita.
- `loadPortalHub(claims, clientId, deps): Promise<PortalHubView | null>`:
  - `{ snapshot; publishedAt; clientName; pendingApprovalId: string | null }`, pela vista;
  - `pendingApprovalId` só para o decisor.
- `hubAssetUrl(claims, assetId, deps): Promise<string | null>`:
  - a equipa e o freelancer: um ficheiro ativo e pronto do hub que editam;
  - o cliente: só pela vista `portal_brand_hub_assets`;
  - devolve um link de 15 minutos com o nome do ficheiro.
- `hubZipManifest(claims, { clientId; pageId: string | null }, deps): Promise<ZipManifest | NotFound | { ok: false; rule: 'zip_too_large' }>`:
  - lê a publicação atual (vista para o cliente, tabela para a equipa);
  - usa `downloadEntries`, com os limites `MAX_ZIP_FILES` e `MAX_ZIP_BYTES`;
  - devolve links de 15 minutos.

**Passos:**

- [ ] Testes:
  - `the editor view reports unpublished changes and approval state`;
  - `the preview shows the draft to editors only`;
  - `the portal shows the current publication only`;
  - `clients only reach published assets` (foco 3: `draft.png` por id e pelo manifesto);
  - `zip manifests follow the current publication with standardised names`;
  - `client finance and other freelancers get nothing`.
- [ ] FALHA → implementar → PASSA → commit.

### Task 8: Interface

**Ficheiros:**

- navegação: Brand Hub na sala (`/c/:cliente/hub`) e no portal (`/portal/hub`), com o ícone `brand` (`Palette`);
- `app/[locale]/c/[clientId]/hub/page.tsx` e `app/[locale]/portal/hub/page.tsx`;
- `app/[locale]/brand-hub-actions.ts`;
- `components/brand-hub/`:
  - `hub-view.tsx`: o renderizador puro, com os quatro layouts e os oito blocos, e as cores e os cantos do design como variáveis CSS locais;
  - `hub-editor.tsx`, `page-navigator.tsx`, `block-editor.tsx` (um formulário por tipo), `design-panel.tsx`, `assets-panel.tsx`, `publish-bar.tsx`, `hub-downloads.tsx` (ZIP no navegador com `client-zip`, como na Biblioteca);
- grupo Brand Hub em `components/proofing/approvals-list.tsx`;
- mensagens `brandHub.*` nos dois idiomas.

**Detalhes:**

- O P-08 usa `ApprovalDecision` com `decideHubApprovalAction`.
- Partilhar copia o endereço absoluto de `/portal/hub`.
- O editor mostra:
  - Editar e Pré-visualizar;
  - o estado "Alterações por publicar";
  - Publicar e Pedir aprovação só com `canPublish`;
  - o aviso de contraste no painel Design.
- No telemóvel, as três colunas passam a separadores.

**Passos:**

- [ ] Testes de componentes:
  - `room and portal navigation link the brand hub`;
  - `hub view renders every layout and block type`;
  - `hub view renders text as text` (foco 5);
  - `the editor shows unpublished changes and hides publishing from freelancers`;
  - `the design panel edits colours by hex and warns on contrast`;
  - `downloads offer each page and all assets`;
  - `approvals list groups the brand hub`.
- [ ] FALHA → implementar → PASSA → `pnpm typecheck`, `pnpm lint` → commit.

### Task 9: Ponta a ponta e documentação

**Ficheiros:** `apps/web/e2e/brand-hub.spec.ts`; `docs/STATUS.md`; estado do spec.

**Passos:**

- [ ] `brand-hub.spec.ts`:
  - a equipa cria o hub, preenche a missão, carrega um logótipo SVG no bloco Logótipo, muda o acento e publica;
  - o cliente abre `/portal/hub`, vê a missão e o logótipo, descarrega o pacote de logótipo e aprova;
  - a sala mostra Aprovado;
  - axe no editor e em P-08.
- [ ] Local (com `e2e:seed`) → PASSA → e2e relacionados (documentos, Biblioteca) → PASSAM.
- [ ] Atualizar o `STATUS.md` (linha do 2F.1, exclusões do spec e Resync de `brand-hub-published-notice` e `brand-hub-asset-sweep`) e marcar o spec como "Implementado" → commit.
