# UX-3 Dashboard do portal — Plano de implementação

**Goal:** Início do portal com "A sua ação", plano do retainer e quadro do trabalho pedido; boas-vindas no primeiro acesso, momento de pagamento e comparação de versões de provas.

**Architecture:** Uma tabela nova `retainer_requests` e uma função `security definer` dão ao cliente o estado dos seus pedidos sem expor tarefas. O Início do portal compõe leituras existentes (aprovações, provas, proposta, contrato, pagamentos, retainer, sala) com componentes da UX-0/UX-1 (`AllowanceRing`, `EmptyState`, `CreateDialog`, `m`).

**Tech Stack:** Drizzle + migrações Supabase (ADR 0005), Next.js 16, React 19.3, Radix, `motion`, Vitest (unit + db), Playwright.

**Spec:** `docs/specs/2026-10-26-client-dashboard-design.md`

## Global Constraints

- Migrações: esquema Drizzle + `generate`; RLS, grants e a função em `generate:custom`. Aplicar à base de dev com `npx --no-install supabase db push --db-url "$DATABASE_DIRECT_URL" --yes` só com o esquema final e **nunca enquanto um job e2e do CI estiver a correr** (`gh pr checks`).
- `retainer_requests`: `force row level security`; `revoke all` de `anon`, `authenticated`, `service_role`; `grant select` a `authenticated` com política só para a equipa (mesma regra de leitura de `retainers`); clientes sem `select` direto.
- `app.client_retainer_requests(p_client uuid)`: `security definer`, `stable`, `set search_path = ''`, exige `app.is_client_member(p_client)`, devolve só `id`, `description`, `state`, `created_at`, `completed_at`; `revoke execute … from public, anon`, `grant execute … to authenticated`.
- Momentos expressivos só no portal, com o token `moment` (600–1200 ms) e "reduzir movimento" a mostrar o estado final.
- Fraunces só em títulos que o cliente vê (`brand-display`).
- Testes de `packages/ui` em `packages/ui/test/`; `MotionProvider` nos testes com `m.*`. Nunca correr `e2e:seed` com um job e2e do CI a correr.

## Review Focus

- Cliente A chama a função com o id do cliente B: zero linhas → teste DB no Task 1.
- Tarefa do pedido apagada pela equipa: o pedido continua no quadro como "Recebido", sem erro → teste DB no Task 1.
- Cliente com papel sem acesso à sala (por exemplo só faturação): o Início não mostra quadro nem anéis e não falha → teste no Task 3.
- Abrir o portal na pré-visualização da equipa: as boas-vindas nunca aparecem e nenhum marcador é gravado → teste no Task 4.
- Regressar do Stripe com `?paid=1` duas vezes: o momento corre uma vez por pedido pago (marcador) → teste no Task 5.

---

### Task 1: Pedidos do retainer visíveis ao cliente

**Files:** `packages/db/src/schema/retainers.ts` (`retainerRequests`), migrações geradas e custom; `apps/web/src/modules/retainers/requests.ts` (`requestWork` cria a linha na mesma transação que a tarefa), `apps/web/src/modules/retainers/portal-requests.ts` (`loadClientRetainerRequests(claims, clientId, deps): Promise<ClientRetainerRequest[]>` via a função); tests `requests.db.test.ts`, `portal-requests.db.test.ts`.

- `ClientRetainerRequest = { id: string; description: string; state: 'received' | 'in_progress' | 'done'; createdAt: string; completedAt: string | null }`.
- Estado: tarefa `done` → `done`; aberta com responsável → `in_progress`; sem responsável ou tarefa apagada → `received`.
- [ ] **Step 1: Failing DB tests** — `requestWork creates the request and its task together`; `the client reads its own requests with derived states`; `another client reads none`; `deleted task leaves the request received`; `no internal task field is returned` (chaves exatas do resultado); `client has no direct select on retainer_requests`.
- [ ] **Step 2–4:** FAIL → implementar + aplicar a dev (ver restrições) → PASS. **Step 5:** commit `feat(web): retainer requests with a state the client can read`.

### Task 2: Peças do dashboard

