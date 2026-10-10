# Sub-projeto 2C — Equipa e convites — Plano de implementação

> **Para agentes:** SUB-SKILL OBRIGATÓRIA: usar `superpowers:subagent-driven-development` ou `superpowers:executing-plans` para executar este plano tarefa a tarefa. Os passos usam caixas (`- [ ]`) para acompanhamento.

**Objetivo:** o fundador gere a equipa no OS (convites, papéis, clientes, projetos, custo, disponibilidade, carga, retirar acesso); o decisor gere os colegas no portal; os freelancers veem só os projetos atribuídos; os gestores recebem os avisos dos seus clientes.

**Arquitetura:**

- Módulo novo `apps/web/src/modules/team`: domínio puro (carga, regras do último fundador e do último decisor), serviços da equipa e dos colegas do portal.
- `identity` passa a gerar o link de convite com `generateLink` e a enviá-lo pelo email do OS.
- Acesso por projeto na base de dados (`app.can_read_project`) e nos carregadores da sala que leem em contexto de sistema.

**Stack:** a do 2B; sem dependências novas.

**Spec:** [docs/superpowers/specs/2026-10-10-team-invitations-design.md](../specs/2026-10-10-team-invitations-design.md)

## Restrições globais

- As dos planos anteriores:
  - TDD;
  - inglês no código e PT-PT na documentação;
  - migrações com dry-run e nunca com o e2e do CI a usar a base de dados;
  - sem custo;
  - sem linhas de atribuição a IA.
- **Valores do spec:**
  - MFA recente: 15 minutos (`requireRecentMfa`);
  - carga: tarefas abertas com data de segunda a domingo (Lisboa) e projetos ativos atribuídos;
  - papéis convidáveis: equipa `project_manager`, `freelancer`, `finance`; cliente `decision_maker`, `operational`, `client_finance`.
- **Regras:**
  - custo e disponibilidade só para fundador e finanças;
  - nunca sem fundador ativo nem cliente sem decisor ativo;
  - token do convite nunca em `domain_events`.

## Foco de revisão

1. **Freelancer com dois projetos no mesmo cliente, atribuído a um:** não vê o outro em lado nenhum (sala, Plano, Início, feed, tarefas). Testes nas Tasks 1 e 5.
2. **Pessoa sem acesso com sessão aberta:** a próxima leitura não devolve nada. Teste na Task 4 (`revoked member resolves no actor`).
3. **Convite a um email que já tem conta (ex.: cliente noutro cliente):** reutiliza o utilizador e cria só a pertença. Teste na Task 3.
4. **Último fundador e último decisor:** recusado com erro próprio. Testes nas Tasks 2, 4 e 7.
5. **Ação crítica fora dos 15 minutos:** pede código e não muda nada. Teste na Task 4.

---

### Task 1: Esquema e acesso por projeto

**Ficheiros:**

- `packages/db/src/schema/team.ts` (+ exportações);
- migração gerada `<ts>_team.sql` e migração de acesso `<ts>_team_access.sql`;
- `createTeamFixture` em `packages/db/src/testing/fixtures.ts`;
- `packages/db/test/rls/team.test.ts` e o isolamento.

**O que muda:**

- `project_staff_assignments`: `organization_id`, `client_id`, `project_id`, `user_id`, `archived_at`; chave composta `(project_id, client_id)` para `projects`; único `(project_id, user_id)`.
- `team_member_rates`: `organization_id`, `user_id`, `hourly_cost numeric(10,2)` opcional, `currency` (`currencyEnum`), `weekly_hours integer` opcional (0–80); único `(organization_id, user_id)`.
- `app.is_project_staff(p_project uuid)`: atribuição não arquivada da pessoa, com pertença ativa e MFA.
- `app.can_read_project(p_organization, p_client, p_project)`: fundador ou finanças; gestor com `is_assigned_staff`; freelancer com `is_assigned_staff` e `is_project_staff`.
- Políticas de leitura de `projects` (`id`), `project_phases`, `project_steps`, `project_updates`, `approvals` (`project_id`) passam a `can_read_project`; `app.can_read_task` usa `can_read_project` quando a tarefa tem projeto.
- Leitura: `project_staff_assignments` pelo fundador e pela própria pessoa; `team_member_rates` pelo fundador e pelas finanças. Sem escrita direta.
- `createTeamFixture(sql, world)`: segundo projeto no cliente A (`otherProjectId`), freelancer atribuído só ao primeiro projeto da `createRoomFixture`, uma tarefa e uma aprovação em cada projeto, uma linha de `team_member_rates` do freelancer.

