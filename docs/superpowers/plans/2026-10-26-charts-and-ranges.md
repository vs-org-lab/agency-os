# UX-3b Gráficos e intervalos — Plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** gráficos SVG próprios em Relatórios e Dinheiro e filtro por intervalo de datas no Dinheiro.

**Spec:** `docs/superpowers/specs/2026-10-26-charts-and-ranges-design.md`

## Global Constraints

- Sem dependências novas. `motion` via `m` e `transitions` de `packages/ui/src/motion`; `MotionProvider` nos testes.
- Cores só por tokens CSS; acrescentar a escala de dados (`--chart-1`… `--chart-5`) aos temas claro e escuro se não existir.
- Testes de `packages/ui` em `packages/ui/test/`. Sem atribuição a IA nos commits. Nunca correr `e2e:seed` nem e2e locais.

### Task 1: Escala de dados e `LineChart`

**Files:** `packages/ui/src/components/charts/line-chart.tsx`, `chart-scale.ts` (marcas do eixo "agradáveis"), tokens em `packages/ui/src/styles/*`; tests `packages/ui/test/line-chart.test.tsx`, `chart-scale.test.ts`.

- `LineChart({ series: { key; label; values: (number | null)[] }[]; labels: string[]; formatValue(v: number): string; summary: string })`.
- [ ] Failing tests (`nice ticks for known ranges`, `path points for known data`, `arrow keys move the active point`, `reduced motion renders full line`) → implementar → PASS → commit `feat(ui): line chart`.

### Task 2: `StackedBars`

**Files:** `packages/ui/src/components/charts/stacked-bars.tsx`; test `stacked-bars.test.tsx`.

- `StackedBars({ rows: { key; label; segments: { key; value }[] }[]; segmentLabels: Record<string,string>; formatValue; summary })`.
- [ ] Failing tests (`segment widths are proportional to the largest row`, `legend lists segments`, `zero rows render an empty bar`) → PASS → commit `feat(ui): stacked bars chart`.

### Task 3: `DateRangeField`

**Files:** `packages/ui/src/components/date-range-field.tsx`; test `date-range-field.test.tsx`.

- `DateRangeField({ label; value: { from: string; to: string } | null; onChange; min: string; max: string; presets: { label; from; to }[]; clearLabel })` sobre `Popover` + `Calendar` `mode="range"`.
- [ ] Failing tests (`preset sets the range`, `clear resets`, `dates outside min and max are disabled`) → PASS → commit `feat(ui): date range field`.

### Task 4: Relatórios

**Files:** `apps/web/src/components/reports/reports-screen.tsx` (+ test), mensagens pt-PT e en.

- [ ] Failing tests (`revenue panel shows a line per currency`, `pipeline and load show stacked bars`, `no chart without data`) → PASS → commit `feat(web): charts in team reports`.

### Task 5: Dinheiro

**Files:** `apps/web/src/components/money/money-screen.tsx`, `money-summary.tsx`, `apps/web/src/modules/money/` (função pura `monthlyTotals` com teste), `app/[locale]/(workspace)/money/page.tsx` (lê `from`/`to` e valida dentro do ano); mensagens.

- [ ] Failing tests (`monthly totals group by Lisbon month in EUR`, `range filters requests and expenses`, `invalid range is ignored`) → PASS → commit `feat(web): monthly chart and date range in money`.

### Task 6: E2E, documentação e verificação

- Passo no e2e de dinheiro que escolhe "Este mês" (não correr localmente). `STATUS.md`, `INVENTORY.md` (line-charts-9 e calendar-range-select da 21st.dev, stacked-bars bencho — implementações próprias), `05 Design system.md` (escala de dados).
- [ ] `pnpm typecheck && pnpm lint && pnpm test`, `npx prettier --check .`, `pnpm --filter web build` → commit `docs: charts and date ranges in status and inventory`.
