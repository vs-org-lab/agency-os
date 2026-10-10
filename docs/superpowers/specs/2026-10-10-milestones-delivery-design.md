# Sub-projeto 2D.2 — Marcos e entrega

| Campo                   | Valor                                                                                                                                                                          |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Data                    | 2026-10-10                                                                                                                                                                     |
| Estado                  | Implementado (2026-10-10)                                                                                                                                                      |
| Vaga                    | 2 (2A → 2B → 2C → 2D.1 → **2D.2 Marcos e entrega** → 2E … 2G)                                                                                                                  |
| Módulos                 | M05 (RF-040), M07, M08, M17 (RF-161)                                                                                                                                           |
| Documentação de produto | `04` (RN-04, RN-32, RN-51), `07` (AUT-16, AUT-21), `02` (F5, P-02), `03` (US-21), `08` (matriz de acessos: salas e processo)                                                   |
| Depende de              | [1D Faturação](2026-10-09-billing-design.md), [2A Projetos, salas e processo](2026-10-09-rooms-process-design.md), [2D.1 Proofing de ficheiros](2026-10-10-proofing-design.md) |

## 1. Objetivo

O dinheiro passa a seguir o trabalho. Cada marco de faturação fica ligado ao momento que o liberta: a assinatura, a aprovação de uma fase ou a entrega final. Quando o cliente aprova a fase ligada, o OS emite sozinho o pedido de pagamento desse marco; antes disso ninguém o pode pedir (RN-32, AUT-16). No fim do processo, a equipa pede a aprovação final; aprovada, o projeto fica entregue, o OS emite o pedido final, passa o negócio de 2.9 a 2.10 e trata do que vem depois da entrega: o pedido de testemunho, a caixa de celebração e a proposta de ativação (AUT-21, RF-161).

Fecha também dois itens adiados para aqui: os comentários de clientes no feed do estúdio e a escrita do freelancer na sala do seu projeto.

## 2. Decisões

1. **Gatilho do marco.** Cada marco ganha um gatilho: `signature` (assinatura, como hoje no AUT-12), `phase_approval` (aprovação de uma fase ligada) ou `delivery` (aprovação final). Ao criar o plano: o primeiro marco é `signature`; havendo mais de um, o último é `delivery`; os do meio são `phase_approval`. Os marcos existentes são migrados com a mesma regra.
2. **Ligação à fase.** Um marco `phase_approval` aponta para uma fase do projeto do negócio. A ligação é automática quando o projeto é criado (2.2): os marcos do meio ligam-se, por ordem, às fases que pedem aprovação. Um 40/30/30 no processo Orbit fica: 40% na assinatura, 30% na aprovação de "Descoberta e arquitetura", 30% na entrega. Se houver mais marcos do meio do que fases com aprovação, os que sobram ficam sem fase. O fundador e as finanças mudam a fase de um marco pendente na faturação do negócio (Pipeline › negócio › Faturação); só fases do projeto do negócio que pedem aprovação e ainda não foram aprovadas.
3. **RN-32 no pedido manual.** "Pedir pagamento" recusa um marco `phase_approval` cuja fase ainda não está aprovada e um marco `delivery` antes da aprovação final (`milestone_locked`). Um marco `phase_approval` sem fase continua a poder ser pedido à mão.
4. **AUT-16.** Quando o cliente aprova uma fase, uma função Inngest emite o pedido de cada marco pendente ligado a essa fase. É idempotente: um marco que já não está pendente fica como está.
5. **Aprovação final.** Novo tipo de aprovação `project`. A equipa pede-a na sala quando todas as fases estão feitas (projeto `completed`). O decisor decide no portal, em P-02, num grupo "Entrega":
   - **aprovada:** o projeto fica `delivered` (novo estado) com a data da entrega e o OS emite o evento `rooms.project.delivered`;
   - **alterações pedidas:** comentário obrigatório (RN-41); o OS cria a tarefa "Rever entrega final" ao gestor do cliente com o comentário; o projeto continua `completed` e a equipa volta a pedir quando estiver pronta.
6. **Entrega (AUT-21).** Ao `rooms.project.delivered`, uma função Inngest, por passos idempotentes:
   - emite os pedidos dos marcos `delivery` pendentes (a fatura final);
   - passa o negócio de 2.9 a 2.10, se o projeto tiver negócio;
   - envia ao decisor o pedido de testemunho (`lead.testimonial_request`);
   - cria a tarefa "Enviar caixa de celebração" ao fundador, com o conteúdo de RF-161 e prazo de 7 dias;
   - cria a tarefa "Preparar proposta de ativação" ao fundador, com prazo de 14 dias.
7. **Critério de 2.9 (RN-04).** A passagem a 2.10 só a faz o sistema e só com o projeto entregue e sem marcos por pedir. A equipa deixa de a poder fazer à mão (`process_driven`, como as restantes etapas do processo).
8. **Testemunho.** O email leva ao portal, a uma página com o texto (até 1000 caracteres), o nome e a função de quem escreve, e a autorização para publicar. O testemunho fica guardado; o fundador recebe um aviso com o texto (`founder.testimonial_received`). Um testemunho por projeto; voltar a enviar substitui o anterior.
9. **Comentários de clientes no feed (adiado do 2B).** O feed do estúdio (S-02) passa a mostrar os comentários de clientes nas provas, com ligação à versão. Só os do cliente: os da equipa não são atividade do cliente.
10. **Escrita do freelancer (adiado do 2C).** A matriz dá ao freelancer "L E (próprio, sem valores)" em salas e processo. O freelancer atribuído ao projeto passa a poder mudar o estado e editar os passos e publicar atualizações desse projeto. Continua sem iniciar ou concluir fases, sem pedir aprovações, sem mudar o projeto e sem ver marcos.
11. **Acesso.** Os marcos mantêm o acesso do 1D: leem quem lê a faturação; mudam a fase e pedem pagamento só o fundador e as finanças. A aprovação final é pedida pelo fundador e pelo gestor atribuído (`app.can_write_rooms`), como as de fase, e decidida só pelo decisor. O testemunho lê-se pela equipa da sala e escreve-se pelo decisor do cliente, por serviços.

