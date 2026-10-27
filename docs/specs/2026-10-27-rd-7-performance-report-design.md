# RD-7 — Relatórios de performance

Data: 2026-10-27 · Programa de redesenho 2 · Depende da RD-3 · Estado: aprovado pelo fundador (autonomia total, 2026-10-26)

## Objetivo

Os relatórios ao cliente passam a mostrar resultados reais: os indicadores da RD-3 comparados com o período anterior. A QBR passa a sair no formato 16:9 do template `Aurion_Relatorio_Performance_Template`.

## Decisões

1. **Indicadores no relatório:**
   - entram só os indicadores visíveis ao cliente e não arquivados;
   - cada um é calculado no período do relatório e no período anterior com o mesmo número de meses, pela regra do próprio indicador (soma, média ou último valor);
   - os indicadores sem valor em nenhum dos dois períodos ficam de fora;
   - os dados ficam congelados com o resto do relatório quando é partilhado;
   - os relatórios congelados antes desta fase não têm indicadores e continuam válidos.
2. **Variação:**
   - contagens em percentagem;
   - percentagens em pontos percentuais ("p.p.");
   - rácios no próprio valor ("×");
   - a formatação é a mesma do ecrã (`formatKpi` e `kpiChange` passam para o domínio de resultados).
3. **QBR 16:9:**
   - capa Ink com eyebrow "Relatório de performance", o cliente em serifa e o trimestre;
   - "Sumário executivo" com até quatro indicadores em cartões (valor em serifa, nome em eyebrow dourado, variação) e o resumo;
   - "Indicadores": comparação com o período anterior em barras emparelhadas (anterior a cinzento, atual a Ink) com valores e variação;
   - as secções existentes (trabalho feito, retainer, resultado, destaques, prioridades, próximos passos);
   - fecho Ink "Obrigado.".
4. **Relatório mensal:**
   - continua em A4 vertical;
   - ganha eyebrow, título em serifa, filete e a secção "Indicadores" com uma linha por indicador: valor, anterior, variação e meta.

## Fora de âmbito

- **Campanhas, automações e funis como slides próprios.** Não existe ainda uma fonte de dados por campanha; os números entram como indicadores.
  - Revisitar quando houver integração com plataformas de anúncios.

## Testes

- Unitários:
  - cálculo dos indicadores (mês contra o anterior, trimestre por regra, sem valores);
  - linhas do relatório mensal;
  - capa, sumário, comparação e fecho da QBR com proporção 16:9.
- Base de dados: a recolha inclui só os indicadores visíveis ao cliente, com o período anterior.

## Critérios de conclusão

- PDF de exemplo revisto contra o template.
- `STATUS.md` atualizado.
