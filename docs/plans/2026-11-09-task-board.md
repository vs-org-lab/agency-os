# Plano — Quadro de tarefas

Spec: [Quadro de tarefas](../specs/2026-11-09-task-board-design.md) · Ramo: `feat/task-board`

1. **Base de dados.** `startedAt: timestamp('started_at', { withTimezone: true })` em `packages/db/src/schema/tasks.ts`; `pnpm --filter @agency-os/db generate` cria a migração; aplicar no dev com `supabase db push` (sem job e2e do CI em curso).
2. **Domínio** (`apps/web/src/modules/tasks/domain/board.ts`, com testes):
   - `TaskStage = 'todo' | 'doing' | 'done'`, `taskStage({ status, startedAt })`;
   - `boardColumns(tasks, today)`: três colunas, Concluídas só com `completedAt` nos 14 dias até `today` (Lisboa), ordem por prazo nas abertas e por conclusão nas concluídas;
   - `dueUrgency(dueOn, today, stage)`: `'overdue' | 'soon' | 'later' | 'none'` (`soon` = hoje ou amanhã; concluídas sempre `none`).
3. **Serviço** (`service.ts`, testes em `service.db.test.ts`):
   - `TaskView` ganha `startedAt` e `completedAt` (ISO ou `null`);
   - `listTasks` aceita `doneSince` (data): as concluídas só entram com `completed_at` a partir dessa data;
   - `setTaskStage(claims, { taskId, stage }, deps)` com as regras da decisão 2 e a permissão de `canWork`; `setTaskStatus` não mexe em `started_at`;
   - `server.ts`: `setStudioTaskStage`; `loadTasks` passa `doneSince`.
4. **Ação** `setTaskStageAction(taskId, stage)` em `(workspace)/tasks/actions.ts`.
5. **Componentes** (`apps/web/src/components/tasks/`, com testes):
   - `task-view-switch.tsx`: Lista e Quadro como ligações que mantêm os parâmetros do endereço;
   - `task-board.tsx` e `task-board-card.tsx`: colunas com `@dnd-kit/core`, cartão da decisão 4, menu "Mover", atualização otimista com reversão e `aria-live`;
   - `TaskFilters` sem o filtro de estado no quadro; etiqueta "Em curso" na linha e no cartão da tabela.
6. **Páginas** S-03 e C-03: `view=board` carrega todas as abertas e as concluídas dos últimos 14 dias; traduções em `pt-PT.json` e `en.json`.
7. **e2e** do quadro nas tarefas do estúdio; verificação: typecheck, lint, Prettier, unitários e testes de base de dados das tarefas; `STATUS.md`.
