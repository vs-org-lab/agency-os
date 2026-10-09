# Sub-projeto 2A — Projetos, salas e processo

| Campo                   | Valor                                                                                                                                                                                            |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Data                    | 2026-10-09                                                                                                                                                                                       |
| Estado                  | Implementado (ramo `feat/rooms`, 2026-10-09)                                                                                                                                                     |
| Vaga                    | 2 (**2A Projetos, salas e processo** → 2B Tarefas e Início → 2C Equipa e convites → 2D Aprovações e proofing → 2E Biblioteca → 2F Brand Hub → 2G Agenda)                                         |
| Módulos                 | M06 Salas e portal (RF-051 a RF-056), M07 Processo e tarefas (RF-060 a RF-064, RF-066), M08 (RF-070 e RF-072, só fases)                                                                          |
| Documentação de produto | `01` (M06, M07, M08), `02` (C-01, C-02, P-01, P-02, P-05), `03` (US-12, US-13, US-15), `04` (RN-40, RN-41, RN-43, RN-50, RN-51), `07` (AUT-13, AUT-14, AUT-15), `08` (matriz "Salas e processo") |
| Depende de              | [1D Faturação](2026-10-09-billing-design.md): o primeiro pagamento leva o negócio a 2.2                                                                                                          |

## 1. Objetivo

Depois do primeiro pagamento, o trabalho passa a viver numa sala. Cada cliente tem uma sala com os seus projetos. Cada projeto segue um processo de fases e passos, criado a partir de um modelo. A equipa publica atualizações, e o cliente acompanha tudo no portal e aprova as fases que o exigem. O pipeline de 2.3 a 2.9 acompanha o processo sozinho.

## 2. Decisões

1. **O processo é uma cópia do modelo.** Ao criar o projeto, as fases e os passos do modelo ativo são copiados. Mudar o modelo depois não altera projetos já em curso.
2. **Modelos de processo versionados** em Definições › Modelos, como os modelos do Core. Há um modelo por defeito, "Orbit", com as fases do pipeline:

   | Fase                     | Exige aprovação | Ao começar | Ao concluir |
   | ------------------------ | --------------- | ---------- | ----------- |
   | Descoberta e arquitetura | Sim             | 2.3        | 2.4         |
   | Produção                 | Não             | 2.5        | —           |
   | QA interno               | Não             | 2.6        | —           |
   | Apresentação e feedback  | Sim             | 2.7        | —           |
   | Ajustes finais           | Não             | 2.8        | —           |
   | Lançamento               | Não             | 2.9        | —           |

   Cada fase pode indicar o código que o negócio assume quando a fase começa e quando termina. Os modelos sem códigos não mexem no pipeline.

3. **O pipeline segue o processo.**
   - De 2.2 a 2.9, os avanços são feitos pelo sistema quando as fases começam ou terminam.
   - O fundador continua a poder mover à mão. O gestor não pode (regra `process_driven`).
   - 2.10 espera pela aprovação final e pela fatura final (2D).
4. **Aprovação de fase, sem proofing.** O pedido de aprovação é guardado numa tabela geral de aprovações, preparada para documentos e ficheiros no 2D. Só o decisor do cliente aprova ou pede alterações, e pedir alterações exige comentário (RN-41).
5. **"Ver como cliente"** usa as mesmas regras de visibilidade do portal sobre os mesmos dados. Um teste garante que a pré-visualização da equipa e o portal mostram exatamente o mesmo.
6. **Pessoas do projeto** são, por agora, as atribuições da equipa ao cliente que já existem. O acesso por projeto e o custo por hora chegam com o 2C.

## 3. Âmbito

### Incluído

1. **Modelos de processo** (Definições › Modelos › Processos):
   - criar e editar fases (nome, exige aprovação, códigos do pipeline) e passos (nome, visível ao cliente, enviado sozinho quando o anterior termina);
   - publicar uma nova versão e escolher o modelo por defeito;
   - modelo "Orbit" criado no primeiro uso.
2. **Criação do projeto:**
   - automática quando o negócio entra em 2.2 (AUT-13, parte "arranca o processo"), com o modelo por defeito;
   - ou manual na sala ("Novo projeto"), pelo fundador ou pelo gestor, com o modelo escolhido;
   - no máximo um projeto por negócio.