**Passos:**

- [ ] Escrever os testes:
  - `freelancer reads only assigned projects and their rows` (projetos, fases, passos, atualizações, aprovações, tarefas);
  - `manager reads every project of assigned clients`;
  - `rates are read by founder and finance only`;
  - `assignments are read by founder and the person`;
  - `nobody writes team tables directly`.
- [ ] Correr e ver FALHA → esquema e migrações (dry-run, aplicar ao dev) → PASSA → correr `rooms`, `tasks` e isolamento → commit.

### Task 2: Domínio da equipa

**Ficheiros:** `modules/team/domain/{load,guards}.ts` (+ testes).

**Interfaces:**

- `weeklyLoad(input: { taskDueDates: Array<string | null>; activeProjects: number; today: string }): { tasksThisWeek: number; activeProjects: number }`: conta datas de segunda a domingo da semana de `today`, inclusive.
- `canLoseFounder(activeFounderIds: string[], userId: string): boolean`: falso se `userId` é o único fundador ativo.
- `canLoseDecisionMaker(activeDecisionMakerIds: string[], userId: string): boolean`: idem para decisores.

**Passos:**

- [ ] Escrever os testes:
  - `counts tasks from monday to sunday`;
  - `undated and later tasks do not count`;
  - `the only founder cannot be removed`;
  - `the only decision maker cannot be removed`.
- [ ] Correr e ver FALHA → implementar → PASSA → commit.

### Task 3: Convites pelo email do OS

**Ficheiros:**

- `modules/identity/{invitations,server,admin}.ts` (+ `invitations.db.test.ts`);
- `modules/email/templates.ts` e mensagens `emails.team.invitation`, `emails.client.invitation`.

**Interfaces:**

- `InvitationDeps` ganha `email: EmailPort` e `admin: AdminPort & { linkFor(email: string): string | undefined }`.
- `createInvitationDeps(locale)` usa `createInviteLinkPort(supabaseAdmin, acceptUrl)`; se o email já tem conta, `generateLink` falha e o porto procura o utilizador com `lookupUserIdByEmail` e gera um link `magiclink` para o mesmo email.
- `inviteTeamMember` e `inviteClientUser` enviam o email (`team.invitation` com `{ organizationName, role, link }`; `client.invitation` com `{ organizationName, clientName, link }`) depois de gravar a pertença, sem emitir o link em eventos.
- `resendInvitation(session, { membershipId, kind: 'internal' | 'client' }, deps): Promise<{ ok: true } | { ok: false; rule: 'not_found' | 'invalid_state' }>`: só para `invited`; mesmas regras de quem convida.

**Passos:**

- [ ] Escrever os testes:
  - `team invitation sends the OS email with the link`;
  - `existing account gets a membership and an email`;
  - `invited event carries no link`;
  - `resend only for pending invitations`.
- [ ] Correr e ver FALHA → implementar → PASSA → commit.

### Task 4: Serviços da equipa

**Ficheiros:** `modules/team/{service,authorize,index,server,testing}.ts` (+ `service.db.test.ts`); auditoria.

**Interfaces:**

- `listTeam(claims, now, deps): Promise<TeamMemberView[] | null>` (só fundador): `{ userId, membershipId, name, email, role, status, clientCount, load, rates: { hourlyCost, currency, weeklyHours } | null }`.
- `loadMember(claims, userId, deps)`: o mesmo mais `clients: Array<{ id, name, assigned }>` e `projects: Array<{ id, name, clientId, assigned }>` dos clientes atribuídos.
- `changeRole(claims, { userId, role }, deps)`, `revokeAccess(claims, { userId })`, `restoreAccess(claims, { userId })`, `setClientAssignment(claims, { userId, clientId, assigned })`, `setProjectAssignment(claims, { userId, projectId, assigned })`: MFA recente (`reauthentication_required`), só fundador, auditados.
- `setRates(claims, { userId, hourlyCost, currency, weeklyHours })`: só fundador, sem MFA recente.
- Regras: revogar arquiva atribuições; `setProjectAssignment` cria a atribuição ao cliente; gestor não recebe projetos (`invalid_input`); último fundador (`last_founder`); ninguém retira o próprio acesso nem muda o próprio papel (`invalid_input`).

**Passos:**

- [ ] Escrever os testes:
  - `founder lists the team with load and rates`;
  - `role change needs recent mfa`;
  - `revoked member resolves no actor`;
  - `the last founder keeps access`;
  - `founders cannot revoke themselves`;
  - `project assignment assigns the client`;
  - `restore brings access back without assignments`.
