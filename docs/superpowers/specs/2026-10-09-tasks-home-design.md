# Sub-projeto 2B — Tarefas, Início e atualizações

| Campo                   | Valor                                                                                                               |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------- |
| Data                    | 2026-10-09                                                                                                          |
| Estado                  | Aprovado (luz verde permanente do fundador, 2026-10-09)                                                             |
| Vaga                    | 2 (2A Projetos, salas e processo → **2B Tarefas, Início e atualizações** → 2C Equipa e convites → 2D … 2G)          |
| Módulos                 | M06 (RF-050), M07 (RF-065)                                                                                          |
| Documentação de produto | `01` (RF-050, RF-065), `02` (S-01, S-02, S-03, C-03), `03` (US-11), `07` (AUT-13), `08` (matriz "Salas e processo") |
| Depende de              | [2A Projetos, salas e processo](2026-10-09-rooms-process-design.md)                                                 |

## 1. Objetivo

A equipa abre o Início e vê o que precisa dela. As tarefas internas vivem numa lista global e em cada sala. Um feed reúne o que os clientes fizeram: aprovações, aceitações, assinaturas e pagamentos. O primeiro pagamento passa a criar também as tarefas de kickoff e de kit de boas-vindas.

## 2. Decisões

1. **Tarefas próprias, separadas dos acompanhamentos comerciais.** Os acompanhamentos (follow-ups) do 1A continuam no "Hoje" com a sua lógica. As tarefas são uma tabela nova, com cliente opcional (há tarefas do estúdio), projeto e passo opcionais, responsável, data, notas e subtarefas em lista de verificação.
2. **"Hoje" (US-11) junta, por urgência**, com as atrasadas primeiro e depois por data:
   - os itens comerciais que já existem;
   - tarefas para hoje ou atrasadas, do próprio ou sem responsável;
   - passos atrasados (data passada e por fazer);
   - aprovações respondidas com pedido de alterações nos últimos 7 dias;
   - pedidos de pagamento vencidos (só para quem lê faturação).
3. **Indicadores do Início:**
   - clientes com projeto ativo;
   - projetos ativos;
   - "à espera de si" (itens do Hoje);
   - "por receber", com o total dos pedidos de pagamento em aberto por moeda, só para quem lê faturação.
4. **Feed de atualizações (S-02)** lido dos eventos de domínio que vêm dos clientes, filtrado pelos clientes que a pessoa pode ler. Não há tabela nova: o OS já guarda estes eventos. Tipos:
   - proposta aceite;
   - contrato assinado pelo cliente;
   - pagamento recebido;
   - aprovação decidida.
5. **AUT-13, resto:** quando o projeto nasce do 2.2, o OS cria as tarefas "Agendar kickoff" (a 2 dias) e "Enviar kit de boas-vindas" (a 7 dias). O responsável é o gestor atribuído ao cliente ou, sem gestor, nenhum. O agendamento no calendário fica para o 2G.
6. **Próximos eventos** mostra as chamadas marcadas dos próximos 7 dias, que já existem. Os eventos do calendário chegam com o 2G.

## 3. Âmbito

### Incluído

1. **Tarefas (S-03 `/tasks`, C-03 `/c/:cliente/tasks`):**
   - criar, editar, concluir e reabrir tarefas, com título, notas, cliente, projeto, responsável, data e subtarefas;
   - na lista global, agrupadas por Hoje (inclui atrasadas), Esta semana e Mais tarde (inclui sem data);
   - filtros por cliente e responsável;
   - na sala, só as tarefas desse cliente.
2. **Início (S-01):**
   - saudação com a data;
   - ações rápidas: nova tarefa, abrir o pipeline, abrir as atualizações;
   - os 4 indicadores, o Hoje e os próximos eventos;
   - lista de clientes com barra de progresso (fases concluídas do projeto ativo) e última atividade.
3. **Atualizações (S-02 `/updates`):** o feed dos últimos 30 dias, com link para o negócio ou a sala.
4. **Navegação do estúdio:** Início, Atualizações, Tarefas e Pipeline (com Candidaturas e Angariação para quem vê o pipeline). Na sala, o separador Tarefas.
5. **AUT-13:** as duas tarefas de arranque, uma única vez por projeto.

### Excluído (registado em `docs/STATUS.md`)

| Item                                               | Motivo                               | Volta quando |
| -------------------------------------------------- | ------------------------------------ | ------------ |
| Eventos de calendário no Início e kickoff agendado | Agenda própria                       | 2G           |
| Comentários de clientes no feed                    | Os comentários chegam com o proofing | 2D           |
| Etiqueta de retainer na lista de clientes          | Retainers                            | Vaga 3       |
| Notificações das tarefas (email ao responsável)    | Equipa e notificações internas       | 2C           |

## 4. Dados e acesso

| Tabela       | Campos principais                                                                                                                                                                                       |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `tasks`      | organização, cliente (opcional), projeto (opcional), passo (opcional), título, notas, responsável, data, estado (`open`, `done`), concluída em, criada por, origem (`manual`, `kickoff`, `welcome_kit`) |
| `task_items` | tarefa, posição, título, feita                                                                                                                                                                          |

- **Leitura:**
  - com cliente: as regras da sala (`app.can_read_rooms`), em que o fundador e as finanças veem todos os clientes, e o gestor e o freelancer só os atribuídos;
  - sem cliente: fundador e gestores;
  - o freelancer vê também as tarefas que lhe estão atribuídas.
- **Escrita** por serviços que autorizam quem pede:
  - fundador e gestor atribuído criam, editam e apagam;
  - quem tem a tarefa atribuída conclui-a e marca as subtarefas.
- Nenhum cliente vê tarefas (são internas por natureza; US-12).
- Origem única: no máximo uma tarefa `kickoff` e uma `welcome_kit` por projeto.

## 5. Testes

- **Unitários:**
  - agrupamento Hoje / Esta semana / Mais tarde (fuso de Lisboa, semana de segunda a domingo);
  - ordenação por urgência;
  - indicadores.
- **Base de dados:**
  - RLS e isolamento de `tasks` e `task_items`;
  - quem cria, edita e conclui;
  - tarefas de arranque uma única vez;
  - Hoje com passos atrasados, aprovações respondidas e pedidos vencidos;
  - feed filtrado por cliente.
- **Ponta a ponta:** criar uma tarefa com subtarefa, concluí-la e vê-la sair do Hoje; o Início mostra os indicadores; o feed mostra um pagamento recebido; axe nas páginas novas.

## 6. Critérios de aceitação

1. Uma tarefa atrasada aparece no Hoje antes das de hoje e sai quando é concluída.
2. O projeto que nasce do 2.2 traz as duas tarefas de arranque, uma única vez.
3. Um freelancer vê só as suas tarefas e as dos clientes atribuídos, e nunca valores.
4. O feed mostra só clientes que a pessoa pode ler.
5. Os testes de ponta a ponta e o axe passam em CI e em staging.
