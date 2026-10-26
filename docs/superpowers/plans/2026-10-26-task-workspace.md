# UX-2 Tarefas em tabela com painel — Plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tarefas do estúdio e da sala numa tabela com subtarefas expansíveis e um painel lateral com detalhes, comentários, ficheiros e links, aberto pela URL.

**Architecture:** Três tabelas novas (`task_comments`, `task_files`, `task_links`) com RLS de leitura igual à das tarefas e escritas só em serviços do módulo `tasks` (autorização com `withActor`, escrita com contexto de sistema). Ficheiros reutilizam a biblioteca do projeto. A UI troca `TaskList` por `TaskTable` + `TaskPanel` sobre as peças da UX-0/UX-1.

**Tech Stack:** Drizzle + migrações Supabase (ADR 0005), Next.js 16 server actions, React 19.3, Radix (HoverCard), `motion`, Vitest (unit + db), Playwright.

**Spec:** `docs/superpowers/specs/2026-10-26-task-workspace-design.md`

## Global Constraints

- Migrações: esquema em `packages/db/src/schema/tasks.ts`; `pnpm --filter @agency-os/db generate` para tabelas e `generate:custom` para RLS, grants e funções. Nunca editar migrações já aplicadas.
- RLS das tabelas novas: `force row level security`; `revoke all … from anon, authenticated, service_role`; `grant select … to authenticated`; política `select` via `app.can_read_task` da tarefa-mãe (mesmo padrão de `task_items` em `20261009215623_tasks_access.sql`).
- Escritas: só em `apps/web/src/modules/tasks/*`, autorizadas com `withActor`, verificando leitura da tarefa em contexto de utilizador antes de escrever com contexto de sistema; utilizadores `internal` apenas.
- Limites: comentário 1–5000 caracteres (check na BD e Zod); link `https://` com ≤ 2000 caracteres, título ≤ 200; ficheiro ligado tem de ser do mesmo projeto e legível pelo utilizador.
- Texto de comentários renderizado como texto (sem HTML). Links com `target="_blank" rel="noopener noreferrer"`.
- Peças a reutilizar: `SidePanel`, `CreateDialog`, `SelectField`, `DateField`, `FilterBar`, `EmptyState`, `notify`, `ClientAvatar` (tom neutro para pessoas), `DropLayer`, `useStripNewParam`, `m`/`AnimatePresence`.
- Testes: `packages/ui/test/` para `packages/ui`; DB tests `*.db.test.ts` (projeto `db`). Sem `Co-Authored-By` nem atribuição a IA.
- A migração tem de ser aplicada à base de dev (`supabase db push --db-url "$DATABASE_DIRECT_URL" --yes`, com `.env.local`) antes do PR, porque o e2e do CI corre contra dev.

## Review Focus

- Freelancer sem acesso à sala comenta por um `taskId` adivinhado: `forbidden`, nada é escrito → teste DB no Task 2.
- Ligar um `libraryFileId` de outro projeto ou não legível pelo utilizador: `invalid_input` → teste DB no Task 2.
- `?task=<id>` de uma tarefa que o utilizador não lê ou que foi apagada: o painel não abre e a lista mostra-se normalmente, sem erro → teste no Task 4.
- Enviar o comentário duas vezes seguidas (duplo Ctrl+Enter): um só comentário criado (botão desativado enquanto envia) → teste no Task 4.
- Link com `javascript:` ou `http:`: recusado com mensagem junto ao campo → teste no Task 2 e no Task 4.

---

### Task 1: Esquema, migração e RLS

**Files:** `packages/db/src/schema/tasks.ts` (tabelas `taskComments`, `taskFiles`, `taskLinks`), migrações geradas em `supabase/migrations/`, migração custom de acesso; test `apps/web/src/modules/tasks/access.db.test.ts`.

- `task_comments(id, organization_id, task_id → tasks cascade, author_id → profiles set null, body text check 1..5000, created_at)`, índice `(task_id, created_at)`.
- `task_files(task_id → tasks cascade, library_file_id → library_files cascade, organization_id, created_by, created_at, pk (task_id, library_file_id))`.
- `task_links(id, organization_id, task_id → tasks cascade, url text check length ≤ 2000 and url like 'https://%', title text null check length ≤ 200, created_by, created_at)`.

