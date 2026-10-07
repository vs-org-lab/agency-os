# Sub-projeto 1A — Comercial — Plano de implementação

> **Para agentes:** SUB-SKILL OBRIGATÓRIA: usar `superpowers:subagent-driven-development` ou `superpowers:executing-plans` para executar este plano tarefa a tarefa. Os passos usam caixas (`- [ ]`) para acompanhamento.

**Objetivo:** pôr a entrada comercial a funcionar sem intervenção manual: candidatura pontuada e encaminhada, agenda própria sobre o Google Calendar, CRM com o pipeline universal 0.1 a 4.4, acompanhamentos automáticos e os ecrãs do estúdio.

**Arquitetura:** novo módulo `apps/web/src/modules/commercial` (funções de domínio puras, serviços com dependências injetadas, `server.ts` que as compõe) e novo módulo `apps/web/src/modules/email`. Dados em tabelas novas com RLS FORCE e privilégios por coluna; o histórico do pipeline é escrito por gatilho na base de dados; as transições são validadas por uma matriz tipada na aplicação. Os efeitos assíncronos (emails, lembretes, sincronização do calendário, acompanhamentos) correm em funções Inngest alimentadas pelo outbox existente.

**Stack:** a da fundação (Next.js 16, React 19, Drizzle 0.45, Supabase, Inngest 4, Zod 4, Vitest 5, Playwright 1.63 com axe), mais `nodemailer` (SMTP), `date-fns` 4 com `@date-fns/tz` (fusos) e `@dnd-kit/core` (quadro do pipeline). O Google Calendar é chamado por `fetch` à API REST, sem SDK.

**Spec:** [docs/superpowers/specs/2026-10-07-commercial-design.md](../specs/2026-10-07-commercial-design.md)

## Restrições globais

- Todas as restrições globais do [plano da fundação](2026-10-06-platform-foundation.md) continuam em vigor (TypeScript estrito, inglês no código, Conventional Commits com `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`, tokens do separador 05, nenhum texto visível fora de `packages/i18n`, nome da agência nunca no código).
- Branch por tarefa a partir de `develop` (`feat/commercial-*`), PR para `develop` com CI verde.
- Cada tabela nova: `organization_id`; `client_id` com chave estrangeira composta `(client_id, organization_id)` → `clients(id, organization_id)` quando pertence a um cliente; `enable` e `force row level security`; `revoke all ... from anon, authenticated, service_role` e concessões por coluna; entra em `packages/db/test/rls/isolation.test.ts` quando tem `client_id`.
- `withSystemContext` só dentro de `apps/web/src/modules/**` (regra de ESLint existente).
- Valores do spec: pontuação máxima 13; caminho A 9–13 sem eliminatórios, B 6–8, C ≤ 5 ou eliminatório; agenda segunda a sexta 10h–18h `Europe/Lisbon`, 45 min, intervalo 15 min, antecedência 24 h, horizonte 14 dias; gestão da marcação até 2 h antes; token de obrigado 2 h; link de marcação de B 14 dias; limites 5 submissões por hora por IP e 3 por dia por email; tempo mínimo de preenchimento 3 s; acompanhamentos aos 3, 7, 14 e 30 dias; alerta da Fila B às 24 h; alerta de resultado 2 h após o fim da chamada; lembretes 24 h e 1 h antes; horas de silêncio 20h–8h; anonimização por defeito aos 12 meses; 5 repetições por automação.
- Variáveis de ambiente novas: `PUBLIC_LINK_SECRET` (≥ 32 caracteres), `PUBLIC_ORGANIZATION_SLUG`, `APP_BASE_URL`, `APPLY_EMBED_ORIGINS` (lista separada por vírgulas, opcional), `EMAIL_TRANSPORT` (`smtp` | `capture`), `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD` (obrigatórias com `smtp`), `CALENDAR_PROVIDER` (`google` | `fake`), `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` (obrigatórias com `google`).
- Nomes de eventos de domínio em inglês, no formato `commercial.<entidade>.<ação>`; cada escrita que emite eventos chama `requestFlush()` depois do commit.

## Foco de revisão

1. **Dois leads escolhem o mesmo horário ao mesmo tempo:** só um fica marcado; o outro vê "horário já ocupado" e a lista atualizada. Teste na Task 12 (`concurrent bookings for the same slot book only one`).
2. **Lead volta a candidatar-se com o mesmo email enquanto tem um negócio aberto (por exemplo em 0.3):** a candidatura liga-se ao negócio existente, não cria um segundo negócio aberto e não faz recuar o código. Teste na Task 7 (`repeat application attaches to the open deal without changing its stage`).
3. **Email com maiúsculas, espaços ou domínio em maiúsculas:** normalizado antes de procurar o contacto; nunca cria um contacto duplicado. Teste na Task 7 (`normalises email before matching the contact`).
4. **Fuso horário do visitante inválido ou ausente:** a agenda usa o fuso das definições; nunca responde 500. Teste na Task 10 (`invalid visitor time zone falls back to the booking time zone`).
5. **Acesso Google revogado a meio de uma marcação:** a chamada fica gravada como pendente, a ligação passa a `revoked` e o fundador é alertado; o lead recebe a confirmação. Testes nas Tasks 11 (`invalid_grant marks the connection revoked`) e 12 (`calendar failure after commit keeps the call pending`).

---

## Mapa de ficheiros

```
packages/db/src/schema/            enums.ts (+), clients.ts (+), contacts.ts, applications.ts, deals.ts, commercial.ts
supabase/migrations/               <ts>_commercial_schema.sql (gerada), <ts>_commercial_access.sql, <ts>_calendar_vault.sql (personalizadas)
packages/db/test/rls/              commercial.test.ts, isolation.test.ts (+)
packages/db/src/testing/           fixtures.ts (+ createCommercialFixture)
packages/i18n/src/messages/        pt-PT.json, en.json (+ commercial, publicApply, email, settings)
packages/ui/src/components/        tabs, select, textarea, checkbox, radio-group, table, alert-dialog (shadcn)
apps/web/src/platform/             env.ts (+), signed-token.ts, security-headers.ts (+)
apps/web/src/modules/email/        port.ts, smtp.ts, capture.ts, templates.ts, quiet-hours.ts, server.ts, index.ts
apps/web/src/modules/commercial/
  pipeline/                        codes.ts, transitions.ts, service.ts
  applications/                    form-definition.ts, default-form.ts, scoring.ts, submit.ts, review.ts, anonymize.ts
  protection/                      throttle.ts, bot-checks.ts, personal-email.ts
  booking/                         slots.ts, service.ts, links.ts
  calendar/                        port.ts, google.ts, google-oauth.ts, fake.ts, connections.ts
  follow-ups/                      sweep.ts, render.ts
  acquisition/                     service.ts
  settings/                        service.ts
  queries.ts, automations.ts, server.ts, index.ts
apps/web/src/app/[locale]/(public)/apply/…            layout, formulário, obrigado, book/[token], booking/[token]
apps/web/src/app/[locale]/(workspace)/pipeline/…      quadro, lista, [dealId]
apps/web/src/app/[locale]/(workspace)/applications, acquisition, settings/{integrations,application,booking,templates}
apps/web/src/app/api/integrations/google/callback/route.ts
apps/web/src/app/api/inngest/route.ts (+ funções comerciais)
apps/web/e2e/                      commercial-apply.spec.ts, pipeline.spec.ts, accessibility.spec.ts (+)
.github/workflows/                 deploy-preview.yml (+), deploy-staging.yml (+)
```

---

### Task 1: Esquema comercial

**Ficheiros:**

- Modificar: `packages/db/src/schema/enums.ts`, `packages/db/src/schema/clients.ts`, `packages/db/src/schema/index.ts`
- Criar: `packages/db/src/schema/contacts.ts`, `applications.ts`, `deals.ts`, `commercial.ts`
- Criar: migração gerada `supabase/migrations/<timestamp>_commercial_schema.sql` (`pnpm --filter @agency-os/db generate`)
- Teste: `packages/db/test/schema.test.ts` (+)

**Interfaces:**

- Produz enums no esquema `app`:
  - `pipeline_code`: `0.1, 0.2, 0.3, 0.4, 1.1 … 1.6, 2.1 … 2.10, 3.1 … 3.6, 4.1 … 4.4, X.1 … X.4` (34 valores, por esta ordem).
  - `client_lifecycle` (`prospect`, `active`, `former`); `application_path` (`a`, `b`, `c`); `deal_source` (`application`, `acquisition`, `referral`, `client_request`); `next_step_owner_kind` (`staff`, `client`); `call_status` (`scheduled`, `cancelled`, `completed`, `no_show`); `call_sync_status` (`pending`, `synced`, `failed`); `call_outcome` (`advance`, `decline`, `follow_up`); `follow_up_status` (`open`, `done`, `dismissed`); `message_template_kind` (`follow_up`, `acquisition`, `email`); `acquisition_status` (`to_contact`, `contacted`, `replied`, `converted`, `discarded`); `calendar_connection_status` (`active`, `revoked`, `error`); `timeline_kind` (`application_submitted`, `application_reviewed`, `stage_changed`, `call_booked`, `call_rescheduled`, `call_cancelled`, `call_completed`, `follow_up_created`, `follow_up_completed`); `throttle_kind` (`application_ip`, `application_email`, `booking_ip`).
