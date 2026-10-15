# Sub-projeto 3D — Saúde e marcos

| Campo                   | Valor                                                                                     |
| ----------------------- | ----------------------------------------------------------------------------------------- |
| Data                    | 2026-10-15                                                                                |
| Estado                  | Aprovado (luz verde permanente do fundador)                                               |
| Vaga                    | 3 (… → 3C Resultado e garantia → **3D Saúde e marcos** → 3E Relatórios e QBR → 3F Adoção) |
| Módulos                 | M17 (RF-160, RF-161), C-01 (cartão de saúde), AUT-29                                      |
| Documentação de produto | `01` (M17), `03` (US-21), `07` (AUT-21, AUT-29), `08`                                     |
| Depende de              | 1D Faturação, 2A Salas, 2D Aprovações e entrega, 2E Documentos, 2C Provas, 3C Resultado   |

## 1. Objetivo

A equipa vê num relance se um cliente está bem: um health score de 0 a 100 no dashboard da sala, feito de quatro sinais com o detalhe de cada um. E o gesto da renovação anual nunca falha: no aniversário da parceria, o OS cria a tarefa da caixa de celebração (AUT-29). A caixa da entrega já existe desde o 2D.2.

## 2. Decisões

1. **Quatro sinais (RF-160), cada um de 0 a 100, ou sem dados:**
   - **Pagamentos em dia:** dos pedidos de pagamento com vencimento nos últimos 12 meses e até hoje, não anulados, a parte paga até ao vencimento (data de pagamento em Lisboa). Um pedido em aberto conta como atrasado só depois do vencimento, por mais antigo que seja; no dia do vencimento ainda não conta.
   - **Tempo de aprovação:** a mediana dos dias entre o pedido e a decisão das aprovações do cliente pedidas nos últimos 6 meses. As pendentes contam com os dias que já passaram, mesmo pedidas há mais de 6 meses. 3 dias ou menos valem 100; 14 dias ou mais valem 0; entre os dois, linear.
   - **Tempo de resposta:** em provas e documentos, a mediana das horas entre um comentário visível da equipa e a resposta seguinte do cliente na mesma prova (versão) ou no mesmo documento, nos últimos 6 meses. Só contam as respostas que chegam até 14 dias depois; comentários sem resposta não contam, porque muitos são informativos. 24 horas ou menos valem 100; 7 dias ou mais valem 0; entre os dois, linear.
   - **Evolução do resultado:** com um resultado acordado e pelo menos um valor, o progresso é (último valor − linha de base) / (meta − linha de base), entre 0 e 1. O esperado é a parte já decorrida entre a criação do resultado e o prazo, entre 0 e 1. O sinal é `min(1, progresso / esperado) × 100`, ou 100 quando o esperado ainda é 0. Uma garantia `not_activated` ou `closed` com `target_met` vale 100.
2. **Score:** a média, arredondada, dos sinais com dados. Sem nenhum sinal, o cliente fica "Sem dados". Níveis: **Saudável** a 75 ou mais, **Atenção** de 50 a 74, **Em risco** abaixo de 50.
3. **Calculado ao ler, sem histórico.** O score é calculado quando o dashboard abre e não é guardado. Tendências e alertas de descida ficam para os painéis do 3E.
4. **Quem vê:** o fundador, as finanças e o gestor de projeto atribuído. O score usa pedidos de pagamento, que a matriz do `08` esconde aos freelancers, por isso os freelancers não o veem. O cliente também não o vê.
5. **Cartão no C-01:** no dashboard da sala, abaixo do cabeçalho, com o score, o nível e uma linha por sinal. Cada linha tem o valor e o detalhe ("4 de 5 pedidos pagos a tempo", "mediana de 2 dias", "mediana de 30 horas", "62% da meta com 50% do tempo") ou "Sem dados".
6. **Caixa da renovação (AUT-29, RF-161).** No aniversário do primeiro contrato assinado do cliente (1, 2, 3… anos), cria a tarefa "Enviar caixa de celebração da renovação":
   - ao gestor único (`soleClientManager`) ou sem responsável, com vencimento a 7 dias;
   - as notas listam a caixa: monumento, carta, espumante ou alternativa sem álcool. Acrescentam "manual impresso do Brand Hub" quando o cliente tem um Brand Hub publicado.

   Um varrimento diário às 08:15 de Lisboa trata os aniversários dos últimos 7 dias, para recuperar dias falhados, uma vez por cliente e por ano (tabela `client_milestones`, única por cliente, tipo e ano). Só para clientes ativos.

## 3. Âmbito

### Incluído

- **Dados:** `client_milestones` (`organization_id`, `client_id`, `kind` `renewal_anniversary`, `year`, `task_id`, `created_at`), com RLS de leitura para quem lê a sala e sem escrita para `authenticated`.
- **Lógica:**
  - domínio dos quatro sinais, do score e dos níveis (puro e testado);
  - leitor `loadClientHealth` com as quatro consultas;
  - varrimento das renovações.
- **Automação:** `milestones-renewal-sweep` (`TZ=Europe/Lisbon 15 8 * * *`).
- **Ecrã:** cartão "Saúde" no C-01.
- **E2E:** o fundador vê o cartão de saúde com os sinais de um cliente com pedidos pagos e uma aprovação decidida; axe no C-01.

### Excluído (registado em `docs/STATUS.md`)

| Item                                              | Motivo                                  | Quando      |
| ------------------------------------------------- | --------------------------------------- | ----------- |
| Histórico do score, tendência e alerta de descida | Os painéis da equipa chegam no 3E       | 3E          |
| Score na lista de clientes do Início (S-01)       | O Início muda no 3E com os painéis      | 3E          |
| Pesos dos sinais configuráveis                    | Pesos iguais bastam até haver uso real  | Pedido real |
| Caixa noutros marcos (resultado atingido, QBR)    | O RF-161 nomeia a entrega e a renovação | Pedido real |

## 4. Testes

- **Unitários:**
  - cada sinal com dados e sem dados, incluindo os limites (3 e 14 dias, 24 horas e 7 dias, meta atingida, esperado 0);
  - média só dos sinais com dados, arredondamento e níveis nos limites (49, 50, 74, 75);
  - aniversários: datas dos últimos 7 dias, 29 de fevereiro, anos completos;
  - cartão do C-01 com cada nível, "Sem dados" e o detalhe dos sinais.
- **Base de dados:**
  - `loadClientHealth` com um cliente de pedidos pagos a tempo e atrasados, aprovações decididas e pendentes, comentários com e sem resposta, e um resultado com valores;
  - o freelancer e o cliente recebem `null`; outro cliente nada;
  - o varrimento das renovações cria uma tarefa por cliente e por ano, mesmo corrido duas vezes, com o manual impresso quando há Brand Hub publicado, e ignora clientes arquivados e o próprio dia da assinatura;
  - RLS de `client_milestones`.
- **E2E:** o percurso do âmbito.

## 5. Critérios de aceitação

1. O dashboard da sala mostra à equipa com acesso a faturação um score de 0 a 100 com o nível e os quatro sinais, ou "Sem dados".
2. Freelancers e clientes nunca veem o score.
3. No aniversário de cada ano de parceria, o gestor recebe uma única tarefa da caixa de celebração da renovação.
