# UX-4 Ecrã de integrações — Plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Spec:** `docs/superpowers/specs/2026-10-26-integrations-screen-design.md`

## Global Constraints
- Sem migrações. Sem atribuição a IA nos commits. Nunca correr `e2e:seed` nem e2e locais. Nenhum valor de ambiente sai do servidor além do tipo de fornecedor.

### Task 1: Estado dos serviços do estúdio
**Files:** `apps/web/src/modules/settings/studio-services.ts` (ou o módulo de settings existente) + test.
- `studioServices(source = process.env): { key: 'payments' | 'email' | 'transcription' | 'receipts' | 'domains' | 'events'; status: 'active' | 'test' | 'missing' }[]` reutilizando os esquemas de `platform/env.ts` (safeParse; erro → `missing`).
- [ ] Failing tests → implementar → PASS → commit `feat(web): studio service status for integrations`.

### Task 2: Ecrã
**Files:** `apps/web/src/app/[locale]/(workspace)/settings/integrations/page.tsx`, componentes em `apps/web/src/components/settings/integrations/` (`IntegrationCard`, `IntegrationGroup`, `ConnectedList`) + tests; mensagens pt-PT e en.
- [ ] Failing tests (`renders three groups and the connected list`, `ideas have no buttons`, `connected google shows disconnect`) → PASS → commit `feat(web): integrations screen with groups and ideas`.

### Task 3: Verificação e documentação
- Ajustar e2e que procurem textos antigos da página (sem correr). `STATUS.md`.
- [ ] `pnpm typecheck && pnpm lint && pnpm test`, `npx prettier --check .`, `pnpm --filter web build` → commit `docs: integrations screen in status`.
