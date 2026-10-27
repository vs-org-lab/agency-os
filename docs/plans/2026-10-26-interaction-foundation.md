# UX-0 Fundação de interação — Plano de implementação

**Goal:** Dar ao OS movimento com morph, criação por botões identificados, estados vazios com ação, notificações, skeletons por rota, paleta ⌘K e painel lateral, sem redesenhar ecrãs.

**Architecture:** As peças genéricas vivem em `packages/ui` (movimento, separadores, Collapsible, PageHeader, SidePanel, Empty, skeletons, AnimatedNumber); as que dependem da aplicação (CreateDialog/CreateSheet, notify, paleta de comandos e a sua server action) vivem em `apps/web/src/components/ui` e `apps/web/src/components/command`. Depois, os ecrãs trocam os `<details>` de criação por estas peças.

**Tech Stack:** Next.js 16 App Router, React 19.3, Tailwind 4, Radix (`radix-ui` 1.7.0), `motion` 14.1.0, `@number-flow/react` 0.6.2, `cmdk` 1.1.1, Sonner 2.0.8, Vitest + Testing Library, Playwright.

**Spec:** `docs/specs/2026-10-26-interaction-foundation-design.md`

## Global Constraints

- Dependências fixadas sem `^`: `motion@14.1.0`, `@number-flow/react@0.6.2`, `cmdk@1.1.1` (MIT, publicadas há mais de 14 dias).
- `motion` só através de `m.*` dentro de `LazyMotion features={domAnimation} strict`; nunca `motion.*`.
- Durações: fast 120 ms, base 180 ms, slow 240 ms, morph 300 ms (mola sem ressalto: `{ type: 'spring', duration: 0.3, bounce: 0 }`), moment 600 ms.
- Só `transform` e `opacity` animam (e `height` no Collapsible). Nada anima em ciclo em ecrãs de trabalho.
- Com `prefers-reduced-motion: reduce`: morphs instantâneos, números no valor final, skeleton sem brilho.
- Só tokens de cor (`bg-surface`, `border-border`, `text-text-secondary`…); nenhum hex em componentes.
- Rótulos dos botões novos = rótulos dos `<summary>` que substituem (mesmas chaves de tradução).
- Copy de interface em pt-PT e en (as duas mensagens de `next-intl`); código e comentários em inglês.
- Cada componente externo ou inspirado entra em `apps/web/src/components/INVENTORY.md`.
- Testes locais: só os do módulo tocado (`pnpm vitest run <path>`); o CI corre o resto.

## Review Focus

