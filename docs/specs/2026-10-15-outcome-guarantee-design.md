# Sub-projeto 3C — Resultado e garantia

| Campo                   | Valor                                                                                             |
| ----------------------- | ------------------------------------------------------------------------------------------------- |
| Data                    | 2026-10-15                                                                                        |
| Estado                  | Aprovado (luz verde permanente do fundador)                                                       |
| Vaga                    | 3 (3A Dinheiro → 3B Retainers → **3C Resultado e garantia** → 3D Saúde e marcos → …)              |
| Módulos                 | M13 (RF-120 a RF-123), C-11, P-10 (parte do resultado), AUT-26                                    |
| Documentação de produto | `01` (M13), `02` (C-11, P-10), `03` (US-20), `04` (RN-70 a RN-73), `06` (Retenção), `07` (AUT-26) |
| Depende de              | 2A Salas e processo, 2B Tarefas, 3B.1 Retainers (P-10)                                            |

## 1. Objetivo

Cada projeto pode ter um resultado acordado: uma métrica com linha de base, meta, prazo e fonte. A equipa regista a evolução e as condições do cliente, cada uma com data. No prazo, o OS avalia a meta e as condições e decide se a garantia se ativa (RN-71). Ativada, a garantia conta os meses usados, até 3, e encerra quando a meta é atingida ou os meses acabam (RN-72, RN-73). O cliente vê a evolução e o estado da garantia no portal.

## 2. Decisões

1. **Um resultado por projeto**, criado e editado no C-11 pelo fundador e pelo gestor da sala:
   - métrica (texto, 1 a 80 caracteres), unidade (texto opcional, até 20, por exemplo "leads/mês" ou "%");
   - linha de base e meta (numéricas, diferentes uma da outra);
   - prazo (data, posterior a hoje quando é criado ou alterado) e fonte dos dados (texto, 1 a 120).

   O sentido sai dos números: meta acima da linha de base quer dizer subir, abaixo quer dizer descer. A meta é atingida quando um valor registado chega à meta nesse sentido.

   O RN-70 pede que o resultado venha do mapa aprovado. A aprovação do mapa Core está adiada desde o 2A, por isso no 3C o resultado é escrito no C-11, com o texto da garantia da proposta à vista como referência.

2. **Condições do cliente (RF-121).** O resultado nasce com as três condições do RN-71 e aceita outras escritas pela equipa:
   - `access` "Acessos entregues em 5 dias úteis";
   - `approvals` "Aprovações dentro do prazo";
   - `media_budget` "Orçamento de media acordado";
   - `other`, com descrição.

   Cada condição está `pending`, `met` ou `failed`. A equipa marca-a com a data do registo e uma nota opcional; uma condição falhada exige nota. Uma condição pode ser corrigida até a garantia ser decidida.

3. **Evolução (RF-122).** A equipa regista valores com data (um por data) e nota opcional. Não há integrações no 3C. O gráfico mostra a linha de base, a meta e os valores por data.
4. **Garantia (RF-123).** Estados:
   - `pending`: antes do prazo, ou no prazo enquanto houver condições por decidir;
   - `not_activated`: com o motivo `target_met` (a meta foi atingida até ao prazo) ou `conditions_failed` (pelo menos uma condição falhada);
   - `active`: desde a data de ativação, com os meses usados de 0 a 3;
   - `closed`: com o motivo `target_met` ou `months_used`.
5. **Avaliação no prazo (AUT-26).** Um varrimento diário às 06:30 de Lisboa avalia cada resultado `pending` com o prazo já passado:
   - meta atingida por um valor registado até ao prazo → `not_activated` com `target_met`;
   - senão, alguma condição falhada → `not_activated` com `conditions_failed`;
   - senão, alguma condição por decidir → continua `pending`, e o gestor (ou o fundador) recebe uma vez a tarefa "Decidir as condições do resultado de <cliente>";
   - senão → `active` com a data de hoje.

   Decidir a última condição de um resultado com o prazo passado avalia-o logo, sem esperar pelo varrimento.

6. **Meses da garantia.** O mesmo varrimento atualiza os meses usados de cada garantia ativa: são os meses completos desde a ativação, até 3. Aos 3 meses, a garantia fecha com `months_used`. Um valor com data depois do prazo que atinge a meta fecha a garantia ativa com `target_met`; se esse valor já existir quando a garantia se ativaria, ela fica logo encerrada com `target_met`. O 3C não muda a faturação: o trabalho da garantia é gerido pela equipa.
7. **Avisos.** Cada decisão da garantia (não ativada, ativada, encerrada) avisa por email os fundadores e os gestores atribuídos, com o motivo e a ligação ao C-11. O cliente vê o estado no portal; não recebe email no 3C.
8. **Acesso:**
   - **ler:** quem lê a sala (`can_read_rooms`); o resultado não é um valor monetário;
   - **escrever:** quem escreve na sala (fundador e gestor atribuído);
   - **portal:** o decisor e o operacional do cliente veem o resultado, a evolução, as condições e o estado da garantia por vistas próprias, sem notas internas nem quem registou.
