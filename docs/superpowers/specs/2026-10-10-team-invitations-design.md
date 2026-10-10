# Sub-projeto 2C — Equipa e convites

| Campo                   | Valor                                                                                                                                        |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| Data                    | 2026-10-10                                                                                                                                   |
| Estado                  | Aprovado (luz verde permanente do fundador, 2026-10-09)                                                                                      |
| Vaga                    | 2 (2A → 2B → **2C Equipa e convites** → 2D Aprovações e proofing → 2E … 2G)                                                                  |
| Módulos                 | M20 (RF-190), M06 (P-11)                                                                                                                     |
| Documentação de produto | `01` (RF-190), `02` (S-12, P-11), `04` (RN-51), `07` (notificações para a equipa), `08` (SEC-01, SEC-03, matriz "Permissões e utilizadores") |
| Depende de              | [2A Projetos, salas e processo](2026-10-09-rooms-process-design.md), [2B Tarefas, Início e atualizações](2026-10-09-tasks-home-design.md)    |

## 1. Objetivo

O fundador gere a equipa dentro do OS: convida gestores, freelancers e finanças, escolhe o papel de cada um, atribui clientes e, aos freelancers, projetos, e retira o acesso quando alguém sai. Regista o custo por hora e a disponibilidade semanal e vê a carga de cada pessoa. O decisor do cliente convida os colegas para o portal. Os gestores passam a receber os avisos de aprovação dos seus clientes, e quem recebe uma tarefa é avisado por email.

## 2. Decisões

1. **Convites enviados pelo OS, não pelo Supabase.** O link de convite é gerado pela API de administração (`generateLink`) e enviado com os modelos de email do OS (`team.invitation`, `client.invitation`), na língua da organização e com a marca do OS. O envio é feito no próprio serviço e não passa pelo outbox, para o token do link nunca ficar guardado em `domain_events`. Reenviar gera um link novo. O convite do cliente no 1B passa a usar o mesmo caminho.
2. **Acesso por projeto para freelancers (RN-51).** Uma tabela nova, `project_staff_assignments`, liga freelancers a projetos. O freelancer continua atribuído ao cliente, mas os dados de um projeto (projeto, fases, passos, atualizações, aprovações e tarefas desse projeto) só lhe aparecem se estiver atribuído ao projeto. A regra está na base de dados (`app.can_read_project`) e nos carregadores que leem em contexto de sistema. Gestores e fundador continuam a ver todos os projetos dos seus clientes.
3. **Atribuir um freelancer a um projeto atribui-o também ao cliente.** Retirá-lo do último projeto de um cliente não lhe tira o cliente (pode haver tarefas soltas do cliente); o fundador retira o cliente à parte.
4. **Custo e disponibilidade numa tabela própria**, `team_member_rates`, legível só pelo fundador e pelas finanças, porque são valores (RN-51: freelancers nunca veem valores, nem os seus). Campos: custo por hora, moeda e horas por semana.
5. **Carga semanal** é o número de tarefas abertas com data nesta semana (segunda a domingo, Lisboa) e o número de projetos ativos atribuídos, lado a lado com as horas disponíveis. Não há registo de horas nesta vaga.
6. **Ações críticas pedem MFA recente (SEC-03):** mudar o papel, retirar ou repor o acesso, mudar atribuições a clientes e projetos. Fora dos 15 minutos, o OS pede um código e volta à página.
7. **Retirar o acesso** põe a pertença em `revoked` e arquiva as atribuições a clientes e projetos. As sessões abertas deixam de valer de imediato, porque todas as regras de acesso exigem pertença ativa. Repor o acesso devolve a pertença a `active` sem as atribuições antigas. O fundador não pode retirar o próprio acesso nem o do último fundador.
8. **Portal, colegas (P-11):** só o decisor convida colegas para o seu cliente, escolhe o papel (decisor, operacional, finanças do cliente), muda-o e retira o acesso. Tem de ficar sempre pelo menos um decisor ativo, e o decisor não retira o próprio acesso.
9. **Avisos para a equipa:**
   - aprovação respondida e aprovação em atraso vão ao fundador e aos gestores atribuídos ao cliente (fecha o adiamento do 2A);
   - uma tarefa atribuída a outra pessoa envia-lhe um email com o título, o cliente e a data (fecha o adiamento do 2B).
10. **Escrita pelos serviços.** As tabelas novas são só de leitura para utilizadores; os serviços autorizam quem pede e escrevem em contexto de sistema, como desde o 1D.

## 3. Âmbito

### Incluído