- Produz tipos TypeScript exportados por `@agency-os/db` a partir dos enums (`(typeof enum.enumValues)[number]`): `ClientLifecycle`, `ApplicationPath`, `DealSource`, `NextStepOwnerKind`, `CallStatus`, `CallSyncStatus`, `CallOutcome`, `FollowUpStatus`, `MessageTemplateKind`, `AcquisitionStatus`, `CalendarConnectionStatus`, `TimelineKind`, `ThrottleKind`, e os já existentes `ClientRole`, `Currency`, `Locale`.
- Produz tabelas Drizzle exportadas por `@agency-os/db` (`schema.*`), com os campos da secção 5 do spec e estes acréscimos decididos aqui:
  - `clients`: `lifecycle` (não nulo, por defeito `active`), `website`, `revenueBand`.
  - `contacts`: `email` anulável (anonimização); índice único parcial `(client_id, lower(email)) where email is not null`.
  - `applications`: `reviewDecision` (`application_path`, anulável), `reviewedAt`, `reviewedBy`; `answers` jsonb; `knockouts` `text[]`; `source` jsonb; `consentAt`, `consentTextVersion`; `anonymizedAt`.
  - `applicationForms`: `version` inteiro, `definition` jsonb, `isActive`; índice único parcial `(organization_id) where is_active`.
  - `deals`: `pipelineCode`, `nextStep`, `nextStepOwnerKind`, `nextStepOwnerUserId`, `nextStepDueOn` (date), `estimatedValue` (numeric 12,2), `currency` (`app.currency`), `source`, `lostReason`; índice único parcial `(client_id) where pipeline_code not in ('X.3','X.4') and archived_at is null`.
  - `dealStageChanges`: `fromCode` (anulável), `toCode`, `reason`, `actorUserId` (anulável), `createdAt`.
  - `calls`: campos do spec; `syncStatus` por defeito `pending`; `manageTokenHash` (text, único, anulável); índice único parcial `(deal_id) where status = 'scheduled'`.
  - `followUps`: `callId` não nulo; único `(deal_id, call_id, sequence_day)`; `check (sequence_day in (3, 7, 14, 30))`.
  - `timelineEntries`, `messageTemplates`, `acquisitionTargets`, `calendarConnections` (`vaultSecretId` uuid anulável; único `(user_id, provider)`), `commercialSettings` (único `organization_id`; `weeklyHours` jsonb; valores por defeito do spec), `submissionThrottle` (único `(kind, key_hash, window_start)`), `capturedEmails`.

- [ ] **Passo 1:** acrescentar a `schema.test.ts`: `commercial tables exist with organization_id` (as 13 tabelas novas) e `pipeline_code enum lists the 34 codes in order` (consulta a `pg_enum` ordenada por `enumsortorder`, comparada com a lista acima).
- [ ] **Passo 2:** `pnpm test:db packages/db/test/schema.test.ts` → FALHA.
- [ ] **Passo 3:** escrever os ficheiros de esquema e gerar a migração.
- [ ] **Passo 4:** `supabase db push` para o dev; `pnpm test:db packages/db/test/schema.test.ts` → PASSA. `pnpm test:db packages/db/test/rls/coverage.test.ts` → FALHA (tabelas sem políticas), esperado até à Task 2.
- [ ] **Passo 5:** commit `feat(db): add commercial schema` (no mesmo PR da Task 2, porque a cobertura de RLS só fica verde com ela).

---

### Task 2: Acesso comercial na base de dados

**Ficheiros:**

- Criar: migração personalizada `supabase/migrations/<timestamp>_commercial_access.sql` (`pnpm --filter @agency-os/db generate:custom`)
- Modificar: `packages/db/src/testing/fixtures.ts` (+ `createCommercialFixture`), `packages/db/test/rls/isolation.test.ts`
- Teste: `packages/db/test/rls/commercial.test.ts`, `packages/db/test/commercial-history.test.ts`

**Interfaces:**

- Consome: `app.has_org_role`, `app.is_assigned_staff` (fundação).
- Produz:
  - `app.can_read_pipeline(p_organization uuid, p_client uuid) returns boolean`: `has_org_role(org, {founder, finance})` ou (`has_org_role(org, {project_manager})` e `is_assigned_staff(client)`).
  - `app.can_write_pipeline(p_organization uuid, p_client uuid) returns boolean`: `has_org_role(org, {founder})` ou (`project_manager` e `is_assigned_staff(client)`).
  - Ambas `security definer`, `stable`, `set search_path = ''`, `execute` só para `authenticated`.
  - Gatilho `deals_record_stage_change` (`after insert or update of pipeline_code on deals`, `security definer`): insere em `deal_stage_changes` (`from_code` = antigo ou nulo, `to_code`, `reason` = `nullif(current_setting('app.stage_change_reason', true), '')`, `actor_user_id` = `auth.uid()`).
  - `deal_stage_changes` e `timeline_entries` só de escrita: gatilhos que rejeitam UPDATE, DELETE e TRUNCATE (mesmo padrão de `app.reject_audit_log_change`).
  - Políticas:
    - `contacts`, `deals`, `calls`, `follow_ups`: `select` com `can_read_pipeline`; `insert` e `update` com `can_write_pipeline`.
    - `applications`, `deal_stage_changes`: só `select` com `can_read_pipeline` (escrita pelo sistema e pelo gatilho).
    - `timeline_entries`: `select` com `can_read_pipeline`; `insert` com `can_write_pipeline`.
    - `acquisition_targets`: `select` fundador e financeiro; escrita só fundador.
    - `application_forms`, `commercial_settings`, `message_templates`: só fundador.
    - `calendar_connections`: `select` da própria linha (`user_id = auth.uid()`); sem escrita para utilizadores.
    - `submission_throttle`, `captured_emails`: política que nega tudo (padrão `domain_events_no_user_access`).
  - Concessões por coluna: `deals` atualizável em `title, pipeline_code, next_step, next_step_owner_kind, next_step_owner_user_id, next_step_due_on, estimated_value, currency, lost_reason, archived_at, updated_at`; `clients` ganha `lifecycle, website, revenue_band` na concessão de `update` existente.
  - `createCommercialFixture(sql, world): Promise<{ dealA: string; dealB: string; callA: string; contactA: string }>`: negócios em 0.3 para os clientes A e B do `World`, com contacto e chamada marcada.

- [ ] **Passo 1:** testes em `commercial.test.ts`, com `createFixtureWorld` + `createCommercialFixture` + `asUser`:
  - `founder reads and writes deals of every client`.
  - `manager reads and writes only deals of assigned clients`.
  - `finance reads deals but cannot update them`.
  - `freelancer and client users see no commercial rows`.
  - `founder without mfa sees no deals`.
  - `stage change is recorded with reason and actor` (`set local app.stage_change_reason`, `update deals set pipeline_code`, linha em `deal_stage_changes`).
  - `deal_stage_changes and timeline_entries reject update and delete`.
  - `only one open deal per client` (segundo `insert` em 0.1 falha com `unique_violation`).
  - `calendar connection is visible only to its owner`.
  - `throttle and captured emails are invisible to every user`.
- [ ] **Passo 2:** acrescentar `contacts`, `applications`, `deals`, `deal_stage_changes`, `calls`, `follow_ups`, `timeline_entries` a `clientScopedTables` em `isolation.test.ts`, com sementes em `seedClientScopedRows`.
- [ ] **Passo 3:** `pnpm test:db packages/db/test/rls` → FALHA.
- [ ] **Passo 4:** escrever a migração; `supabase db push`; `pnpm test:db` → PASSA (incluindo `coverage.test.ts`).
- [ ] **Passo 5:** commit `feat(db): enforce commercial access with rls and stage history`.

---

### Task 3: Pipeline — códigos e matriz de transições

**Ficheiros:**

- Criar: `apps/web/src/modules/commercial/pipeline/codes.ts`, `pipeline/transitions.ts`
- Modificar: `packages/i18n/src/messages/pt-PT.json`, `en.json` (`commercial.pipeline.codes`, `commercial.pipeline.stages`, `commercial.pipeline.rules`)
- Teste: `pipeline/codes.test.ts`, `pipeline/transitions.test.ts`

**Interfaces:**

- Produz em `codes.ts`:
  - `PIPELINE_CODES` (tupla dos 34 códigos, igual ao enum); `type PipelineCode`.
  - `type PipelineStage = 'pre_sale' | 'core' | 'orbit' | 'gravity' | 'constellation' | 'off_cycle'`; `PIPELINE_STAGES: ReadonlyArray<{ stage: PipelineStage; codes: readonly PipelineCode[] }>`; `stageOf(code: PipelineCode): PipelineStage`.
  - `pipelineCodeMessageKey(code: PipelineCode): string` → `p0_1`, `p2_10`, `pX_4` (o next-intl usa o ponto como separador).
  - `OPEN_CODES` (todos exceto `X.3` e `X.4`).
- Produz em `transitions.ts`:
  - `type PendingModule = 'diagnosis' | 'documents' | 'billing' | 'retainers'`.
  - `type TransitionRefusal = 'same_code' | 'not_allowed' | 'final_state' | 'reason_required' | 'founder_only' | 'call_required' | 'call_outcome_required' | 'module_pending'`.
  - `type TransitionFacts = { hasScheduledCall: boolean; hasCompletedCallWithOutcome: boolean }`.
  - `type TransitionInput = { from: PipelineCode; to: PipelineCode; previousOpenCode: PipelineCode | null; actor: 'system' | 'founder' | 'staff'; reason: string | null; facts: TransitionFacts }`.
  - `type TransitionDecision = { allowed: true } | { allowed: false; rule: TransitionRefusal; module?: PendingModule }`.
  - `evaluateTransition(input: TransitionInput): TransitionDecision`.
  - `ENABLED_STAGES: ReadonlySet<PipelineStage>` = `pre_sale`, `off_cycle` no 1A; `STAGE_MODULE`: `core → diagnosis`, `orbit → documents`, `gravity → retainers`, `constellation → retainers`.
- Regras (secção 3 do spec), avaliadas por esta ordem: igual → `same_code`; origem `X.3`/`X.4` → `final_state`; origem `X.1`/`X.2` → só para `previousOpenCode`, senão `not_allowed`; destino `X.*` → `X.4` exige motivo; destino numa etapa fora de `ENABLED_STAGES` → `module_pending` com `STAGE_MODULE`; seguinte na etapa ou ligação entre etapas → critérios de `0.2 → 0.3` (`call_required`) e `0.3 → 0.4` (`call_outcome_required`); anterior na mesma etapa → `founder_only` para `staff`, depois `reason_required`; resto → `not_allowed`. `system` conta como fundador.

