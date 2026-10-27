# Sub-projeto 2B — Tarefas, Início e atualizações — Plano de implementação

**Objetivo:** dar à equipa um sítio onde vê o que precisa dela:

- tarefas internas, numa lista global e em cada sala;
- o Início com indicadores e o "Hoje" alargado;
- o feed do que os clientes fizeram;
- as tarefas de arranque criadas sozinhas no 2.2.

**Arquitetura:**

- Módulo novo `apps/web/src/modules/tasks`: domínio puro (agrupamento e urgência), serviços e automação.
- O Início e o feed vivem num módulo `studio`, que lê `commercial`, `rooms`, `billing` e `tasks` pelas suas entradas públicas, sem dependências no sentido inverso.
- O feed lê `domain_events` em contexto de sistema, depois de filtrar os clientes que a pessoa pode ler.

**Stack:** a do 2A; sem dependências novas.

**Spec:** [docs/specs/2026-10-09-tasks-home-design.md](../specs/2026-10-09-tasks-home-design.md)

## Restrições globais

- As dos planos anteriores:
  - TDD;
  - inglês no código e PT-PT na documentação;
  - migrações com dry-run e nunca com o e2e do CI a usar a base de dados;
  - sem custo;
- **Valores do spec:**
  - tarefas de arranque a 2 dias ("Agendar kickoff") e a 7 dias ("Enviar kit de boas-vindas");
  - aprovações com pedido de alterações nos últimos 7 dias entram no Hoje;
  - o feed mostra 30 dias;
  - a semana vai de segunda a domingo, em Lisboa.
- **Regras:**
  - os clientes nunca veem tarefas;
  - o freelancer vê as suas tarefas e as dos clientes atribuídos;
  - "por receber" só para quem lê faturação.

## Foco de revisão

1. **Freelancer a ver tarefas de clientes não atribuídos:** recusado. Teste na Task 1 (`freelancer reads own and assigned client tasks only`).
2. **Evento de 2.2 repetido:** uma tarefa de cada origem. Teste na Task 3 (`kickoff tasks are created once`).
3. **Gestor sem faturação:** não vê "por receber" nem pedidos vencidos no Hoje. Teste na Task 4.
4. **Feed com clientes de outra pessoa:** filtrado. Teste na Task 5 (`feed shows only readable clients`).
5. **Tarefa sem data:** fica em "Mais tarde" e nunca no Hoje. Teste na Task 2.

---

### Task 1: Esquema e acesso

**Ficheiros:**

- `packages/db/src/schema/{enums,tasks}.ts`;
- migração gerada `<ts>_tasks.sql` e migração de acesso `<ts>_tasks_access.sql`;
- `createTaskFixture`;
- `packages/db/test/rls/tasks.test.ts` e o isolamento.

**O que muda:**

- Enums `task_status` (`open`, `done`) e `task_source` (`manual`, `kickoff`, `welcome_kit`).
- `tasks`:
  - cliente opcional, com chave composta para o cliente da organização;
  - projeto opcional, que tem de ser do mesmo cliente;
  - o passo continua opcional;
  - único `(project_id, source)` quando a origem não é `manual`.
- `task_items`: posição única por tarefa.
- RLS de leitura:
  - com cliente, `can_read_rooms` ou responsável;
  - sem cliente, fundador e gestores, ou responsável.
- Sem escrita direta.

**Passos:**

- [ ] Escrever os testes:
  - `founder reads all tasks`;
  - `manager reads assigned clients and studio tasks`;
  - `freelancer reads own and assigned client tasks only`;
  - `clients never read tasks`;
  - `nobody writes tasks directly`.
- [ ] Correr e ver FALHA → esquema e migrações (dry-run, aplicar ao dev) → PASSA → commit.

### Task 2: Domínio das tarefas e do Hoje

**Ficheiros:** `modules/tasks/domain/{groups,urgency}.ts` (+ testes).

**Interfaces:**

- `taskGroup(dueOn: string | null, today: string): 'today' | 'this_week' | 'later'`, em que atrasadas contam como `today` e a semana acaba ao domingo.
- `sortByUrgency<T extends { dueAt: Date; overdue: boolean }>(items: T[]): T[]`: atrasadas primeiro, depois por data.

**Passos:**

- [ ] Escrever os testes:
  - `overdue tasks are today`;
  - `sunday ends the week`;
  - `undated tasks are later`;
  - `overdue items come first`.
- [ ] Correr e ver FALHA → implementar → PASSA → commit.

### Task 3: Serviços das tarefas e AUT-13

**Ficheiros:**

