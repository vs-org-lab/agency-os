# Endurecimento antes do primeiro cliente — Plano de implementação

> **Para agentes:** SUB-SKILL OBRIGATÓRIA: usar `superpowers:executing-plans`. Os passos usam caixas (`- [ ]`) para acompanhamento.

**Objetivo:** as sete correções do spec, cada uma com um teste que falha antes.

**Spec:** [docs/superpowers/specs/2026-10-17-hardening-design.md](../specs/2026-10-17-hardening-design.md)

## Restrições globais

As dos planos anteriores: TDD; inglês no código e PT-PT na documentação; migrações com dry-run; sem atribuição a IA; ficheiros pela ferramenta Write; segredos nunca mostrados.

## Foco de revisão

1. Um decisor do cliente a decidir pela sala uma aprovação de `retainer_extra`, `document_version` ou `brand_hub_publication`: não encontrada, e o sujeito não muda.
2. Um gestor atribuído a alterar `proposals.status` pela API: permissão negada; o fundador continua a enviar e retirar.
3. Um membro removido com uma tarefa atribuída: nenhum email.

---

### Task 1: Decisão genérica de aprovações

**Ficheiros:** `apps/web/src/modules/rooms/approvals.ts` e `approvals.db.test.ts`.

- [ ] Teste `generic decisions refuse approvals that have their own path`: para cada sujeito `retainer_extra`, `document_version`, `brand_hub_publication`, a decisão e a retirada genéricas devolvem `not_found` e a aprovação fica `pending`.
- [ ] FALHA → aceitar só `phase` e `project` na decisão e na retirada → PASSA → commit.

### Task 2: Estado das propostas

**Ficheiros:** migração nova (revogar `update (status, sent_at)` de `proposals` a `authenticated`), `packages/db/test/rls/` (teste do privilégio), `apps/web/src/modules/contracts/proposals.ts` (enviar e retirar em contexto de sistema depois da verificação do fundador).

- [ ] Teste RLS `pipeline writers cannot change a proposal status directly`.
- [ ] FALHA → migração (dry-run mostrado, push) → mover as escritas → testes de envio e retirada existentes verdes → commit.

### Task 3: Cabeçalhos do site

**Ficheiros:** `apps/brand-hub/vercel.json` e um teste em `apps/brand-hub/test/`.

- [ ] Teste `the public site sends security headers` (lê `vercel.json`).
- [ ] FALHA → cabeçalhos → PASSA → commit.

### Task 4: Email de tarefa atribuída

**Ficheiros:** `apps/web/src/modules/tasks/notices.ts` e o seu teste de base de dados.

- [ ] Teste `assigned notices skip members who left`.
- [ ] FALHA → verificar a pertença ativa → PASSA → commit.

### Task 5: Lembretes em projetos parados

**Ficheiros:** o varrimento de lembretes da sala (`apps/web/src/modules/rooms`) e o seu teste.

- [ ] Teste `reminders skip paused and cancelled projects`.
- [ ] FALHA → filtrar pelo estado do projeto → PASSA → commit.

### Task 6: Relatório com projetos cancelados

**Ficheiros:** `apps/web/src/modules/client-reports/collect.ts` e `collect.db.test.ts`.

- [ ] Teste `cancelled projects stay out of the report`.
- [ ] FALHA → juntar `projects` com `status <> 'cancelled'` → PASSA → commit.

### Task 7: Plurais da saúde

**Ficheiros:** mensagens `health.*` em pt-PT e en, o componente que as usa e o seu teste.

- [ ] Teste `health messages use singular and plural`.
- [ ] FALHA → mensagens ICU com `plural` → PASSA → commit.

### Final

- [ ] Suíte unitária, DB dos módulos tocados, lint e tipos → revisão final (revisor novo, opus) → correções → STATUS → PR.