- Diálogo de criação aberto quando o formulário falha a validação: o diálogo fica aberto, o erro aparece junto ao campo e nenhuma notificação de sucesso é disparada → teste no Task 4.
- `?new=1` em `/tasks` com utilizador sem permissão de criar: nada abre e não há erro → teste no Task 9.
- Procura ⌘K com `%`, `_` ou `\` na consulta: tratados como literais, não como curingas → teste no Task 8.
- Dois separadores `Tabs` no mesmo ecrã: cada indicador só se move dentro do seu grupo (`layoutId` com `useId`) → teste no Task 2.
- Contador da navegação a passar de 9 para 10: mostra "9+" sem animar um valor que não é numérico → teste no Task 7.

---

### Task 1: Movimento base

**Files:**

- Modify: `packages/ui/package.json` (dependência `motion` 14.1.0, export `"./motion": "./src/motion/index.ts"`)
- Create: `packages/ui/src/motion/transitions.ts`, `packages/ui/src/motion/motion-provider.tsx`, `packages/ui/src/motion/index.ts`
- Modify: `packages/ui/src/styles/tokens.css` (`--duration-morph: 300ms`, e `0ms` no bloco de reduced motion)
- Modify: `apps/web/src/app/[locale]/layout.tsx` (envolver o conteúdo em `MotionProvider`)
- Test: `packages/ui/src/motion/motion-provider.test.tsx`

**Interfaces:**

- Produces: `transitions: { fast; base; slow; morph }` (objetos `Transition` do `motion`: fast/base/slow como tween `ease: [0, 0, 0.2, 1]` com 0.12/0.18/0.24 s; morph a mola acima); `MotionProvider({ children }: { children: ReactNode })`; re-exporta `m`, `AnimatePresence`, `LayoutGroup`, `useReducedMotion` do `motion/react`.

- [ ] **Step 1: Failing test** — `motion-provider.test.tsx`: `renders children` (o texto filho aparece); `uses reduced motion from the user setting` (com `matchMedia('(prefers-reduced-motion: reduce)')` a `true`, um componente filho que lê `useReducedMotion()` renderiza `"reduced"`).
- [ ] **Step 2:** `pnpm vitest run packages/ui/src/motion` → FAIL (módulo inexistente).
- [ ] **Step 3:** `pnpm --filter @agency-os/ui add motion@14.1.0 --save-exact`; implementar os ficheiros; `MotionProvider` = `LazyMotion features={domAnimation} strict` + `MotionConfig reducedMotion="user" transition={transitions.base}`. Montar no layout `[locale]`.
- [ ] **Step 4:** testes PASS; `pnpm --filter web typecheck` PASS.
- [ ] **Step 5:** commit `feat(ui): motion foundation with lazy loading and reduced motion`.

### Task 2: Separadores e menu com indicador partilhado

**Files:**

- Modify: `packages/ui/src/components/tabs.tsx`
- Modify: `apps/web/src/components/shell/app-sidebar.tsx` (item ativo)
- Test: `packages/ui/src/components/tabs.test.tsx`

**Interfaces:**

- Consumes: `m`, `transitions.morph` do Task 1.
- Produces: `TabsList` cria um `LayoutGroup` com `id = useId()`; `TabsTrigger` renderiza, quando ativo, `<m.span data-slot="tabs-indicator" layoutId="tabs-indicator" aria-hidden className="absolute inset-0 -z-10 rounded-md bg-surface …" transition={transitions.morph} />`. A API pública dos Tabs não muda.

- [ ] **Step 1: Failing tests** — `shows one indicator on the active trigger`; `moves the indicator when another tab is selected` (clicar no segundo → o indicador está dentro do segundo trigger); `keeps indicators independent across two tab groups` (dois `Tabs` → dois indicadores); `indicator is hidden from assistive technology` (`aria-hidden="true"`).
- [ ] **Step 2:** FAIL.
- [ ] **Step 3:** Implementar. Para saber se o trigger está ativo, usar contexto próprio com o valor de `Tabs` (`value`/`defaultValue`/`onValueChange` controlados internamente) ou o atributo `data-state` lido por um `MutationObserver`; escolher o contexto. No sidebar: o item ativo renderiza o mesmo padrão com `layoutId="sidebar-active"` dentro de um `LayoutGroup` do menu.
- [ ] **Step 4:** PASS; `pnpm vitest run apps/web/src/components/shell` PASS.
- [ ] **Step 5:** commit `feat(ui): shared active indicator for tabs and sidebar`.

### Task 3: Collapsible e PageHeader

**Files:**

- Create: `packages/ui/src/components/collapsible.tsx`, `packages/ui/src/components/page-header.tsx`
- Test: `packages/ui/src/components/collapsible.test.tsx`, `packages/ui/src/components/page-header.test.tsx`

**Interfaces:**

- Produces: `Collapsible`, `CollapsibleTrigger` (botão com chevron que roda 90°, props `children`), `CollapsibleContent` (altura animada com `AnimatePresence` + `m.div` `height: 0 → 'auto'`, `transitions.slow`, `overflow-hidden`), sobre `radix-ui` Collapsible; aceita `defaultOpen`/`open`/`onOpenChange`.
- Produces: `PageHeader({ title: string; description?: string; context?: ReactNode; actions?: ReactNode; headingLevel?: 1 | 2 })` — `<header>` com `h1.text-title` (ou `h2`), descrição `text-body text-text-secondary`, `actions` alinhadas à direita em ecrãs `md+`, por baixo no telemóvel.

- [ ] **Step 1: Failing tests** — Collapsible: `is closed by default and opens on click` (`aria-expanded` false → true, conteúdo visível); `opens with Enter and Space`; `respects defaultOpen`. PageHeader: `renders title as h1 by default`; `renders actions`; `omits description when absent`.
- [ ] **Step 2:** FAIL.
- [ ] **Step 3:** Implementar.
- [ ] **Step 4:** PASS.
- [ ] **Step 5:** commit `feat(ui): animated collapsible and page header`.

### Task 4: SidePanel, CreateDialog, CreateSheet e notificações

**Files:**

- Create: `packages/ui/src/components/side-panel.tsx`
- Create: `apps/web/src/components/ui/create-dialog.tsx`, `apps/web/src/components/ui/create-sheet.tsx`, `apps/web/src/components/ui/notify.ts`
- Modify: `packages/ui/src/components/sonner.tsx` (tokens, posição `bottom-right`, `expand` no hover, raio 12 px)
- Modify: `apps/web/src/app/[locale]/(workspace)/layout.tsx`, `apps/web/src/app/[locale]/c/[clientId]/layout.tsx`, `apps/web/src/app/[locale]/portal/layout.tsx` (montar `<Toaster />` uma vez por área)
- Test: `apps/web/src/components/ui/create-dialog.test.tsx`, `apps/web/src/components/ui/notify.test.ts`, `packages/ui/src/components/side-panel.test.tsx`

**Interfaces:**

- Produces: `SidePanel({ open; onOpenChange; title: string; actions?: ReactNode; tabs?: ReactNode; children })` sobre `Sheet` (lado direito, `w-full md:w-[480px]`, corpo com scroll próprio).
- Produces: `CreateDialog({ label: string; title: string; description?: string; icon?: ReactNode; variant?: 'default' | 'outline'; defaultOpen?: boolean; children: (close: (result?: { message: string }) => void) => ReactNode })`. O gatilho é um `Button` com `+` (Lucide `Plus`) e `label`; o conteúdo anima de `scale: 0.96, opacity: 0` para `1` com `transformOrigin` calculado a partir do `getBoundingClientRect()` do gatilho relativo ao centro do diálogo. `close({ message })` fecha e chama `notify.success(message)`; `close()` fecha sem notificar. O foco volta ao gatilho.
- Produces: `CreateSheet` com a mesma API, renderizado num `SidePanel`.
- Produces: `notify.success(message: string, options?: { action?: { label: string; onClick: () => void } })`, `notify.error(message: string)`, `notify.info(message: string)` sobre `toast` do Sonner.

- [ ] **Step 1: Failing tests** — `opens from the labelled trigger` (botão com nome acessível = `label`); `closes and notifies on success` (filho chama `close({ message: 'Tarefa criada' })` → diálogo fechado, `toast.success` chamado com `'Tarefa criada'`); `stays open without notifying when the form reports an error` (filho não chama `close`; diálogo continua aberto; `toast.success` não chamado); `returns focus to the trigger on close`; `opens initially when defaultOpen`. `notify`: cada método delega no Sonner com a mensagem. `SidePanel`: `renders title and actions`; `closes with Escape`.
- [ ] **Step 2:** FAIL.
- [ ] **Step 3:** Implementar. Os formulários existentes usam `useActionState`; o padrão de integração é o filho observar o estado devolvido pela action e chamar `close({ message })` quando `state.ok`.
- [ ] **Step 4:** PASS.
- [ ] **Step 5:** commit `feat(ui): create dialog, create sheet, side panel and notifications`.

### Task 5: Estado vazio v2

**Files:**

- Create: `packages/ui/src/components/states/empty.tsx`
- Modify: `packages/ui/src/components/states/empty-state.tsx` (atalho retrocompatível)
- Test: `packages/ui/src/components/states/empty.test.tsx`

**Interfaces:**

- Produces: `Empty`, `EmptyMedia({ icons: ReactNode[] })` (1 a 3 ícones; com 3, os laterais `-rotate-6`/`rotate-6`, `opacity-60`, e no `group-hover` do `Empty` afastam-se 4 px com `transition-transform duration-(--duration-morph)`), `EmptyTitle`, `EmptyDescription`, `EmptyActions`, `EmptyRows({ count?: number })` (linhas fantasma estáticas com máscara em gradiente para o fundo, `aria-hidden`).
- Produces: `EmptyState(props: StateProps & { icons?: ReactNode[]; variant?: 'plain' | 'rows' })` — o `icon` antigo continua aceite e é tratado como `icons: [icon]`.

- [ ] **Step 1: Failing tests** — `renders title, description and action` (props atuais); `accepts the legacy icon prop`; `renders three fanned icons`; `rows variant renders hidden ghost rows` (`aria-hidden`); `has no dashed border` (classe `border-dashed` ausente).
- [ ] **Step 2:** FAIL.
- [ ] **Step 3:** Implementar. Superfície `bg-surface`, `border border-border`, `rounded-xl`, `px-6 py-12`.
- [ ] **Step 4:** PASS; `pnpm --filter web typecheck` PASS (os 26 usos continuam a compilar).
- [ ] **Step 5:** commit `feat(ui): composable empty state with icon stack and ghost rows`.

### Task 6: Skeletons e carregamento por rota

**Files:**

- Create: `packages/ui/src/components/states/skeletons.tsx`
- Modify: `packages/ui/src/components/skeleton.tsx` (brilho em CSS com `@keyframes` em `globals.css`, desligado em reduced motion; cor `bg-surface-muted`)
- Create `loading.tsx` em: `(workspace)/tasks`, `(workspace)/pipeline`, `(workspace)/pipeline/[dealId]`, `(workspace)/money`, `(workspace)/reports`, `(workspace)/calendar`, `(workspace)/updates`, `c/[clientId]/tasks`, `c/[clientId]/docs`, `c/[clientId]/library`, `c/[clientId]/retainer`, `c/[clientId]/hub`, `portal/docs`, `portal/library`, `portal/invoices` (todos sob `apps/web/src/app/[locale]/`). Rever os três `loading.tsx` existentes para usarem as novas peças.
- Test: `packages/ui/src/components/states/skeletons.test.tsx`

**Interfaces:**

- Produces: `SkeletonHeader({ actions?: boolean })`, `SkeletonRows({ rows?: number; columns?: number })`, `SkeletonCards({ count?: number })`, `SkeletonPanel()`; cada um com `role="status"`, `aria-busy="true"` e texto `sr-only` passado por prop `label: string` (a página passa a tradução de `common.loading`).

- [ ] **Step 1: Failing tests** — `each skeleton announces loading` (role status + label); `rows renders the requested count`.
- [ ] **Step 2:** FAIL.
- [ ] **Step 3:** Implementar as peças e os `loading.tsx` com a forma aproximada de cada ecrã (lista → header + rows; documentos/biblioteca → header + cards; negócio → header + panel).
- [ ] **Step 4:** PASS; `pnpm --filter web typecheck` PASS.
- [ ] **Step 5:** commit `feat(web): route loading skeletons shaped like their content`.

### Task 7: Números animados

**Files:**

- Modify: `packages/ui/package.json` (`@number-flow/react` 0.6.2)
- Create: `packages/ui/src/components/animated-number.tsx`
- Modify: `apps/web/src/components/shell/navigation-counter.tsx`
- Test: `packages/ui/src/components/animated-number.test.tsx`, `apps/web/src/components/shell/navigation-counter.test.tsx`

**Interfaces:**

- Produces: `AnimatedNumber({ value: number; locale: string; format?: Intl.NumberFormatOptions; className?: string })` sobre `NumberFlow`, `tabular-nums`, `animated={!reducedMotion}`, sem animação no primeiro render.

- [ ] **Step 1: Failing tests** — `formats with the locale` (`1234.5`, `pt-PT`, `{ style: 'currency', currency: 'EUR' }` → texto acessível contém `1234,50 €` como devolvido por `Intl.NumberFormat`); `does not animate with reduced motion`. Contador: `shows 9+ above nine without an animated number`; `animates numeric counts up to nine`.
- [ ] **Step 2:** FAIL.
- [ ] **Step 3:** `pnpm --filter @agency-os/ui add @number-flow/react@0.6.2 --save-exact`; implementar; no contador, `formatCounter` mantém-se e só os valores 1–9 usam `AnimatedNumber`.
- [ ] **Step 4:** PASS.
- [ ] **Step 5:** commit `feat(ui): animated numbers for counters`.

### Task 8: Paleta de comandos ⌘K

**Files:**

- Modify: `apps/web/package.json` (`cmdk` 1.1.1)
- Create: `packages/ui/src/components/command.tsx` (shadcn Command sobre `cmdk`, com os tokens)
- Create: `apps/web/src/components/command/command-palette.tsx`, `apps/web/src/components/command/search.ts` (server), `apps/web/src/components/command/actions.ts` (`'use server'`)
- Modify: `apps/web/src/components/shell/app-sidebar.tsx` (campo "Procurar" abre a paleta), `apps/web/src/app/[locale]/(workspace)/layout.tsx` e `c/[clientId]/layout.tsx` (montar a paleta só para internos)
- Modify: mensagens `next-intl` pt-PT e en (`command.*`)
- Test: `apps/web/src/components/command/search.db.test.ts`, `apps/web/src/components/command/command-palette.test.tsx`

**Interfaces:**

- Produces: `searchWorkspace(claims: VerifiedClaims, query: string, deps: { contexts: Pick<DbContexts, 'withUserContext'> }): Promise<{ ok: true; results: CommandResult[] } | { ok: false; rule: 'forbidden' | 'invalid_input' }>` com `CommandResult = { kind: 'client' | 'deal' | 'task'; id: string; title: string; context: string | null; href: string }`. Zod: `query` com `trim`, 2–80 caracteres. Escapar `\`, `%`, `_` e usar `ilike … escape '\'`. Máximo 5 por tipo, ordenado por `updated_at desc`. Clientes e negócios arquivados excluídos; tarefas `done` excluídas. `forbidden` se `user_kind !== 'internal'` ou `aal !== 'aal2'`.
- Produces: `searchWorkspaceAction(query: string)` (server action com `getVerifiedClaims`).
- Produces: `CommandPalette({ navigation: NavItem[]; createActions: { labelKey: string; href: string }[] })` — abre com ⌘K/Ctrl+K, grupos "Ir para", "Criar", "Procurar"; debounce 200 ms; descarta respostas de consultas antigas.

