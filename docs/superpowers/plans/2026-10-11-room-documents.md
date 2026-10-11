# Sub-projeto 2E.2 — Documentos da sala — Plano de implementação

> **Para agentes:** SUB-SKILL OBRIGATÓRIA: usar `superpowers:subagent-driven-development` ou `superpowers:executing-plans` para executar este plano tarefa a tarefa. Os passos usam caixas (`- [ ]`) para acompanhamento.

**Objetivo:** documentos por projeto (Figma, PDF, ficheiro, link) com versões imutáveis, estados Rascunho, Com o cliente e Aprovado, comentários com avisos e aprovação pelo decisor; separador Documentos com cartões do Core, proposta, contrato e faturas; P-03 e lista no portal.

**Arquitetura:**

- Novo módulo `apps/web/src/modules/project-documents` (domínio puro, serviços, leitores, avisos, automações) sobre três tabelas novas com RLS forçado e vistas do portal; escrita só por serviços em contexto de sistema depois da autorização (`projectEditor` para a equipa, `is_client_member` para o cliente).
- Ficheiros no bucket `library` com prefixo `documents/`, verificados por `detectLibraryType` e contados por `fitsStorage` (2E.1); aprovações em `approvals` com o sujeito `document_version`, avisadas pelos avisos de aprovação existentes.

**Stack:** a do 2E.1, sem dependências novas.

**Spec:** [docs/superpowers/specs/2026-10-11-room-documents-design.md](../specs/2026-10-11-room-documents-design.md)

## Restrições globais

- As dos planos anteriores: TDD (teste visto a falhar antes do código); inglês no código e PT-PT na documentação; migrações com dry-run e nunca com o e2e do CI a usar a base de dados; sem custo; sem linhas de atribuição a IA; escapes `\u…` e barras invertidas só com a ferramenta Edit.
- **Valores do spec:** tipos `figma`, `pdf`, `file`, `link`; estados `draft`, `with_client`, `approved`; título 1–200; comentário 1–2000; 50 MB por ficheiro; link de 15 minutos; tarefa "Rever documento" ao gestor do cliente; emails `lead.document_shared`, `lead.document_comment`, `founder.document_comment`.
- **Recusas:** `not_found`, `invalid_input`, `invalid_state`, `invalid_file`, `storage_full`, `comment_required`.
- **Regras:** RN-20 (versão nunca muda; versão aprovada fica acessível), RN-21 (retirar só antes de aprovar), RN-23 (internos nunca saem; visíveis da equipa vão por email), RN-41 (pedir alterações com comentário).

## Foco de revisão

1. **Link do Figma de outro domínio (`figma.com.evil.io`), `http:` ou `javascript:` num link externo:** recusado. Teste na Task 2 (`links are validated by kind`).
2. **Cliente pede uma versão em rascunho criada depois de partilhar (por id direto ou pelo link de download):** não a vê. Teste na Task 7 (`clients read only versions shown to them`).
3. **Duas decisões do decisor sobre o mesmo pedido (duplo clique, dois separadores):** a segunda devolve o estado já decidido e não cria segunda tarefa. Teste na Task 5.
4. **Versão nova enquanto há pedido de aprovação pendente:** o pedido é retirado e o portal deixa de mostrar Aprovar. Teste na Task 4.
5. **Cliente financeiro ou freelancer de outro projeto abrem `/portal/docs/:id` ou o download:** 404. Teste nas Tasks 1 e 7.

---

### Task 1: Esquema, acesso e fixture

**Ficheiros:** `packages/db/src/schema/{enums,project-documents,index}.ts` e tipos em `packages/db/src/index.ts`; migração gerada `<ts>_project_documents.sql` e de acesso `<ts>_project_documents_access.sql`; `createDocumentFixture` em `fixtures.ts`; `packages/db/test/rls/project-documents.test.ts` e o isolamento.

**O que muda:**