9. **Ecrãs:**
   - C-11 em `/c/:clientId/outcome`: formulário, gráfico e tabela da evolução com o registo de valores, condições com as ações, e cartão da garantia;
   - P-10 (`/portal/progress`) ganha a secção do resultado (gráfico, tabela, condições e garantia) e passa a abrir também sem retainer;
   - menu da sala: "Resultado" aparece quando existe um resultado ou para quem escreve na sala, como o "Retainer".
   - O gráfico é um SVG próprio (`role="img"` com descrição) acompanhado da tabela dos valores, sem dependências novas.

## 3. Âmbito

### Incluído

- **Dados:** `project_outcomes`, `outcome_conditions`, `outcome_measurements`, os enums e as vistas do portal, com RLS.
- **Lógica:** domínio do sentido, da meta atingida, da avaliação e dos meses; serviço do resultado, das condições e dos valores, com auditoria.
- **Automação:** varrimento `outcomes-sweep` (06:30 de Lisboa) e avisos por email à equipa em PT-PT e EN.
- **Ecrãs:** C-11, secção do resultado no P-10 e menu da sala.
- **E2E:** o fundador cria o resultado, regista um valor e marca as condições; o cliente vê a evolução e as condições no P-10; a avaliação, chamada como o varrimento a chama, ativa a garantia.

### Excluído (registado em `docs/STATUS.md`)

| Item                                             | Motivo                                                | Quando                         |
| ------------------------------------------------ | ----------------------------------------------------- | ------------------------------ |
| Resultado definido no mapa Core aprovado (RN-70) | A aprovação do mapa está adiada desde o 2A            | Aprovação do mapa              |
| Valores por integração (RF-122)                  | Cada fonte exige ligação própria                      | Pedido real                    |
| Trabalho e faturação dentro da garantia (RN-72)  | A equipa gere o âmbito; o retainer continua a faturar | Pedido real                    |
| Email ao cliente nas decisões da garantia        | O estado está no portal                               | 3E (relatórios) ou pedido real |

## 4. Dados e acesso

- `project_outcomes`:
  - `id`, `organization_id`, `client_id`, `project_id` (único, FK com o cliente);
  - `metric`, `unit`, `baseline` e `target` numeric(14,2) com `baseline <> target`, `deadline` (date), `data_source`;
  - `guarantee_status` (`pending`, `not_activated`, `active`, `closed`), `guarantee_reason` (`target_met`, `conditions_failed`, `months_used`), `activated_on` (date), `months_used` (0 a 3), `conditions_task_for` (date do prazo para o qual já se criou a tarefa);
  - `created_by` e carimbos;
  - CHECKs:
    - `pending` e `active` sem motivo; `not_activated` com `target_met` ou `conditions_failed`; `closed` com `target_met` ou `months_used`;
    - `activated_on` preenchido exatamente em `active` e `closed` (só se fecha uma garantia ativada);
    - `months_used` entre 0 e 3, e 3 em `closed` com `months_used`.
- `outcome_conditions`: `id`, `organization_id`, `client_id`, `outcome_id`, `kind`, `description` (1 a 200), `status`, `recorded_on`, `note`, `recorded_by`, carimbos; uma condição falhada tem nota.
- `outcome_measurements`: `id`, `organization_id`, `client_id`, `outcome_id`, `measured_on` (único por resultado), `value` numeric(14,2), `note`, `recorded_by`, `created_at`.
- **RLS:** leitura com `app.can_read_rooms(organization_id, client_id)`; sem escrita para `authenticated`.
- **Portal:** vistas `portal_project_outcomes`, `portal_outcome_conditions` (sem `note` nem `recorded_by`) e `portal_outcome_measurements` (sem `note` nem `recorded_by`), para o decisor e o operacional (`app.is_client_member`).
- **Eventos:** `outcomes.guarantee.decided` (`outcomeId`, `status`, `reason`), consumido pelo aviso à equipa.

## 5. Testes

- **Unitários:**
  - sentido e meta atingida (subir e descer, valor igual à meta);
  - avaliação no prazo (meta atingida, condição falhada, condições por decidir, ativação);
  - meses completos desde a ativação, até 3, incluindo meses de comprimentos diferentes;
  - gráfico e tabela do C-11 e do P-10; estados da garantia.
- **Base de dados:**
  - RLS e vistas do portal por papel (outro cliente nada; o portal sem notas);
  - criar e editar o resultado (só quem escreve na sala; prazo no futuro; meta diferente da linha de base; três condições criadas);
  - condições: falhada sem nota recusada; decidir a última com o prazo passado avalia logo;
  - valores: um por data; atingir a meta com a garantia ativa fecha-a;
  - varrimento: cada caminho do §2.5 e do §2.6, cada decisão emitida uma vez, a tarefa das condições criada uma vez.
- **E2E:** o percurso do âmbito, com axe no C-11 e no P-10.

## 6. Critérios de aceitação

1. Um projeto tem no máximo um resultado com métrica, linha de base, meta, prazo e fonte.
2. As condições do cliente ficam registadas com data e estado, e o portal mostra-as ao cliente.
3. No prazo, a garantia fica ativada só com a meta por atingir e todas as condições cumpridas; caso contrário, fica não ativada com o motivo à vista.
4. Uma garantia ativa conta até 3 meses e encerra quando a meta é atingida ou os meses acabam.
5. O cliente vê a evolução num gráfico com a tabela dos valores; nunca vê notas internas nem resultados de outro cliente.