- [ ] **Step 1: Failing DB tests** — `client users read no comments, files or links`; `a freelancer reads them only on tasks they can read`; `another organization reads nothing`; `authenticated cannot insert directly` (insert via user context falha por privilégio).
- [ ] **Step 2:** FAIL. **Step 3:** esquema + `generate` + `generate:custom` com grants e políticas. **Step 4:** `pnpm vitest run --project db apps/web/src/modules/tasks/access.db.test.ts` PASS.
- [ ] **Step 5:** commit `feat(db): task comments, files and links with read access of their task`.

### Task 2: Serviços de comentários, ficheiros, links, detalhe e contagens

**Files:** Create `apps/web/src/modules/tasks/collaboration.ts`, `detail.ts`; Modify `service.ts` (`listTasks` com contagens agregadas), `server.ts`, `index.ts`; Create `apps/web/src/app/[locale]/(workspace)/tasks/collaboration-actions.ts` (server actions partilhadas pelas duas páginas); tests `collaboration.db.test.ts`, `detail.db.test.ts`, e o teste existente de `listTasks`.

**Interfaces:**

- `addTaskComment(claims, { taskId: string; body: string }, deps): Promise<Result<{ id: string }>>`
- `deleteTaskComment(claims, { commentId: string }, deps): Promise<Result<void>>` — autor ou fundador; audita quando não é o autor.
- `addTaskLink(claims, { taskId; url; title?: string | null }, deps)`, `removeTaskLink(claims, { linkId }, deps)` — quem criou ou fundador; audita.
- `attachTaskFile(claims, { taskId; libraryFileId }, deps)`, `detachTaskFile(claims, { taskId; libraryFileId }, deps)` — ficheiro do mesmo projeto e em `readableFileIds`.
- `taskUploadFolder(claims, { taskId }, deps): Promise<Result<{ folderId: string }>>` — devolve a pasta "Tarefas" do projeto (criada com `createFolder`, visibilidade interna, se não existir); o carregamento usa `requestUploads`/`confirmUpload` existentes e depois `attachTaskFile`.
- `loadTaskDetail(claims, taskId, deps): Promise<TaskDetail | null>` — `TaskDetail = TaskView & { comments: { id; authorName; authorId; body; createdAt; canDelete }[]; files: { id; name; mimeType; canDetach }[]; links: { id; url; title; canRemove }[]; canEdit: boolean }`; `null` se não lê.
- `TaskView` ganha `itemsDone: number; itemsTotal: number; commentCount: number; fileCount: number` (subconsultas agregadas na consulta da lista).
- Resultado de erro: `{ ok: false; rule: 'forbidden' | 'not_found' | 'invalid_input' }`, como o resto do módulo.
- Aviso: ao comentar, se o responsável existe e não é o autor, enfileira email pelo mesmo mecanismo de `sendTaskAssignedNotice`, com link `…/tasks?task=<id>` e sem o texto do comentário.

- [ ] **Step 1: Failing DB tests** — `comments need read access` (freelancer sem acesso → forbidden, nada escrito); `author deletes own comment, other manager cannot, founder can and is audited`; `links accept only https` (`http:`, `javascript:` → invalid_input); `files must belong to the task's project and be readable`; `upload folder is created once and reused`; `detail returns null when unreadable`; `list counts items, comments and files`; `comment on someone else's task queues one notice without the body`.
- [ ] **Step 2:** FAIL. **Step 3:** implementar. **Step 4:** PASS (`--project db` nos ficheiros do módulo).
- [ ] **Step 5:** commit `feat(web): task comments, links and library files with notices`.

### Task 3: Tabela de tarefas

**Files:** Create `apps/web/src/components/tasks/task-table.tsx`, `task-row.tsx`, `subtask-rows.tsx`; Modify `task-filters.tsx` (chip "Minhas"), `modules/tasks` (parâmetro `sort`: `due` | `created` | `title`); test `task-table.test.tsx`.

- Colunas e comportamento da spec, decisão 2. Cabeçalhos ordenáveis com `aria-sort` e botão; a ordenação muda o parâmetro `sort` pela mesma via do `FilterBar`.
- Subtarefas = `task_items`; expandir com `AnimatePresence` (altura); "+ Adicionar subtarefa" usa o serviço de itens existente (se não houver criação de item isolada, acrescentar `addTaskItem(claims, { taskId; title })` ao `service.ts` com teste DB, mesma autorização de `setTaskItem`).
- Abaixo de 768 px: cartões.
- [ ] **Step 1: Failing tests** — `sorts by due date by default and toggles aria-sort`; `expands subtasks and adds one with Enter`; `Escape cancels adding a subtask`; `overdue open tasks show the due date in danger`; `renders cards below 768px` (matchMedia); `title opens the panel by setting task in the url`.
- [ ] **Step 2–4:** FAIL → implementar → PASS. **Step 5:** commit `feat(web): task table with sortable columns and inline subtasks`.

