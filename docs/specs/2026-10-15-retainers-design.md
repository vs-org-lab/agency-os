# Sub-projeto 3B.1 — Retainers: limites, consumo e pedidos extra

| Campo                   | Valor                                                                                                                      |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| Data                    | 2026-10-15                                                                                                                 |
| Estado                  | Aprovado (luz verde permanente do fundador)                                                                                |
| Vaga                    | 3 (3A Dinheiro → **3B.1 Retainers: limites, consumo e pedidos extra** → 3B.2 Retainers: faturação mensal → 3C …)           |
| Módulos                 | M12 (RF-110 a RF-113), C-10, P-10 (parte do retainer), F7, AUT-22 a AUT-24                                                 |
| Documentação de produto | `01` (M12), `02` (C-10, P-10, F7), `03` (US-19), `04` (RN-60, RN-61), `06` (Retenção), `07` (AUT-22, AUT-23, AUT-24), `08` |
| Depende de              | 2A Salas e processo, 2B Tarefas, 2D Aprovações                                                                             |

## 1. Objetivo

Um projeto em retainer tem limites mensais por tipo de trabalho. A equipa e o cliente veem o consumo do mês. Quando o cliente pede trabalho e o limite está esgotado, o OS cria um pedido extra com orçamento, e o trabalho só começa depois de o cliente o aprovar. A equipa recebe a tarefa de rever o retainer 60 dias antes da data de revisão.

## 2. Divisão do 3B

- **3B.1** (este): retainer, limites, consumo, transporte de saldo, pedidos do cliente, pedidos extra, avisos de 80% e 100% e revisão anual.
- **3B.2:** faturação mensal do retainer, com um pedido de pagamento por mês a partir do plano recorrente (RF-040, adiado do 1D). O débito direto (RF-043) fica fora do 3B.2.

## 3. Decisões

1. **Um retainer por projeto (`06`):**
   - nível (texto livre, 1 a 40 caracteres, por exemplo "Essencial"), valor mensal e moeda (usados no 3B.2);
   - início do mês, data de revisão anual e estado (`active`, `ended`);
   - limites mensais por tipo:
     - `content_pieces` (peças de conteúdo);
     - `campaigns` (campanhas);
     - `maintenance_hours` (horas de manutenção, com uma casa decimal);
     - `automations` (automações novas).
   - Um tipo sem limite não existe nesse retainer.
   - Criam e editam o fundador e o gestor da sala. A matriz do `08` dá à equipa da sala escrita no processo e não dá valores ao freelancer, por isso os freelancers só leem o consumo, nunca o valor mensal.
2. **Disponível do mês (RN-60).** Para o limite L de um tipo no mês M:
   - transporte = mínimo de 20% de L e do que ficou por usar de L em M−1;
   - o transporte vem só do limite base e só do mês anterior, sem acumular;
   - no primeiro mês do retainer não há transporte;
   - disponível = L + transporte;
   - o consumo de trabalho pago com pedido extra não conta para o limite.
3. **Registo de consumo (RF-111):**
   - A equipa da sala regista `quantidade`, `tipo`, `descrição` e uma tarefa opcional, no mês corrente de Lisboa.
   - Um registo que passe o disponível é recusado (RN-61), a menos que venha de um pedido extra aprovado.
   - Corrigir é apagar e voltar a registar; tudo fica na auditoria.
4. **Pedidos do cliente (F7, US-19):**
   - No portal (P-10), o decisor ou o operacional pede trabalho: tipo, descrição e quantidade (por omissão 1).
   - **Dentro do disponível:** o OS cria a tarefa da equipa (atribuída ao gestor da sala) e regista logo o consumo ligado a ela.
   - **Acima do disponível:** o OS cria um pedido extra no estado `requested` e avisa a equipa (AUT-23).
5. **Pedido extra (RF-112, RN-61):**
   - **Estados:** `requested` → `quoted` → `approved` ou `declined`.
   - **Orçamento:** a equipa da sala orça (valor e moeda), o que cria uma aprovação do tipo `retainer_extra` para o decisor.
   - **Decisão:** o decisor decide em "Aprovações" do portal, como as outras aprovações (2D), com os lembretes que já existem.
   - **Aprovado:** o OS cria a tarefa e regista o consumo ligado ao pedido extra, fora do limite.
   - **Recusado:** nada mais acontece.
   - A cobrança do valor aprovado é feita pela equipa num pedido de pagamento (1D).
6. **Avisos de consumo (AUT-22):**
   - Quando o consumo de um tipo passa 80% e depois 100% do disponível do mês, o OS envia email ao decisor e ao gestor da sala.
   - Cada aviso vai uma vez por tipo, mês e limiar, guardado numa tabela própria.
   - Os emails respeitam as horas de silêncio, como os outros.
7. **Revisão anual (RF-113, AUT-24):**
   - Um varrimento diário do Inngest cria, 60 dias antes da data de revisão, a tarefa "Rever o retainer de <cliente>" para o gestor da sala.
   - É criada uma vez por data de revisão.
   - Mudar a data de revisão permite um novo aviso.
