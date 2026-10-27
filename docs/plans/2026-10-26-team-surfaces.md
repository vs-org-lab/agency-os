# UX-1 Superfícies da equipa — Plano de implementação

**Goal:** Aproximar o Início e a sala do cliente das referências: um cabeçalho por ecrã, filtros que aplicam logo, controlos shadcn em vez de nativos, processo em linhas compactas com painel lateral, documentos, biblioteca e retainer redesenhados.

**Architecture:** Peças novas genéricas em `packages/ui` (Popover, Calendar, DatePicker, AllowanceRing, ClientAvatar); peças com URL ou dados em `apps/web/src/components` (FilterBar, CreateMenu, camada de largada). Cada ecrã troca a sua composição sem mudar server actions nem consultas, exceto contagens por estado nas tarefas.

**Tech Stack:** Next.js 16, React 19.3, Tailwind 4, `radix-ui` 1.7.0 (Popover), `react-day-picker` 10.0.2, `motion` 14.1.0, Vitest + Testing Library, Playwright.

**Spec:** `docs/specs/2026-10-26-team-surfaces-design.md`

## Global Constraints

- Usa as peças da UX-0: `PageHeader`, `CreateDialog`/`CreateSheet` (`triggerLabel`, `openRequested`, `onClose`), `SidePanel`, `Empty`/`EmptyState`, `AnimatedNumber`, `notify`, `m` e `transitions` de `@agency-os/ui/motion`. Testes que renderizam `m.*` envolvem `MotionProvider`.
- Testes de `packages/ui` em `packages/ui/test/`; os da app ao lado do código.
- `react-day-picker@10.0.2` exato. Datas mostradas `dd/MM/yyyy` (pt-PT) ou `MM/dd/yyyy` (en) pelo locale da sessão; valor submetido `yyyy-MM-dd` em `input type="hidden"` com o `name` atual.
- Server actions, nomes de campos e parâmetros de URL atuais não mudam.
- Uma ação principal sólida por ecrã.
- Copy em pt-PT e en; nenhum hex em componentes; tons de avatar só de `*-bg` de estado (nunca gold).

## Review Focus

- Filtro mudado enquanto a navegação anterior ainda corre: a última escolha vence e nenhum parâmetro é perdido → teste no Task 2.
- `DatePicker` limpo pelo utilizador: o campo oculto fica vazio (a action já trata data vazia como "sem data") → teste no Task 1.
- Reabrir um passo já enviado ao cliente pelo círculo: pede confirmação; cancelar não altera nada → teste no Task 4.
- Largar uma pasta ou um tipo não permitido na camada de largada: segue as mesmas validações e mensagens do botão "Carregar" → teste no Task 6.
- Consumo acima de 100% no retainer: anel cheio em `danger`, texto "0 restantes · 12 de 10 usados", nunca número negativo → teste no Task 7.

---

### Task 1: Peças base (Popover, Calendar, DatePicker, AllowanceRing, ClientAvatar)

**Files:**

- Create: `packages/ui/src/components/popover.tsx`, `calendar.tsx`, `date-picker.tsx`, `allowance-ring.tsx`, `client-avatar.tsx`
- Modify: `packages/ui/package.json` (`react-day-picker` 10.0.2)
- Test: `packages/ui/test/date-picker.test.tsx`, `allowance-ring.test.tsx`, `client-avatar.test.tsx`

**Interfaces:**

- `DatePicker({ name: string; defaultValue?: string | null; locale: string; label: string; placeholder: string; clearLabel: string; disabled?: boolean; onChange?: (value: string | null) => void })` — botão com a data formatada; `Popover` com `Calendar`; botão "Limpar"; `<input type="hidden" name={name} value="yyyy-MM-dd" | "">`.
- `AllowanceRing({ used: number; limit: number; locale: string; label: string; remainingLabel: (n: string) => string; usedLabel: (used: string, limit: string) => string; size?: 40 | 56 })` — tom `accent` < 80%, `warning` ≥ 80%, `danger` > 100%; restantes = `max(limit - used, 0)`; números com `AnimatedNumber`.
- `ClientAvatar({ id: string; name: string; size?: 'sm' | 'md' | 'lg' })` — iniciais (até 2) sobre um de seis tons escolhido por hash estável do `id`.

