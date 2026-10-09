# Sub-projeto 1C — Proposta, contrato e assinatura — Plano de implementação

> **Para agentes:** SUB-SKILL OBRIGATÓRIA: usar `superpowers:subagent-driven-development` ou `superpowers:executing-plans` para executar este plano tarefa a tarefa. Os passos usam caixas (`- [ ]`) para acompanhamento.

**Objetivo:** do 1.6 ao 2.1: proposta Orbit com até três opções aceite no portal, contrato gerado de um modelo, assinatura simples das duas partes e PDF assinado.

**Arquitetura:** módulo novo `apps/web/src/modules/contracts` (domínio puro, serviços, portal, estúdio, automações próprias). Depende de `commercial/server` (mudança de etapa, emails) e nunca o contrário; o pipeline lê os factos do contrato diretamente das tabelas. Escritas do cliente (aceitar, pedir alterações, assinar) passam por serviços que verificam o papel e escrevem em contexto de sistema. PDF com `pdf-lib`, guardado no bucket privado `contracts`.

**Stack:** a do 1B; `pdf-lib` (MIT) para o PDF.

**Spec:** [docs/superpowers/specs/2026-10-09-contracts-design.md](../specs/2026-10-09-contracts-design.md) · [ADR 0008](../../decisions/0008-simple-electronic-signature.md)

## Restrições globais

- As dos planos anteriores: TDD, inglês no código, PT-PT na documentação, migrações com dry-run antes de aplicar ao dev, sem custo.
- Valores do spec: até 3 opções; validade por defeito 30 dias; plano de pagamentos com percentagens inteiras que somam 100; retainer mensal opcional com meses (1 a 36); PDF até 10 MB; impressão digital SHA-256 do texto em UTF-8; nome do signatário comparado sem maiúsculas nem espaços a mais.
- Campos do modelo: os 20 da secção 5 do spec, exatamente com esses nomes.
- Só o fundador envia propostas, assina pela Aurion, anula contratos e edita entidades e modelos; gestores preparam rascunhos dos seus clientes; só o `decision_maker` aceita e assina no portal.
- Eventos: `contracts.proposal.sent`, `contracts.proposal.accepted`, `contracts.proposal.change_requested`, `contracts.contract.client_signed`, `contracts.contract.signed`.

## Foco de revisão

1. **Aceitação repetida** (duplo clique, dois separadores): um único contrato. Teste na Task 5 (`accepting twice creates one contract`).
2. **Assinatura sobre texto alterado** (contrato anulado e regenerado com o separador antigo aberto): recusada. Teste na Task 6 (`signing a voided contract is refused`).
3. **Operacional ou finanças do cliente a aceitar ou assinar:** recusado. Teste na Task 5 (`only the decision maker accepts`).
4. **Proposta expirada aceite:** recusada. Teste na Task 5 (`an expired proposal cannot be accepted`).
5. **Modelo com campo desconhecido publicado:** recusado antes de chegar a um contrato. Teste na Task 2 (`rejects unknown fields`).

---

### Task 1: Esquema e acesso

**Ficheiros:** `packages/db/src/schema/{enums,contracts}.ts` (+ `index.ts`, tipos em `src/index.ts`), migração gerada `<ts>_contracts.sql`, migração de acesso `<ts>_contracts_access.sql` (privilégios, RLS, vistas `portal_proposals`, `portal_proposal_options`, `portal_contracts`, bucket `contracts`), `packages/db/src/testing/fixtures.ts` (`createContractFixture`), `packages/db/test/rls/contracts.test.ts`, `isolation.test.ts` (+).

- Enums `country_code` (`PT`, `AO`), `proposal_status` (`draft`, `sent`, `accepted`, `withdrawn`), `contract_status` (`awaiting_signatures`, `signed`, `void`), `signature_party` (`client`, `studio`).
- Tabelas da secção 4 do spec com chaves compostas cliente↔organização e negócio↔cliente; único ativo por organização e idioma em `contract_templates`; único contrato não anulado por proposta.
- [ ] Testes `founder manages entities and templates`, `manager reads but does not edit templates`, `decision maker reads only sent proposals of the own client`, `client users never read drafts or change requests`, isolamento → FALHA → esquema e migrações (dry-run, aplicar ao dev) → PASSA → commit.

### Task 2: Domínio do contrato

**Ficheiros:** `modules/contracts/domain/{template,render,payments,signature}.ts` (+ testes), `modules/contracts/templates/defaults.ts` (texto base pt-PT e en).

- `TEMPLATE_FIELDS` (os 20 campos); `validateTemplate(body: string): { ok: true } | { ok: false; unknown: string[]; unbalanced: boolean }`.
- `renderContract(body: string, values: ContractValues, locale: Locale): string` — substitui campos; `opcao.ambito` e `opcao.pagamentos` como listas `- …`; valores com `formatMoney`.
- `validatePaymentPlan(steps: Array<{ label: string; percent: number }>): boolean` (inteiros 1–100, soma 100, 1 a 6 passos).
- `contractHash(text: string): string` (SHA-256 hex); `sameSigner(typed: string, expected: string): boolean`.
- [ ] Testes `renders every field`, `renders scope and payments as lists`, `formats kwanzas`, `says not applicable without retainer`, `rejects unknown fields`, `rejects unbalanced braces`, `defaults are valid in both languages`, `payment plan must sum to 100`, `hash is stable`, `signer name ignores case and spacing` → FALHA → implementar → PASSA → commit.

### Task 3: Entidades emissoras e modelos de contrato

