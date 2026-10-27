# Sub-projeto 3E.2 — Relatórios do cliente e QBR — Plano de implementação

**Objetivo:** relatório mensal e QBR por cliente a partir de um modelo, partilhados como documento PDF da sala; rascunhos automáticos e tarefa do QBR para clientes com retainer (AUT-25); PDF dos painéis do S-11.

**Arquitetura:**

- Um módulo novo, `apps/web/src/modules/client-reports`, com o domínio puro (períodos, títulos, modelo, PDFs), a recolha dos dados gerados, o serviço (criar, guardar, partilhar), o varrimento e os leitores do C-14.
- A entrega reutiliza os documentos da sala: `project-documents` ganha `publishGeneratedPdf`, que grava o PDF no bucket da biblioteca e o publica como documento PDF com o cliente (novo ou versão nova).
- O PDF do QBR usa um escritor de diapositivos novo em `platform/pdf.ts` (A4 em paisagem); o mensal e o dos painéis usam o `PdfWriter` existente.

**Stack:** a existente, sem dependências novas.

**Spec:** [docs/specs/2026-10-16-client-reports-design.md](../specs/2026-10-16-client-reports-design.md)

## Restrições globais

- As dos planos anteriores: TDD; inglês no código e PT-PT na documentação; migrações com dry-run; sem custo; ficheiros pela ferramenta Write (nada de backticks em `node -e`); fronteira de módulos; segredos nunca mostrados.
- **Valores do spec:**
  - **tipos:** `monthly` (mês civil de Lisboa) e `qbr` (trimestre civil: T1 jan–mar … T4 out–dez); um relatório por cliente, tipo e início do período;
  - **estados:** `draft` e `shared`;
  - **textos:** `summary`, `highlights`, `next_steps` e, só no QBR, `priorities`; cada um até 2000 caracteres;
  - **projeto:** o do retainer ativo; sem retainer, o projeto mais recente; sem projeto, nada;
  - **dados gerados:** passos visíveis ao cliente concluídos no período; atualizações `client` do período; documentos aprovados no período; consumo do retainer por mês do período; medições do resultado do período com linha de base, meta e prazo;
  - **nunca no relatório:** saúde, valores de faturação, tarefas, comentários internos;
  - **títulos:** "Relatório mensal — <mês ano>" e "QBR — T<n> <ano>"; PDF mensal "Relatório mensal · <cliente> · <mês ano>"; capa do QBR "QBR · <cliente> · T<n> <ano>";
  - **acesso:** criar, guardar, pré-visualizar e partilhar por `documentEditor` do projeto do relatório; ver lista e rascunhos por `can_read_rooms`; cliente sem acesso a `client_reports`;
  - **varrimento:** `client-reports-drafts` às `TZ=Europe/Lisbon 0 8 1 * *`; tarefa "Marcar o QBR do T<n> <ano>" com prazo a 10 dias para o gestor único;
  - **painéis em PDF:** `/api/reports/pdf?year=AAAA`, só fundadores; título "Relatórios · <ano>";
  - **ano válido:** 2000–2100, fora disso 404 no S-11, no CSV e no PDF.

## Foco de revisão

1. **Partilhar duas vezes (ou dois cliques seguidos):** um documento e versões numeradas em sequência, nunca dois documentos para o mesmo relatório. Teste na Task 4 (`sharing again adds version 2 to the same document`, com a linha do relatório bloqueada `for update`).
2. **Período que ainda não acabou ou futuro:** recusado ao criar. Teste na Task 2 (`only finished periods`) e na Task 4 (`create refuses an unfinished period`).
3. **Dados de outro cliente ou fora do período:** nunca entram. Teste na Task 3 (`collects only the client's period`).
4. **Varrimento repetido no mesmo dia ou em dias seguidos:** nem relatórios nem tarefas duplicados. Teste na Task 5 (`sweep is idempotent`).
5. **Lista longa num diapositivo do QBR:** continua no diapositivo seguinte, sem texto fora da página. Teste na Task 2 (`qbr deck splits a long list across slides`).

---

### Task 1: Esquema dos relatórios

**Ficheiros:** `packages/db/src/schema/client-reports.ts` (exportado em `index.ts`), os enums `client_report_kind` e `client_report_status` em `enums.ts`, a migração gerada com RLS à mão, e `packages/db/test/rls/client-reports.test.ts`.