- [ ] **Step 1: Failing tests** — DatePicker: `shows the date in the session locale` (`2026-10-31`, `pt-PT` → `31/10/2026`); `submits ISO in the hidden field`; `clear empties the hidden field`; `opens with Enter and closes with Escape returning focus`. AllowanceRing: `shows remaining and used` (`4/10` → `6 restantes` e `4 de 10 usados`); `uses warning at 80%`; `uses danger above 100% and never shows negative remaining` (`12/10` → `0`). ClientAvatar: `same id always gives the same tone`; `two initials from the name`.
- [ ] **Step 2:** FAIL. **Step 3:** implementar (`pnpm --filter @agency-os/ui add react-day-picker@10.0.2 --save-exact`). **Step 4:** PASS + `pnpm --filter @agency-os/ui typecheck`.
- [ ] **Step 5:** commit `feat(ui): date picker, allowance ring and client avatar`.

### Task 2: Cabeçalho da sala e filtros que aplicam logo

**Files:**

- Modify: `apps/web/src/app/[locale]/c/[clientId]/room/room-header.tsx` (compõe `PageHeader`; props `title`, `description?`, `actions?`, `client: { id; name }`, `showPreviewLink`); todas as páginas sob `c/[clientId]/` que o usam passam o título da secção e movem a ação principal para `actions` (documentos: "Novo documento").
- Create: `apps/web/src/components/filters/filter-bar.tsx`
- Modify: `apps/web/src/components/tasks/task-filters.tsx` (usa `FilterBar`), `apps/web/src/modules/tasks` (contagem por estado com o mesmo filtro de cliente/responsável, no mesmo `withUserContext`), páginas `(workspace)/tasks/page.tsx` e `c/[clientId]/tasks/page.tsx`
- Test: `apps/web/src/components/filters/filter-bar.test.tsx`, testes de `room-components.test.tsx` e `tasks.test.tsx` atualizados

**Interfaces:**

- `FilterBar({ segments?: { param: string; options: { value: string; label: string; count?: number }[]; value: string }; selects?: { param: string; label: string; options: { value: string; label: string }[]; value: string | null; allLabel: string }[] })` — cada mudança chama `router.replace(pathname + '?' + params)` dentro de `startTransition`, preservando os outros parâmetros e removendo `new`; o segmento usa `Tabs` (indicador partilhado).
- Tarefas: `countTasksByStatus(...)` devolve `{ open: number; done: number; all: number }`.

- [ ] **Step 1: Failing tests** — FilterBar: `changes the url without a submit button`; `keeps the other params`; `last change wins when changed twice quickly`. RoomHeader: `renders one h1 with the section title`; `renders the preview link as an outline button`.
- [ ] **Step 2:** FAIL. **Step 3:** implementar. **Step 4:** PASS (`pnpm vitest run apps/web/src/components/filters apps/web/src/components/tasks "apps/web/src/app/[locale]/c"`).
- [ ] **Step 5:** commit `feat(web): single room header and filters that apply on change`.

### Task 3: Selects e datas nos formulários desta fase

**Files:** `components/tasks/task-form.tsx`, `components/retainers/usage-form.tsx`, `components/retainers/retainer-form.tsx`, e os controlos de fase e passo de `room/process-board.tsx` (os que ficarem no painel do Task 4).

- Trocar `<select>` por `Select` (com `name` via campo oculto ou `name` do Radix Select) e `<input type="date">` por `DatePicker`.
- Test: testes existentes atualizados; um teste por formulário a provar que o valor submetido é o mesmo (`FormData` igual ao de antes para a mesma escolha).