- `modules/tasks/{service,automations,index,server,runtime-types,testing}.ts` (+ `.db.test.ts`);
- eventos e auditoria.

**Interfaces:**

- `createTask(claims, { title, notes?, clientId?, projectId?, assigneeId?, dueOn?, items?: string[] }, deps)`:
  - fundador cria em qualquer lado;
  - gestor cria em clientes atribuídos ou sem cliente.
- `updateTask(claims, { taskId, … })` e `deleteTask(claims, { taskId })`: mesmas regras.
- `setTaskStatus(claims, { taskId, status })` e `setTaskItem(claims, { itemId, done })`: quem pode escrever ou o responsável.
- `listTasks(tx, { clientId?, assigneeId? })` sob RLS.
- `createKickoffTasks(projectId, deps)`:
  - idempotente;
  - responsável: o gestor atribuído ao cliente, se houver um único;
  - usado pela função `tasks-kickoff` em `rooms.project.created` quando o projeto tem negócio.

**Passos:**

- [ ] Escrever os testes:
  - `kickoff tasks are created once`;
  - `manager cannot create tasks for other clients`;
  - `assignee completes a task they cannot edit`;
  - `items toggle`.
- [ ] Correr e ver FALHA → implementar → PASSA → commit.

### Task 4: Início (S-01)

**Ficheiros:**

- `modules/studio/{home,index,server}.ts` (+ `.db.test.ts`);
- `app/[locale]/(workspace)/page.tsx` e componentes `home/{indicators,today-list,client-progress}.tsx` (+ testes).

**Interfaces:**

- `loadHome(claims, now, deps)` devolve:
  - `indicators`: `{ clients, activeProjects, waiting, receivable: Array<{ currency; amountMinor }> | null }`;
  - `today: HomeItem[]`;
  - `upcomingCalls`;
  - `clients: Array<{ id; name; progress: { done; total } | null; lastActivityAt }>`.
- `HomeItem.kind`: `follow_up | queue_b | call | task | step | approval | payment`.

**Passos:**

- [ ] Escrever os testes:
  - `today merges tasks, late steps, changes requested and overdue requests`;
  - `manager sees no receivable nor payments`;
  - `progress counts done phases`;
  - componentes: `indicators hide receivable when null`, `today list links each kind`.
- [ ] Correr e ver FALHA → implementar → PASSA → commit.

### Task 5: Atualizações (S-02)

**Ficheiros:** `modules/studio/feed.ts` (+ `.db.test.ts`), `app/[locale]/(workspace)/updates/page.tsx` (+ componente e teste).

**Interface:** `loadStudioFeed(claims, now, deps)` devolve `FeedEntry[]`, com `{ id, type, clientId, clientName, dealId, occurredAt }`.

- Tipos lidos:
  - `contracts.proposal.accepted`;
  - `contracts.contract.client_signed`;
  - `billing.payment.received`;
  - `rooms.approval.decided`.
- 30 dias, até 100 entradas.

**Passos:**

- [ ] Escrever os testes:
  - `feed shows only readable clients`;
  - `feed keeps 30 days`;
  - componente: `renders each type with its link`.
- [ ] Correr e ver FALHA → implementar → PASSA → commit.

### Task 6: Páginas das tarefas e navegação

**Ficheiros:**

- `app/[locale]/(workspace)/tasks/{page,actions}.tsx`;
- `app/[locale]/c/[clientId]/tasks/page.tsx`;
- componentes `tasks/{task-list,task-form}.tsx` (+ testes);
- `components/shell/navigation.ts` (+ teste);
- mensagens `tasks.*` e `studio.*`.

**Passos:**

- [ ] Escrever os testes:
  - `groups tasks by today, this week and later`;
  - `filters by client and assignee`;
  - `task form keeps values when refused`;
  - `studio navigation lists updates and tasks`;
  - `room navigation lists tasks`.
- [ ] Correr e ver FALHA → implementar → PASSA → commit.

### Task 7: Ponta a ponta, revisão e documentação

**Ficheiros:** `apps/web/e2e/tasks.spec.ts`, `docs/STATUS.md`, spec marcado como implementado, registo de execução.

**Passos:**

- [ ] Escrever e correr o teste ponta a ponta:
  1. Criar uma tarefa atrasada com subtarefa.
  2. Vê-la no Hoje.
  3. Concluí-la e vê-la sair.
  4. Ver o feed com um pagamento semeado.
  5. Axe nas páginas novas.
- [ ] Revisão final.
- [ ] PR, CI e staging.
- [ ] STATUS.
