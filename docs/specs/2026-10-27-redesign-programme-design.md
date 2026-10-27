# Programa de redesenho 2 — Qualidade de produto (RD-0 a RD-9)

Data: 2026-10-27 · Estado: decisões do fundador recolhidas a 2026-10-27 · Substitui a direção visual do programa UX-0 a UX-6 onde houver conflito

## Objetivo

Levar o OS ao nível das referências: ecrãs compostos com intenção, hierarquia clara, tema escuro premium, métricas legíveis tanto para a equipa como para o cliente, documentos que reforçam o valor da marca e movimento que dá vida sem atrapalhar.

Referências (pasta `References/`, local, fora do repositório):

- `Brand/`: paleta (`Colors.png`), símbolo e lettering em contornos (`Asset 4.svg` branco, `Asset 5.svg` escuro, `logouu.svg` símbolo), estratégia de marca, templates de proposta, contrato, questionário Core e relatório de performance.
- `Inspirations you need/`: Início, sala do cliente com fases, passo em modal, construtor de processos, questionário interativo, Brand Hub (assistente, editor e hub publicado), documentos, faturas, finanças, tarefas, quadros e calendário.
- `Ref 01 (1–19)` e `Screenshot 2026-10-21 *`: as mesmas superfícies em claro, incluindo a faixa de métricas do retainer.
- Design systems de apoio: Linear (contenção, escada de superfícies, hairlines, um só acento) e Cursor (calma editorial, peso 400 nos títulos).

## Decisões do fundador (2026-10-27)

1. **Métricas de resultado:** introdução manual por cliente e importação de CSV exportado das fontes (GA4, Search Console, Meta, Google Ads). Sem integrações OAuth nesta fase.
2. **Contrato:** construtor modular ao estilo do questionário interativo, com módulos A a E e cláusulas aplicáveis; gera um contrato curto.
3. **Documentos gerados** (proposta, contrato, relatório, fatura): estilo dos templates da marca — títulos em serifa, rótulos em mono dourado espaçado, corpo em Inter, fundo Ink com cartões Navy, formato 16:9 para proposta e relatório e A4 para contrato e fatura.
4. **Tema:** escuro por defeito; o claro continua no seletor. O escuro tem de ficar premium e todos os componentes têm de se ler bem nele.
5. **Tipografia do OS:** Inter em toda a aplicação, incluindo o portal (substitui o Fraunces previsto na UX-3 para o que o cliente vê).

## Diagnóstico (ecrãs enviados a 2026-10-27)

| Ecrã                             | Problema                                                                                                           |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| Início                           | Quatro cartões soltos e uma faixa de ações; sem "Hoje", "A seguir" nem progresso dos clientes como nas referências |
| Sala › Retainer                  | Anéis pequenos sem contentor, lista de registos com "Delete" em texto, secções sem hierarquia                      |
| Ver como cliente                 | Lista de cartões por fase; sem fases em separadores, sem painel do projeto, sem trabalho atual                     |
| Brand Hub (editor)               | Índice e secções em texto corrido; secções vazias mostradas como títulos; cor sem copiar ao clicar                 |
| Documentos (Figma)               | Bom esqueleto, mas cabeçalho e comentários sem composição                                                          |
| Relatórios                       | Formulário e lista; o relatório lista passos e não resultados; PDF praticamente vazio                              |
| Definições (equipa, candidatura) | `select` nativo, formulários em grelha crua, linhas de equipa sem estrutura                                        |
| Escuro em geral                  | Componentes com contraste insuficiente ou invisíveis (campos, `select` nativo, checkboxes, bordas)                 |

## Direção visual

- **Escada de superfícies no escuro** (tingida de Ink, nunca preto puro): `canvas` → `surface` → `surface-raised` → `surface-overlay`, com hairlines em dois níveis. A hierarquia vem da elevação por superfície e da hairline, não de sombras.
- **Um acento cromático por ecrã:** Aurion Blue para foco, seleção, links e progresso; Aurion Gold reservado a momentos de marca e "a sua ação". Botão principal monocromático (branco no escuro, Ink no claro), como nas referências.
- **Tipografia Inter:** títulos 500–600 com tracking negativo (−2% a partir de 24 px), corpo 400, rótulos 500 com tracking positivo; números tabulares em métricas.
- **Composição:** cabeçalhos de página com avatar ou logótipo, título, contexto e ações à direita; painéis com cabeçalho próprio (título, contagem, ação "abrir" ↗); listas em linhas com hairline; painel lateral de propriedades à direita quando há um objeto em foco.
- **Movimento:** opção A mantida (morph funcional até ~300 ms); entradas em cascata curta nos painéis, números animados nas métricas, anéis que enchem, indicadores partilhados nos separadores, transições de modal e de painel lateral; tudo respeita "reduzir movimento".
- **Marca:** símbolo e lettering em contornos no shell, no ecrã de entrada e nos documentos.

## Fases

