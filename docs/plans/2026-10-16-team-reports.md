# Sub-projeto 3E.1 — Relatórios da equipa — Plano de implementação

**Objetivo:** S-11 com seis painéis e CSV para fundadores, histórico diário da saúde com aviso de risco e tendência no C-01, e etiqueta de retainer e nível de saúde na lista do Início.

**Arquitetura:**

- O cálculo da saúde do 3D passa a ter uma versão de sistema, `computeClientHealth(tx, clientId, now)`, usada pelo leitor e pelo varrimento diário.
- Um módulo novo, `apps/web/src/modules/reports`, tem o domínio puro (meses, conversão, CSV) e os leitores dos painéis. A carga da equipa vem do módulo `team`.
- O CSV é servido por uma rota de API por painel.

**Stack:** a existente, sem dependências novas.

**Spec:** [docs/specs/2026-10-16-team-reports-design.md](../specs/2026-10-16-team-reports-design.md)

## Restrições globais

- As dos planos anteriores: TDD; inglês no código e PT-PT na documentação; migrações com dry-run; sem custo; ficheiros pela ferramenta Write (nada de backticks em `node -e`); fronteira de módulos; segredos nunca mostrados.
- **Valores do spec:**
  - **acesso ao S-11 e ao CSV:** só fundadores (`founder`);
  - **ano:** o de Lisboa, por defeito o corrente;
  - **etapas:** `pre_sale`, `core`, `orbit`, `gravity`, `constellation`, `off_cycle`; passagens pre_sale→core, core→orbit, orbit→gravity, gravity→constellation;
  - **CSV:** UTF-8 com BOM, vírgula, ponto decimal, cabeçalhos PT-PT, rota `/api/reports/<painel>.csv?year=AAAA`, painéis `revenue`, `recurring`, `pipeline`, `conversion`, `load`, `at-risk`;
  - **histórico:** `health-snapshots` às `TZ=Europe/Lisbon 30 7 * * *`, um registo por cliente e dia (substituído no mesmo dia), clientes `active`;
  - **aviso:** evento `health.client.at_risk`, template `founder.health_at_risk` por `alertClientTeam`, só na entrada em risco;
  - **tendência:** contra o registo de há 30 dias ou o mais antigo dos últimos 30 dias.

## Foco de revisão

1. **Varrimento corrido duas vezes no mesmo dia:** um registo por cliente e um só aviso. Teste na Task 2 (`one snapshot per client and day, one alert per entry into risk`).
2. **Cliente que entra em risco, recupera e volta a entrar:** dois avisos, um por entrada. Teste na Task 2 (o mesmo teste, com a sequência at_risk → attention → at_risk).
3. **Conversão sem entradas numa etapa:** sem divisão por zero; a percentagem fica `null` e o ecrã mostra "—". Teste na Task 3 (`conversion counts entries and later passages`).
4. **Texto com vírgulas, aspas ou quebras de linha no CSV** (nomes de clientes e membros): campos entre aspas e aspas duplicadas. Teste na Task 3 (`csv quotes fields and starts with a BOM`).
5. **Retainer que começa no mês seguinte ou que terminou:** fora da receita recorrente. Teste na Task 4 (`recurring revenue counts active retainers that have started`).

---

### Task 1: Esquema do histórico

**Ficheiros:** `packages/db/src/schema/health.ts` (exportado em `index.ts`), o enum `health_level` (`healthy`, `attention`, `at_risk`) em `enums.ts`, a migração gerada com RLS à mão, e `packages/db/test/rls/health-snapshots.test.ts`.

**Interfaces:**

- `client_health_snapshots`: `organization_id`, `client_id` (FK composta com `clients`), `day` date, `score` integer 0–100 ou null, `level` `health_level` ou null (ambos null ou ambos preenchidos), `created_at`; chave primária (`client_id`, `day`).
- RLS de leitura com `app.can_read_rooms(organization_id, client_id) and app.can_read_billing(organization_id)`; sem escrita para `authenticated`.

