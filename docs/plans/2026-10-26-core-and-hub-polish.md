# UX-6 Core, Brand Hub e cronograma — Plano de implementação

**Spec:** `docs/specs/2026-10-26-core-and-hub-polish-design.md`

## Global Constraints

- Sem migrações nem dependências novas. `m` e `transitions` da UX-0; `MotionProvider` nos testes; "reduzir movimento" sempre. Testes de `packages/ui` em `packages/ui/test/`. Nunca `e2e:seed` nem e2e locais.

### Task 1: `ScoreSlider` e grelha Orbit

**Files:** `packages/ui/src/components/score-slider.tsx` + test; `apps/web/src/app/[locale]/(workspace)/pipeline/[dealId]/core/orbit-section.tsx` (+ test se existir); `apps/web/e2e/core.spec.ts` (passo dos pontos).

- [ ] Failing tests → PASS → commit `feat(ui): score slider for the orbit grid`.

### Task 2: `ThinkingOrbs` e `ScrambleText` no assistente

**Files:** `packages/ui/src/components/thinking-orbs.tsx`, `scramble-text.tsx` + tests; `core/assistant-section.tsx`.

- [ ] Failing tests → PASS → commit `feat(ui): thinking state and title reveal for the core assistant`.

### Task 3: Paleta e proporção no Brand Hub

**Files:** `apps/web/src/components/brand-hub/design-panel.tsx`, `assets-panel.tsx`, função pura `contrastRatio` (+ test) em `apps/web/src/modules/brand-hub/` ou `packages/ui/src/lib/`; tests em `brand-hub.test.tsx`.

- [ ] Failing tests → PASS → commit `feat(web): palette swatches and aspect preview in the brand hub`.

### Task 4: Cronograma da sala

**Files:** `packages/ui/src/components/timeline-gantt.tsx` + test; separador no processo da sala (`apps/web/src/components/rooms/*` / página do processo); leitura das datas a partir das leituras existentes (sem queries novas se possível).

- [ ] Failing tests → PASS → commit `feat(web): read-only project timeline`.

### Task 5: Carregamento do portal

**Files:** `packages/ui/src/components/logo-trace-loader.tsx` + test; `apps/web/src/app/[locale]/portal/loading.tsx`.

- [ ] Failing tests → PASS → commit `feat(web): branded loading in the portal`.

### Task 6: Verificação e documentação

- `STATUS.md`, `INVENTORY.md` (origem e licença de cada padrão: slider-06 e gantt 21st.dev, wake-slider/palette/aspect bencho, thinking-orbs yogesharc, scramble-text e logo-trace-loader dqnamo — todas implementações próprias salvo licença MIT confirmada).
- [ ] `pnpm typecheck && pnpm lint && pnpm test`, `npx prettier --check .`, `pnpm --filter web build` → commit `docs: core and brand hub polish in status and inventory`.