**Interfaces:**

- `client_reports`: `id`, `organization_id`, `client_id` (FK composta com `clients`), `project_id` (FK composta `(project_id, client_id)` com `projects`), `kind`, `period_start` date, `period_end` date, `status` (por defeito `draft`), `summary`, `highlights`, `next_steps`, `priorities` (text, por defeito ''), `data` jsonb null, `document_id` uuid null (FK composta `(document_id, project_id)` com `project_documents`, `on delete set null` só do documento), `created_by`, `shared_at`, `created_at`, `updated_at`.
- CHECKs:
  - `period_end >= period_start`;
  - mensal: `period_start` é dia 1 e `period_end` o último dia do mês;
  - QBR: `period_start` é 1 de jan/abr/jul/out e `period_end` o fim do trimestre;
  - cada texto até 2000 caracteres; `priorities = ''` no mensal;
  - `shared` exige `shared_at`, `data` e `document_id`.
- Único `(client_id, kind, period_start)`.
- RLS de leitura com `app.can_read_rooms(organization_id, client_id)`; sem escrita para `authenticated`.

**Passos:**

- [ ] Testes: `room readers read reports, freelancers outside the room and clients nothing`; `periods must be whole months or quarters`; `one report per client, kind and period`; `authenticated users cannot write reports`.
- [ ] FALHA → esquema → gerar → SQL à mão (RLS, revoke, grant select) → dry-run mostrado → push → PASSA → commit.

### Task 2: Domínio e PDFs

**Ficheiros:**

- `modules/client-reports/domain/{periods.ts,titles.ts,content.ts}` e `domain/domain.test.ts`;
- `modules/client-reports/pdf.ts` e `pdf.test.ts`;
- `platform/pdf.ts` (escritor de diapositivos) e o seu teste.

**Interfaces:**

- `type ReportKind = 'monthly' | 'qbr'`; `type ReportPeriod = { kind; start: string; end: string }`.
- `periodOf(kind, day: string) → ReportPeriod` (o período que contém o dia).
- `previousPeriod(kind, today: string) → ReportPeriod`.
- `isFinished(period, today) → boolean` (`end < today`).
- `quarterOf(start) → { quarter: 1|2|3|4; year: number }`.
- `closesQuarter(monthStart) → boolean`.
- `documentTitle(period)` e `pdfTitle(period, clientName)`, com os textos do spec e meses em pt-PT ("outubro 2026").
- `ReportData` (JSON congelado):
  ```ts
  type ReportData = {
    steps: { name: string; on: string }[];
    updates: { title: string; on: string }[];
    approvals: { title: string; on: string }[];
    retainer:
      | { month: string; limits: { kind: RetainerLimitKind; used: number; available: number }[] }[]
      | null;
    outcome: {
      metric: string;
      baseline: string;
      target: string;
      deadline: string;
      measurements: { on: string; value: string }[];
    } | null;
  };
  type ReportTexts = { summary: string; highlights: string; nextSteps: string; priorities: string };
  ```
- `reportTexts(kind, input: unknown) → ReportTexts | null` (zod; trim; 2000 caracteres; `priorities` vazio no mensal).
- `monthlyReportPdf({ clientName, period, data, texts }) → Promise<Uint8Array>`: A4 retrato com `PdfWriter`; secções "Resumo", "Trabalho feito" (passos, atualizações, aprovações), "Retainer", "Resultado", "Destaques", "Próximos passos"; vazias omitidas.
- `qbrDeckPdf({ clientName, period, data, texts }) → Promise<Uint8Array>`: um diapositivo por secção (capa, "Resumo", "Trabalho feito", "Retainer", "Resultado", "Destaques", "Prioridades do próximo trimestre", "Próximos passos"), vazios omitidos, listas longas continuadas com "(cont.)".
- `SlideWriter` em `platform/pdf.ts`: páginas `[PAGE_HEIGHT, PAGE_WIDTH]`; `slide(title)`, `bullet(text)` (passa para um novo diapositivo com o mesmo título e "(cont.)" quando não cabe), `paragraph(text)`.
- O título das atualizações é o `milestone` ou as primeiras 120 letras do corpo, cortadas na palavra, com "…".

