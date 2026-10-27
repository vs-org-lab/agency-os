# RD-3 — Métricas de resultado e do plano

Data: 2026-10-27 · Programa de redesenho 2 · Depende da RD-0 · Estado: aprovado pelo fundador (maquetes "Sala do cliente", "Registar resultados e importar CSV" e "Portal do cliente", 2026-10-27)

## Objetivo

Dar a cada cliente os números que mostram o que a Aurion conseguiu, iguais na sala e no portal, e servir de fonte ao relatório de performance (RD-7). Decisão do fundador: introdução manual e importação de CSV exportado das fontes; sem integrações OAuth.

## Modelo de dados

- **`client_kpis`**: um indicador do cliente.
  - `id`, `organization_id`, `client_id`, `name` (1–60), `format` (`number` | `percent` | `currency` | `ratio`), `aggregation` (`sum` | `average` | `last`), `source` (0–40, texto livre: GA4, Meta Ads, CRM…), `target` (numérico, opcional), `client_visible` (booleano, por defeito verdadeiro), `position`, `archived_at`, `created_by`, carimbos.
  - Únicos: nome por cliente entre os não arquivados.
- **`client_kpi_values`**: o valor de um indicador num mês.
  - `id`, `organization_id`, `client_id`, `kpi_id`, `month` (primeiro dia do mês), `value` (numérico 16,4), `origin` (`manual` | `csv`), `recorded_by`, carimbos.
  - Único: `kpi_id` + `month`; o mesmo mês substitui o valor anterior.

## Regras

- Escrevem quem escreve na sala (`roomActor` com `write`): fundador e gestor de projeto com acesso ao cliente.
- A equipa lê pelas regras de leitura da sala (`app.can_read_rooms`).
- O cliente nunca lê as tabelas. Lê através de `app.client_kpi_results(p_client)`, `security definer`, que exige `app.is_client_member` e devolve só os indicadores visíveis, não arquivados, com os valores dos últimos 12 meses.
- O mês de um valor nunca é posterior ao mês corrente (fuso de Lisboa).

## Importação de CSV

- O ficheiro é lido no browser e nunca é guardado. Até 2 MB e 20 000 linhas.
- Separador `,` ou `;`, aspas, decimais com ponto ou vírgula, separador de milhares ignorado.
- Deteção da fonte pelos cabeçalhos (GA4, Search Console, Meta Ads, Google Ads); por defeito, "CSV".
- A coluna de data é identificada pelos cabeçalhos (`Date`, `Data`, `Day`, `Dia`, `Month`, `Mês`) ou escolhida à mão.
- Cada coluna numérica liga-se a um indicador existente ou é ignorada.
- Os valores agregam-se por mês segundo a agregação do indicador. Só os totais mensais vão ao servidor, numa ação que valida tudo outra vez.
- O passo "Rever" mostra os valores que substituem registos existentes antes de confirmar.

## Interface

- **Sala › Resultados** (nova entrada na navegação da sala): tabela de indicadores por mês (últimos 4 meses, o atual destacado), fonte e objetivo, edição na célula, "+ Indicador" e "Importar CSV" (painel lateral em 3 passos).
- **Sala › Painel:** faixa "Resultados" com os 4 primeiros indicadores visíveis (valor do último mês, variação face ao anterior, linha dos 6 meses e estado face ao objetivo) e "Plano" com os anéis do retainer quando existe.
- **Portal › Início:** a mesma faixa de resultados e o plano, em leitura.

## Segurança (08)

- RLS forçado nas duas tabelas; `select` para a equipa pela regra da sala; nenhuma escrita direta (`grant` só de `select`). Escritas nos serviços com `withSystemContext` depois da autorização, com auditoria (`results.kpi_*`, `results.values_recorded`).
- A função do cliente valida a pertença e devolve um conjunto mínimo de campos.
- Os valores do CSV são validados no servidor (Zod: mês, número finito, até 500 valores por pedido).

## Testes

- Domínio: leitura de CSV (separadores, aspas, decimais, linhas inválidas), deteção de fonte e de coluna de data, agregação mensal por `sum`, `average` e `last`.
- Base de dados: escrita autorizada e recusada; o mês futuro é recusado; o mesmo mês substitui; RLS (outra organização e cliente não leem as tabelas); a função do cliente só devolve indicadores visíveis do próprio cliente.
- Componentes: tabela, edição na célula, os três passos da importação e a faixa de resultados.
- E2E: a equipa cria um indicador, importa um CSV e o cliente vê o valor no portal.