- Enums `project_document_kind` (`figma`, `pdf`, `file`, `link`) e `project_document_status` (`draft`, `with_client`, `approved`); `approval_subject` ganha `document_version`; o estado de carregamento das versões reutiliza `library_file_status`.
- Tabelas do spec (secção 4), com FKs compostas `(client_id, organization_id)`, `(project_id, client_id)` em cascata, `(document_id, project_id)` das versões e comentários, `unique (document_id, number)`, `CHECK` (`url` nos tipos `figma`/`link` via `kind` copiado na versão, `storage_path` nos outros), corpo do comentário 1–2000, título 1–200. `current_version_id` sem FK circular rígida (`on delete set null`).
- Acesso: RLS forçado e leitura `app.can_read_project` nas três; vistas `portal_project_documents` (`status in ('with_client','approved')`, projeto não cancelado, decisor ou operacional), `portal_project_document_versions` (`shared_at is not null`, `upload_status = 'ready'`, documento na vista anterior), `portal_project_document_comments` (não internos, versão na vista anterior, com `author_name` e `by_client`).
- `createDocumentFixture(sql, world)` no projeto do cliente A: documento `link` em rascunho; documento `pdf` com o cliente (v1 partilhada, v2 pronta em rascunho, criada depois); documento `figma` aprovado (v1 aprovada); comentário visível e comentário interno no `pdf`; no cliente B, um documento com o cliente.

**Passos:**

- [ ] Testes: `team reads documents of readable projects only`; `clients read shared documents, shown versions and public comments only` (rascunho invisível, v2 invisível, interno invisível, cliente financeiro B sem linhas); `nobody writes documents directly`.
- [ ] FALHA → esquema e migrações (dry-run, aplicar ao dev) → PASSA → isolamento → commit.

### Task 2: Domínio

**Ficheiros:** `modules/project-documents/domain/{links,lifecycle}.ts` (+ `domain.test.ts`).

**Interfaces:**

- `documentLink(kind: 'figma' | 'link', url: string): string | null` — `figma`: `toFigmaEmbedUrl` aceita (devolve o URL limpo); `link`: `https:` com host, até 2000 caracteres.
- `documentActions(input: { status: ProjectDocumentStatus; everApproved: boolean; pendingApproval: boolean }): { share: boolean; withdraw: boolean; remove: boolean; requestApproval: boolean }` — partilhar só em rascunho; retirar só `with_client` sem aprovação; remover só sem nunca ter sido aprovado; pedir aprovação só `with_client` sem pedido pendente.
- `statusAfterNewVersion(status): ProjectDocumentStatus` — `approved` → `draft`; os outros mantêm-se.

**Passos:**

- [ ] Testes: `links are validated by kind`, `actions follow the document state`, `a new version reopens an approved document`.
- [ ] FALHA → implementar → PASSA → commit.

### Task 3: Criar documentos e versões

**Ficheiros:** `modules/project-documents/{access,storage,versions,testing}.ts` (+ `versions.db.test.ts`); `modules/library/quota.ts` conta as versões; ações de auditoria.

**Interfaces:**

- `DocumentsDeps = { contexts; storage: LibraryStorage; flush?: () => Promise<void>; now?: () => Date }`.
- `documentEditor(claims, documentOrProjectId, deps)` — `projectEditor` sobre o projeto.
- `createProjectDocument(claims, input: { projectId: string; title: string; kind: ProjectDocumentKind; url?: string; file?: { name: string; sizeBytes: number } }, deps): Promise<{ ok: true; documentId: string; versionId: string; uploadUrl: string | null } | NotFound | { ok: false; rule: 'invalid_input' | 'storage_full' }>` — `figma`/`link` criam a v1 pronta; `pdf`/`file` criam a v1 `uploading` com link de carregamento.
- `addDocumentVersion(claims, input: { documentId: string; url?: string; file?: { name; sizeBytes } }, deps)` — mesmo retorno sem `documentId`; aplica `statusAfterNewVersion`; com o cliente: a versão nova fica partilhada e o pedido pendente é retirado; atualiza `current_version_id` só quando a versão fica pronta.
- `confirmDocumentVersion(claims, { versionId }, deps): Promise<{ ok: true } | NotFound | { ok: false; rule: 'invalid_file' | 'storage_full' }>` — tamanho igual ao declarado, `detectLibraryType`, PDF tem de abrir (`pdf-lib`, guarda `pages`), `fitsStorage`.
- Caminho `documents/{org}/{client}/{project}/{document}/{version}`. Auditoria `document.version_added`, `document.version_rejected`, `project_document.created`.