**Passos:**

- [ ] Testes do domínio: `periods of a day`, `previous period across the year`, `only finished periods`, `quarters close in march, june, september and december`, `titles in pt-PT`, `texts are trimmed and limited`.
- [ ] Testes do PDF (texto extraído com o `pdftext` dos testes existentes): `monthly report lists the sections in order and omits empty ones`, `qbr deck is landscape with one slide per section`, `qbr deck splits a long list across slides`.
- [ ] FALHA → implementar → PASSA → commit.

### Task 3: Dados gerados

**Ficheiros:** `modules/client-reports/collect.ts`, `collect.db.test.ts`; exportar `limitMonths` em `modules/retainers/server.ts`.

**Interfaces:**

- `reportProject(tx, clientId) → Promise<string | null>` (projeto do retainer ativo, senão o mais recente).
- `collectReportData(tx, { clientId, period }) → Promise<ReportData>`, em contexto de sistema, depois da autorização:
  - passos `visible_to_client` com `completed_at` no período (dia de Lisboa), por data;
  - atualizações `visibility = 'client'` com `created_at` no período;
  - documentos com `approved_at` no período;
  - consumo do retainer ativo para cada mês do período em que já tinha começado (`limitMonths`), ou `null` sem retainer;
  - resultado do cliente com as medições do período, ou `null` sem resultado.

**Passos:**

- [ ] Testes: `collects only the client's period` (passos, atualizações internas ou de outro cliente e fora do período ficam de fora); `retainer usage per month of a quarter`; `no retainer and no outcome give null sections`; `report project prefers the active retainer`.
- [ ] FALHA → implementar → PASSA → commit.

### Task 4: Serviço e publicação

**Ficheiros:**

- `modules/project-documents/publish.ts` e `publish.db.test.ts`, exportado em `project-documents/server.ts`;
- `modules/client-reports/{access.ts,service.ts,readers.ts,server.ts,index.ts}` e `service.db.test.ts`.

**Interfaces:**

- `publishGeneratedPdf(claims, { projectId, documentId: string | null, title, fileName, bytes }, deps: DocumentsDeps) → Promise<{ ok: true; documentId: string; versionId: string } | NotFound>`:
  - `documentEditor` do projeto;
  - sobe os bytes para `documentVersionPath` (o id da versão gerado antes);
  - numa transação: cria o documento `pdf` se `documentId` for null ou se o documento já não existir; insere a versão `ready` com `pages` e `mime_type`; `applyNewVersion`; se o documento ficou em `draft`, partilha-o como `shareProjectDocument` (estado, `shared_at`, auditoria); emite `rooms.document.shared` em todos os casos; `requestFlush` no fim.
- `type ClientReportsDeps = DocumentsDeps & { contexts; now? }`.
- `createClientReport(claims, { clientId, kind, periodStart }, deps) → { ok: true; reportId } | NotFound | { ok: false; rule: 'invalid_period' | 'exists' }`: período válido e acabado; projeto por `reportProject`; `documentEditor`.
- `saveClientReport(claims, { reportId, texts }, deps) → { ok: true } | NotFound | { ok: false; rule: 'invalid_input' }`.
- `previewClientReport(claims, reportId, deps) → { ok: true; bytes; fileName } | NotFound`: dados recalculados (ou os congelados, se partilhado e sem edição posterior), PDF do tipo.
- `shareClientReport(claims, reportId, deps) → { ok: true; documentId } | NotFound`: com a linha bloqueada `for update`, recolhe os dados, gera o PDF, `publishGeneratedPdf` com o `document_id` guardado, grava `status = 'shared'`, `data`, `document_id`, `shared_at`.
- `loadClientReports(claims, clientId, deps) → { canWrite: boolean; reports: ClientReportRow[] } | null` e `loadClientReport(claims, reportId, deps) → ClientReportView | null` (com os dados gerados atuais para a vista do editor).
- Nome do ficheiro: `relatorio-<aaaa-mm>.pdf` e `qbr-<aaaa>-t<n>.pdf`.

**Passos:**

