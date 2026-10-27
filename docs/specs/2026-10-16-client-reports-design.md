# Sub-projeto 3E.2 — Relatórios do cliente e QBR

| Campo                   | Valor                                                                                                 |
| ----------------------- | ----------------------------------------------------------------------------------------------------- |
| Data                    | 2026-10-16                                                                                            |
| Estado                  | Aprovado (luz verde permanente do fundador)                                                           |
| Vaga                    | 3 (… → 3E.1 Relatórios da equipa → **3E.2 Relatórios do cliente e QBR** → 3F Adoção)                  |
| Módulos                 | M14 (RF-130, RF-132 em PDF), AUT-25, C-14 (novo), C-04/C-05 e P-03 (entrega), S-11 (PDF dos painéis)  |
| Documentação de produto | `01` (M14), `02` (C-04, C-05, P-03, S-11), `07` (AUT-25), `08`                                        |
| Depende de              | 1B Documentos da sala, 2E Tarefas, 3B.1 Retainers, 3C Resultado e garantia, 3E.1 Relatórios da equipa |

## 1. Objetivo

A equipa prepara, a partir de um modelo, o relatório mensal de cada cliente e o QBR de cada trimestre, e partilha-os com o cliente como PDF. O relatório junta automaticamente o que aconteceu no período (passos concluídos, atualizações publicadas, documentos aprovados, consumo do retainer, evolução do resultado) e a equipa escreve o resumo, os destaques e os próximos passos. O QBR sai em formato de apresentação (diapositivos em paisagem), que o cliente abre no visualizador de documentos com navegação e ecrã inteiro. No fim de cada mês e de cada trimestre, os clientes com retainer ativo recebem o rascunho sem ninguém pedir, e o fim do trimestre cria a tarefa de marcar o QBR (AUT-25). O fundador descarrega também os painéis do S-11 em PDF.

## 2. Decisões

1. **Entidade própria, entrega pelos documentos da sala.** O relatório vive em `client_reports` (rascunho, texto da equipa, dados congelados). Ao partilhar, o OS gera o PDF e publica-o como documento PDF do projeto (C-04), com estado "Com o cliente": o cliente recebe o aviso habitual de documento partilhado, abre-o no P-03 (que já tem navegação de diapositivos e ecrã inteiro) e pode comentá-lo. Voltar a partilhar depois de editar cria uma nova versão do mesmo documento.
2. **Tipos e períodos.**
   - **Mensal:** um mês civil (Lisboa).
   - **QBR:** um trimestre civil (T1 jan–mar, T2 abr–jun, T3 jul–set, T4 out–dez).
   - Um relatório por cliente, tipo e período (único na base de dados).
3. **Projeto do relatório.** O projeto do retainer ativo do cliente; sem retainer, o projeto mais recente do cliente. Um cliente sem projeto não tem relatórios.
4. **Modelo (conteúdo):**
   - **Gerado (congelado ao partilhar):**
     - passos do processo concluídos no período (título e data);
     - atualizações visíveis ao cliente publicadas no período (título e data);
     - documentos aprovados pelo cliente no período (título e data);
     - consumo do retainer em cada mês do período, quando o cliente tem retainer (horas ou pedidos usados contra o limite, como no P-10);
     - medições do resultado acordado no período, com linha de base, meta e prazo, quando há resultado.
   - **Escrito pela equipa:**
     - resumo (até 2000 caracteres);
     - destaques (até 2000 caracteres);
     - próximos passos (até 2000 caracteres);
     - no QBR, também as prioridades do próximo trimestre (até 2000 caracteres).
   - **Fora do relatório:** a saúde do cliente, valores de faturação, tarefas internas e comentários internos.
5. **Rascunho vivo, partilha congelada.** Enquanto é rascunho, a pré-visualização recalcula os dados gerados. Partilhar grava os dados do momento (`data` em JSON) e gera o PDF a partir deles; o relatório passa a "Partilhado" com a data. Editar um relatório partilhado volta a recalcular os dados na pré-visualização até à partilha seguinte.
6. **PDF:**
   - **Mensal:** A4 em retrato, pelo `PdfWriter` existente: título "Relatório mensal · <cliente> · <mês ano>", as secções do modelo pela ordem, secções vazias omitidas.
   - **QBR:** A4 em paisagem, um diapositivo por secção: capa ("QBR · <cliente> · T<n> <ano>"), resumo, trabalho feito, retainer, resultado, destaques, prioridades do próximo trimestre, próximos passos. Diapositivos sem conteúdo são omitidos e uma lista longa continua no diapositivo seguinte.
   - Texto em pt-PT; datas e números no formato de Portugal; fontes padrão (WinAnsi), como nos outros PDFs.
   - Título do documento na sala: "Relatório mensal — <mês ano>" ou "QBR — T<n> <ano>".
7. **Quem faz o quê.**
   - **Criar, editar, pré-visualizar e partilhar:** quem edita documentos no projeto do relatório, pela mesma regra do C-04.
   - **Ver a lista e os rascunhos:** quem lê a sala (`can_read_rooms`).
   - **Cliente:** só o documento partilhado, pelo caminho dos documentos (RLS existente). A tabela `client_reports` não tem leitura para membros do cliente.