- [ ] **Passo 1:** testes:
  - `codes.test.ts`: `lists 34 codes in pipeline order`, `maps every code to exactly one stage`, `builds message keys without dots`.
  - `transitions.test.ts`: tabela célula a célula com os 34 × 34 pares e o resultado esperado para `actor: 'founder'` com factos verdadeiros e motivo presente, construída a partir das regras acima numa tabela literal (não derivada da implementação); mais `qualifies 0.1 to 0.2`, `requires a scheduled call for 0.3`, `requires a recorded outcome for 0.4`, `refuses entering core while diagnosis is pending with module diagnosis`, `X.4 requires a reason`, `reopens X.1 to the previous open code only`, `X.3 and X.4 are final`, `staff cannot step back`, `founder steps back with reason`.
- [ ] **Passo 2:** `pnpm test apps/web/src/modules/commercial/pipeline` → FALHA.
- [ ] **Passo 3:** implementar; mensagens de cada código, etapa e regra em pt-PT (nomes do Operations Playbook, secção 3 do spec) e en.
- [ ] **Passo 4:** `pnpm test` → PASSA (incluindo a paridade de mensagens em `packages/i18n/test/messages.test.ts`).
- [ ] **Passo 5:** commit `feat(commercial): add pipeline codes and transition rules`.

---

### Task 4: Serviço do pipeline

**Ficheiros:**

- Criar: `apps/web/src/modules/commercial/pipeline/service.ts`, `apps/web/src/modules/commercial/index.ts`, `server.ts`
- Modificar: `apps/web/src/modules/audit/actions.ts`, `apps/web/src/modules/events/emit.ts`
- Teste: `pipeline/service.db.test.ts`

**Interfaces:**

- Consome: `evaluateTransition` (Task 3); `recordAudit`, `emit`, `requestFlush`, `authorize`, `resolveActor`, `loadAccessContext`, `DbContexts` (fundação).
- Produz:
  - `AUDIT_ACTIONS` + `deal.stage_changed`, `deal.updated`, `application.submitted`, `application.reviewed`, `application.anonymized`, `call.booked`, `call.rescheduled`, `call.cancelled`, `call.outcome_recorded`, `calendar.connected`, `calendar.disconnected`, `commercial_settings.updated`, `application_form.published`, `message_template.saved`, `acquisition_target.converted`, `follow_up.completed`.
  - `DOMAIN_EVENTS` + `commercial.application.submitted`, `commercial.application.reviewed`, `commercial.deal.stage_changed`, `commercial.call.booked`, `commercial.call.rescheduled`, `commercial.call.cancelled`, `commercial.call.completed`, `commercial.calendar.unavailable`.
  - `type StageActor = 'system' | { userId: string; isFounder: boolean }`.
  - `type StageChangeResult = { ok: true; from: PipelineCode; to: PipelineCode } | { ok: false; rule: TransitionRefusal; module?: PendingModule }`.
  - `applyStageChange(tx: DbTransaction, input: { dealId: string; to: PipelineCode; reason: string | null; actor: StageActor }): Promise<StageChangeResult>`: `select … for update` do negócio; factos (chamada `scheduled`; chamada `completed` com `outcome`); `previousOpenCode` = último `to_code` fora de `X.*` em `deal_stage_changes`; `set_config('app.stage_change_reason', reason, true)`; `update deals`; `timeline_entries` (`stage_changed`); `emit('commercial.deal.stage_changed', { dealId, from, to })`; `recordAudit('deal.stage_changed')`.
  - `addTimelineEntry(tx, input: { organizationId; clientId; dealId: string | null; kind: TimelineKind; summary: Record<string, unknown>; itemType: string | null; itemId: string | null }): Promise<void>`.
  - `changeDealStage(claims: VerifiedClaims, input: { dealId: string; to: PipelineCode; reason: string | null }, deps: { contexts: DbContexts }): Promise<StageChangeResult | { ok: false; rule: 'not_found' }>`: `withUserContext`, ator, `authorize(actor, 'write', { type: 'pipeline', clientId })`; recusa ou negócio invisível → `not_found` (SEC-12); depois `requestFlush()`.
  - `updateDealTracking(claims, input: { dealId; nextStep: string | null; nextStepOwnerKind; nextStepOwnerUserId: string | null; nextStepDueOn: string | null; estimatedValue: string | null; currency }, deps): Promise<{ ok: true } | { ok: false; rule: 'not_found' | 'invalid_input' }>` com auditoria `deal.updated`.

- [ ] **Passo 1:** testes com `testDatabase` + `createDbContexts` (padrão de `identity/invitations.db.test.ts`):
  - `applies an allowed transition and records history, timeline, audit and event`.
  - `refuses a disallowed transition without writing anything`.
  - `reopens X.1 to the code before the pause`.
  - `manager cannot move a deal of an unassigned client and gets not_found`.
  - `finance cannot move deals`.
  - `concurrent changes to the same deal are serialised` (duas transações; a segunda vê o código já mudado).
  - `updates tracking fields and audits the change`.
- [ ] **Passo 2:** `pnpm test:db apps/web/src/modules/commercial/pipeline` → FALHA.
- [ ] **Passo 3:** implementar.
- [ ] **Passo 4:** `pnpm test:db` e `pnpm test` → PASSA.
- [ ] **Passo 5:** commit `feat(commercial): add pipeline stage service`.

---

### Task 5: Formulário e pontuação da candidatura

**Ficheiros:**

- Criar: `apps/web/src/modules/commercial/applications/form-definition.ts`, `default-form.ts`, `scoring.ts`
- Teste: `applications/form-definition.test.ts`, `applications/scoring.test.ts`

**Interfaces:**

- Produz:
  - `type LocalizedText = { 'pt-PT': string; en: string }`.
  - `applicationFormDefinitionSchema` (Zod) e `type ApplicationFormDefinition = { questions: FormQuestion[]; thresholds: { a: number; b: number } }`, com `FormQuestion = { id: string; kind: 'contact' | 'company' | 'single_choice' | 'long_text'; label: LocalizedText; help?: LocalizedText; required: boolean; showIf?: { questionId: string; optionId: string }; options?: Array<{ id: string; label: LocalizedText; points: number | null; knockout: boolean }> }`. O esquema recusa ids repetidos, `showIf` para perguntas inexistentes, `single_choice` sem opções e limites com `a <= b`.
  - `maxScore(definition): number`.
  - `DEFAULT_APPLICATION_FORM: ApplicationFormDefinition` com os ids `contact`, `company`, `role` (`ceo_founder_partner` 3, `director` 2, `other` 0), `decision_maker_present` (`showIf role=other`; `yes` 0, `no` eliminatório), `sector` (`consulting` 2, `energy` 2, `technology` 2, `other` 0), `revenue` (`up_to_1m` 0, `1m_5m` 1, `5m_20m` 2, `over_20m` 3), `priority` (`decision_maker_meetings`, `brand_and_site`, `integrate_automate`, `other`, sem pontos), `investment` (`under_10k` eliminatório, `10k_25k` 1, `25k_50k` 2, `over_50k` 3), `timing` (`this_quarter` 2, `six_months` 1, `exploring` 0), `cost_of_inaction` (`long_text`); limites `{ a: 9, b: 6 }`; textos pt-PT e en da secção 3 do spec.
  - `type ApplicationAnswers = { contact: { fullName: string; email: string }; company: { name: string; website: string | null }; choices: Record<string, string>; texts: Record<string, string> }`.
  - `type ScoreResult = { score: number; path: ApplicationPath; knockouts: string[] }`; `scoreApplication(definition, answers): ScoreResult`. Respostas a perguntas escondidas por `showIf` são ignoradas.
  - `answersSchemaFor(definition): z.ZodType<ApplicationAnswers>` (obrigatórias, opções válidas, textos até 2000 caracteres, email válido).

- [ ] **Passo 1:** testes:
  - `default form scores a maximum of 13`.
  - `maximum answers route to path a`; `score 9 without knockouts routes to a`; `score 8 routes to b`; `score 6 routes to b`; `score 5 routes to c`.
  - `investment under 10k routes to c regardless of score` com `knockouts` `['investment']`.
  - `absent decision maker routes to c` (`role=other`, `decision_maker_present=no`).
  - `ignores the decision maker question when role is not other`.
  - `rejects unknown option ids and missing required answers` (`answersSchemaFor`).
  - `definition schema rejects duplicate ids, dangling showIf and inverted thresholds`.
- [ ] **Passo 2:** `pnpm test apps/web/src/modules/commercial/applications` → FALHA.
- [ ] **Passo 3:** implementar.
- [ ] **Passo 4:** → PASSA.
- [ ] **Passo 5:** commit `feat(commercial): add application form and scoring`.

---

### Task 6: Proteção pública

**Ficheiros:**

- Criar: `apps/web/src/platform/signed-token.ts`, `apps/web/src/modules/commercial/protection/throttle.ts`, `bot-checks.ts`, `personal-email.ts`
- Modificar: `apps/web/src/platform/env.ts`, `.env.example`
- Teste: `platform/signed-token.test.ts`, `protection/bot-checks.test.ts`, `protection/personal-email.test.ts`, `protection/throttle.db.test.ts`

**Interfaces:**