| Fase                               | Âmbito                                                                                                                                                                                                                                                                                                                                                                          | Referências                                                                                       |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| **RD-0 Fundação escura**           | Tokens da escada de superfícies e hairlines; tema escuro por defeito; auditoria de contraste de todos os componentes (`select` nativo substituído, campos, checkboxes, badges, tabelas, gráficos); assets da marca em contornos; utilitários de movimento                                                                                                                       | Linear, `04 (14–17)`                                                                              |
| **RD-1 Shell e Início**            | Barra lateral com logótipos dos clientes e contadores; Início com faixa de métricas unida, "Hoje", "A seguir" com datas em bloco e progresso dos clientes por fases                                                                                                                                                                                                             | `01 Homepage`, `01 Client Portal (1–2)`                                                           |
| **RD-2 Sala do cliente**           | Cabeçalho do cliente; fases em separadores com anel de progresso; processo em lista com estados; painel do projeto (estado, fase, datas, pessoas); passo em modal (ficheiros e tarefas à esquerda, conversa com o cliente à direita); modo "Ver como cliente" com faixa e regresso                                                                                              | `01 Client Portal (3–5)`, `01 Phases View`, `04 (30)`                                             |
| **RD-3 Métricas**                  | Componente único de métricas do retainer (anéis por crédito e período, "N restantes · X de Y usados") com quadro "Trabalho atual" (Lista · Quadro) e painel "Plano", igual na sala e no portal; KPIs de resultado por cliente com objetivo, registo mensal, importação de CSV com mapeamento de colunas e gráficos período vs anterior                                          | `Screenshot 2026-10-21 002003`, `003105`, `04 (22)`                                               |
| **RD-4 Portal do cliente**         | Portal com a mesma estrutura da sala em modo cliente: "A sua ação", fases, métricas do plano e de resultado, documentos e conversa                                                                                                                                                                                                                                              | `01 Client Portal (4)`                                                                            |
| **RD-5 Brand Hub**                 | Assistente de configuração em 10 passos (aspeto, páginas, cores, fontes, galeria, logótipos, fotografia, layout, ferramentas, revisão); editor em três painéis (índice, hub ao vivo, conteúdo/estilos/ficheiros); hub publicado editorial com hero, secções numeradas, blocos de valores, escala tipográfica, logótipos com descarga e cores que se copiam ao clicar (HEX, RGB) | `03 Brand Hub (1–9)`, `Ref 01 (16–19)`                                                            |
| **RD-6 Documentos e faturas**      | Documentos em grelha com miniatura e estado; visualizador com navegação de páginas e conversa; faturas com resumo recebido/em aberto, filtros e editor com pré-visualização ao vivo; PDFs de proposta e fatura nos templates da marca                                                                                                                                           | `04 (2–11)`, `Ref 01 (6–7, 13–15)`                                                                |
| **RD-7 Relatórios de performance** | Relatório construído a partir dos KPIs da RD-3: sumário executivo com quatro indicadores, gráfico período vs anterior, campanhas (investimento, cliques, conversões, CPA), automações e funis, o que funcionou e a ajustar, próximos passos; PDF 16:9 no template `Aurion_Relatorio_Performance_Template`                                                                       | `Brand/Aurion_Relatorio_Performance_Template.pptx`                                                |
| **RD-8 Construtor de contrato**    | Secções numeradas à esquerda, módulos e cláusulas à direita; escolha de módulos A–E com volumes, plataformas, revisões e preços; condições de pagamento (opções A, B, C); pré-preenchimento a partir da proposta aceite; contrato curto em PDF A4 no estilo da marca; assinatura existente mantida                                                                              | `01 Interactive Briefing Questions Build`, `Brand/AURION_Contrato_Template.pdf`                   |
| **RD-9 Superfícies restantes**     | Construtor de processos em duas colunas ("O que o cliente vê" · "O que a equipa faz") com encadeamento entre passos; questionário interativo; finanças (recebido, em aberto, gasto, gráfico anual, faturas por idade, recebido por cliente); definições (equipa, candidatura, integrações)                                                                                      | `02 Process Building`, `01 Interactive Briefing UI`, `04 (22–27)`, `Screenshot 2026-10-21 003030` |

Cada fase tem o seu spec em `docs/specs/` e o seu plano em `docs/plans/` antes de código. A RD-0 é pré-requisito de todas; a RD-3 é pré-requisito da RD-4 e da RD-7.

## Fluxo de aprovação visual

Antes de implementar cada fase com ecrãs novos, a composição é mostrada ao fundador numa maquete de alta fidelidade com a paleta e a tipografia reais. Só depois de aprovada entra em código.

## Fora de âmbito

- Integrações OAuth com GA4, Search Console, Meta e Google Ads.
- Fotografias e texturas da marca (por criar); os espaços ficam preparados.
- Quadros colaborativos em tempo real (canvas) e assistente por MCP.

## Critérios de conclusão do programa

- Todas as superfícies do diagnóstico redesenhadas e aprovadas visualmente.
- Tema escuro por defeito, sem componentes com contraste insuficiente (verificação automática de contraste nas suites de acessibilidade).
- Métricas do retainer e de resultado iguais na sala e no portal.
- Relatório, proposta, contrato e fatura gerados nos templates da marca.
- `STATUS.md` e `INVENTORY.md` atualizados em cada fase.