8. **C-14 Relatórios** em `/c/:cliente/reports`, novo separador da sala. Mostra a lista por período (tipo, período, estado, data de partilha), "Novo relatório" (tipo e período, por defeito o mês ou o trimestre anterior) e o editor em `/c/:cliente/reports/:id` (dados gerados à esquerda em leitura, os quatro textos à direita, "Pré-visualizar PDF", "Guardar" e "Partilhar com o cliente"; depois da partilha, a ligação para o documento no C-05). Um período futuro ou que ainda não acabou é recusado.
9. **AUT-25 e rascunhos mensais.** Um varrimento no dia 1 de cada mês às 08:00 de Lisboa, para cada cliente ativo com retainer ativo que começou até ao fim do mês anterior:
   - cria o rascunho mensal do mês anterior;
   - se o mês anterior fecha um trimestre (março, junho, setembro, dezembro), cria também o rascunho do QBR desse trimestre e a tarefa "Marcar o QBR do T<n> <ano>" para o gestor único do cliente (ou sem responsável), com prazo a 10 dias;
   - repetir não cria nada de novo (unicidade do relatório; a tarefa só nasce com o rascunho do QBR);
   - uma transação por cliente; uma falha fica no registo e não para os outros.
10. **PDF dos painéis (RF-132).** O S-11 ganha "Descarregar PDF" em `/api/reports/pdf?year=AAAA`, só para fundadores: os seis painéis do 3E.1 em tabelas, A4 em retrato, título "Relatórios · <ano>" e data de geração.
11. **Ano inválido.** Um ano fora de 2000–2100 no S-11, no CSV ou no PDF dá 404, em vez do erro 500 que o 3E.1 deixou em aberto.

## 3. Âmbito

### Incluído

- **Dados:** `client_reports` (organização, cliente, projeto, tipo `monthly`/`qbr`, início e fim do período, estado `draft`/`shared`, os quatro textos, `data` congelado, documento ligado, quem criou, quando partilhou), com CHECK de períodos e comprimentos, FKs compostas e RLS de leitura para quem lê a sala; sem escrita para `authenticated`.
- **Lógica:**
  - períodos (mês e trimestre de Lisboa, período anterior, período acabado);
  - recolha dos dados gerados;
  - PDF mensal e PDF do QBR;
  - criar, guardar, partilhar (publicação do PDF como documento do projeto, primeira versão ou versão nova);
  - varrimento mensal com a tarefa do QBR;
  - PDF dos painéis.
- **Documentos da sala:** uma função de servidor que publica um PDF gerado pelo sistema como documento do projeto (novo ou versão nova), com o mesmo evento e aviso da partilha manual.
- **Automação:** `client-reports-drafts` (`TZ=Europe/Lisbon 0 8 1 * *`).
- **Ecrãs:** separador e ecrã C-14 (lista e editor), "Descarregar PDF" no S-11.
- **E2E:** o gestor cria o relatório mensal, escreve o resumo, partilha, e o documento aparece no C-04; o cliente abre-o no portal; axe no C-14.

### Excluído (registado em `docs/STATUS.md`)

| Item                                         | Motivo                                                                                   | Quando      |
| -------------------------------------------- | ---------------------------------------------------------------------------------------- | ----------- |
| Marcação automática da reunião do QBR        | Escolher hora exige as agendas de todos; a tarefa leva a equipa a marcá-la no calendário | Pedido real |
| Modelos de relatório editáveis por cliente   | Um modelo fixo cobre o RF-130 no início                                                  | Pedido real |
| Gráficos no PDF                              | Os valores em tabela chegam para o primeiro uso                                          | Pedido real |
| Rascunhos mensais para clientes sem retainer | O relatório mensal faz-se à mão nesses casos                                             | Pedido real |
| Email ao cliente nas decisões da garantia    | O estado está no portal e o relatório do mês mostra o resultado                          | Pedido real |

## 4. Testes

- **Unitários:**
  - períodos (mês e trimestre de Lisboa, anterior, acabado, viragem de ano);
  - títulos e nomes de ficheiro;
  - PDF mensal e do QBR (texto extraído com as secções, secções vazias omitidas, lista longa dividida por diapositivos, página em paisagem no QBR);
  - PDF dos painéis;
  - validação dos textos;
  - C-14 (lista, editor, estados) e botão do S-11.
- **Base de dados:**
  - dados gerados só do período e do cliente (passos, atualizações visíveis, documentos aprovados, consumo, medições);
  - partilha cria o documento PDF com o cliente e uma segunda partilha cria a versão 2;
  - só quem edita documentos cria, guarda e partilha; freelancer sem a sala e cliente nada;
  - o cliente vê o documento partilhado e não vê `client_reports`;
  - unicidade por cliente, tipo e período;
  - varrimento: rascunho mensal, QBR e tarefa no fecho do trimestre, repetição sem duplicados, retainer que começa depois fica de fora;
  - PDF dos painéis só para fundadores; ano inválido dá 404.
- **E2E:** o percurso do âmbito.

## 5. Critérios de aceitação

1. A equipa da sala cria um relatório mensal ou um QBR de um período acabado, escreve os textos e pré-visualiza o PDF.
2. Partilhar publica o PDF no C-04 como documento com o cliente; o cliente abre-o no portal e é avisado como em qualquer documento.
3. Partilhar de novo depois de editar cria uma nova versão do mesmo documento.
4. No dia 1 de cada mês, cada cliente com retainer ativo tem o rascunho do mês anterior; no fecho do trimestre, também o rascunho do QBR e a tarefa de marcar o QBR.
5. O fundador descarrega os seis painéis do S-11 em PDF.
6. A saúde, os valores de faturação e o que é interno nunca entram no relatório do cliente.
