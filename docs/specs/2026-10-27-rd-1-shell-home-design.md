# RD-1 — Shell e Início

Data: 2026-10-27 · Programa de redesenho 2 · Depende da RD-0 · Estado: aprovado pelo fundador (maquete "RD-1 · Início da agência", 2026-10-27)

## Objetivo

O Início passa a ter a composição da maquete aprovada: saudação, faixa única de números, "Hoje" e "A seguir" em painéis, e clientes em cartões com o progresso das fases.

## Decisões

1. **Cabeçalho:** a data por extenso como rótulo e o título "Olá, {primeiro nome}" (ou "Início" quando o perfil não tem nome); à direita, "+ Novo" (menu que nasce do botão), "Abrir o pipeline" e "Ver atualizações".
   - O `HomeView` passa a trazer `readerFirstName` (do perfil de quem lê) e `localDate` (a data no fuso da organização).
2. **Números:** uma só faixa com divisórias (clientes ativos, projetos ativos, à espera de ti, por receber), números de 28 px que rolam até ao valor.
3. **Painéis:** "Hoje" e "Próximos eventos" lado a lado, cada um num painel com título e ação ↗ (tarefas e calendário).
   - "Hoje": itens em bloco com barra lateral neutra e etiqueta "Atrasado" de perigo.
   - "Próximos eventos": agrupados em Hoje, Amanhã, Esta semana e Mais tarde pela `localDate`, com a data em bloco (dia e dia da semana) e a hora à direita.
4. **Clientes:** cartões em duas colunas com logótipo, nome, etiquetas de plano e saúde, fase atual, segmentos das fases (feitas sólidas, a atual a meio tom) e a última atividade.
5. **Movimento:** painéis e cartões entram em cascata (`rd-rise`, 30–40 ms entre eles); cartões sobem ao pairar (`rd-lift`).

## Testes

- Base de dados: `loadHome` devolve o primeiro nome de quem lê e a data local.
- Componentes: agrupamento de "Próximos eventos" por dia relativo; os testes existentes de indicadores, "Hoje" e clientes continuam válidos.
- E2E: o título do Início passa a ser a saudação (`tasks.spec.ts`, `team.spec.ts`).

## Critérios de conclusão

- Início igual à maquete aprovada nos dois temas; axe sem violações.
- `STATUS.md` atualizado.