**Passos:**

- [ ] Testes: `room readers who read billing read snapshots, freelancers and clients nothing`; `score and level go together and one snapshot per client and day`; `authenticated users cannot write snapshots`.
- [ ] FALHA → esquema → gerar → SQL à mão → dry-run mostrado → push → PASSA → commit.

### Task 2: Histórico, aviso e tendência

**Ficheiros:**

- `modules/health/{health.ts,snapshots.ts,domain/trend.ts,automations.ts,server.ts,index.ts}`;
- o template `founder.health_at_risk` em `email/templates.ts` e o seu teste, as mensagens, e o evento em `events/emit.ts`;
- `components/health/health-card.tsx` e o seu teste;
- os testes `snapshots.db.test.ts` e `domain/trend.test.ts`.

**Interfaces:**

- `computeClientHealth(tx, clientId, now) → Promise<Omit<ClientHealthView, 'trend'>>`: o cálculo do 3D sem autorização; `loadClientHealth` passa a usá-lo e acrescenta `trend`.
- `healthTrend(today: number | null, past: number | null) → number | null` (diferença, ou null sem os dois).
- `ClientHealthView` ganha `trend: number | null`.
- `sweepHealthSnapshots(now: Date, deps) → Promise<{ saved: number; alerts: number }>`: para cada cliente `active` (uma transação cada, falhas registadas), calcula, faz upsert do dia e, se o nível for `at_risk` e o registo anterior mais recente não for, emite `health.client.at_risk` (`{ score }`).
- `HEALTH_FUNCTIONS = [healthSnapshots, healthAtRisk]`; `health-at-risk` envia `founder.health_at_risk` com `{ companyName, score, roomUrl }`. Assunto pt-PT "{companyName} está em risco: saúde {score} de 100"; en "{companyName} is at risk: health {score} of 100".
- Cartão: "+{n} nos últimos 30 dias", "−{n} nos últimos 30 dias", "Sem variação nos últimos 30 dias"; nada quando `trend` é null.

**Passos:**

- [ ] Testes:
  - `trend compares today with the past snapshot`;
  - `one snapshot per client and day, one alert per entry into risk` (foco 1 e 2);
  - `the trend reads the snapshot from 30 days ago or the oldest in the window`;
  - template: `founder.health_at_risk renders in both locales`;
  - cartão: `the card shows the trend over 30 days`.
- [ ] FALHA → implementar → PASSA → commit.

### Task 3: Domínio dos relatórios

**Ficheiros:** `modules/reports/domain/{months.ts,conversion.ts,csv.ts}` com testes.

**Interfaces:**

- `revenueByMonth(payments: { receivedOn: string; amount: string; currency: string }[], year: number) → { currency: string; months: string[12]; total: string }[]` (somas em cêntimos, moedas por ordem alfabética).
- `STAGE_PASSAGES` e `conversion(entries: { dealId: string; stage: PipelineStage; at: string }[], year: number) → { from: PipelineStage; to: PipelineStage; entered: number; passed: number; percent: number | null }[]`: entrou = primeira entrada na etapa de origem dentro do ano; passou = desses, com entrada na etapa seguinte depois dessa data.
- `toCsv(headers: string[], rows: (string | number | null)[][]) → string`: BOM, separador vírgula, `\r\n`, aspas quando há vírgula, aspas ou quebra de linha.

**Passos:**

- [ ] Testes:
  - `revenue is summed per month and currency in cents`;
  - `conversion counts entries and later passages` (foco 3: etapa sem entradas dá `percent: null`; entrada no ano anterior não conta);
  - `csv quotes fields and starts with a BOM` (foco 4).
- [ ] FALHA → implementar → PASSA → commit.

### Task 4: Leitores dos painéis

**Ficheiros:** `modules/reports/{access.ts,readers.ts,csv-panels.ts,testing.ts,server.ts,index.ts}`, `modules/team/server.ts` (se for preciso expor a carga) e `readers.db.test.ts`.