- Produz:
  - `serverEnv()` + `PUBLIC_LINK_SECRET` (≥ 32), `PUBLIC_ORGANIZATION_SLUG`, `APP_BASE_URL` (URL).
  - `signToken(purpose: TokenPurpose, data: Record<string, string>, secret: string, expiresAt: Date): string` e `verifyToken(token: string, purpose: TokenPurpose, secret: string, now: Date): Record<string, string> | null`; `type TokenPurpose = 'apply_thanks' | 'booking_link'`. Formato `base64url(json).base64url(hmac-sha256)`; comparação em tempo constante; o propósito entra no conteúdo assinado.
  - `hashForThrottle(value: string, secret: string): string` (HMAC-SHA256 com o rótulo `throttle:`).
  - `consumeThrottle(tx: DbTransaction, input: { organizationId: string; kind: ThrottleKind; key: string; limit: number; windowSeconds: number; now: Date }): Promise<boolean>`: `insert … on conflict (kind, key_hash, window_start) do update set count = count + 1 returning count`; janela alinhada a `floor(epoch / windowSeconds)`.
  - `THROTTLE_LIMITS = { applicationIp: { limit: 5, windowSeconds: 3600 }, applicationEmail: { limit: 3, windowSeconds: 86400 }, bookingIp: { limit: 10, windowSeconds: 3600 } }`.
  - `type BotVerdict = 'human' | 'honeypot' | 'too_fast'`; `assessSubmission(input: { honeypot: string; startedAt: number; now: Date }): BotVerdict` (mínimo 3000 ms; `startedAt` no futuro conta como `too_fast`).
  - `isPersonalEmail(email: string): boolean` com a lista `gmail.com, googlemail.com, hotmail.com, outlook.com, live.com, msn.com, yahoo.com, icloud.com, me.com, aol.com, proton.me, protonmail.com, gmx.com, sapo.pt, mail.pt, clix.pt`.

- [ ] **Passo 1:** testes:
  - `signed-token`: `round-trips data before expiry`, `rejects an expired token`, `rejects a token signed for another purpose`, `rejects a tampered payload or signature`.
  - `bot-checks`: `flags a filled honeypot`, `flags submissions under 3 seconds`, `flags a start time in the future`, `accepts a normal submission`.
  - `personal-email`: `detects personal providers case-insensitively`, `accepts company domains`.
  - `throttle.db`: `allows up to the limit within a window`, `blocks above the limit`, `resets in the next window`, `stores only hashed keys`.
- [ ] **Passo 2:** → FALHA.
- [ ] **Passo 3:** implementar; acrescentar as variáveis a `.env.example` e ao `.env.local` do dev (valores gerados com `openssl rand -base64 48`; nunca impressos).
- [ ] **Passo 4:** `pnpm test` e `pnpm test:db` → PASSA.
- [ ] **Passo 5:** commit `feat(commercial): add public link tokens, throttling and bot checks`.

---

### Task 7: Submissão da candidatura

**Ficheiros:**

- Criar: `apps/web/src/modules/commercial/applications/submit.ts`, `applications/forms.ts`
- Modificar: `apps/web/src/modules/commercial/server.ts`, `index.ts`
- Teste: `applications/submit.db.test.ts`

**Interfaces:**

- Consome: Tasks 4 (`applyStageChange`, `addTimelineEntry`), 5 (`scoreApplication`, `answersSchemaFor`), 6 (`assessSubmission`, `consumeThrottle`, `hashForThrottle`).
- Produz:
  - `getActiveForm(tx, organizationId): Promise<{ id: string; version: number; definition: ApplicationFormDefinition }>`: devolve a versão ativa; se não existir, grava `DEFAULT_APPLICATION_FORM` como versão 1 e devolve-a.
  - `type SubmitApplicationInput = { answers: unknown; source: { utm: Partial<Record<'source' | 'medium' | 'campaign' | 'term' | 'content', string>>; landingPage: string | null; referrer: string | null; timeZone: string | null }; consentTextVersion: string; consentAccepted: boolean; honeypot: string; startedAt: number; ipAddress: string | null; locale: Locale }`.
  - `type SubmitResult = { status: 'accepted'; applicationId: string; dealId: string; path: ApplicationPath } | { status: 'discarded' } | { status: 'throttled' } | { status: 'invalid'; issues: Array<{ questionId: string; code: string }> }`.
  - `submitApplication(input, deps: { contexts: Pick<DbContexts, 'withSystemContext'>; organizationSlug: string; linkSecret: string; now: () => Date }): Promise<SubmitResult>`.
- Comportamento, numa só transação em contexto de sistema:
  1. `assessSubmission` ≠ `human` → `discarded` sem escrita.
  2. Consentimento ausente ou respostas inválidas → `invalid`.
  3. Email normalizado (`trim`, minúsculas); `consumeThrottle` por IP e por email → `throttled`.
  4. Contacto por email normalizado → o seu cliente; senão cria cliente `prospect` (nome da empresa, website, setor e faixa de faturação a partir das respostas) e contacto `decision_maker` quando `role ≠ other`, `operational` caso contrário. Contacto existente: atualiza nome e telefone.
  5. Negócio aberto do cliente → reutiliza; senão cria em `0.1` com origem `application` (o gatilho grava o histórico).
  6. Grava a candidatura com a versão do formulário, pontuação, caminho, eliminatórios, origem, `consent_at = now()` e `consent_text_version`.
  7. Negócio novo: `applyStageChange` para `0.2` (A, B) ou `X.4` com motivo `path_c` (C). Negócio reutilizado: o código não muda.
  8. `timeline_entries` (`application_submitted`), `recordAudit('application.submitted')`, `emit('commercial.application.submitted', { applicationId, dealId, path, isNewDeal })`.
  9. Depois do commit, `requestFlush()`.

- [ ] **Passo 1:** testes com uma organização de teste e `PUBLIC_ORGANIZATION_SLUG` dessa organização:
  - `path a creates prospect, contact, application and deal at 0.2`.
  - `path c closes the new deal at X.4 with reason path_c`.
  - `stores form version, score, knockouts, source and consent timestamp`.
  - `normalises email before matching the contact`.
  - `repeat application attaches to the open deal without changing its stage`.
  - `honeypot and fast submissions are discarded without writes`.
  - `fourth application from the same email in a day is throttled`.
  - `invalid answers return issues without writes`.
  - `creates the default form version on first use`.
- [ ] **Passo 2:** → FALHA.
- [ ] **Passo 3:** implementar.
- [ ] **Passo 4:** `pnpm test:db apps/web/src/modules/commercial/applications` → PASSA.
- [ ] **Passo 5:** commit `feat(commercial): submit and route applications`.

---

### Task 8: Módulo de email

**Ficheiros:**

- Criar: `apps/web/src/modules/email/port.ts`, `smtp.ts`, `capture.ts`, `templates.ts`, `quiet-hours.ts`, `server.ts`, `index.ts`
- Modificar: `apps/web/src/platform/env.ts`, `apps/web/package.json` (`nodemailer`, `@types/nodemailer`), `packages/i18n/src/messages/*.json` (`email.*`)
- Teste: `email/templates.test.ts`, `email/quiet-hours.test.ts`, `email/capture.db.test.ts`, `email/smtp.test.ts`

**Interfaces:**

- Produz:
  - `type EmailTemplateKey = 'lead.booking_link' | 'lead.booking_confirmed' | 'lead.call_reminder' | 'lead.booking_cancelled' | 'founder.application_received' | 'founder.queue_b_pending' | 'founder.call_outcome_missing' | 'founder.integration_unavailable' | 'founder.automation_failed'`.
  - `type EmailParams<K>`: parâmetros tipados por modelo (por exemplo `lead.booking_link`: `{ firstName: string; agencyName: string; bookingUrl: string; expiresOn: string }`; `lead.booking_confirmed`: `{ firstName; agencyName; startsAtLabel; meetUrl: string | null; manageUrl }`).
  - `renderEmail<K>(key: K, locale: Locale, params: EmailParams<K>): { subject: string; html: string; text: string }`: textos de `email.<key>` nos catálogos; HTML com os tokens de cor do separador 05 em linha, um único botão de ação, todos os parâmetros escapados.
  - `type OutgoingEmail = { to: string; template: EmailTemplateKey; subject: string; html: string; text: string; fromName: string }`; `type EmailPort = { send(message: OutgoingEmail): Promise<void> }`.
  - `createSmtpEmailPort(config: { host: string; port: number; user: string; password: string }): EmailPort` (`nodemailer`, `secure: port === 465`, remetente `"<fromName>" <user>`).
  - `createCaptureEmailPort(contexts: Pick<DbContexts, 'withSystemContext'>): EmailPort` (grava em `captured_emails`).
  - `emailPort(): EmailPort` conforme `EMAIL_TRANSPORT`; `serverEnv()` + `EMAIL_TRANSPORT`, `SMTP_*` (validação condicional com `superRefine`).
  - `senderName(founderFullName: string, agencyName: string): string` → primeiro nome + `, ` + agência ("Vladimir, Aurion").
  - `nextAllowedSendTime(now: Date, timeZone: string): Date`: `now` entre 08:00 e 20:00 locais; senão as 08:00 locais seguintes.

- [ ] **Passo 1:** testes:
  - `templates`: `renders every template in both locales without missing keys`, `escapes html in parameters`, `includes exactly one action link`, `plain text contains the action url`.
  - `quiet-hours`: `sends immediately at 14:00 Lisbon`, `defers 21:30 Lisbon to 08:00 next day`, `defers 06:00 Luanda to 08:00 Luanda`, `handles the October DST change in Lisbon`.
  - `capture.db`: `stores the rendered message`.
  - `smtp`: `maps the message to nodemailer options with the sender name` (transporte de `nodemailer` substituído por um duplo).
- [ ] **Passo 2:** → FALHA.
- [ ] **Passo 3:** implementar; copy das mensagens pela voz do separador 07 (direta, curta, sem pontos de exclamação).
- [ ] **Passo 4:** → PASSA.
- [ ] **Passo 5:** commit `feat(email): add application email service with smtp and capture transports`.

---

### Task 9: Candidatura pública

**Ficheiros:**

- Criar: `apps/web/src/app/[locale]/(public)/layout.tsx`, `(public)/apply/page.tsx`, `apply/application-form.tsx`, `apply/actions.ts`, `apply/thanks/page.tsx`, `apps/web/src/components/public/public-frame.tsx`
- Modificar: `apps/web/src/platform/security-headers.ts`, `apps/web/src/proxy.ts`, `packages/i18n/src/messages/*.json` (`publicApply.*`), `packages/ui` (`radio-group`, `checkbox`, `textarea` via shadcn, imports corrigidos para `@agency-os/ui/lib/utils`)
- Teste: `platform/security-headers.test.ts` (+), `apply/application-form.test.tsx`