**Passos:**

- [ ] Testes: `links create a ready first version`; `files wait for their upload and are verified` (PDF falso → `invalid_file`, removido); `a new version keeps the document state rules` (rascunho; com o cliente retira o pedido pendente; aprovado volta a rascunho); `document uploads count against the organisation quota`; `freelancers of other projects and clients cannot create documents`.
- [ ] FALHA → implementar → PASSA → commit.

### Task 4: Partilhar, retirar, remover

**Ficheiros:** `modules/project-documents/lifecycle.ts` (+ `lifecycle.db.test.ts`); evento `rooms.document.shared`.

**Interfaces:**

- `shareProjectDocument(claims, { documentId }, deps)` → `{ ok: true } | NotFound | { ok: false; rule: 'invalid_state' }` — rascunho com versão atual pronta → `with_client`, `shared_at` no documento e na versão atual, evento `rooms.document.shared { documentId }`.
- `withdrawProjectDocument` — só `with_client` (RN-21); retira o pedido pendente.
- `removeProjectDocument` — só sem versão aprovada; apaga linhas e objetos.

**Passos:**

- [ ] Testes: `sharing shows the current version to the client once`; `withdrawing is refused after approval`; `removing is refused once approved and deletes stored files otherwise`; `a new version withdraws the pending approval` (foco 4).
- [ ] FALHA → implementar → PASSA → commit.

### Task 5: Aprovação

**Ficheiros:** `modules/project-documents/approvals.ts` (+ `approvals.db.test.ts`); `modules/rooms/{notices,portal}.ts` (assunto `document`, grupo `document` em `getClientApprovals`).

**Interfaces:**

- `requestDocumentApproval(claims, { documentId }, deps)` → `{ ok: true; approvalId } | NotFound | { ok: false; rule: 'invalid_state' }` — `with_client`, sem pendente; `subject_type = 'document_version'`, sujeito = versão atual; emite `rooms.approval.requested`.
- `decideDocumentApproval(claims, { approvalId; decision; comment }, deps)` → `{ ok: true; status } | NotFound | { ok: false; rule: 'comment_required' | 'invalid_input' }` — só o decisor; aprovado → documento `approved`, `approved_at`; alterações → tarefa `REVIEW_DOCUMENT_TASK = 'Rever documento'` ao gestor (`soleClientManager`) com o comentário; repetida devolve o estado atual; emite `rooms.approval.decided`.
- `approvalNotice` devolve `subject: 'document'` com o título e `roomUrl` `/c/{client}/docs/{documentId}`; `getClientApprovals` devolve `kind: 'document'` com `subjectName` e `documentId`.

**Passos:**

- [ ] Testes: `the team asks the decision maker to approve the current version`; `approving marks the document approved once` (duas decisões, uma mudança, foco 3); `changes need a comment and create the review task`; `operational users cannot decide`; `document approvals appear under documents in the portal`; `approval notices name the document`.
- [ ] FALHA → implementar → PASSA → commit.

### Task 6: Comentários e avisos

**Ficheiros:** `modules/project-documents/{comments,notices,automations,server,index}.ts` (+ `comments.db.test.ts`); templates de email; registo Inngest.

**Interfaces:**