**Files:** Create `apps/web/src/components/portal/action-list.tsx`, `request-board.tsx`, `plan-panel.tsx`, `project-strip.tsx`; tests ao lado.

- `ActionList({ items: PortalActionItem[] })` com `PortalActionItem = { kind: 'approval' | 'proof' | 'proposal' | 'contract' | 'payment'; title: string; dueOn: string | null; href: string }`; não renderiza nada sem itens; uma ação principal sólida por item mais urgente, as restantes `outline`.
- `RequestBoard({ requests: ClientRetainerRequest[]; month: string })` — três colunas com contagem; "Feito" só deste mês (Europe/Lisbon); vazio por coluna com texto curto.
- `PlanPanel({ plan })` — limites por tipo, regras de transição (a partir de `allowance`), valor mensal e data de revisão.
- `ProjectStrip({ phases, current, nextMilestone })` — stepper horizontal.
- [ ] **Step 1: Failing tests** — `action list hides without items`; `action list orders by due date and links each item`; `board counts columns and keeps only this month in done`; `plan panel shows limits and rules`; `project strip marks the current phase`.
- [ ] **Step 2–4:** FAIL → implementar → PASS. **Step 5:** commit `feat(web): portal dashboard pieces`.

### Task 3: Início do portal

**Files:** `apps/web/src/app/[locale]/portal/page.tsx`, `portal-cards.tsx`, `room-cards.tsx`; navegação `components/shell/navigation.ts` ("Progresso" → "Plano e resultado", mesma rota); mensagens pt-PT e en; test `portal-home.test.tsx`.

- Ordem da spec: cabeçalho (avatar ou logótipo, saudação com o nome do contacto em `brand-display`), `ActionList`, anéis do retainer + "Pedir trabalho" (`CreateDialog` com o formulário de pedido existente), `RequestBoard`, `ProjectStrip`, "Documentos recentes".
- Itens de `ActionList` a partir das leituras existentes (`loadPortalApprovals`, provas por rever, `loadPortalProposal`, contrato por assinar, `loadPortalInvoices` não pagos).
- [ ] **Step 1: Failing tests** — `client with retainer sees rings, board and request button`; `client without room access sees no board and no rings`; `pending approval appears in a sua ação with its link`.
- [ ] **Step 2–4:** FAIL → implementar → PASS. **Step 5:** commit `feat(web): portal home dashboard`.

### Task 4: Boas-vindas no primeiro acesso

**Files:** migração custom (novo valor `portal_onboarding` em `app.seen_area`); `apps/web/src/modules/...` (serviço de marcador, seguindo `commercial/applications/unseen.ts`); Create `apps/web/src/components/portal/onboarding-dialog.tsx`; test `onboarding-dialog.test.tsx` + DB test do marcador.

- 3 passos com indicador (morph do ponto ativo), "Seguinte", "Anterior", "Saltar" e "Começar"; teclado (Esc = saltar); grava o marcador ao fechar.
- Nunca na pré-visualização da equipa (`/c/[clientId]/preview`).
- [ ] **Step 1: Failing tests** — `shows once until dismissed`; `skip marks it seen`; `never renders in staff preview`; DB `marker is per user`.
- [ ] **Step 2–4:** FAIL → implementar → PASS. **Step 5:** commit `feat(web): portal onboarding on first visit`.

### Task 5: Momento de pagamento

**Files:** Create `apps/web/src/components/portal/receipt-moment.tsx`; `apps/web/src/app/[locale]/portal/invoices/page.tsx` (lê `?paid=1`, já usado como `successUrl` em `modules/billing/stripe-events.ts`); "momento visto" guardado no `localStorage` com a chave `payment-moment:<requestId>`, lido e escrito dentro de `try/catch` (sem armazenamento, o recibo aparece estático). Noutro dispositivo o momento repete-se, o que é aceitável para um efeito visual e evita uma migração.

- Recibo com o código do pedido (`PP-AAAA-NNNN`), valor e data; animação de saída de ranhura com `m` (translateY + clip), token `moment`; "reduzir movimento" → estático.
- [ ] **Step 1: Failing tests** — `prints once for a paid request`; `reduced motion shows the receipt without animation`; `does not run for unpaid requests`.
- [ ] **Step 2–4:** FAIL → implementar → PASS. **Step 5:** commit `feat(web): payment receipt moment in the portal`.