**Interfaces:**

- Consome: `submitApplication` (Task 7), `isPersonalEmail` (Task 6), `getActiveForm` (Task 7), `signToken` (Task 6).
- Produz:
  - `buildContentSecurityPolicy(nonce, options)` aceita `frameAncestors?: string[]`; sem valores mantém `'none'`. `buildSecurityHeaders` omite `X-Frame-Options` quando há `frameAncestors`.
  - `proxy.ts`: para caminhos `/apply` e `/{locale}/apply` (e subcaminhos), `frameAncestors` = `APPLY_EMBED_ORIGINS` separados por vírgula, filtrados por `new URL(...).origin`.
  - `submitApplicationAction(formData: FormData): Promise<ApplyActionState>` em `apply/actions.ts`: lê IP com `clientIpAddress`, chama `submitApplication`; `accepted` → `redirect` para `/apply/thanks?ref=<signToken('apply_thanks', { applicationId, path }, …, +2 h)>` (com `embed=1` preservado); `discarded` → obrigado genérico; `throttled` e `invalid` → estado com mensagem.
  - Página de obrigado: token válido → versão A, B ou C (`publicApply.thanks.*`); inválido → genérica. A versão A deixa o lugar da agenda para a Task 12 (componente `BookingPanel` renderizado só quando existir; nesta tarefa mostra a mensagem de B).
- Formulário: uma pergunta por ecrã, barra de progresso ("Pergunta 3 de 9"), Voltar e Seguinte, Enter avança, foco no título de cada pergunta, rascunho em `sessionStorage` (`apply-draft-v<versão>`), campos ocultos para `utm_*`, página de entrada (`document.referrer` e `location.pathname` no primeiro carregamento), fuso (`Intl.DateTimeFormat().resolvedOptions().timeZone`) e `startedAt`; honeypot `company_fax` fora do ecrã com `tabIndex={-1}` e `aria-hidden`; aviso de email pessoal; consentimento obrigatório com ligação para a política (`publicApply.consent`); `?embed=1` esconde o cabeçalho.

- [ ] **Passo 1:** testes:
  - `security-headers`: `allows configured embed origins on apply routes`, `keeps frame-ancestors none elsewhere`, `drops X-Frame-Options only when embedding is allowed`.
  - `application-form` (React Testing Library): `shows one question at a time with progress`, `shows the decision maker question only for role other`, `warns on personal email without blocking`, `restores the draft from sessionStorage`, `requires consent before submitting`.
- [ ] **Passo 2:** → FALHA.
- [ ] **Passo 3:** implementar a moldura pública (símbolo da marca, alternância de idioma e tema, sem barra lateral), o formulário e o obrigado.
- [ ] **Passo 4:** `pnpm test`, `pnpm lint`, `pnpm typecheck` → PASSA; `pnpm dev` e verificação manual a 360 px e 1440 px, claro e escuro.
- [ ] **Passo 5:** commit `feat(commercial): add public application form`.

---

### Task 10: Horários livres

**Ficheiros:**

- Modificar: `apps/web/package.json` (`date-fns`, `@date-fns/tz`)
- Criar: `apps/web/src/modules/commercial/booking/slots.ts`
- Teste: `booking/slots.test.ts`

**Interfaces:**

- Produz:
  - `type Weekday = 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun'`; `type BookingRules = { timeZone: string; weeklyHours: Record<Weekday, Array<{ start: string; end: string }>>; durationMinutes: number; bufferMinutes: number; minimumNoticeHours: number; horizonDays: number; stepMinutes: number }`; `DEFAULT_BOOKING_RULES` (valores do spec, `stepMinutes: 15`, segunda a sexta `10:00`–`18:00`).
  - `type Interval = { start: Date; end: Date }`.
  - `computeAvailableSlots(input: { now: Date; rules: BookingRules; busy: Interval[] }): Date[]`: candidatos a cada `stepMinutes` dentro de cada janela local; o fim da chamada cabe na janela; `[início − intervalo, fim + intervalo)` não cruza nenhum `busy`; início ≥ `now + antecedência`; dia local ≤ hoje + horizonte. Resultado em UTC, ordenado.
  - `resolveTimeZone(candidate: string | null | undefined, fallback: string): string` (valida com `Intl.supportedValuesOf('timeZone')`).
  - `groupSlotsByDay(slots: Date[], timeZone: string): Array<{ day: string; slots: Date[] }>`.

- [ ] **Passo 1:** testes:
  - `offers slots only inside weekly hours` (último início às 17:15 para 45 min).
  - `respects minimum notice and horizon`.
  - `removes slots that overlap busy intervals including the buffer`.
  - `handles the October DST change in Lisbon` (sexta 2026-10-23 10:00 Lisboa = 09:00 UTC; segunda 2026-10-26 10:00 Lisboa = 10:00 UTC).
  - `groups slots by day in Africa/Luanda`.
  - `invalid visitor time zone falls back to the booking time zone`.
- [ ] **Passo 2:** → FALHA.
- [ ] **Passo 3:** implementar com `TZDate` de `@date-fns/tz`.
- [ ] **Passo 4:** → PASSA.
- [ ] **Passo 5:** commit `feat(commercial): compute available call slots`.

---

### Task 11: Calendário Google e ecrã Integrações

**Ficheiros:**

- Criar: migração personalizada `supabase/migrations/<timestamp>_calendar_vault.sql`
- Criar: `apps/web/src/modules/commercial/calendar/port.ts`, `google.ts`, `google-oauth.ts`, `fake.ts`, `connections.ts`
- Criar: `apps/web/src/app/[locale]/(workspace)/settings/integrations/page.tsx`, `actions.ts`, `apps/web/src/app/api/integrations/google/callback/route.ts`
- Modificar: `apps/web/src/platform/env.ts`, `packages/i18n/src/messages/*.json` (`settings.integrations.*`)
- Teste: `calendar/google.test.ts`, `calendar/google-oauth.test.ts`, `calendar/connections.db.test.ts`

**Interfaces:**

- Consome: `requireRecentMfa` (identidade), `recordAudit`, `emit`.
- Produz:
  - SQL: `app.store_calendar_secret(p_connection uuid, p_secret text) returns void`, `app.read_calendar_secret(p_connection uuid) returns text`, `app.delete_calendar_secret(p_connection uuid) returns void`, sobre `vault.create_secret`, `vault.update_secret`, `vault.decrypted_secrets`; `security definer`, `set search_path = ''`, `execute` revogado de `public`, `anon`, `authenticated`, `service_role` (só o contexto de sistema).
  - `type CalendarEventInput = { requestId: string; start: Date; end: Date; summary: string; description: string; attendee: { email: string; name: string } }`.
  - `type CalendarPort = { freeBusy(range: Interval): Promise<Interval[]>; createEvent(input: CalendarEventInput): Promise<{ eventId: string; meetUrl: string | null }>; updateEvent(eventId: string, input: CalendarEventInput): Promise<void>; deleteEvent(eventId: string): Promise<void> }`.
  - `class CalendarUnavailableError extends Error` com `reason: 'not_connected' | 'revoked' | 'provider_error'`.
  - `createGoogleCalendarPort(config: { calendarId: string; accessToken: () => Promise<string>; fetch?: typeof fetch }): CalendarPort`: `POST /calendar/v3/freeBusy`; `POST /calendars/{id}/events?conferenceDataVersion=1&sendUpdates=all` com `conferenceData.createRequest.requestId = requestId` e `conferenceSolutionKey.type = 'hangoutsMeet'`; `PATCH` e `DELETE` com `sendUpdates=all`; respostas 401/403 → `CalendarUnavailableError('revoked')`, 5xx e rede → `provider_error`; timeout de 8 s.
  - `createFakeCalendarPort(): CalendarPort`: sem ocupações; `eventId = fake-<requestId>`; `meetUrl` nulo.
  - `google-oauth.ts`: `GOOGLE_SCOPES = ['openid', 'email', 'https://www.googleapis.com/auth/calendar.events', 'https://www.googleapis.com/auth/calendar.freebusy']`; `buildAuthorizationUrl({ clientId, redirectUri, state, codeChallenge }): string` (`access_type=offline`, `prompt=consent`, `code_challenge_method=S256`); `exchangeCode({ code, codeVerifier, redirectUri, clientId, clientSecret, fetch? }): Promise<{ refreshToken: string; email: string }>` (email do `id_token` recebido diretamente do endpoint de tokens); `refreshAccessToken({ refreshToken, clientId, clientSecret, fetch? }): Promise<{ accessToken: string; expiresAt: Date }>` (`invalid_grant` → `CalendarUnavailableError('revoked')`); `revokeToken(token, fetch?)`.
  - `connections.ts`: `saveGoogleConnection(claims, input: { refreshToken: string; email: string }, deps)`, `disconnectGoogle(claims, deps)`, `getHostCalendar(organizationId, deps): Promise<{ port: CalendarPort; hostUserId: string } | null>` (lê `commercial_settings.host_user_id`, a ligação ativa e o segredo; cache do token de acesso em memória até 60 s antes de expirar; `CALENDAR_PROVIDER=fake` devolve o falso), `markConnectionRevoked(connectionId, deps)` (estado `revoked` + `emit('commercial.calendar.unavailable')`).
  - Ecrã `/settings/integrations` (só fundador): estado (por ligar, ligado como `<email>`, revogado), "Ligar Google Calendar" e "Desligar". A ação `startGoogleConnection` exige MFA recente, gera `state` e `code_verifier` (32 bytes), guarda-os num cookie `httpOnly` assinado com `signToken` (10 min) e redireciona para a Google. O callback valida `state`, troca o código, grava a ligação, define `host_user_id` se estiver vazio, audita `calendar.connected` e volta ao ecrã.