- [ ] **Step 1: Failing DB tests** (`search.db.test.ts`, mesmo estilo de `modules/commercial/acquisition/service.db.test.ts`): `finds clients, deals and tasks of the organization`; `does not return rows from another organization` (RLS); `treats percent, underscore and backslash literally` (cliente "50% Off" encontrado por `50%`, e `5_` não encontra "50"); `rejects client users with forbidden`; `rejects one-character queries`.
- [ ] **Step 2:** `pnpm vitest run --project db apps/web/src/components/command` → FAIL.
- [ ] **Step 3:** Implementar `search.ts` e a action.
- [ ] **Step 4:** DB tests PASS.
- [ ] **Step 5: Failing UI tests** — `opens with Ctrl+K`; `lists navigation and create groups`; `navigates on Enter`; `ignores a stale response` (duas consultas; a primeira resolve depois da segunda → só aparecem os resultados da segunda); `returns focus to the trigger on close`.
- [ ] **Step 6:** `pnpm --filter web add cmdk@1.1.1 --save-exact`; implementar; PASS.
- [ ] **Step 7:** E2E em `apps/web/e2e/navigation.spec.ts` (novo): Ctrl+K → escrever o nome do cliente semeado → Enter → URL da sala do cliente.
- [ ] **Step 8:** commit `feat(web): command palette with navigation, create and search`.