## 3. Âmbito

### Incluído

1. **Faturação do negócio:** a coluna "Liberta em" em cada marco (assinatura, fase X, entrega) e, nos pendentes `phase_approval`, a escolha da fase; o botão "Pedir pagamento" fica desativado com o motivo quando o marco está preso.
2. **Sala:** "Pedir aprovação final" no plano quando todas as fases estão feitas; o estado do pedido; o projeto entregue com a data.
3. **Portal:** grupo "Entrega" em P-02 com aprovar e pedir alterações; a página do testemunho.
4. **Automações:** AUT-16 e AUT-21 como funções Inngest; ligação automática dos marcos às fases quando o projeto é criado.
5. **Emails:** o pedido e a decisão da aprovação final usam os avisos de aprovação existentes (decisor e equipa do cliente), com o assunto "entrega final"; novos `lead.testimonial_request` e `founder.testimonial_received`.
6. **Feed do estúdio:** comentários de clientes nas provas.
7. **Freelancer:** passos e atualizações do seu projeto.

### Excluído (registado em `docs/STATUS.md`)

| Item                                            | Motivo                                                            | Volta quando                                          |
| ----------------------------------------------- | ----------------------------------------------------------------- | ----------------------------------------------------- |
| Proposta de ativação gerada pelo OS             | O Gravity (retainers) ainda não existe; fica a tarefa ao fundador | Retainers (vaga 3)                                    |
| Lista de testemunhos e publicação no site       | O site e o Brand Hub ainda não existem                            | Brand Hub e sites (2F)                                |
| Caixa de celebração na renovação anual (RF-161) | A renovação pertence à Parceria                                   | Parceria (vaga 4)                                     |
| Health score (M17)                              | Precisa de dados de uso e de pagamentos ao longo do tempo         | Saúde e marcos (vaga 3)                               |
| Marcos ligados a fases em projetos sem negócio  | Sem contrato não há plano de faturação                            | Quando houver projetos fora do pipeline com faturação |

## 4. Dados e acesso

| Alteração            | Campos                                                                                                       |
| -------------------- | ------------------------------------------------------------------------------------------------------------ |
| `billing_milestones` | `trigger` (`signature`, `phase_approval`, `delivery`), `phase_id` (opcional, só com `phase_approval`)        |
| `projects`           | estado `delivered` no enum `project_status`; `delivered_at`                                                  |
| `approvals`          | `project` no enum `approval_subject` (sujeito = o projeto)                                                   |
| `testimonials`       | organização, cliente, projeto (único), autor, texto, nome, função, autoriza publicar, criado e atualizado em |

- `phase_id` referencia `project_phases (id, client_id)`, para a fase ser do mesmo cliente; o serviço garante que é do projeto do negócio e que pede aprovação.
- **Testemunhos:** RLS forçado; leitura pela equipa da sala (`app.can_read_project`) e pelo cliente pela vista `portal_testimonials` (decisor, os do seu cliente); escrita só por serviço.
- **Escrita do freelancer:** a autorização dos passos e das atualizações aceita, além de `app.can_write_rooms`, o freelancer com `app.can_read_project` para o projeto do passo ou da atualização.

## 5. Testes

- **Unitários:** gatilhos dos marcos a partir do plano (1, 2 e 3 ou mais marcos); ligação dos marcos às fases com aprovação (mais marcos que fases, menos marcos que fases); regra de 2.9 → 2.10 nas transições; componentes (coluna "Liberta em", grupo "Entrega", página do testemunho).
- **Base de dados:**
  - migração dos marcos existentes;
  - pedido manual recusado com a fase por aprovar e aceite depois;
  - aprovação da fase emite o pedido do marco ligado uma única vez;
  - mudar a fase de um marco (só pendentes, só fases do projeto com aprovação);
  - aprovação final: pedir só com todas as fases feitas; aprovar entrega o projeto; pedir alterações cria a tarefa;
  - entrega: pedido final emitido, negócio em 2.10, tarefas criadas, email de testemunho, tudo uma única vez;
  - testemunho guardado e substituído; RLS de `testimonials` e da vista;
  - feed com o comentário do cliente e sem os da equipa;
  - freelancer do projeto muda um passo e publica uma atualização; fora do projeto, não.
- **Ponta a ponta:** a equipa conclui as fases e pede a aprovação final; o cliente aprova no portal; o projeto aparece entregue e o pedido final aparece em Portal › Faturas; axe nas páginas novas.

## 6. Critérios de aceitação

1. Nenhum pedido de pagamento de um marco ligado sai antes da aprovação da fase ou da entrega, e sai sozinho quando ela chega.
2. A aprovação final entrega o projeto, emite a fatura final e passa o negócio a 2.10 sem passos manuais.
3. Depois da entrega existem, uma única vez, o pedido de testemunho e as tarefas da caixa e da proposta de ativação.
4. O freelancer trabalha nos passos e nas atualizações do seu projeto e continua sem ver valores.
5. Os testes de ponta a ponta e o axe passam em CI e em staging.
