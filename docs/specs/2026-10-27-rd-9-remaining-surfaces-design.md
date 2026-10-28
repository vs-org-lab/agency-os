# RD-9 — Superfícies restantes

Data: 2026-10-27 · Programa de redesenho 2 · Depende da RD-0 · Estado: aprovado pelo fundador (autonomia total, 2026-10-26)

## Objetivo

Fechar o programa nas superfícies que faltavam: finanças, construtor de processos e questionário interativo.

## Decisões

1. **Finanças:**
   - por baixo da faixa recebido · em aberto · gasto entram dois painéis;
   - "Pedidos em aberto por idade" agrupa por dias desde o envio: até 30, 31–60, 61–90 e mais de 90. Para cada grupo mostra o número de pedidos e o total por moeda, com um ponto de tom crescente (neutro, aviso, perigo);
   - "Recebido por cliente" mostra os oito clientes que mais pagaram no ano, com barras proporcionais. A ordem segue o total em euros e, sem euros, a soma das moedas;
   - os cálculos são funções puras do domínio de dinheiro (`openByAge`, `receivedByClient`) sobre os pedidos do ano já carregados.
2. **Construtor de processos:**
   - cada fase é um painel;
   - os passos mantêm a ordem, mas ficam em duas colunas, "O que o cliente vê" e "O que a equipa faz", conforme a visibilidade;
   - um passo encadeado mostra uma barra à esquerda.
3. **Questionário interativo (modo chamada):**
   - cada bloco abre com o eyebrow mono "Bloco N de M" e o título em 28–36 px;
   - o bloco entra com `rd-rise` ao avançar.

## Fora de âmbito

- **Selects personalizados nas definições.** Os selects nativos já seguem o tema desde a RD-0 (`color-scheme`, opções escuras). Passá-los a Radix obrigaria a reescrever os fluxos e2e que usam `selectOption`.
  - Revisitar numa passagem dedicada às definições, com os e2e atualizados no mesmo PR.

## Testes

- Domínio: grupos por idade (incluindo moedas sem conversão e pedidos pagos ou anulados de fora) e recebido por cliente.
- Componentes: painéis de finanças; os testes existentes do editor de processos e do modo chamada continuam válidos.

## Critérios de conclusão

- `STATUS.md` atualizado com o fecho do programa.
