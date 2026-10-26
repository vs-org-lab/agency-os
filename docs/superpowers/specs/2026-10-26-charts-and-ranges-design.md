# UX-3b — Gráficos e intervalos de datas

Data: 2026-10-26 · Programa de redesenho da UI e UX · Depende da UX-0 a UX-2 · Estado: aprovado (autorização do fundador para o programa completo, 2026-10-26)

## Objetivo

Relatórios e Dinheiro passam a mostrar a tendência antes da tabela, e o Dinheiro deixa filtrar o ano por um intervalo de datas. Referências: `line-charts-9` e `calendar-range-select` (21st.dev) e `stacked-bars` (bencho).

## Decisões

1. **Gráficos próprios em SVG, sem dependência nova** (`packages/ui/src/components/charts/`):
   - `LineChart` — séries mensais (12 pontos), uma linha por série, eixo Y com 3–4 marcas arredondadas, rótulos dos meses abreviados (`Intl`), ponto ativo com etiqueta ao passar o rato ou mover o foco (setas esquerda e direita sobre o gráfico focável), desenho da linha com `pathLength` (token `slow`); "reduzir movimento" mostra a linha completa.
   - `StackedBars` — barras horizontais empilhadas (uma barra por categoria, segmentos com legenda), largura animada uma vez ao montar; "reduzir movimento" sem animação.
   - Cores só dos tokens do design system (escala de dados definida em `05 Design system.md` com contraste ≥ 3:1 contra a superfície, claro e escuro).
   - Acessibilidade: `<figure>` com `<figcaption>`; o SVG tem `role="img"` e `aria-label` com o resumo; as tabelas existentes continuam a ser a fonte completa dos dados.
2. **Relatórios (S-11):** "Receita por mês" ganha um `LineChart` (uma série por moeda) por cima da tabela; "Negócios por etapa" e "Carga da equipa" ganham `StackedBars` (códigos por etapa; tarefas desta semana e projetos ativos por pessoa). O seletor de ano passa a `Tabs`/segmentado com ano anterior e seguinte (mesmos links).
3. **Dinheiro (S-09):** "Recebido e despesas por mês" com `LineChart` de duas séries no topo; os montantes vêm das linhas já carregadas (`requests` pagos e `expenses`), agrupados por mês de Lisboa no cliente. Moeda principal: EUR; outras moedas ficam fora do gráfico com uma nota.
4. **Intervalo de datas** (`DateRangeField` em `packages/ui`, sobre `Popover` + `Calendar` `mode="range"` da UX-1, com predefinições "Este mês", "Último trimestre", "Este ano"): no Dinheiro filtra as tabelas de pedidos e despesas dentro do ano carregado; fica na URL (`from`, `to`, ISO), validado e limitado ao ano; "Limpar" volta ao ano todo.

## Fora de âmbito

- Intervalos que atravessam anos nos serviços, CSV e PDF por intervalo (continuam por ano).

## Testes

- Componentes: pontos e caminho do `LineChart` para dados conhecidos; foco e setas mudam o ponto ativo; "reduzir movimento" sem animação; `StackedBars` com larguras proporcionais e legenda; `DateRangeField` (predefinições, limpar, teclado).
- Ecrãs: Relatórios mostra os gráficos com dados e não mostra gráfico vazio; Dinheiro filtra pelas datas da URL e ignora datas inválidas.
- E2E: o e2e de relatórios e de dinheiro continua a passar; um passo novo escolhe "Este mês" no Dinheiro.

## Critérios de conclusão

- Gráficos nos dois ecrãs, filtro por intervalo no Dinheiro, `STATUS.md`, `INVENTORY.md` e `05 Design system.md` (escala de dados) atualizados.