**Ficheiros:** `modules/contracts/{entities,templates/service}.ts` (+ `.db.test.ts`), `modules/contracts/{server,index}.ts`, `app/[locale]/(workspace)/settings/organization/*` (entidades), `settings/templates` (secção Contrato com pré-visualização), mensagens `contracts.*`, `settings.*`.

- `saveLegalEntity(claims, input)`, `archiveLegalEntity`, `listLegalEntities(tx)`; uma entidade por defeito.
- `publishContractTemplate(claims, { locale, body })` (valida, versão nova ativa), `activeContractTemplate(tx, organizationId, locale)` (cria o texto base se não houver).
- [ ] Testes `only the founder saves entities`, `one default entity`, `publishing creates a new active version`, `publishing an invalid template is refused`, `the default template is created on first use` → FALHA → implementar → PASSA → commit.

### Task 4: Proposta no estúdio

**Ficheiros:** `modules/contracts/proposals.ts` (+ `.db.test.ts`), `pipeline/[dealId]/core/proposal-section.tsx` (+ teste), `core/contract-actions.ts`, `core-tab.tsx`, `diagnosis` queries (sem mudanças: a secção carrega os seus dados).

- `saveProposalDraft(claims, input)` (entidade, moeda, idioma, validade, garantia, opções 1–3 com âmbito, valor, pagamentos, retainer); `sendProposal(claims, { proposalId })` (fundador, negócio em 1.6, acesso ao portal, opções válidas; fixa e emite evento); `withdrawProposal`; `getDealProposal(tx, dealId)`.
- Âmbito: linhas de texto, cada uma com `findingId` opcional dos achados da Aurion na faixa de 90 dias.
- [ ] Testes `saves a draft with three options`, `only the founder sends`, `sending requires stage 1.6 and portal access`, `a sent proposal is read only`, `withdraw returns to draft`, `the section lists the Aurion findings of the 90 day lane` → FALHA → implementar → PASSA → commit.

### Task 5: Aceitação no portal e geração do contrato

**Ficheiros:** `modules/contracts/{acceptance,portal}.ts` (+ testes), `app/[locale]/portal/proposal/*`, `portal/page.tsx` (cartões), ações do portal.

- `getPortalProposal(tx, clientId)`; `acceptProposal(claims, { proposalId, optionId, company: { legalName, taxId, address }, signer: { name, role } })` → `{ ok: true; contractId }` (decisor, enviada, dentro da validade; gera contrato com o modelo ativo do idioma, fixa texto e impressão digital; idempotente); `requestProposalChanges(claims, { proposalId, message })`.
- [ ] Testes `only the decision maker accepts`, `an expired proposal cannot be accepted`, `accepting generates the contract of the chosen option`, `accepting twice creates one contract`, `change requests reach the founder` → FALHA → implementar → PASSA → commit.

### Task 6: Assinaturas, PDF e conclusão

**Ficheiros:** `modules/contracts/{signing,pdf,storage}.ts` (+ testes), `portal/contracts/[contractId]/*`, `core/contract-section.tsx`, rota `api/contracts/[contractId]/pdf/route.ts`, `commercial/server.ts` (+ exportar `applyStageChange`).

- `signContract(claims, { contractId, party, typedName, hash, ip, userAgent })` (cliente: decisor do cliente; estúdio: fundador; nome e impressão digital têm de coincidir; idempotente); na segunda assinatura: PDF (`buildContractPdf(text, signatures, labels): Promise<Uint8Array>`), upload, estado `signed`, mudança para 2.1 (sistema), cronologia, evento.
- `voidContract(claims, { contractId, reason })` (fundador, antes de assinado; proposta volta a `sent`).
- `ContractStorage { upload(path, bytes); signedUrl(path, ttl) }` com adaptador Supabase e de memória.
- [ ] Testes `client then studio signature completes the contract`, `studio then client also completes`, `completion moves the deal to 2.1`, `a wrong name is refused`, `signing a voided contract is refused`, `signing twice keeps one signature`, `the pdf contains the text and the signature page` → FALHA → implementar → PASSA → commit.

### Task 7: Regras do pipeline para 2.1

**Ficheiros:** `commercial/pipeline/{transitions,service}.ts` (+ testes).

- `ENABLED_STAGES` inclui `orbit`; entrada em 2.1 exige `contractSigned` e, vindo de 0.4, `coreDeliveredWithinYear`; 2.2 e seguintes devolvem `module_pending` com `billing`.
- [ ] Testes `2.1 needs a signed contract`, `0.4 to 2.1 needs a Core delivered in the last 12 months`, `2.2 waits for billing` → FALHA → implementar → PASSA → commit.

### Task 8: Emails e automações

**Ficheiros:** `email/templates.ts` (+ `lead.proposal_shared`, `lead.contract_ready`, `lead.contract_signed`, `founder.proposal_accepted`, `founder.proposal_changes`, `founder.contract_client_signed`), `modules/contracts/automations.ts`, `app/api/inngest/route.ts`, `events/emit.ts`.

- [ ] Testes de modelos (pt-PT e en) e da escolha do destinatário → FALHA → implementar → PASSA → commit.

### Task 9: Ponta a ponta, staging e documentação

**Ficheiros:** `e2e/contracts.spec.ts`, `e2e/support/*`, `docs/STATUS.md`, `docs/product/01` (RF-035/036 implementados com assinatura simples), registo de execução.

- [ ] E2E `the deal reaches 2.1 after both signatures` e axe das páginas novas → revisão final → PR → staging.