- [ ] Correr e ver FALHA → implementar → PASSA → commit.

### Task 5: Acesso por projeto nos carregadores

**Ficheiros:** `modules/rooms/{room,authorize}.ts`, `modules/studio/feed.ts` (+ testes).

**Interfaces:**

- `visibleProjectIds(tx, actor, clientId): Promise<string[] | null>`: `null` para quem vê todos; ids atribuídos para quem só é freelancer.
- `buildProject` recebe `projectIds: string[] | null` e filtra os resumos e o projeto escolhido; `loadRoom` e `loadRoomPreview` passam-no.
- Feed: `rooms.approval.decided` só aparece ao freelancer se `payload.projectId` estiver atribuído.

**Passos:**

- [ ] Escrever os testes:
  - `freelancer room lists only assigned projects`;
  - `freelancer cannot open another project by id`;
  - `freelancer feed skips approvals of other projects`.
- [ ] Correr e ver FALHA → implementar → PASSA → commit.

### Task 6: Avisos para a equipa

**Ficheiros:** `modules/commercial/booking/notifications.ts`, `modules/rooms/automations.ts`, `modules/tasks/{service,automations}.ts`, templates e mensagens (+ testes).

**Interfaces:**

- `alertClientTeam(organizationId, clientId, template, params, deps): Promise<number>`: fundadores ativos mais gestores atribuídos ao cliente, sem repetidos.
- As funções de aviso `founder.approval_decided` e `founder.approval_overdue` usam `alertClientTeam`.
- Evento `tasks.task.assigned` `{ taskId, assigneeId }` emitido por `createTask` e `updateTask` quando o responsável muda para outra pessoa que não quem pede; função `tasks-assigned-notice` envia `team.task_assigned` `{ title, clientName, dueOn, link }`.

**Passos:**

- [ ] Escrever os testes:
  - `approval alerts reach the client managers once`;
  - `assigning a task to someone else emits the event`;
  - `self assignment emits nothing`;
  - `task assigned email names the task and the client`.
- [ ] Correr e ver FALHA → implementar → PASSA → commit.

### Task 7: Colegas no portal (P-11)

**Ficheiros:** `modules/team/colleagues.ts` (+ `.db.test.ts`).

**Interfaces:**

- `listColleagues(claims, clientId, deps)`: só decisor ativo do cliente; `{ membershipId, name, email, role, status, isSelf }`.
- `inviteColleague(claims, { clientId, email, fullName, role }, deps)`: usa `inviteClientUser`.
- `changeColleagueRole(claims, { membershipId, role })` e `revokeColleague(claims, { membershipId })`: recusam o próprio e o último decisor ativo (`last_decision_maker`); escrita em contexto de sistema, auditada.

**Passos:**

- [ ] Escrever os testes:
  - `decision maker invites an operational colleague`;
  - `operational members cannot manage colleagues`;
  - `the last decision maker stays`;
  - `colleagues of other clients are not found`.
- [ ] Correr e ver FALHA → implementar → PASSA → commit.

### Task 8: Páginas e navegação

**Ficheiros:**

- `app/[locale]/(workspace)/settings/team/{page,actions}.tsx` e `team/[userId]/page.tsx`;
- `app/[locale]/portal/settings/team/{page,actions}.tsx`;
- componentes `components/team/{team-table,invite-form,member-form,assignment-list,colleague-list}.tsx` (+ testes);
- `settings-nav.tsx`, navegação do portal, mensagens `team.*`.

**Passos:**

- [ ] Escrever os testes:
  - `team table shows status, load and rates`;
  - `invite form keeps values when refused`;
  - `member form hides project assignments for managers`;
  - `colleague list hides actions on self`;
  - `settings navigation lists team for founders`.
- [ ] Correr e ver FALHA → implementar → PASSA → commit.

### Task 9: Ponta a ponta, revisão e documentação

**Ficheiros:** `apps/web/e2e/team.spec.ts` (+ suporte), `docs/STATUS.md`, spec marcado como implementado, registo de execução.

**Passos:**

- [ ] Escrever e correr o teste ponta a ponta:
  1. O fundador convida um freelancer e atribui-lhe um de dois projetos de um cliente.
  2. O link chega no email capturado.
  3. O freelancer define a palavra-passe e o MFA e vê só o projeto atribuído.
  4. O decisor convida um colega no portal.
  5. Axe nas páginas novas.
- [ ] Revisão final.
- [ ] PR, CI e staging.
- [ ] STATUS.