### Task 9: Criação por botões e divulgação animada

**Files (modify):**

- `apps/web/src/app/[locale]/(workspace)/tasks/page.tsx`, `apps/web/src/app/[locale]/c/[clientId]/tasks/page.tsx` → `PageHeader` + `CreateSheet` (`label` = `t('form.heading')`, `defaultOpen={query.new === '1' && options.canCreate}`)
- `apps/web/src/app/[locale]/c/[clientId]/page.tsx` → `CreateSheet` "Novo projeto" nas ações do cabeçalho
- `apps/web/src/app/[locale]/c/[clientId]/room/proofs-section.tsx` → `CreateDialog` `t('newFile')`
- `apps/web/src/app/[locale]/(workspace)/acquisition/page.tsx` → `CreateDialog` `t('add')`; edição por linha → `CreateDialog` `variant="outline"` com `t('edit')`
- `apps/web/src/app/[locale]/(workspace)/pipeline/[dealId]/page.tsx` → contactos: `CreateDialog` add/edit
- `apps/web/src/app/[locale]/(workspace)/settings/organization/page.tsx` → `CreateDialog` add/edit
- `apps/web/src/app/[locale]/(workspace)/settings/templates/page.tsx` → `CreateSheet` para "Novo modelo", "Novo" e "Editar"; guia, grelha, editores por idioma e por processo → `Collapsible`
- `apps/web/src/app/[locale]/(workspace)/settings/templates/contract-template-editor.tsx` → ajuda em `Collapsible`
- `apps/web/src/components/tasks/task-list.tsx` → "Editar" em `CreateDialog` `variant="outline"`
- `apps/web/src/app/[locale]/(workspace)/pipeline/[dealId]/core/contract-section.tsx` → "Ler" em `Collapsible`; "Anular" passa a botão destrutivo que abre `CreateDialog` com o formulário de anulação
- Os formulários dentro dos diálogos (`TaskForm`, etc.) recebem uma prop opcional `onDone?: (message: string) => void` chamada quando a action devolve sucesso; o diálogo passa `(m) => close({ message: m })`. Mensagens de sucesso novas em `next-intl` (pt-PT e en), por exemplo `tasks.created`, `rooms.projectCreated`.
- E2E: `apps/web/e2e/*.spec.ts` que abriam estes `<summary>` passam a clicar no botão com o mesmo nome (`getByRole('button', { name })`).
- Test: os testes de componente existentes dos ecrãs tocados (`tasks.test.tsx`, etc.) atualizados; novo `apps/web/src/components/tasks/task-create.test.tsx`.

