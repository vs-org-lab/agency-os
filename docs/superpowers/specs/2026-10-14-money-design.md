# Sub-projeto 3A — Dinheiro

| Campo                   | Valor                                                                                                              |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------ |
| Data                    | 2026-10-14                                                                                                         |
| Estado                  | Aprovado (luz verde permanente do fundador)                                                                        |
| Vaga                    | 3 (**3A Dinheiro** → 3B Retainers → 3C Resultado e garantia → 3D Saúde e marcos → 3E Relatórios e QBR → 3F Adoção) |
| Módulos                 | M16 (RF-150 a RF-153), S-09                                                                                        |
| Documentação de produto | `01` (M16), `02` (S-09), `06` (Despesa e Subscrição, Claude API), `08` (matriz de acessos, SEC-10, SEC-11, RNF-10) |
| Depende de              | 1D Faturação (pedidos de pagamento, pagamentos, faturas legais)                                                    |

## 1. Objetivo

O fundador e o financeiro veem num só ecrã o dinheiro de um ano: o que entrou, o que está em aberto e o que saiu. Registam despesas e subscrições com o recibo anexado. O OS lê o recibo e propõe os campos, e uma pessoa confirma. Uma despesa feita por conta de um cliente fica ligada ao pedido de pagamento que a cobra, e o cliente vê o comprovativo original.

## 2. Divisão da Vaga 3

Cada sub-projeto tem spec, plano e execução próprios. A ordem segue o princípio do `00`: primeiro o que traz dinheiro, depois o que o mantém.

| Sub-projeto             | Módulos | Porquê nesta ordem                                                                     |
| ----------------------- | ------- | -------------------------------------------------------------------------------------- |
| 3A Dinheiro             | M16     | Fecha o ciclo do 1D e é a base dos painéis de receita do 3E                            |
| 3B Retainers            | M12     | Receita recorrente: limites, consumo, pedidos extra e os pedidos mensais adiados do 1D |
| 3C Resultado e garantia | M13     | O resultado acordado alimenta a saúde (3D) e os relatórios (3E)                        |
| 3D Saúde e marcos       | M17     | Precisa de pagamentos (1D, 3A), aprovações (2D) e resultado (3C)                       |
| 3E Relatórios e QBR     | M14     | Agrega todos os anteriores                                                             |
| 3F Adoção               | M15     | Independente; fecha a vaga                                                             |

## 3. Decisões

1. **Acesso (matriz do `08`, "Faturas e pagamentos"):**
   - fundador e financeiro leem e escrevem;
   - gestor só lê;
   - freelancers e clientes não veem o S-09.
   - Usa os predicados existentes `app.can_read_billing` e `app.can_write_billing`.
2. **S-09 em `/money`, com seletor de ano (por omissão, o ano corrente em Lisboa):**
   - **Entrou:** pagamentos com `received_on` no ano.
   - **Em aberto:** pedidos de pagamento no estado `sent` emitidos no ano.
   - **Saiu:** despesas com data no ano.
   - Os totais são por moeda (EUR, GBP, USD, AOA), sem conversão: uma linha por moeda que tenha valores.
   - Por baixo, três listas do ano: faturas (pedidos com cliente, número, valor, estado e fatura legal quando existe), despesas e subscrições por data de renovação.
   - A barra lateral ganha "Dinheiro" para quem pode ler.
3. **Despesas (RF-151):**
   - Campos: data, fornecedor, descrição, categoria, valor, moeda, recibo (opcional), cliente (opcional, quando faturável) e subscrição de origem (opcional).
   - **Categorias fixas:** software, publicidade, freelancers, equipamento, deslocações, formação e outros.
   - O recibo é JPEG, PNG, WebP ou PDF, até 10 MB. É carregado antes de a despesa existir, para poder ser lido, no bucket `library` em `money/<organização>/receipts/<id>`, com link assinado; o servidor confirma o tipo real e o tamanho, e a despesa guarda o caminho ao ser gravada.
   - Editar e apagar fica registado na auditoria (RNF-10). Uma despesa ligada a um pedido de pagamento não pode ser apagada; primeiro desliga-se.
4. **Subscrições (RF-151):**
   - Campos: nome, fornecedor, categoria, valor, moeda, ciclo (mensal ou anual), próxima renovação e estado (ativa ou cancelada).
   - "Registar renovação" cria a despesa dessa renovação (com recibo opcional) e avança a próxima renovação um ciclo.
   - **Destaques na lista:** as subscrições com renovação nos próximos 7 dias e as atrasadas.
   - Não há débito automático nem aviso por email; o S-09 é o lembrete.
5. **Leitura de recibos (RF-152):**
   - Ao carregar um recibo em JPEG, PNG ou WebP, o OS pede a um modelo de visão a data, o fornecedor, o valor, a moeda e a descrição.
   - O resultado aparece como proposta editável nos campos do formulário; nada é gravado sem a pessoa confirmar.
   - Os PDFs não são lidos: a pessoa preenche os campos à mão.
   - **Fornecedor:**
     - `RECEIPT_READER=groq` usa a visão da Groq (`qwen/qwen3.8-27b`; o Llama 4 Scout saiu do catálogo da Groq), já com conta e chave sem custo (ver 1B), e `RECEIPT_READER_MODEL` troca o modelo sem nova versão;
     - `RECEIPT_READER=fake` devolve uma proposta fixa, para o dev e o e2e;
     - sem configuração, não há proposta.
   - O `06` prevê a API da Anthropic para esta leitura; a troca fica para o lançamento, quando houver orçamento (critério de lançamento).
   - Só a imagem do recibo é enviada (`06`: só os dados necessários). A resposta é validada por esquema; valores estranhos dão uma proposta vazia.