- [ ] **Passo 1:** testes:
  - `google`: `requests free busy for the configured calendar`, `creates an event with a Meet request and the lead as attendee`, `maps 401 to revoked and 503 to provider_error`, `aborts after 8 seconds`.
  - `google-oauth`: `builds the authorization url with pkce and offline access`, `exchanges the code and reads the email from the id token`, `invalid_grant marks the connection revoked` (através de `refreshAccessToken` + `markConnectionRevoked`).
  - `connections.db`: `stores the refresh token in the vault and never in the table`, `authenticated users cannot execute the vault functions`, `disconnect deletes the secret and marks the connection revoked`.
- [ ] **Passo 2:** → FALHA.
- [ ] **Passo 3:** implementar; `supabase db push`.
- [ ] **Passo 4:** `pnpm test`, `pnpm test:db` → PASSA.
- [ ] **Passo 5:** commit `feat(commercial): connect google calendar with vault-stored tokens`.

---

### Task 12: Marcações

**Ficheiros:**

- Criar: `apps/web/src/modules/commercial/booking/service.ts`, `booking/links.ts`
- Criar: `apps/web/src/components/public/booking-panel.tsx`, `apps/web/src/app/[locale]/(public)/apply/book/[token]/page.tsx`, `apply/booking/[token]/page.tsx`, `apply/booking-actions.ts`
- Modificar: `apply/thanks/page.tsx` (versão A com `BookingPanel`)
- Teste: `booking/service.db.test.ts`, `components/public/booking-panel.test.tsx`

**Interfaces:**

- Consome: Tasks 4, 6, 10, 11.
- Produz:
  - `links.ts`: `bookingLinkToken(dealId, secret, now): string` (`booking_link`, 14 dias); `manageUrl(token): string` e `bookingUrl(token): string` a partir de `APP_BASE_URL`; `newManageToken(): { token: string; hash: string }` (32 bytes aleatórios, `sha256`).
  - `type BookingAccess = { dealId: string; organizationId: string }`; `resolveBookingAccess(source: { kind: 'thanks'; token: string } | { kind: 'link'; token: string } | { kind: 'manage'; token: string }, deps): Promise<BookingAccess & { callId: string | null } | null>`.
  - `listSlots(access, deps): Promise<{ status: 'available'; slots: Date[]; rules: BookingRules } | { status: 'unavailable' }>`: negócio em `0.2` sem chamada marcada (ou acesso `manage` a uma chamada própria); ocupações = Google + chamadas `scheduled` do anfitrião; sem ligação → `unavailable` + `emit('commercial.calendar.unavailable')`.
  - `bookCall(access, input: { start: Date; leadTimeZone: string; ipAddress: string | null }, deps): Promise<{ status: 'booked'; callId: string; startsAt: Date; meetUrl: string | null } | { status: 'slot_taken' } | { status: 'unavailable' } | { status: 'throttled' }>`. Transação: `pg_advisory_xact_lock(hashtext('booking:' || host_user_id))`; recalcula os horários (`computeAvailableSlots`) e exige `start` na lista; grava `calls` (`scheduled`, `sync_status = pending`); `applyStageChange(0.3, actor 'system')`; linha temporal `call_booked`; auditoria; `emit('commercial.call.booked', { callId, startsAt })`. Depois do commit: `createEvent` com `requestId = callId`; sucesso → `google_event_id`, `meet_url`, `synced`; falha → fica `pending` (a Task 13 repete) e, se `revoked`, `markConnectionRevoked`. `requestFlush()`.
  - `rescheduleCall(manageToken, input: { start: Date; leadTimeZone: string }, deps)` e `cancelCall(manageToken, deps)`: recusam a menos de 2 h do início (`too_late`); remarcar atualiza a chamada e o evento (`commercial.call.rescheduled`); cancelar marca `cancelled`, apaga o evento, `applyStageChange(0.2, actor 'system', reason 'lead_cancelled')` e emite `commercial.call.cancelled`. Depois de cancelar, a página de gestão volta a mostrar horários para o mesmo negócio.
  - `BookingPanel` (cliente): dias e horários no fuso do visitante com seletor de fuso, confirmação com o resumo, estados "a carregar", "horário já ocupado" (lista atualizada), "marcação confirmada" (data, hora, Meet quando existir, "o link para gerir a marcação segue por email") e "indisponível" (mensagem de B).

- [ ] **Passo 1:** testes:
  - `books a free slot, moves the deal to 0.3 and creates the calendar event`.
  - `concurrent bookings for the same slot book only one`.
  - `refuses a slot that is no longer available`.
  - `calendar failure after commit keeps the call pending`.
  - `without a calendar connection slots are unavailable and an event is emitted`.
  - `booking link stops working once the deal leaves 0.2`.
  - `manage link refuses changes less than 2 hours before the call`.
  - `cancel returns the deal to 0.2 and frees the slot`.
  - `booking-panel`: `renders slots in the visitor time zone`, `shows slot taken and refreshes the list`.
- [ ] **Passo 2:** → FALHA.
- [ ] **Passo 3:** implementar.
- [ ] **Passo 4:** `pnpm test`, `pnpm test:db` → PASSA; verificação manual no dev com `CALENDAR_PROVIDER=fake`.
- [ ] **Passo 5:** commit `feat(commercial): book, reschedule and cancel discovery calls`.

---

### Task 13: Automações

**Ficheiros:**

- Criar: `apps/web/src/modules/commercial/automations.ts`, `follow-ups/sweep.ts`, `follow-ups/render.ts`, `applications/anonymize.ts`, `booking/notifications.ts`
- Modificar: `apps/web/src/app/api/inngest/route.ts`, `apps/web/src/modules/events/inngest.ts` (opções comuns de repetição e falha)
- Teste: `follow-ups/sweep.db.test.ts`, `follow-ups/render.test.ts`, `applications/anonymize.db.test.ts`, `booking/notifications.db.test.ts`

**Interfaces:**

- Consome: Tasks 4, 8, 11, 12.
- Produz serviços (testados) e funções Inngest (finas, só compõem serviços):
  - `notifications.ts`: `sendBookingLinkEmail(dealId, deps)`; `sendCallConfirmation(callId, deps)` (gera um novo token de gestão, grava o hash e envia no mesmo passo; o token nunca é devolvido); `sendCallReminder(callId, expectedStartsAt: Date, deps): Promise<'sent' | 'skipped'>` (salta se a chamada não estiver `scheduled` ou tiver mudado de hora); `syncCallEvent(callId, deps)` (cria ou atualiza o evento quando `pending`); `alertFounder(organizationId, template, params, deps)` (todos os fundadores ativos da organização).
  - `sweep.ts`: `FOLLOW_UP_DAYS = [3, 7, 14, 30]`; `createDueFollowUps(now: Date, deps): Promise<number>`: negócios em `0.4` ou cuja última chamada `completed` tem `outcome = follow_up`, com a última entrada da linha temporal (excluindo `follow_up_created` e `follow_up_completed`) há exatamente 3, 7, 14 ou 30 dias locais; cria `follow_ups` (`on conflict do nothing`) com a mensagem de `renderFollowUpMessage`.
  - `render.ts`: `renderFollowUpMessage(template: string, values: { firstName: string; companyName: string; callDate: string }): string` (marcadores `{firstName}`, `{companyName}`, `{callDate}`; marcadores desconhecidos ficam como estão). Modelos por defeito para os quatro dias em pt-PT e en, criados por `ensureDefaultTemplates(tx, organizationId)` na primeira utilização.
  - `anonymize.ts`: `anonymizeExpiredApplications(now: Date, deps): Promise<number>`: candidaturas com caminho ou decisão `c`, cliente `prospect` sem negócio fora de `X.4`, mais antigas do que `commercial_settings.anonymize_after_months`; apaga respostas e origem (mantém pontuação, caminho e data), contacto com nome "—" e email nulo, `anonymized_at`; auditoria `application.anonymized` sem dados pessoais.
  - `automations.ts`, com `retries: 5` e `onFailure` (Sentry + `founder.automation_failed`):
    - `onApplicationSubmitted` (`commercial.application.submitted`): A → `sendBookingLinkEmail` + alerta; B → alerta, `step.sleep('24h')`, alerta `founder.queue_b_pending` se continuar sem decisão.
    - `onApplicationReviewed` (`commercial.application.reviewed`, decisão `a`): `step.sleepUntil(nextAllowedSendTime)` no fuso do lead (origem da candidatura; senão o das definições) e `sendBookingLinkEmail`.
    - `onCallBooked` (`commercial.call.booked` e `commercial.call.rescheduled`, `cancelOn` para `commercial.call.rescheduled` e `commercial.call.cancelled` com o mesmo `callId`): `syncCallEvent`, `sendCallConfirmation`, lembretes às −24 h e −1 h, e às +2 h do fim `founder.call_outcome_missing` se não houver resultado.
    - `onCallCancelled`: apaga o evento e envia `lead.booking_cancelled`.
    - `onCalendarUnavailable`: `rateLimit` de 1 por organização por 24 h; `founder.integration_unavailable`.
    - `followUpSweep`: `cron: 'TZ=Europe/Lisbon 0 8 * * *'`.
    - `anonymizationSweep`: `cron: 'TZ=Europe/Lisbon 30 3 * * *'`.
  - `COMMERCIAL_FUNCTIONS` exportado e registado em `api/inngest/route.ts`.

- [ ] **Passo 1:** testes:
  - `sweep`: `creates follow ups on days 3, 7, 14 and 30 only`, `ignores follow up entries when measuring inactivity`, `is idempotent for the same day`, `skips deals that moved past 0.4 or closed`.
  - `render`: `fills known placeholders and keeps unknown ones`.
  - `anonymize`: `anonymizes path c applications after the retention period`, `keeps applications of clients with an open deal`, `keeps score, path and date`.
  - `notifications`: `reminder is skipped when the call was rescheduled`, `confirmation rotates the manage token`, `alerts every active founder`, `sync retries a pending call and stores the Meet link`.
