# UX-3 — Dashboard do portal do cliente

Data: 2026-10-26 · Programa de redesenho da UI e UX · Depende da UX-0 a UX-2 · Estado: aprovado (autorização do fundador para o programa completo, 2026-10-26)

## Objetivo

Dar ao cliente, logo no Início do portal, a resposta a três perguntas: o que tenho de fazer, quanto me resta do plano e em que ponto está o meu trabalho. Referências: `Screenshot 2026-10-21 002003` e `003105` (anéis por franquia, período de faturação, quadro de trabalho e painel do plano).

## Hoje no portal

- O Início é uma pilha de cartões: sala, pagamento, proposta e, se houver, as apresentações e o briefing do Core.
- O retainer vive em "Progresso", com barras e o pedido de trabalho.
- Os pedidos do cliente (`requestWork`) criam tarefas internas `manual` com o prefixo "Pedido do cliente: ". O cliente nunca lê tarefas (RLS), por isso não vê em que estado está o que pediu.
- Não há boas-vindas no primeiro acesso, nem momento de pagamento, nem comparação entre versões de uma prova.

## Decisões

1. **Início do portal em dashboard**, por esta ordem:
   - **Cabeçalho:** logótipo ou avatar do cliente, saudação com o nome do contacto (Fraunces `brand-display`, como prevê o design system para o que o cliente vê) e a data.
   - **"A sua ação"** (só quando há): aprovações pendentes, provas por rever, propostas e contratos por assinar e pedidos de pagamento por pagar. Cada item mostra o tipo, o nome, a data-limite quando existe e um botão direto. Fica vazio e escondido quando não há nada. É a única zona com ação principal sólida.
   - **Plano (retainer):** faixa de `AllowanceRing` por tipo (restantes e "X de Y usados") e o anel neutro do período ("N dias para renovar · DD/MM a DD/MM"); à direita, "Pedir trabalho" (abre o diálogo do pedido existente). Painel "O seu plano" lateral ou dobrável: o que inclui (limites por tipo), regras (o que transita e o que expira, segundo `allowance`), valor mensal e data de revisão.
   - **"O seu trabalho"** (retainer): quadro com três colunas e contagem: "Recebido" (pedido sem responsável), "Em curso" (com responsável, aberto) e "Feito este mês". Cada cartão tem a descrição do pedido, a data e o tipo quando foi registado consumo. "Ver tudo" leva a "Progresso".
   - **Projeto** (clientes com sala): fases em stepper horizontal com a fase atual destacada, o próximo marco e a data prevista; link para a sala.
   - Os cartões atuais de proposta, pagamento e Core continuam, mas entram em "A sua ação" quando pedem algo ao cliente, ou numa secção "Documentos recentes" quando são só consulta.
2. **Estado dos pedidos visível ao cliente, sem expor tarefas:**
   - Tabela nova `retainer_requests`: `id`, `organization_id`, `client_id`, `retainer_id`, `task_id` (→ tasks, `set null`), `description` (1–2000), `created_by`, `created_at`. `requestWork` passa a criar a linha na mesma transação que cria a tarefa.
   - O cliente lê os seus pedidos por uma função `app.client_retainer_requests(p_client uuid)`, `security definer` e `stable`, que exige `app.is_client_member(p_client)` e devolve só `id`, `description`, `state` (`received` | `in_progress` | `done`, calculado a partir do `status` e do `assignee_id` da tarefa, ou `received` se a tarefa foi apagada) e `created_at`/`completed_at`. Nenhum outro campo da tarefa sai.
   - A equipa lê a tabela pelas mesmas regras de leitura do retainer.
   - Pedidos anteriores a esta fase não aparecem no quadro (só existem dados de teste).
3. **Boas-vindas no primeiro acesso** (padrão `onboarding-dialog` da Origin UI, MIT): diálogo com 3 passos ("Onde vê o seu trabalho", "Como aprova", "Como pede trabalho"), indicador de passos com morph e "Saltar". Mostra-se uma vez por utilizador: novo valor `portal_onboarding` em `seen_area` e o marcador existente de "visto". Nunca aparece na pré-visualização da equipa.
4. **Momento de pagamento** (padrão `receipt-printer`, implementação própria): quando o cliente volta do Stripe com o pagamento confirmado, ou abre um pedido já pago pela primeira vez, o recibo "sai" de uma ranhura (token `moment`, 600–1200 ms) com o número do pedido, o valor e a data, e depois fica estático. Com "reduzir movimento" aparece já impresso. Um momento por evento, como manda o design system.
5. **Comparar versões de uma prova** (padrão `image-compare` / `feature-with-image-comparison`, MIT): quando a versão atual e a anterior de uma prova são imagens, o visualizador ganha "Comparar com a versão anterior". Mostra as duas versões sobrepostas com uma divisória arrastável (rato, toque e teclado com setas, `role="slider"` com `aria-valuenow`). Vale para o portal e para a equipa. Os URLs assinados vêm das mesmas leituras do proofing.
6. **Lista e quadro com `card-tabs`** (21st.dev, MIT): "O seu trabalho" no portal e o cartão "Trabalho atual" da equipa ganham um cabeçalho com separadores Lista · Quadro (indicador partilhado da UX-0); a escolha fica na URL (`view=list|board`).
7. **Responsáveis com `member-selector`** (padrão da 21st.dev, licença desconhecida, implementação própria): nas tarefas (tabela, painel e criação) e nos passos da sala, o `Select` de responsável passa a um seletor com avatar, procura por nome, os membros com acesso à sala primeiro e "Sem responsável"; teclado completo e `role="listbox"`. As regras de quem pode ser responsável não mudam (`validAssignee`).
8. **Navegação do portal:** "Progresso" passa a "Plano e resultado". O conteúdo detalhado (registos do mês, pedidos extra, resultado acordado) fica lá. O Início mostra o resumo.

## Segurança (08)

- `retainer_requests`: RLS forçado; `select` para a equipa com as regras de leitura do retainer; nenhum `select` direto para clientes (só pela função). Escritas só no serviço `requestWork`.
- A função do cliente valida a pertença e devolve um conjunto mínimo de campos; testes de RLS provam que um cliente não lê pedidos de outro cliente e que nenhum campo interno da tarefa sai (responsável, notas, título interno).
- O marcador de boas-vindas usa a tabela de "visto" existente e as suas políticas.

## Fora de âmbito

- Pedidos com anexos e prioridade, notificações em tempo real do quadro, testemunho em vídeo (UX-5).

## Testes

- Base de dados: função do cliente (estados `received`, `in_progress` e `done`; outro cliente → zero linhas; campos devolvidos); `requestWork` cria a linha e a tarefa na mesma transação; seen marker `portal_onboarding`.
- Componentes: "A sua ação" escondida sem itens; anéis e período; quadro com contagens; boas-vindas (3 passos, "Saltar", teclado, não aparece na pré-visualização); recibo (com "reduzir movimento" aparece estático); comparação (teclado com setas e `aria-valuenow`, só com duas imagens).
- E2E: o cliente entra, vê as boas-vindas uma vez, pede trabalho e vê-o em "Recebido"; a equipa atribui a tarefa e o pedido passa a "Em curso".

## Critérios de conclusão

- Início do portal com "A sua ação", plano e trabalho; "Progresso" renomeado.
- Pedidos do retainer com estado visível ao cliente pela função.
- Boas-vindas, recibo e comparação de versões entregues, com "reduzir movimento".
- `STATUS.md` e `INVENTORY.md` atualizados.