### Task 4: Painel da tarefa

**Files:** Create `apps/web/src/components/tasks/task-panel.tsx`, `task-comments.tsx`, `task-files.tsx`, `task-links.tsx`; test `task-panel.test.tsx`.

- `TaskPanel({ detail: TaskDetail | null; open: boolean; onClose: () => void; actions })` sobre `SidePanel` com `tabs`: "Detalhes" e "Comentários e ficheiros (n)".
- Detalhes: título e notas editáveis no próprio sítio (gravam no `blur`, notificam), responsável, prazo, checklist, "Apagar" com confirmação.
- Comentários: lista, campo com Ctrl/⌘+Enter, botão desativado enquanto envia.
- Ficheiros: escolher da biblioteca (`attachableFiles` numa `CreateDialog`), "Carregar" e `DropLayer` → pasta "Tarefas" → `attachTaskFile`; sem projeto mostra o motivo.
- Links: "+ Adicionar link" com validação junto ao campo.
- A página lê `?task=` e carrega `loadTaskDetail` no servidor; fechar remove o parâmetro (`router.replace`, mesmos parâmetros restantes).
- [ ] **Step 1: Failing tests** — `opens from task in the url and shows both tabs with the comment count`; `unknown or unreadable task leaves the list without a panel`; `ctrl enter sends one comment and disables while sending`; `rejects a javascript link next to the field`; `delete asks for confirmation`; `files block explains why when the task has no project`.
- [ ] **Step 2–4:** FAIL → implementar → PASS. **Step 5:** commit `feat(web): task side panel with details, comments, files and links`.

### Task 5: Pré-visualização ao passar o rato

**Files:** Create `packages/ui/src/components/hover-card.tsx` (Radix HoverCard), `apps/web/src/components/tasks/task-files-preview.tsx`; test `task-files-preview.test.tsx`.

- Abre após 300 ms com rato e mostra até três ficheiros, cada um com ícone do tipo e nome. Para imagens, a miniatura vem de uma server action `taskFilePreviewAction(taskId)` chamada só quando o cartão abre, que devolve URLs assinados via `libraryFileUrl` (mesmas regras de leitura); enquanto carrega, mostra o ícone.
- Nunca abre por foco do teclado nem em toque.
- [ ] **Step 1: Failing tests** — `opens on pointer hover after delay`; `does not open on keyboard focus`. **Step 2–4:** FAIL → implementar → PASS. **Step 5:** commit `feat(web): file preview on task hover`.

### Task 6: Páginas, paleta, e2e e documentação

- `(workspace)/tasks/page.tsx` e `c/[clientId]/tasks/page.tsx`: `TaskTable` + `TaskPanel`; a paleta (`components/command/search.ts`) passa a dar `href` de tarefa `…/tasks?task=<id>`.
- E2E novo `apps/web/e2e/task-workspace.spec.ts`: criar tarefa num projeto semeado → abrir o painel → comentar → link `https://example.com` → anexar ficheiro da biblioteca (semear um ficheiro com os helpers de `e2e/support`) → fechar e reabrir pela URL; axe na tabela e no painel. Atualizar `tasks.spec.ts` (editar/apagar agora no painel).
- `docs/STATUS.md`: UX-2 em "Feito"; "Adiado": tarefas-filhas com prazo e responsável (motivo: YAGNI, checklist cobre o uso; gatilho: pedido do fundador). `INVENTORY.md`: Radix HoverCard; padrão hover-preview (21st.dev, licença desconhecida, implementação própria).
- Aplicar a migração a dev: `supabase db push --db-url "$DATABASE_DIRECT_URL" --yes`.
- [ ] Verificação: `pnpm typecheck && pnpm lint && pnpm test && pnpm test:db && npx prettier --check .` e `pnpm --filter web build`.
- [ ] commit `docs: task workspace in status and inventory` (+ `test(e2e): task workspace flow`).