8. **Ecrãs:**
   - **C-10** em `/c/:cliente/retainer`. O item "Retainer" aparece no menu da sala só quando existe um retainer (`02`), e o ecrã também serve para criar o primeiro.
   - **C-10 mostra:** limites com barras de consumo do mês (usado, transporte, disponível); registo de consumo; pedidos extra com orçamento; edição do retainer.
   - **P-10** em `/portal/progress`: o consumo do mês por limite, o formulário de pedido e os pedidos extra com o estado. O resultado acordado entra no 3C.
   - O menu do portal ganha "Progresso" para o decisor e o operacional.

## 4. Âmbito

### Incluído

- **Dados:** tabelas `retainers`, `retainer_limits`, `retainer_usage`, `retainer_extra_requests` e `retainer_alerts`; valor `retainer_extra` em `approval_subject`; RLS e vistas do portal.
- **Lógica:** domínio do disponível e do transporte; serviço de retainer, consumo, pedidos e pedidos extra, com auditoria; aprovação `retainer_extra` integrada na lista e na decisão do 2D.
- **Automação:** avisos por email com templates PT-PT e EN; varrimento diário da revisão.
- **Ecrãs:** C-10, P-10 e navegação.
- **E2E:** o gestor cria um retainer; o cliente pede dentro do limite e recebe a tarefa; pede acima e o pedido extra é orçado, aprovado no portal e cria a tarefa.

### Excluído (registado em `docs/STATUS.md`)

| Item                                                       | Motivo                                  | Quando      |
| ---------------------------------------------------------- | --------------------------------------- | ----------- |
| Faturação mensal do retainer                               | Ciclo próprio                           | 3B.2        |
| Pedido de pagamento gerado do pedido extra aprovado        | A equipa cobra num pedido do 1D         | 3B.2        |
| Débito direto (RF-043)                                     | Exige um serviço de pagamentos com SEPA | Pedido real |
| Consumo calculado a partir das tarefas concluídas          | O registo manual cobre o caso           | Pedido real |
| Etiqueta de retainer na lista de clientes do Início (S-01) | O Início muda no 3E com os painéis      | 3E          |

## 5. Dados e acesso

- `retainers`:
  - `id`, `organization_id`, `client_id`, `project_id` (único, FK com o cliente);
  - `tier`, `monthly_fee` numeric(12,2) ≥ 0, `currency`;
  - `starts_on` (primeiro dia de um mês), `review_on`, `status`, `review_alerted_for` (date);
  - `created_by` e carimbos.
- `retainer_limits`: `retainer_id`, `kind`, `monthly_limit` numeric(6,1) > 0; a chave primária é (`retainer_id`, `kind`).
- `retainer_usage`:
  - `id`, `organization_id`, `client_id`, `retainer_id`, `kind`;
  - `month` (primeiro dia do mês), `quantity` numeric(6,1) > 0, `description`;
  - `task_id` e `extra_request_id`, opcionais;
  - `recorded_by` e `created_at`.
- `retainer_extra_requests`:
  - `id`, `organization_id`, `client_id`, `retainer_id`, `kind`, `description`, `quantity`;
  - `quote_amount`, `currency`, `status`;
  - `requested_by`, `approval_id`, `task_id` e carimbos.
- `retainer_alerts`: (`retainer_id`, `kind`, `month`, `threshold` 80 ou 100) como chave primária e `sent_at`.
- **RLS:**
  - leitura para a equipa com `app.can_read_rooms(organization_id, client_id)`;
  - sem escrita para `authenticated`;
  - o valor mensal fica fora do alcance dos freelancers por uma vista da equipa sem esse campo, ou por colunas sem grant.
- **Portal:**
  - as vistas `portal_retainer_limits`, `portal_retainer_usage` e `portal_retainer_extra_requests` são lidas pelo decisor e pelo operacional do cliente (`app.is_client_member`);
  - o valor mensal fica de fora;
  - o orçamento de um pedido extra é visto pelo decisor.

## 6. Testes

- **Unitários:**
  - disponível e transporte: primeiro mês; mês anterior por usar além de 20%; mês anterior esgotado; consumo extra fora do limite; horas com uma casa decimal;
  - limiares de 80% e 100%;
  - C-10 e P-10: barras, recusa acima do limite e estados do pedido extra.
- **Base de dados:**
  - RLS e vistas do portal (o decisor de outro cliente nada; o freelancer sem valor mensal);
  - criar e editar o retainer (só o fundador e o gestor);
  - registo de consumo recusado acima do disponível;
  - pedido do cliente dentro do limite cria tarefa e consumo; acima cria pedido extra;
  - orçar cria a aprovação; aprovar cria a tarefa e o consumo fora do limite; recusar não cria nada;
  - avisos enviados uma vez por limiar;
  - a revisão cria uma tarefa por data.
- **E2E:** o percurso do âmbito, com axe no C-10 e no P-10.

## 7. Critérios de aceitação

1. O disponível de cada limite segue o RN-60 e o consumo do mês aparece igual à equipa e ao cliente.
2. Nenhum consumo acima do disponível é registado sem um pedido extra aprovado (RN-61).
3. Um pedido do cliente dentro do limite cria a tarefa; acima, cria o pedido extra que o decisor aprova no portal antes de haver tarefa.
4. Os avisos de 80% e 100% e a tarefa de revisão chegam uma vez cada.
5. O cliente nunca vê o valor mensal, nem os retainers de outro cliente.