- [ ] **Step 1: Failing tests** (`submits the same form data as before` por formulário). **Step 2:** FAIL. **Step 3:** implementar. **Step 4:** PASS.
- [ ] **Step 5:** commit `feat(web): shadcn selects and date pickers in task, retainer and process forms`.

### Task 4: Processo da sala em linhas compactas

**Files:**

- Modify: `apps/web/src/app/[locale]/c/[clientId]/room/process-board.tsx` (dividir em `phase-stepper.tsx`, `step-row.tsx`, `step-panel.tsx` na mesma pasta), `project-card.tsx` (linha de saúde), `app/[locale]/c/[clientId]/page.tsx` (ordem: processo + projeto primeiro; `HealthCard` só se algum indicador tiver dados)
- Test: `room/process-board.test.tsx` (novo), `room-components.test.tsx`

**Interfaces:**

- `StepRow({ step; canEdit: boolean; onOpen: () => void; onToggle: (done: boolean) => Promise<void> })` — círculo clicável (`aria-label` com o nome do passo e a ação), nome como botão que abre o painel, olho quando `visibleToClient`, `ClientAvatar`-like avatar do responsável, data curta, etiqueta de estado. As linhas usam `m.li layout`.
- `StepPanel` — `SidePanel` com estado, responsável (`Select`), data (`DatePicker`), visível ao cliente, encadeado; chama as mesmas actions de hoje (`setStepStatus`, `updateStep`).
- `PhaseStepper` — lista vertical de fases com círculo (pendente, em curso, feita), data, seleção com indicador partilhado; ações da fase (pedir aprovação, data prevista com `DatePicker`) no cabeçalho da coluna de passos.

- [ ] **Step 1: Failing tests** — `toggles a step done from the circle`; `asks to confirm before reopening a step already shared`; `cancel keeps the step unchanged`; `opens the side panel from the step name`; `hides the health card when no indicator has data`.
- [ ] **Step 2:** FAIL. **Step 3:** implementar. **Step 4:** PASS.
- [ ] **Step 5:** commit `feat(web): compact process steps with side panel and phase stepper`.

### Task 5: Documentos da sala

**Files:** `apps/web/src/components/project-documents/document-cards.tsx`, `app/[locale]/c/[clientId]/docs/page.tsx`; test `project-documents.test.tsx`.

- Linha "Comercial" primeiro; cartão = ícone Lucide por tipo (`FileText` proposta, `PenLine` contrato, `Receipt` faturas, `Presentation` Figma, `File` ficheiro), título, `Badge` com ponto no tom do estado, linha de origem; hover `border-border-strong` em 120 ms; "Novo documento" no `RoomHeader`; vazio com `EmptyState` v2 e a ação.
- [ ] **Step 1: Failing tests** — `renders commercial row before project documents`; `each card shows icon, status and source`; `empty project documents show the create action`.
- [ ] **Step 2–4:** FAIL → implementar → PASS. **Step 5:** commit `feat(web): room documents with commercial row and status cards`.

### Task 6: Biblioteca: barra única e largar para carregar

**Files:** `apps/web/src/components/library/library-browser.tsx`, `library-items.tsx`, `folder-actions.tsx`; Create `apps/web/src/components/library/drop-layer.tsx`; test `library-browser.test.tsx`, `drop-layer.test.tsx`.

- Barra: pesquisa com debounce 250 ms sem botão (mesmo parâmetro), chips de tipo, `Select` de ordenação, alternador grelha/lista, "Nova pasta" (`CreateDialog` outline), "Carregar" (principal, só dentro de pasta). Pastas em chips com ícone e contagem.
- `DropLayer({ enabled: boolean; onFiles: (files: File[]) => void; label: string })` — escuta `dragenter`/`dragover`/`dragleave`/`drop` na área; contador de profundidade para não piscar; `onFiles` entra no mesmo caminho que o input de ficheiros atual (`upload-files.ts`).
- Progresso por ficheiro numa lista fixa no fundo com `AnimatePresence`.
- [ ] **Step 1: Failing tests** — `searches without a button after typing stops`; `shows the drop layer on dragenter and hides on drop`; `dropped files go through the same validation as the upload button` (tipo proibido → mesma mensagem); `upload button only inside a folder`.
- [ ] **Step 2–4:** FAIL → implementar → PASS. **Step 5:** commit `feat(web): library toolbar and drag and drop upload`.

