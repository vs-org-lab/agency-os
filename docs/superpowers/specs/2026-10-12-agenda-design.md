# Sub-projeto 2G — Agenda

| Campo                   | Valor                                                                                                                                                                       |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Data                    | 2026-10-12                                                                                                                                                                  |
| Estado                  | Aprovado (aprovação permanente do fundador)                                                                                                                                 |
| Vaga                    | 2 (… → 2F.1 Brand Hub: editor, publicação e portal → **2G Agenda**; 2F.2 fica a seguir)                                                                                     |
| Módulos                 | M11 (RF-100), M06 (separador Agenda da sala), S-01 (Próximos eventos), S-04, AUT-13 (kickoff agendado)                                                                      |
| Documentação de produto | `01` (RF-100), `02` (arquétipo Calendário, S-01, S-04, F2), `06` (Google Calendar), `07` (AUT-13), `08` (matriz)                                                            |
| Depende de              | [1A Comercial](2026-10-07-commercial-design.md) (ligação ao Google Calendar), [2A Salas](2026-10-09-rooms-process-design.md), [2B Tarefas](2026-10-09-tasks-home-design.md) |

## 1. Objetivo

A equipa vê num só calendário tudo o que tem data: as reuniões que marca, as chamadas comerciais, os prazos das fases, dos passos e das tarefas, e as entregas dos projetos. O calendário aparece no estúdio (S-04, com uma cor por cliente) e em cada sala, já filtrado pelo cliente. Uma reunião criada no OS vai para o Google Calendar do anfitrião ligado, com link do Meet e, se a equipa quiser, com convite ao decisor do cliente. O Início passa a mostrar os próximos eventos, e o kickoff de cada projeto marca-se aqui.

## 2. Decisões

1. **Eventos próprios e eventos lidos.**
   - Tabela nova `agenda_events` para as reuniões marcadas no OS.
   - Os outros itens do calendário são lidos das suas tabelas, sem cópia:
     - chamadas (`calls`): só para quem lê o pipeline;
     - prazos de fase (`project_phases.due_on`);
     - prazos de passo (`project_steps.due_on`);
     - prazos de tarefa (`tasks.due_on`), com as regras de visibilidade das tarefas do 2B;
     - entregas (`projects.ends_on`).
   - Prazos e entregas são itens de dia inteiro; reuniões e chamadas têm hora.
2. **Tipos de reunião:** `kickoff`, `meeting` (reunião com o cliente), `review` (revisão) e `internal` (sem cliente). Título 1–120, notas até 2000, local ou link até 500, início e fim (fim depois do início, até 12 horas).
3. **Âmbito de cada reunião.** Uma reunião `internal` pertence à organização. As outras pertencem a um cliente e, opcionalmente, a um projeto desse cliente. Um `kickoff` exige projeto.
4. **Google Calendar (RF-100, `06`).**
   - O OS cria, muda e apaga o evento no calendário do anfitrião ligado no 1A (`getHostCalendar`), pela porta existente.
   - O evento leva o link do Meet devolvido pelo Google. Com "Convidar o decisor", o decisor do cliente vai como convidado e recebe o convite do próprio Google.
   - A sincronização corre numa função Inngest com repetições, como as chamadas. A reunião guarda `sync_status` (`pending`, `synced`, `failed`), `external_event_id` e `meet_url`.
   - Sem calendário ligado, a reunião fica no OS com `failed` e um aviso; voltar a guardar tenta de novo.
   - Em CI e em staging sem ligação usa-se o calendário falso do 1A.
   - **Sentido Google → OS:** o calendário mostra, na vista semanal, os blocos ocupados do anfitrião (`freeBusy`) como "Ocupado", sem título nem pormenores. Importar os eventos do Google fica adiado.
5. **Kickoff (AUT-13).** Marcar um `kickoff` para um projeto fecha a tarefa "Agendar kickoff" desse projeto, se estiver aberta.
6. **Vistas (arquétipo Calendário):**
   - mês, semana e agenda (lista dos próximos 30 dias);
   - "Hoje", anterior e seguinte;
   - clicar num dia (mês) ou numa hora (semana) abre "Nova reunião" com a data preenchida;
   - filtros em chips pelos tipos de item;
   - estado vazio "Sem eventos".
   - Datas e horas em Europe/Lisbon.
7. **Onde aparece:**
   - S-04 `/calendar`: todos os clientes que o utilizador lê, com a cor de cada cliente (derivada do id, estável) e as reuniões internas.
   - Sala `/c/:cliente/agenda`: só esse cliente.
   - S-01 Início: o bloco "Próximos eventos" com os próximos 5 itens com hora e os prazos dos próximos 7 dias.