1. **Definições › Equipa (S-12, `/settings/team`), só fundador:**
   - lista com nome, email, papel, estado (convidado, ativo, sem acesso), clientes, carga e disponibilidade;
   - convidar (email, nome, papel: gestor, freelancer, finanças) e reenviar o convite a quem ainda não entrou.
2. **Ficha da pessoa (`/settings/team/[userId]`):**
   - papel, retirar e repor o acesso;
   - custo por hora, moeda e horas por semana;
   - clientes atribuídos (gestor e freelancer) e, ao freelancer, projetos atribuídos.
3. **Acesso por projeto** na base de dados, nos carregadores da sala, no Início, no feed e nas tarefas.
4. **Portal › Definições › Colegas (`/portal/settings/team`), só decisor:** lista, convite, papel e retirar acesso.
5. **Emails:** `team.invitation`, `client.invitation`, `team.task_assigned`; os avisos de aprovação passam a incluir os gestores do cliente.
6. **Ponta a ponta do convite** pelo módulo real (fecha o adiamento da fundação): o fundador convida um freelancer, o link chega no email capturado, o freelancer define a palavra-passe e o MFA e vê só o projeto atribuído.

### Excluído (registado em `docs/STATUS.md`)

| Item                                                          | Motivo                                         | Volta quando              |
| ------------------------------------------------------------- | ---------------------------------------------- | ------------------------- |
| Centro de notificações no OS e preferências por tipo de aviso | Precisa de um modelo de notificações próprio   | Antes do primeiro cliente |
| Registo de horas e custo real por projeto                     | Sem registo de horas na vaga 2                 | Relatórios (M14, vaga 3)  |
| Acesso temporário de freelancers a credenciais (SEC-23)       | O cofre ainda não existe                       | Cofre                     |
| Escrita do freelancer na sala (passos, atualizações)          | A matriz diz "L E (próprio)"; o 2A deu leitura | Proofing (2D)             |
| Passkeys                                                      | Adiado desde a fundação                        | Antes do lançamento       |

## 4. Dados e acesso

| Tabela                      | Campos principais                                            |
| --------------------------- | ------------------------------------------------------------ |
| `project_staff_assignments` | organização, cliente, projeto, pessoa, arquivada em          |
| `team_member_rates`         | organização, pessoa, custo por hora, moeda, horas por semana |

- **`app.can_read_project(organização, cliente, projeto)`:** fundador e finanças; gestor atribuído ao cliente; freelancer atribuído ao cliente e ao projeto. Todas as vias exigem pertença ativa e MFA.
- As políticas de `projects`, `project_phases`, `project_steps`, `project_updates` e `approvals` passam a usar `app.can_read_project`. As tarefas de um projeto seguem a mesma regra; as tarefas do cliente sem projeto ficam como no 2B.
- **`project_staff_assignments`:** leitura pelo fundador e pela própria pessoa; escrita só por serviços.
- **`team_member_rates`:** leitura pelo fundador e pelas finanças; escrita só por serviços, a pedido do fundador.
- As vistas do portal não mudam: os clientes não dependem de atribuições.

## 5. Testes

- **Unitários:** carga semanal; regras do último fundador e do último decisor; formulários (convite, ficha, colegas).
- **Base de dados:**
  - RLS e isolamento das duas tabelas novas;
  - freelancer vê só os projetos atribuídos (projeto, fases, passos, atualizações, aprovações, tarefas);
  - convite gera o link sem email do Supabase e envia o email do OS; reenviar gera outro link;
  - mudar papel, retirar e repor o acesso, com MFA recente;
  - atribuir freelancer a projeto atribui o cliente;
  - decisor convida, muda papel e retira acesso, nunca ao último decisor;
  - avisos de aprovação aos gestores do cliente; email de tarefa atribuída.
- **Ponta a ponta:** o convite completo de um freelancer até ver só o projeto atribuído; o decisor convida um colega no portal; axe nas páginas novas.

## 6. Critérios de aceitação

1. O fundador convida, atribui e retira o acesso a uma pessoa sem sair do OS, e o convite chega pelo email do OS.
2. Um freelancer atribuído a um projeto de um cliente com dois projetos nunca vê o outro projeto, na sala, no Início, no feed ou nas tarefas.
3. Quem perde o acesso deixa de ver qualquer dado na sessão que já tinha aberta.
4. Custo por hora e disponibilidade só aparecem ao fundador e às finanças.
5. O decisor gere os colegas do seu cliente e nunca fica sem decisor.
6. Os testes de ponta a ponta e o axe passam em CI e em staging.