### Task 7: Retainer da equipa com anéis

**Files:** `apps/web/src/components/retainers/retainer-screen.tsx`, `limit-bars.tsx` (substituído por faixa de `AllowanceRing`), `usage-form.tsx` (dentro de `CreateDialog` "+ Registar consumo" com `onDone`); test `retainer.test.tsx`.

- Faixa: um anel por tipo + anel do período ("N dias para o fecho", dias até ao fim do mês em Europe/Lisbon, mesma função de mês já usada no módulo).
- Lista de registos com `EmptyState` quando vazia; "Apagar" com nome acessível do registo.
- [ ] **Step 1: Failing tests** — `shows one ring per limit kind with remaining`; `over limit shows zero remaining in danger`; `register usage opens a dialog and notifies on success`.
- [ ] **Step 2–4:** FAIL → implementar → PASS. **Step 5:** commit `feat(web): retainer allowance rings and usage dialog`.

### Task 8: Início

**Files:** `app/[locale]/(workspace)/page.tsx`, `home/indicators.tsx`, `home/client-progress.tsx`, `home/today-list.tsx`; Create `apps/web/src/components/ui/create-menu.tsx`; `(workspace)/acquisition/page.tsx` e `(workspace)/calendar/page.tsx` passam a honrar `?new=1` (abrem o `CreateDialog` respetivo só se o utilizador puder criar); `components/shell/app-sidebar.tsx` usa `ClientAvatar`; test `home-components.test.tsx`, `create-menu.test.tsx`.

- `CreateMenu({ label: string; items: { label: string; href: string; icon: ReactNode }[] })` — botão principal "+ Novo" que faz morph (`layoutId`) para um painel com os itens; teclado completo (setas, Enter, Esc devolve o foco), `role="menu"`; com "reduzir movimento" abre sem morph. Itens filtrados pelas permissões que o servidor já calcula para cada fluxo.
- Indicadores com `AnimatedNumber`; "Clientes" em largura total com `ClientAvatar`, etiqueta de retainer, barra de fases, fase atual e última atividade; "Hoje" vazio compacto.
- [ ] **Step 1: Failing tests** — `create menu lists only allowed items`; `create menu opens with Enter and closes with Escape returning focus`; `acquisition opens the create dialog with new=1 when allowed`; `clients section renders full width rows with phase progress`.
- [ ] **Step 2–4:** FAIL → implementar → PASS. **Step 5:** commit `feat(web): home with create menu and full width client progress`.

### Task 9: E2E, documentação e verificação

- [ ] **Step 1:** Atualizar `apps/web/e2e/*.spec.ts` que usavam "Filtrar", selects ou datas nativas, os controlos dos passos na linha ou o formulário de consumo aberto (procurar `selectOption`, `Filtrar`, `type="date"`, `Registar`).
- [ ] **Step 2:** `docs/STATUS.md`: UX-1 em "Feito"; em "Adiado", o logótipo do cliente (motivo: exige bucket, políticas de armazenamento e validação de ficheiros; gatilho: fase de ficheiros do cliente ou pedido do fundador). `INVENTORY.md`: `react-day-picker` 10.0.2 MIT, Radix Popover, CreateMenu (padrão inspirado em bencho `liq-create`, implementação própria), DropLayer (inspirado em bencho `upload-dropzone`, implementação própria).
- [ ] **Step 3:** `pnpm typecheck && pnpm lint && pnpm test && npx prettier --check .` e `pnpm --filter web build` → PASS.
- [ ] **Step 4:** commit `docs: team surfaces in status and inventory`.
