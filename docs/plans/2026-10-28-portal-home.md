# Plano — Início do portal, primeiros passos e visita guiada

Spec: [Início do portal](../specs/2026-10-28-portal-home-design.md) · Branch: `feat/rd-1-home`

1. Linha temporal partilhada (`components/rooms/timeline-view`) e alternância na página do projeto do portal.
2. Marcador `portal_getting_started` (migração do enum) e marcadores por área no módulo de onboarding, com teste.
3. `gettingStartedSteps` puro, com testes.
4. Traduções do início, dos primeiros passos e da visita (pt-PT e en).
5. Visita guiada com testes; âncoras `data-nav` na barra lateral e `data-tour` no início.
6. Cartões do início (projeto, primeiros passos, atualizações e documentos recentes); `ActionList` com estado vazio; novo `PortalHome`; remover o diálogo de boas-vindas e a faixa de fases.
7. Documentos do portal agrupados, com o estado nas palavras do cliente.
8. e2e do portal e da faturação; verificação: typecheck, lint, Prettier, unitários e testes de base de dados; `STATUS.md`.