**Interfaces:**

- `reportsActor(claims, deps) → Actor | null`: só `founder`.
- `loadReports(claims, year: number, deps) → Promise<ReportsView | null>` com `{ year, revenue, recurring: { currency; monthly: string; retainers: number }[], pipeline: { stage; codes: { code; deals: number }[] }[], conversion, load: { userId; name; tasksThisWeek; activeProjects; weeklyHours: number | null }[], atRisk: { clientId; name; score: number; scoreBefore: number | null }[] }`.
- `reportCsv(claims, panel: ReportPanel, year: number, deps) → Promise<{ filename: string; body: string } | null>` com `ReportPanel = 'revenue' | 'recurring' | 'pipeline' | 'conversion' | 'load' | 'at-risk'`.

**Passos:**

- [ ] Testes:
  - `revenue counts reconciled payments of the year and organization`;
  - `recurring revenue counts active retainers that have started` (foco 5);
  - `pipeline and conversion follow the stage changes of the year`;
  - `team load matches the team screen`;
  - `at-risk clients come from the latest snapshot with the one from 30 days before`;
  - `only founders load the reports and their csv`.
- [ ] FALHA → implementar → PASSA → commit.

### Task 5: S-11 e CSV

**Ficheiros:** `app/[locale]/(workspace)/reports/page.tsx`, `app/api/reports/[panel]/route.ts`, `components/reports/{reports-screen.tsx,reports.test.tsx}`, `components/shell/navigation.ts` (`reports` em `permissions`, item `/reports`, `shell.studioNav.reports` "Relatórios", ícone novo `chart` com `BarChart3`), `app-sidebar.tsx`, o layout do estúdio, mensagens `reports.*`, e `navigation.test.ts`.

**Interfaces:**

- `ReportsScreen({ view })`: h1 "Relatórios"; seletor de ano (ligações `?year=`); uma secção por painel com título h2, tabela e "Descarregar CSV" (`/api/reports/<painel>.csv?year=`); vazios "Sem dados neste ano." ou "Sem dados."; percentagem `null` como "—".
- A rota devolve `text/csv; charset=utf-8` com `Content-Disposition: attachment; filename="<painel>-<ano>.csv"`, ou 404 para quem não é fundador.

**Passos:**

- [ ] Testes: `the reports screen shows each panel with its download`; `empty panels and conversion without entries`; navegação `studio navigation links reports for founders`.
- [ ] FALHA → implementar → PASSA → lint e typecheck → commit.

### Task 6: Início

**Ficheiros:** `modules/studio/home.ts` e `home.db.test.ts`, o componente da lista de clientes do Início e o seu teste, e as mensagens.

**Interfaces:**

- Cada cliente da lista do Início ganha `retainer: boolean` (retainer `active`) e `healthLevel: HealthLevel | null` (o registo mais recente, lido pelo RLS do histórico).
- A lista mostra a etiqueta "Retainer" e o nível ("Saudável", "Atenção", "Em risco") quando existem.

**Passos:**

- [ ] Testes: `home clients show the retainer label and the latest health level` (o freelancer vê a etiqueta mas não o nível); componente `the client list shows the retainer and health badges`.
- [ ] FALHA → implementar → PASSA → commit.

### Task 7: Ponta a ponta e documentação

**Ficheiros:** `apps/web/e2e/reports.spec.ts`, `docs/STATUS.md`.

**Passos:**

- [ ] E2E: o fundador abre `/reports`, vê "Receita por mês" e "Negócios por código", descarrega o CSV da receita (nome `revenue-<ano>.csv`, começa por BOM e cabeçalho); axe no S-11.
- [ ] `docs/STATUS.md`: linha do 3E.1, exclusões do spec §4, e as linhas adiadas para o 3E (etiqueta de retainer no S-01, histórico e alerta da saúde, score no Início) passam a feitas.
- [ ] Suite → PASSA → commit.