3. **Sala do cliente** (`/c/:cliente`): seletor de projeto quando há mais de um (RF-052) e separadores Dashboard e Atualizações. Os outros separadores do RF-051 chegam com os seus sub-projetos.
4. **Dashboard (C-01):**
   - fases à esquerda e passos à direita, na vista Passos;
   - vista Plano com as fases numa linha temporal semanal;
   - cartão do projeto com estado, fase atual, datas de início e de fim previsto e pessoas.
5. **Passos:**
   - estado (por fazer, em curso, feito), responsável, data, visível ao cliente;
   - quando um passo fica Feito, o passo seguinte ligado começa sozinho e, se for visível, é enviado ao cliente (AUT-14, US-13);
   - um passo enviado que volta a "em curso" fica assinalado e não é retirado (RN-43).
6. **Fases:**
   - começar uma fase exige a anterior concluída (RN-40, US-15);
   - concluir exige todos os passos feitos e, se a fase o exigir, a aprovação do cliente;
   - "Pedir aprovação" envia o pedido ao decisor; aprovar conclui a fase; pedir alterações, com comentário, devolve-a a "em curso".
7. **Atualizações (C-02, P-05):**
   - texto (até 5000 caracteres), marco opcional e visibilidade, interna por defeito (RN-50);
   - as entradas visíveis notificam o decisor;
   - o sistema acrescenta entradas visíveis quando um passo é enviado, uma fase é concluída ou uma aprovação é decidida.
8. **Portal:**
   - Início (P-01): fase atual e próximo passo, aprovações pendentes e últimas atualizações, junto do que já existe (proposta, contrato, pagamentos);
   - Aprovações (P-02): fases à espera de decisão;
   - Atualizações (P-05).
   - Decisor e operacional veem a sala; as finanças do cliente não.
9. **"Ver como cliente"** (`/c/:cliente/preview`, US-12): a sala como o decisor a vê, sem itens internos.
10. **Emails:**
    - ao decisor: nova atualização visível, passo enviado, aprovação pedida e lembrete aos 2 dias;
    - à equipa (fundador e gestores do cliente): aprovação decidida, e aprovação sem resposta aos 5 dias (AUT-15).

### Excluído (registado em `docs/STATUS.md`)

| Item                                                                          | Motivo                                       | Volta quando            |
| ----------------------------------------------------------------------------- | -------------------------------------------- | ----------------------- |
| Tarefas internas, Início da equipa, feed global (RF-050, RF-065, S-01 a S-03) | Sub-projeto próprio                          | 2B                      |
| Kickoff agendado e tarefa do kit de boas-vindas (resto do AUT-13)             | Dependem das tarefas e da agenda             | 2B e 2G                 |
| Ficheiros nas atualizações                                                    | Os ficheiros vivem na Biblioteca             | 2E                      |
| Acesso por projeto, freelancers por projeto, custo por hora                   | Equipa e permissões finas                    | 2C                      |
| Comentários posicionados, rondas, aprovação de documentos e ficheiros         | Proofing                                     | 2D                      |
| Fase ligada a marco de faturação e 2.10 (RN-32, AUT-16, AUT-21)               | Precisa da aprovação final e da fatura final | 2D                      |
| Portal no domínio do cliente (RF-054)                                         | Infraestrutura de domínios                   | Critérios de lançamento |

## 4. Fluxo

1. O primeiro pagamento leva o negócio a 2.2 (1D). O evento `commercial.deal.stage_changed` cria o projeto com o modelo por defeito, sem fase começada, e publica a atualização visível "Projeto iniciado".
2. A equipa começa a primeira fase. O negócio passa a 2.3, e o primeiro passo da fase fica em curso.
3. Os passos avançam. Um passo ligado começa sozinho e, se for visível, chega ao portal e ao email do decisor.
4. Com todos os passos feitos, numa fase que exige aprovação, a equipa pede a aprovação. O decisor aprova no portal; a fase fica concluída e o negócio passa a 2.4.
5. A fase seguinte começa (2.5), e assim até ao Lançamento (2.9).

## 5. Dados e acesso