- [ ] **Passo 2:** → FALHA.
- [ ] **Passo 3:** implementar.
- [ ] **Passo 4:** `pnpm test`, `pnpm test:db` → PASSA; `npx inngest-cli@latest dev` contra `pnpm dev` para ver as funções registadas.
- [ ] **Passo 5:** commit `feat(commercial): add commercial automations`.

---

### Task 14: Navegação do estúdio e ecrã Pipeline

**Ficheiros:**

- Modificar: `apps/web/src/components/shell/navigation.ts` (+ teste), `app-sidebar.tsx`, `packages/i18n/src/messages/*.json` (`shell.studioNav.*`, `commercial.board.*`)
- Criar: `apps/web/src/modules/commercial/queries.ts`, `apps/web/src/app/[locale]/(workspace)/pipeline/page.tsx`, `pipeline/board.tsx`, `pipeline/deal-list.tsx`, `pipeline/move-menu.tsx`, `pipeline/reason-dialog.tsx`, `pipeline/actions.ts`
- Modificar: `apps/web/package.json` (`@dnd-kit/core`), `packages/ui` (`table`, `select`, `alert-dialog`)
- Teste: `navigation.test.ts` (+), `modules/commercial/queries.db.test.ts`, `pipeline/board.test.tsx`

**Interfaces:**

- Consome: `changeDealStage` (Task 4), `PIPELINE_STAGES`, `evaluateTransition` (Task 3).
- Produz:
  - `buildNavigation({ level: 'studio', permissions: { pipeline: boolean } })`: itens Início, Pipeline, Candidaturas, Angariação (estes três só com `pipeline`); ícones `kanban`, `inbox`, `target`. A assinatura muda; `AppShell` calcula `pipeline` com `authorize(actor, 'read', { type: 'pipeline' }, ctx)` sem `clientId` (verdadeiro para fundador, gestor e financeiro).
  - `type PipelineCard = { dealId: string; clientName: string; code: PipelineCode; estimatedValue: string | null; currency: Currency; nextStep: string | null; ownerLabel: string | null; dueOn: string | null; overdue: boolean }`.
  - `listPipelineDeals(tx, filters: { stage?: PipelineStage; ownerUserId?: string; overdueOnly?: boolean; search?: string }): Promise<PipelineCard[]>` (contexto de utilizador; RLS filtra).
  - `moveDealAction(input: { dealId: string; to: PipelineCode; reason: string | null }): Promise<{ ok: true } | { ok: false; message: string }>` (mensagem traduzida da regra; `module_pending` inclui o módulo).
  - A sala `/c/[clientId]` responde 404 para clientes `prospect` (verificação em `c/[clientId]/layout.tsx`, a partir de `clients.lifecycle`); os prospetos só existem no CRM.
  - Quadro: colunas por código dentro de cada etapa (etapas recolhíveis, contador por coluna), faixa X, cartões arrastáveis com `@dnd-kit/core` (sensores de ponteiro e de teclado); atualização otimista revertida na recusa com `toast` da regra; motivo pedido por diálogo para `X.4` e para recuar; "Mover para…" no menu de cada cartão. Vista Lista (`?view=list`) com tabela, filtros em chips e pesquisa. Estados: vazio com ação, esqueleto, erro com repetir, sem resultados.

- [ ] **Passo 1:** testes:
  - `navigation`: `studio shows commercial items only with pipeline permission`.
  - `queries.db`: `lists only deals visible to the actor`, `flags overdue next steps`, `filters by stage, owner and search`.
  - `board`: `reverts the card and shows the rule when the move is refused`, `asks for a reason before moving to X.4`, `moves with the keyboard menu`.
- [ ] **Passo 2:** → FALHA.
- [ ] **Passo 3:** implementar.
- [ ] **Passo 4:** `pnpm test`, `pnpm test:db`, `pnpm lint`, `pnpm typecheck` → PASSA; verificação manual claro e escuro.
- [ ] **Passo 5:** commit `feat(commercial): add pipeline board and list`.

---

### Task 15: Ecrã Negócio

**Ficheiros:**

- Criar: `apps/web/src/app/[locale]/(workspace)/pipeline/[dealId]/page.tsx`, `deal-header.tsx`, `summary-tab.tsx`, `application-tab.tsx`, `calls-tab.tsx`, `timeline-tab.tsx`, `follow-ups-panel.tsx`, `actions.ts`
- Criar: `apps/web/src/modules/commercial/calls.ts`, `apps/web/src/modules/commercial/contacts.ts`
- Modificar: `queries.ts` (+ `getDealDetail`), `packages/ui` (`tabs`), mensagens `commercial.deal.*`
- Teste: `calls.db.test.ts`, `contacts.db.test.ts`, `queries.db.test.ts` (+)

**Interfaces:**

- Consome: Tasks 4, 12 (`bookCall` para marcação manual com `actor` utilizador), 13 (`followUps`).
- Produz:
  - `getDealDetail(tx, dealId): Promise<DealDetail | null>` com cliente, contactos, código, rastreio, candidaturas (respostas com rótulos da versão do formulário, pontuação por pergunta), chamadas, acompanhamentos abertos e linha temporal (mais recente primeiro).
  - `scheduleCallManually(claims, input: { dealId: string; start: Date; durationMinutes: number }, deps)`: o fundador ou gestor marca uma chamada combinada por outro meio; cria o evento quando há ligação; aplica `0.3` se o negócio estiver em `0.2`.
  - `recordCallOutcome(claims, input: { callId: string; status: 'completed' | 'no_show'; outcome: CallOutcome | null; reason: string | null; notes: string | null }, deps)`: `completed` exige `outcome`; `decline` exige motivo e fecha o negócio em `X.4`; `advance` e `follow_up` aplicam `0.4`; emite `commercial.call.completed`; auditoria `call.outcome_recorded`.
  - `completeFollowUp(claims, input: { followUpId: string; status: 'done' | 'dismissed' }, deps)`.
  - `upsertContact(claims, input: { clientId: string; contactId: string | null; fullName: string; email: string | null; phone: string | null; jobTitle: string | null; role: ClientRole }, deps)`.
  - Ecrã com o cabeçalho (código, "Mover para…", rastreio editável com `updateDealTracking`), separadores Resumo, Candidatura (pergunta 9 em destaque), Chamadas, Linha temporal, e a coluna lateral de acompanhamentos com "Copiar mensagem". Negócio invisível ou inexistente → 404.

- [ ] **Passo 1:** testes:
  - `calls.db`: `completed requires an outcome`, `decline closes the deal at X.4 with the reason`, `advance and follow up move the deal to 0.4`, `manual scheduling moves 0.2 to 0.3`.
  - `contacts.db`: `founder adds and edits contacts`, `rejects a duplicate email for the same client`.
  - `queries.db`: `deal detail includes per-question points and the cost of inaction answer`, `returns null for a deal outside the actor scope`.
- [ ] **Passo 2:** → FALHA.
- [ ] **Passo 3:** implementar.
- [ ] **Passo 4:** → PASSA; verificação manual.
- [ ] **Passo 5:** commit `feat(commercial): add deal detail with calls and timeline`.

---

### Task 16: Ecrã Candidaturas e Fila B

**Ficheiros:**

- Criar: `apps/web/src/modules/commercial/applications/review.ts`, `apps/web/src/app/[locale]/(workspace)/applications/page.tsx`, `applications-table.tsx`, `actions.ts`
- Modificar: `queries.ts` (+ `listApplications`), mensagens `commercial.applications.*`
- Teste: `applications/review.db.test.ts`, `queries.db.test.ts` (+)

**Interfaces:**

- Produz:
  - `listApplications(tx, input: { tab: 'all' | 'queue_b'; search?: string }): Promise<ApplicationRow[]>` (`queue_b` = caminho `b` sem `review_decision`; anonimizadas mostram só pontuação, caminho e data).
  - `reviewQueueB(claims, input: { applicationId: string; decision: 'a' | 'c' }, deps): Promise<{ ok: true } | { ok: false; rule: 'not_found' | 'already_reviewed' }>`: grava `review_decision`, `reviewed_at`, `reviewed_by`; `a` → `emit('commercial.application.reviewed', { applicationId, dealId, decision })`; `c` → `applyStageChange(X.4, reason 'path_c')`; linha temporal `application_reviewed`; auditoria `application.reviewed`; `requestFlush()`.
  - Ecrã Lista com separadores Todas e Fila B (contador), colunas pontuação, caminho, origem (UTM resumida), data; ações "Aprovar para A" e "Enviar para C" com confirmação.

- [ ] **Passo 1:** testes: `approve to a emits the reviewed event and keeps the deal at 0.2`, `send to c closes the deal at X.4`, `a reviewed application cannot be reviewed twice`, `queue b lists only unreviewed path b applications`, `finance cannot review`.
- [ ] **Passo 2:** → FALHA.
- [ ] **Passo 3:** implementar.
- [ ] **Passo 4:** → PASSA.
- [ ] **Passo 5:** commit `feat(commercial): add applications list and queue b review`.

---

### Task 17: Angariação

**Ficheiros:**

- Criar: `apps/web/src/modules/commercial/acquisition/service.ts`, `apps/web/src/app/[locale]/(workspace)/acquisition/page.tsx`, `target-form.tsx`, `actions.ts`
- Modificar: `queries.ts` (+ `listAcquisitionTargets`), mensagens `commercial.acquisition.*`
- Teste: `acquisition/service.db.test.ts`

**Interfaces:**