- `addDocumentComment(claims, { documentId; body; internal? }, deps)` → `{ ok: true; commentId } | NotFound | { ok: false; rule: 'invalid_input' }` — equipa (`projectEditor`) ou cliente (decisor, operacional) num documento visível; `internal` só da equipa; liga à versão atual visível a quem comenta; emite `rooms.document.commented { commentId }` quando não interno.
- Funções Inngest `documents-shared-notice` (`rooms.document.shared` → `lead.document_shared` com `path: /docs/{id}`) e `documents-comment-notice` (`rooms.document.commented` → equipa: `lead.document_comment`; cliente: `founder.document_comment` à equipa do cliente), com horas de silêncio.

**Passos:**

- [ ] Testes: `clients and the team comment on visible documents`; `internal comments never leave and never notify`; `comment notices go to the other side`; registo das duas funções; templates nos dois idiomas.
- [ ] FALHA → implementar → PASSA → commit.

### Task 7: Leitores e download

**Ficheiros:** `modules/project-documents/{views,readers,commercial}.ts` (+ `readers.db.test.ts`); `app/api/documents/versions/[versionId]/route.ts`.

**Interfaces:**

- `loadRoomDocuments(claims, { clientId; projectId? }, deps): Promise<RoomDocumentsView | null>` — projetos, documentos do projeto (`id`, `title`, `kind`, `status`, `version`, `updatedAt`), apresentações do Core do cliente, `commercial: { proposal: status | null; contract: status | null; invoices: 'none' | 'open' | 'paid' } | null` (só quem lê o pipeline), `canWrite`.
- `loadStaffDocument(claims, documentId, deps): Promise<DocumentView | null>` — documento, versão atual e histórico, comentários (com internos), ações (`documentActions`), aprovação pendente.
- `loadPortalDocuments(claims, clientId)` e `loadPortalDocument(claims, documentId)` pelas vistas; `canDecide` com pedido pendente para o decisor.
- `documentVersionUrl(claims, versionId, deps)` — equipa (RLS) ou vista do portal; link de 15 minutos com o nome do ficheiro.

**Passos:**

- [ ] Testes: `the room lists project documents with Core and commercial cards`; `commercial cards only for pipeline readers` (freelancer sem cartões); `the staff document shows versions, internal comments and actions`; `clients read only versions shown to them` (foco 2: v2 em rascunho por id e por link); `client finance and other freelancers get nothing` (foco 5).
- [ ] FALHA → implementar → PASSA → commit.

### Task 8: Interface

**Ficheiros:** navegação (Documentos na sala `/c/:cliente/docs` e no portal `/portal/docs`, ícone `documents`); `app/[locale]/c/[clientId]/docs/{page,[documentId]/page,actions}`; `app/[locale]/portal/docs/{page,[documentId]/page,actions}`; `components/project-documents/{document-cards,new-document-form,document-viewer,document-comments,document-actions,version-history}.tsx`; grupo Documentos em `components/proofing/approvals-list.tsx`; mensagens `projectDocuments.*` nos dois idiomas.

- O visualizador usa `FigmaFrame` (1B) para `figma`, `PdfCanvas` (2D.1) para `pdf` com a rota da Task 7, um cartão de download para `file` e um cartão com o domínio e "Abrir" para `link`.

**Passos:**

- [ ] Testes de componentes: `room and portal navigation link documents`; `cards show kind, status and version`; `the viewer renders each kind`; `actions follow permissions and state`; `comments mark internal ones for the team only`; `approvals list groups documents`.
- [ ] FALHA → implementar → PASSA → `pnpm typecheck`, `pnpm lint` → commit.

### Task 9: Ponta a ponta e documentação

**Ficheiros:** `apps/web/e2e/documents.spec.ts`; `docs/STATUS.md`; estado do spec.

**Passos:**

- [ ] `documents.spec.ts`: a equipa cria um documento PDF, partilha-o e pede aprovação; o cliente abre-o em `/portal/docs`, comenta e aprova; a sala mostra Aprovado; axe na lista e no documento (sala e portal).
- [ ] Local (com `e2e:seed`) → PASSA → e2e relacionados (Biblioteca, proofing, entrega) → PASSAM.
- [ ] `STATUS.md` (linha do 2E.2, exclusões, Resync das funções novas), spec "Implementado" → commit.