**Interfaces:**

- Consumes: `PageHeader`, `Collapsible*` (Task 3), `CreateDialog`, `CreateSheet` (Task 4).

- [ ] **Step 1: Failing tests** — `task-create.test.tsx`: `opens the task sheet from the New task button`; `opens automatically with new=1 when the user can create`; `does not render the button or open when the user cannot create`; `closes and notifies after the task is created`.
- [ ] **Step 2:** FAIL.
- [ ] **Step 3:** Converter tarefas; PASS.
- [ ] **Step 4:** Converter os restantes ecrãs da lista; `rg "<details" apps/web/src` → zero resultados.
- [ ] **Step 5:** Atualizar e2e e testes de componente; `pnpm vitest run apps/web/src/components/tasks apps/web/src/app` PASS; `pnpm --filter web typecheck` e `pnpm lint` PASS.
- [ ] **Step 6:** commit `feat(web): labelled create buttons with dialogs and animated disclosures`.

### Task 10: Documentação e verificação final

**Files:**

- Modify: `docs/product/05 Design system.md` (tabela de movimento com o token `morph`, regra 2 de "Bibliotecas de UI" conforme a spec, inventário: Paleta de comandos com `cmdk`, Estado vazio v2, Painel lateral, CreateDialog; regra "criar = botão identificado")
- Modify: `apps/web/src/components/INVENTORY.md` (`motion` 14.1.0 MIT; `@number-flow/react` 0.6.2 MIT; `cmdk` 1.1.1 MIT; Radix Collapsible; estado vazio inspirado em cnippet-empty, empty-state Serafim e empty-state-04, todos MIT; CreateDialog padrão próprio)
- Modify: `docs/STATUS.md` (UX-0 em "Feito" com a referência do PR; programa continua em "Em curso")

- [ ] **Step 1:** Atualizar os três documentos; em `components/ui/action-button.tsx` e `hold-to-confirm.tsx` trocar durações literais pelas variáveis `--duration-*` (testes de `interaction.test.tsx` continuam a passar).
- [ ] **Step 2:** `pnpm typecheck && pnpm lint && pnpm test` → tudo PASS; `npx prettier --check .` PASS.
- [ ] **Step 3:** `pnpm --filter web build` PASS.
- [ ] **Step 4:** commit `docs: interaction foundation in design system and inventory`.
