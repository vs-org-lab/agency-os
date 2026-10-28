# Plano — RD-7 Relatórios de performance

Spec: [RD-7](../specs/2026-10-27-rd-7-performance-report-design.md) · Branch: `feat/rd-1-home` (sobre a RD-0)

1. Testes de `reportIndicators`; depois a função de domínio.
2. `ReportData.indicators` e recolha na base de dados, com teste de base de dados.
3. `formatKpi`/`kpiChange` passam de `components/results` para o domínio de resultados.
4. Testes do PDF; depois o escritor de slides 16:9 da marca (capa, cartões, comparação, fecho) e os relatórios.
5. Verificação: typecheck, lint, Prettier, unitários, teste de base de dados quando não houver e2e a correr; PDF de exemplo revisto; `STATUS.md`.