6. **Despesa faturável (RF-153):**
   - Uma despesa com cliente é faturável.
   - No S-09, "Ligar a um pedido" escolhe um pedido de pagamento desse cliente (enviado ou pago) que a cobra. Ligar e desligar fica na auditoria.
   - **No portal:** no separador Faturação, o pedido mostra "Comprovativos" com o recibo de cada despesa ligada, em link de 15 minutos (SEC-32). O decisor e o financeiro do cliente veem-no, como já veem o pedido.
   - O valor do pedido não muda: a equipa inclui a despesa no valor ao emitir.
7. **Fora do S-09:** os painéis de receita, receita recorrente e conversão são do 3E; a exportação para a contabilidade em CSV é do 3E (RF-132).

## 4. Âmbito

### Incluído

- Tabelas `expenses` e `subscriptions`, enums de categoria, ciclo e estado; RLS com os predicados da faturação.
- Serviço de dinheiro: resumo do ano, despesas (criar, editar, apagar, recibo), subscrições (criar, editar, cancelar, renovar), ligação a pedidos.
- Leitor de recibos com `groq` e `fake`.
- Ecrã S-09 e navegação; comprovativos no separador Faturação do portal.
- E2E: criar uma despesa com recibo lido pelo `fake`, uma subscrição renovada, ligar uma despesa a um pedido e vê-la no portal.

### Excluído (registado em `docs/STATUS.md`)

| Item                                              | Motivo                                                        | Quando                  |
| ------------------------------------------------- | ------------------------------------------------------------- | ----------------------- |
| Leitura de recibos em PDF                         | O modelo de visão lê imagens; converter PDF exige mais código | Pedido real             |
| Leitura de recibos pela API da Anthropic (`06`)   | Sem custo durante o desenvolvimento                           | Critérios de lançamento |
| Conversão de moedas nos totais                    | Exige câmbios datados; os totais por moeda bastam             | 3E ou pedido real       |
| Débito automático e avisos de renovação por email | O S-09 mostra as renovações próximas                          | Pedido real             |
| Pedido de pagamento criado a partir de despesas   | O pedido vem de um marco (1D); a equipa inclui o valor        | 3B ou pedido real       |

## 5. Dados e acesso

- `expenses`:
  - `id`, `organization_id`, `spent_on` (date), `vendor`, `description`, `category`, `amount` numeric(12,2) > 0, `currency`;
  - `receipt_path`, `receipt_name`, `receipt_mime_type` (todos nulos ou todos preenchidos);
  - `client_id` (opcional, FK com a organização), `payment_request_id` (opcional, FK com o mesmo cliente), `subscription_id` (opcional);
  - `created_by`, `created_at`, `updated_at`.
  - CHECK: há pedido só se houver cliente.
- `subscriptions`: `id`, `organization_id`, `name`, `vendor`, `category`, `amount`, `currency`, `cycle` (`monthly`, `annual`), `next_renewal_on`, `status` (`active`, `cancelled`), `created_by`, carimbos.
- RLS forçada: leitura com `app.can_read_billing`; sem escrita por `authenticated`; o serviço escreve em contexto de sistema depois de verificar `can_write_billing`.
- **Portal:** uma vista `portal_payment_request_receipts` com o id do pedido, o nome do recibo e o caminho. Filtra por `app.is_client_member` com os papéis decisor e financeiro do cliente e só mostra despesas com recibo.

## 6. Testes

- **Unitários:** cálculo do resumo por moeda; avanço do ciclo (31 de janeiro mensal → 28 ou 29 de fevereiro; 29 de fevereiro anual → 28 de fevereiro); validação da proposta do leitor (datas, valores, moedas inválidas); leitor `groq` com `fetch` simulado; formulários e S-09 (seletor de ano, totais por moeda, destaques de renovação).
- **Base de dados:** RLS e CHECKs; resumo do ano com pagamentos, pedidos e despesas de anos e moedas diferentes; permissões (gestor só lê, freelancer e cliente nada); recibo confirmado só com tipo e tamanho válidos; renovação cria a despesa e avança a data; ligar só a pedidos do mesmo cliente; despesa ligada não se apaga; o portal só mostra os comprovativos do próprio cliente e aos papéis certos.
- **E2E:** o percurso do âmbito, com axe no S-09.

## 7. Critérios de aceitação

1. O S-09 mostra, para um ano, o que entrou, o que está em aberto e o que saiu, por moeda.
2. Despesas e subscrições têm recibo anexado e a renovação de uma subscrição gera a despesa e a próxima data.
3. Um recibo em imagem gera uma proposta editável que só é gravada quando a pessoa confirma.
4. Uma despesa faturável ligada a um pedido mostra o comprovativo ao cliente certo no portal, e só a ele.
5. Só o fundador e o financeiro escrevem; o gestor lê; ninguém mais vê o S-09.