- Produz:
  - `saveAcquisitionTarget(claims, input: { targetId: string | null; companyName: string; sector: string; website: string | null; notes: string | null; status: AcquisitionStatus }, deps)`.
  - `convertAcquisitionTarget(claims, input: { targetId: string; contact: { fullName: string; email: string | null; role: ClientRole } }, deps): Promise<{ ok: true; dealId: string } | { ok: false; rule: 'not_found' | 'already_converted' }>`: cria cliente `prospect`, contacto e negócio em `0.1` com origem `acquisition`; estado `converted` com `converted_client_id`; auditoria `acquisition_target.converted`.
  - Ecrã com alvos agrupados por setor, estado e notas; modelos de mensagem do tipo `acquisition` do setor com botão de copiar; "Converter" abre um diálogo para o contacto e leva ao negócio criado.

- [ ] **Passo 1:** testes: `converts a target into prospect, contact and deal at 0.1`, `a converted target cannot be converted again`, `finance reads targets but cannot change them`, `manager has no access to targets`.
- [ ] **Passo 2:** → FALHA.
- [ ] **Passo 3:** implementar.
- [ ] **Passo 4:** → PASSA.
- [ ] **Passo 5:** commit `feat(commercial): add acquisition targets`.

---

### Task 18: Início — "Hoje"

**Ficheiros:**

- Modificar: `apps/web/src/app/[locale]/(workspace)/page.tsx`, `queries.ts` (+ `listTodayItems`), mensagens `studio.today.*`
- Criar: `apps/web/src/app/[locale]/(workspace)/today-list.tsx`
- Teste: `queries.db.test.ts` (+)

**Interfaces:**

- Produz `listTodayItems(tx, input: { now: Date; timeZone: string }): Promise<TodayItem[]>` com `TodayItem = { kind: 'follow_up' | 'queue_b' | 'call'; id: string; dealId: string; clientName: string; dueAt: Date; overdue: boolean; label: string }`: acompanhamentos abertos com data ≤ hoje, Fila B por rever, chamadas `scheduled` de hoje no fuso das definições; ordenados por vencidos primeiro e depois por hora. Sem permissão de pipeline, o Início mantém o estado vazio atual.

- [ ] **Passo 1:** testes: `includes overdue follow ups first`, `includes today's calls in the booking time zone`, `includes unreviewed queue b applications`, `returns nothing for a freelancer`.
- [ ] **Passo 2:** → FALHA.
- [ ] **Passo 3:** implementar a lista com ligação direta para o negócio ou para a Fila B.
- [ ] **Passo 4:** → PASSA.
- [ ] **Passo 5:** commit `feat(commercial): show today's commercial items on the studio home`.

---

### Task 19: Definições comerciais

**Ficheiros:**

- Criar: `apps/web/src/modules/commercial/settings/service.ts`, `apps/web/src/app/[locale]/(workspace)/settings/layout.tsx` (navegação de definições), `settings/page.tsx` (redireciona para Sessões), `settings/application/page.tsx`, `application-form-editor.tsx`, `score-preview.tsx`, `settings/booking/page.tsx`, `settings/templates/page.tsx`, `actions.ts` por ecrã
- Modificar: `navigation.ts` (rodapé aponta para `/settings`), mensagens `settings.*`
- Teste: `settings/service.db.test.ts`, `application-form-editor.test.tsx`

**Interfaces:**

- Produz:
  - `getCommercialSettings(tx, organizationId)` (cria a linha com os valores por defeito se não existir) e `updateBookingSettings(claims, input: BookingRules & { selfDiagnosisUrl: string | null; anonymizeAfterMonths: number }, deps)` (validação: horas `HH:MM` com fim depois do início, duração 15–120, intervalo 0–60, antecedência 0–168, horizonte 1–60, fuso válido, meses 1–60).
  - `publishApplicationForm(claims, definition: ApplicationFormDefinition, deps): Promise<{ ok: true; version: number } | { ok: false; issues: string[] }>`: valida com `applicationFormDefinitionSchema`; desativa a versão atual e grava a nova numa transação; auditoria `application_form.published`.
  - `saveMessageTemplate(claims, input: { templateId: string | null; kind: MessageTemplateKind; sector: string | null; sequenceDay: number | null; locale: Locale; name: string; subject: string | null; body: string }, deps)`.
  - Navegação de definições: Sessões (todos); Integrações, Candidatura, Agenda, Modelos (só fundador). Editor do formulário: perguntas, opções, pontos e eliminatórios editáveis, textos em pt-PT e en, limites, pré-visualização da pontuação (`scoreApplication` no cliente com respostas escolhidas), "Publicar nova versão" com a versão atual visível.

- [ ] **Passo 1:** testes: `publishing creates a new active version and keeps the old one`, `rejects an invalid definition`, `only the founder can change commercial settings`, `booking settings validation rejects end before start`, `editor preview recomputes the path when answers change`.
- [ ] **Passo 2:** → FALHA.
- [ ] **Passo 3:** implementar.
- [ ] **Passo 4:** → PASSA.
- [ ] **Passo 5:** commit `feat(commercial): add commercial settings screens`.

---

### Task 20: Ponta a ponta, acessibilidade e previews

**Ficheiros:**

- Modificar: `apps/web/scripts/seed-e2e.ts` (definições comerciais da organização `e2e-studio`, alvo de angariação, negócio em 0.2 com candidatura B), `apps/web/e2e/support/*` (helper `bookingLinkFor(dealId)` com `PUBLIC_LINK_SECRET`)
- Criar: `apps/web/e2e/commercial-apply.spec.ts`, `apps/web/e2e/pipeline.spec.ts`
- Modificar: `apps/web/e2e/accessibility.spec.ts`, `.github/workflows/deploy-preview.yml`, `.github/workflows/deploy-staging.yml` (só o passo de testes: `--grep-invert @public-writes`), `.env.example`

**Interfaces:**

- Previews: `--env` com `PUBLIC_LINK_SECRET` (`PREVIEW_PUBLIC_LINK_SECRET`), `PUBLIC_ORGANIZATION_SLUG=e2e-studio`, `APP_BASE_URL` = URL do deploy, `EMAIL_TRANSPORT=capture`, `CALENDAR_PROVIDER=fake`, `APPLY_EMBED_ORIGINS` vazio. Segredo novo no GitHub: `PREVIEW_PUBLIC_LINK_SECRET`.
- Specs (desktop; `@responsive` também a 360 px nas páginas públicas):
  - `commercial-apply.spec.ts @public-writes`: `path a applicant books a call and the founder sees the deal at 0.3`; `path c applicant sees the thank-you page and the deal closes at X.4`; `queue b approval and booking link flow`; `honeypot submission shows the generic thank-you page`.
  - `pipeline.spec.ts`: `refused move returns the card with the rule`; `move to X.4 asks for a reason`; `deal detail records a call outcome`; `prospect clients have no room`.
  - `accessibility.spec.ts`: axe sem violações graves em `/apply` (cada passo), `/apply/thanks`, `/pipeline` (quadro e lista), `/pipeline/:id`, `/applications`, `/acquisition`, `/settings/integrations`, `/settings/application`, `/settings/booking`, `/settings/templates`, em claro e escuro.

- [ ] **Passo 1:** escrever os specs e o seed.
- [ ] **Passo 2:** `pnpm --filter web e2e:seed` e `pnpm --filter web e2e` contra `pnpm dev` local (`EMAIL_TRANSPORT=capture`, `CALENDAR_PROVIDER=fake`) → PASSA.
- [ ] **Passo 3:** atualizar os workflows e criar o segredo `PREVIEW_PUBLIC_LINK_SECRET` (`gh secret set`).
- [ ] **Passo 4:** PR → preview e ponta a ponta verdes no GitHub Actions.
- [ ] **Passo 5:** commit `test(commercial): cover the commercial flows end to end`.

---

### Task 21: Staging, teste real e documentação

**Ficheiros:**

- Modificar: `.github/workflows/deploy-staging.yml` (`--env` com `PUBLIC_LINK_SECRET`, `PUBLIC_ORGANIZATION_SLUG=aurion-creative`, `APP_BASE_URL`, `EMAIL_TRANSPORT=smtp`, `SMTP_HOST`, `SMTP_PORT=465`, `SMTP_USER`, `SMTP_PASSWORD`, `CALENDAR_PROVIDER=google`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`)
- Modificar: `docs/STATUS.md`, `docs/superpowers/execution/2026-10-07-commercial-ledger.md` (criar), `docs/superpowers/specs/2026-10-07-commercial-design.md` (estado "Implementado")

**Passos com o fundador:**

- [ ] **Passo 1:** guia passo a passo para o fundador: projeto no Google Cloud, ativar a Google Calendar API, ecrã de consentimento externo publicado em produção, credencial OAuth "Aplicação Web" com o URI de retorno `https://agency-os-staging-vslab.vercel.app/api/integrations/google/callback` (e `http://localhost:3000/api/integrations/google/callback` para o dev), valores no `.env.local` (nunca no chat).
- [ ] **Passo 2:** segredos `STAGING_PUBLIC_LINK_SECRET`, `STAGING_GOOGLE_CLIENT_ID`, `STAGING_GOOGLE_CLIENT_SECRET` no GitHub; app Inngest de staging sincronizada com o URL `https://agency-os-staging-vslab.vercel.app/api/inngest?x-vercel-protection-bypass=<segredo>` (o fundador regista no painel do Inngest; os segredos `STAGING_INNGEST_*` já existem).
- [ ] **Passo 3:** merge em `develop` → staging verde (isolamento, migrações, deploy, ponta a ponta sem `@public-writes`).
- [ ] **Passo 4:** o fundador entra em staging, liga o Google Calendar em Definições › Integrações, preenche a candidatura com o próprio email (caminho A), marca uma chamada e confirma: evento com Meet no calendário, email de confirmação com link de gestão, lembrete de 1 h (marcação para daqui a pouco mais de 24 h com antecedência ajustada nas definições), negócio em 0.3 no quadro, registo do resultado em 0.4 e acompanhamento ao 3.º dia (data avançada com `createDueFollowUps(now)` no dev).
- [ ] **Passo 5:** registar no `STATUS.md` (feito, critérios de aceitação 1 a 9 com evidência, adiamentos da secção 2 do spec) e no registo de execução; commit `docs: record commercial sub-project delivery`.