- [ ] Testes de `publishGeneratedPdf`: `publishes a new pdf document with the client`; `a second publication adds version 2 and keeps it with the client`; `only document editors publish`.
- [ ] Testes do serviço: `create refuses an unfinished period`; `create refuses a second report for the same period`; `save validates and keeps the texts`; `sharing creates the room document with the client`; `sharing again adds version 2 to the same document`; `freelancers outside the room and clients cannot create, save or share`; `clients read the shared document and not the report`.
- [ ] FALHA → implementar → PASSA → commit.

### Task 5: Varrimento e AUT-25

**Ficheiros:** `modules/client-reports/{drafts.ts,automations.ts}`, `drafts.db.test.ts`; registar `CLIENT_REPORT_FUNCTIONS` na rota do Inngest.

**Interfaces:**

- `QBR_TASK_DAYS = 10`; `qbrTaskTitle(period) → 'Marcar o QBR do T<n> <ano>'`.
- `sweepReportDrafts(today: string, deps) → Promise<{ monthly: number; qbr: number }>`:
  - clientes `active` e não arquivados com retainer `active` cujo `starts_on <=` fim do mês anterior;
  - uma transação por cliente, falhas registadas;
  - insere o rascunho mensal do mês anterior `on conflict do nothing`;
  - se o mês anterior fecha um trimestre, insere o rascunho do QBR `on conflict do nothing` e, só quando inseriu, a tarefa para `soleClientManager` com `dueOn = today + 10`, ligada ao projeto do retainer, com auditoria.
- `client-reports-drafts`: cron `TZ=Europe/Lisbon 0 8 1 * *`, `RETRIES`, `failureHandler`.

**Passos:**

- [ ] Testes: `monthly draft for each retainer client`; `quarter close adds the qbr draft and the scheduling task`; `sweep is idempotent`; `retainer starting after the month is skipped`; `former clients are skipped`.
- [ ] FALHA → implementar → PASSA → commit.

### Task 6: C-14 e PDF dos painéis

**Ficheiros:**

- `app/[locale]/c/[clientId]/reports/page.tsx` e `reports/[reportId]/page.tsx`, `app/[locale]/c/[clientId]/report-actions.ts`, a rota `app/api/client-reports/[reportId]/pdf/route.ts`;
- `components/client-reports/{reports-list.tsx,report-editor.tsx}` e os seus testes;
- `components/shell/navigation.ts` (separador `reports`, ícone `chart`, label `shell.room.reports`) e o layout da sala;
- `modules/reports/{pdf.ts,pdf.test.ts}`, `app/api/reports/pdf/route.ts`, o botão "Descarregar PDF" em `components/reports/reports-screen.tsx`;
- validação do ano (2000–2100) no S-11, no CSV e no PDF;
- mensagens pt-PT e en.

**Interfaces:**

- O separador "Relatórios" aparece a quem lê a sala.
- Lista: tipo, período, estado ("Rascunho" ou "Partilhado em <data>"), "Novo relatório" (só para quem escreve) com tipo e período (por defeito o anterior), e a ligação para o editor.
- Editor: dados gerados em leitura, os textos (o das prioridades só no QBR), "Guardar", "Pré-visualizar PDF" (abre a rota), "Partilhar com o cliente" (com confirmação) e, depois, "Ver documento" para o C-05; leitura só para quem não escreve.
- `reportsPdf(view: ReportsView, generatedAt: Date) → Promise<Uint8Array>`.

**Passos:**

- [ ] Testes: `room navigation shows reports`; `list shows kind, period and state`; `editor hides priorities in a monthly report`; `editor is read-only without write`; `reports pdf lists the six panels`; `reports screen links the pdf`; `invalid year is not found`.
- [ ] FALHA → implementar → PASSA → commit.

### Task 7: E2E, documentação e verificação

**Ficheiros:** `apps/web/e2e/client-reports.spec.ts`; `docs/STATUS.md`; os ecrãs em `docs/product/02` (C-14).

**Passos:**

- [ ] E2E: o gestor abre o C-14, cria o relatório mensal do mês anterior, escreve o resumo, guarda e partilha; o documento aparece no C-04 com o cliente; o cliente abre-o no portal; axe no C-14.
- [ ] STATUS: a linha do 3E.2, os excluídos do spec e o PDF dos painéis e o ano inválido do 3E.1 dados como feitos.
- [ ] Suíte unitária, DB dos módulos tocados, lint, tipos e build → verde → commit.