8. **Quem faz o quê (matriz do `08`):**
   - fundador e gestor do cliente: veem e marcam reuniões dos clientes que escrevem e reuniões internas;
   - freelancer: vê as reuniões e os prazos dos projetos em que trabalha, e não marca;
   - financeiro: vê as entregas e os prazos das salas que lê (como no 2A) e não marca;
   - chamadas só para quem lê o pipeline;
   - o cliente não vê a agenda no portal nesta vaga.
9. **Mudar e cancelar.** Quem marca pode mudar data, hora, título, notas, local e o convite, ou cancelar. Cancelar apaga o evento no Google e marca a reunião `cancelled`, que deixa de aparecer. Uma reunião passada não muda.

## 3. Âmbito

### Incluído

1. Tabela `agenda_events` com RLS e escrita só por serviços; leitor que junta reuniões, chamadas, prazos e entregas num intervalo de datas.
2. S-04 `/calendar` e o separador Agenda da sala, com mês, semana e agenda; formulário "Nova reunião" e "Editar reunião" num diálogo.
3. Sincronização com o Google Calendar (criar, mudar, apagar) e blocos ocupados na semana.
4. Kickoff que fecha a tarefa "Agendar kickoff".
5. Bloco "Próximos eventos" no Início.
6. Entradas Calendário no menu do estúdio (entre Tarefas e Pipeline) e Agenda no menu da sala.

### Excluído (registado em `docs/STATUS.md`)

| Item                                                       | Motivo                                                                                  | Volta quando                     |
| ---------------------------------------------------------- | --------------------------------------------------------------------------------------- | -------------------------------- |
| Importar eventos do Google para o OS (sentido Google → OS) | Exige notificações push do Google ou leitura periódica; os blocos ocupados cobrem o uso | Pedido real                      |
| Calendário de cada membro da equipa                        | Hoje só o anfitrião da organização liga o calendário (1A)                               | Equipa com mais pessoas a marcar |
| Agenda no portal do cliente                                | O portal não tem ecrã de calendário na documentação                                     | Pedido real                      |
| Reuniões repetidas                                         | Sem caso concreto                                                                       | Pedido real                      |
| Arrastar eventos para mudar a data                         | O diálogo de edição cobre o caso                                                        | Pedido real                      |
| Datas de faturas e de QBR no calendário                    | Vêm com os retainers e os relatórios (Vaga 3)                                           | Vaga 3                           |

## 4. Dados e acesso

| Tabela          | Campos                                                                                                                                                                                                                                               |
| --------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `agenda_events` | organização, cliente (nulo só em `internal`), projeto (opcional), `kind`, título, notas, local, `starts_at`, `ends_at`, `invite_client`, `status` (`scheduled`, `cancelled`), `sync_status`, `external_event_id`, `meet_url`, criado por, timestamps |

- FKs compostas `(client_id, organization_id)` e `(project_id, client_id)`. `CHECK` no tipo e no cliente, no kickoff com projeto, no fim depois do início com no máximo 12 horas, e nos comprimentos.
- **RLS forçado; escrita só por serviços.** Leitura:
  - reunião interna: `app.has_org_role(org, founder, project_manager)`;
  - reunião com cliente e sem projeto: `app.can_read_rooms`;
  - reunião com projeto: `app.can_read_project`.
- As chamadas, os prazos e as entregas são lidos com as permissões que já têm, sob a RLS do utilizador.

## 5. Testes

- **Unitários:**
  - grelhas de mês e de semana em Europe/Lisbon, incluindo a mudança de hora;
  - cor estável por cliente;
  - validação da reunião (tipo e cliente, kickoff com projeto, duração);
  - componentes: as três vistas, os filtros, o diálogo, o estado vazio e o bloco do Início;
  - navegação.
- **Base de dados:**
  - marcar, mudar e cancelar uma reunião, com auditoria;
  - o freelancer e o financeiro não marcam;
  - leitor do intervalo: reuniões, chamadas só para quem lê o pipeline, prazos de fase, passo e tarefa, e entregas;
  - filtro por cliente na sala;
  - um cancelamento sai do calendário;
  - kickoff fecha "Agendar kickoff";
  - sincronização: criar, mudar e apagar no calendário falso, `failed` sem ligação e nova tentativa ao guardar;
  - RLS e isolamento da tabela nova;
  - próximos eventos do Início.
- **Ponta a ponta:** o fundador marca um kickoff na agenda da sala com convite ao decisor; o evento aparece no mês do S-04 com a cor do cliente e no Início; a tarefa "Agendar kickoff" fica feita; axe no S-04 e na agenda da sala.

## 6. Critérios de aceitação

1. Uma reunião marcada no OS aparece no Google Calendar do anfitrião, com o Meet e, quando pedido, o convite ao decisor.
2. O calendário de cada pessoa só mostra o que ela pode ler: chamadas só para quem lê o pipeline, e salas e projetos pelas regras existentes.
3. Marcar o kickoff fecha a tarefa "Agendar kickoff".
4. Os testes de ponta a ponta e o axe passam em CI e em staging.