| Tabela              | Campos principais                                                                                                                                                                                                         |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `process_templates` | organização, nome, versão, definição (fases e passos), ativa, por defeito, publicado por                                                                                                                                  |
| `projects`          | organização, cliente, negócio (único quando existe), nome, estado (`active`, `paused`, `completed`, `cancelled`), modelo e versão, início, fim previsto, criado por                                                       |
| `project_phases`    | projeto, posição, nome, exige aprovação, código ao começar, código ao concluir, estado (`pending`, `in_progress`, `awaiting_approval`, `done`), começada em, concluída em, data prevista                                  |
| `project_steps`     | fase, posição, nome, estado (`todo`, `in_progress`, `done`), responsável, data, visível ao cliente, ligado ao anterior, enviado em, reaberto depois de enviado                                                            |
| `project_updates`   | projeto, autor (ou sistema), texto, marco, visibilidade (`internal`, `client`), tipo (`manual`, `project_started`, `step_shared`, `phase_done`, `approval_decided`)                                                       |
| `approvals`         | organização, cliente, projeto, objeto (`phase`) e identificador, estado (`pending`, `approved`, `changes_requested`, `withdrawn`), pedido por e em, decidido por e em, comentário, lembrete enviado em, alerta enviado em |

**Acesso** (matriz "Salas e processo" de `08`):

- Leitura da equipa:
  - fundador e finanças: todos os clientes;
  - gestor e freelancer: só os clientes que lhes estão atribuídos (`app.can_read_rooms`).
- Escrita da equipa:
  - fundador e gestor atribuído;
  - o freelancer atribuído só muda o estado dos passos que lhe estão atribuídos.
- Todas as escritas passam por serviços que autorizam quem pede.
- Portal: vistas com `security_barrier` (`portal_projects`, `portal_project_phases`, `portal_project_steps`, `portal_project_updates`, `portal_approvals`).
  - Expõem só o que é visível ao cliente, a decisor e operacional.
  - As finanças do cliente ficam de fora.
  - Aprovar ou pedir alterações é só do decisor.
- Os projetos não guardam valores; nada muda nas regras de valores (RN-51).

**Eventos**

- `rooms.project.created`
- `rooms.step.shared`
- `rooms.update.published`
- `rooms.approval.requested`
- `rooms.approval.decided`

## 6. Erros e regras

| Regra / situação                                                    | Resposta do servidor                                        |
| ------------------------------------------------------------------- | ----------------------------------------------------------- |
| Começar uma fase com a anterior por concluir ou por aprovar (US-15) | Recusa `previous_phase_open`, com o motivo                  |
| Concluir uma fase com passos por fazer                              | Recusa `steps_open`                                         |
| Concluir uma fase que exige aprovação sem aprovação                 | Recusa `approval_required`                                  |
| Pedido de alterações sem comentário (RN-41)                         | Recusa `comment_required`; o botão fica bloqueado no portal |
| Aprovação decidida duas vezes (duplo clique, dois separadores)      | A segunda devolve o estado atual, sem novo efeito           |
| Mudança de etapa do negócio recusada                                | Fica no registo; o processo continua                        |

## 7. Testes

- **Unitários:**
  - validação do modelo;
  - regras de começar e concluir fases;
  - cadeia de passos (RN-43);
  - linha temporal do Plano;
  - regras do pipeline (`process_driven`, códigos 2.3 a 2.9).
- **Base de dados:**
  - RLS e isolamento das tabelas e vistas novas, para cada papel da matriz;
  - criação no 2.2 uma única vez;
  - passo ligado enviado;
  - aprovação e pedido de alterações;
  - mudança de etapa;
  - "Ver como cliente" igual ao portal.
- **Ponta a ponta:** do negócio em 2.2 ao projeto criado, fase começada (2.3), passo ligado visível no portal, aprovação pedida e aprovada no portal (2.4) e atualização no feed; axe nas páginas novas.

## 8. Critérios de aceitação

1. O primeiro pagamento cria o projeto com o processo Orbit, sem intervenção.
2. Um passo ligado chega sozinho ao cliente quando o anterior termina.
3. Uma fase que exige aprovação não deixa começar a seguinte sem a aprovação do decisor.
4. O negócio percorre 2.3 a 2.9 à medida que as fases avançam.
5. "Ver como cliente" nunca mostra um item interno.
6. Os testes de ponta a ponta e o axe passam em CI e em staging.

## 9. Riscos

| Risco                                | Mitigação                                                                                    |
| ------------------------------------ | -------------------------------------------------------------------------------------------- |
| Item interno exposto ao cliente      | Interno por defeito; vistas do portal com filtros; teste de igualdade com a pré-visualização |
| Pipeline e processo dessincronizados | O sistema move o negócio na mesma transação que a fase; as recusas ficam registadas          |
| Modelo alterado a meio de um projeto | O projeto guarda a sua cópia; as versões do modelo não o afetam                              |