### Task 6: Comparar versões de uma prova

**Files:** Create `packages/ui/src/components/image-compare.tsx`; `apps/web/src/components/proofing/*` (visualizador da equipa e do portal); `modules/proofing` (a leitura da versão passa a incluir a versão anterior, se for imagem e legível, com URL assinado das mesmas regras); tests `packages/ui/test/image-compare.test.tsx` e do visualizador.

- `ImageCompare({ before: { src; alt }; after: { src; alt }; label: string })` — divisória arrastável (pointer), `role="slider"` com `aria-valuenow` 0–100, setas ±5, Home/End; sem animação contínua.
- Botão "Comparar com a versão anterior" só quando as duas versões são imagens.
- [ ] **Step 1: Failing tests** — `arrow keys move the divider and update aria-valuenow`; `compare button only with two image versions`.
- [ ] **Step 2–4:** FAIL → implementar → PASS. **Step 5:** commit `feat(web): compare proof versions side by side`.

### Task 7: E2E, documentação e verificação

- E2E `apps/web/e2e/portal-dashboard.spec.ts`: o cliente entra, vê as boas-vindas uma vez, pede trabalho e vê-o em "Recebido"; a equipa atribui a tarefa e o pedido passa a "Em curso" (seed com `e2e/support/retainers.ts`). Atualizar specs do portal que dependam do Início antigo ("Ver pagamentos", "Ver a proposta"…).
- `STATUS.md` (UX-3 feita; migrações aplicadas a dev) e `INVENTORY.md` (onboarding-dialog Origin UI MIT; receipt-printer dqnamo sem licença, implementação própria; image-compare bencho sem licença e feature-with-image-comparison MIT).
- [ ] `pnpm typecheck && pnpm lint && pnpm test && npx prettier --check .`, DB tests dos módulos tocados e `pnpm --filter web build`.
- [ ] commits `test(e2e): portal dashboard flow` e `docs: portal dashboard in status and inventory`.

### Task 8: Responsáveis com seletor de membros

**Files:** Create `packages/ui/src/components/member-selector.tsx`; usar em `apps/web/src/components/tasks/*` (tabela, painel e criação) e nos passos da sala (`components/rooms/*`, painel do passo); test `packages/ui/test/member-selector.test.tsx`.

- `MemberSelector({ members: { id; name; avatarUrl?: string | null; priority?: boolean }[]; value: string | null; onChange(id: string | null): void; label: string; unassignedLabel: string; searchPlaceholder: string; name?: string })` sobre `Popover` + `cmdk` (já dependências): botão com avatar e nome, procura por nome, membros com `priority` primeiro, opção "Sem responsável"; `role="listbox"` via cmdk, teclado completo; `name` gera `<input type="hidden">` para formulários de server actions.
- As regras de quem pode ser responsável não mudam (`validAssignee`); os membros com acesso à sala vêm marcados com `priority`.
- [ ] **Step 1: Failing tests** — `filters members by name`; `priority members come first`; `choosing unassigned clears the value`; `hidden input carries the value`.
- [ ] **Step 2–4:** FAIL → implementar → PASS; atualizar os e2e que usavam o `Select` de responsável (`chooseOption`). **Step 5:** commit `feat(ui): member selector for assignees`.

### Task 9: Lista e quadro com separadores

**Files:** Create `packages/ui/src/components/card-tabs.tsx`; usar em "O seu trabalho" no portal (`RequestBoard` ganha a vista Lista) e no cartão "Trabalho atual" da equipa; test `packages/ui/test/card-tabs.test.tsx`.

- `CardTabs({ title; tabs: { value; label }[]; value; onValueChange; children })` — cabeçalho de cartão com separadores (indicador partilhado da UX-0, `layoutId` único por instância); a escolha fica na URL (`view=list|board`) com `router.replace` sem scroll.
- [ ] **Step 1: Failing tests** — `switches panel and marks the active tab`; `arrow keys move between tabs`.
- [ ] **Step 2–4:** FAIL → implementar → PASS. **Step 5:** commit `feat(ui): card tabs for list and board views`.
