# Sub-projeto 2E.1 — Biblioteca

| Campo                   | Valor                                                                                                                                                                 |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Data                    | 2026-10-10                                                                                                                                                            |
| Estado                  | Aprovado (aprovação permanente do fundador)                                                                                                                           |
| Vaga                    | 2 (2A → 2B → 2C → 2D.1 → 2D.2 → **2E.1 Biblioteca** → 2E.2 Documentos da sala → 2F Brand Hub → 2G Agenda)                                                             |
| Módulos                 | M09 (RF-080, RF-081, RF-083), M06 (RF-055, ficheiros nas atualizações)                                                                                                |
| Documentação de produto | `01` (RF-055, RF-080 a RF-083), `02` (C-02, C-06, P-04, P-05), `03` (US-16), `06` (entidade Biblioteca), `08` (matriz, SEC-30, SEC-31)                                |
| Depende de              | [2A Projetos, salas e processo](2026-10-09-rooms-process-design.md), [2D.1 Proofing](2026-10-10-proofing-design.md), [2D.2](2026-10-10-milestones-delivery-design.md) |

## 1. Objetivo

Cada projeto tem uma Biblioteca: os ficheiros do cliente e da equipa, organizados em pastas. A equipa carrega ficheiros e pastas inteiras, decide que pastas o cliente vê e anexa ficheiros às atualizações. O cliente vê no portal só as pastas visíveis, descarrega um ficheiro, uma pasta ou tudo num ZIP, e o operacional pode carregar ficheiros para as pastas visíveis (logótipos, fotografias, textos).

## 2. Decisões

1. **Divisão do 2E.** O 2E fica em dois sub-projetos: este (Biblioteca) e o 2E.2 Documentos da sala (separador Documentos C-04, documento C-05 e P-03 com PDF, ficheiro e link externo, versões, comentários e aprovação de documentos). O 2E.2 reutiliza o armazenamento e a verificação de ficheiros deste.
2. **Pastas encadeadas por projeto.** Uma pasta pertence a um projeto e pode ter subpastas, até 4 níveis. Os ficheiros vivem sempre numa pasta. Cada pasta e cada ficheiro guardam a pasta raiz (`root_id`), para a visibilidade e as consultas não precisarem de recursão.
3. **Visibilidade na pasta raiz (RF-083).** Só as pastas de primeiro nível têm visibilidade (`internal` ou `client`, interna por defeito); as subpastas e os ficheiros herdam-na. Mudar a visibilidade da raiz muda a de tudo o que está dentro.
4. **Tipos aceites** (verificados pelos primeiros bytes depois do carregamento, SEC-30):
   - imagem: PNG, JPEG, WebP, GIF, SVG;
   - vídeo: MP4, MOV, WebM;
   - documento: PDF, DOCX, XLSX, PPTX;
   - outro: ZIP, PSD, TTF, OTF, WOFF, WOFF2.
     Os formatos Office e o ZIP partilham a assinatura ZIP e distinguem-se pela extensão do nome. Um ficheiro que não confere é apagado e fica recusado. O antivírus continua adiado.
5. **Tamanho e quota (ADR 0003).** Até 50 MB por ficheiro, o limite do plano gratuito. A organização tem um teto de 900 MB somando a Biblioteca e as provas; acima dele, novos carregamentos são recusados (`storage_full`), para o plano gratuito de 1 GB nunca encher sem aviso.
6. **Carregamento direto ao Storage** com links assinados de carregamento, em lotes até 100 ficheiros, como as provas. "Carregar pasta" envia os caminhos relativos; o servidor cria (ou reutiliza, pelo nome) as subpastas e devolve um link por ficheiro. Cada ficheiro é confirmado depois do carregamento.
7. **Links que expiram (RF-083, SEC-31).** Todos os ficheiros são servidos por links assinados de 15 minutos a partir do domínio do Storage, com o nome original no download. A partilha com pessoas fora do OS fica para o Brand Hub (2F).
8. **ZIP no navegador (RF-081, US-16).** "Descarregar pasta" e "Descarregar tudo" pedem ao servidor a lista autorizada (caminho no ZIP e link assinado de cada ficheiro) e o navegador gera o ZIP em streaming com `client-zip` (MIT, sem custo). O servidor não guarda nem gera ZIPs, por isso não há limite de tempo nem de resposta das funções. Teto por ZIP: 500 ficheiros e 500 MB. Nomes repetidos no mesmo caminho recebem o sufixo " (2)", " (3)", …
9. **Quem faz o quê (matriz do `08`):**
   - **Equipa que escreve na sala** (fundador, gestor atribuído) e o **freelancer do projeto** (como no 2D.2, com MFA): criar, mudar o nome e apagar pastas, mudar a visibilidade das raízes, carregar e apagar ficheiros.
   - **Financeiro e agente:** leem.
   - **Decisor:** lê e descarrega as pastas visíveis.
   - **Operacional:** lê e descarrega as pastas visíveis, carrega ficheiros e pastas para dentro delas e apaga os ficheiros que carregou.
   - **Cliente financeiro:** sem acesso.
10. **Apagar** remove as linhas e os objetos do Storage. Apagar uma pasta apaga as subpastas e os ficheiros, depois de confirmação na interface. Tudo fica na auditoria.
11. **Ficheiros nas atualizações (RF-055).** Uma atualização pode anexar até 10 ficheiros da Biblioteca do mesmo projeto. Uma atualização visível ao cliente só aceita ficheiros de pastas visíveis (`attachment_hidden`). Se a pasta deixar de ser visível ou o ficheiro for apagado, o anexo desaparece do portal.
12. **Filtros e vistas (RF-080).** Filtros Pastas, Imagens, Vídeo e Documentos; pesquisa pelo nome em todo o projeto; ordenação por nome, data ou tamanho; vista em grelha (miniaturas das imagens) ou em lista. O estado fica no URL.

## 3. Âmbito

### Incluído

1. **Sala › Biblioteca (C-06)** em `/c/:cliente/library`, com o seletor de projeto, migalhas da pasta, contador de ficheiros por pasta, filtros, pesquisa, ordenação, grelha ou lista, Nova pasta, Carregar, Carregar pasta, Descarregar tudo, e por pasta e ficheiro as ações permitidas (mudar o nome, visibilidade, descarregar, apagar).
2. **Portal › Biblioteca (P-04)** em `/portal/library`: só as pastas visíveis, com as mesmas vistas, descarregar ficheiro, pasta ou tudo, e carregar para o operacional.
3. **Atualizações (C-02, P-05):** escolher ficheiros da Biblioteca ao escrever; a lista de anexos na sala e no portal, com download.
4. **Quota** da organização com a recusa `storage_full` e a mensagem na interface.

### Excluído (registado em `docs/STATUS.md`)

| Item                                                | Motivo                                                                               | Volta quando                    |
| --------------------------------------------------- | ------------------------------------------------------------------------------------ | ------------------------------- |
| Importar do Dropbox e do Google Drive (RF-082)      | Exige aplicações OAuth registadas e, no Drive, verificação da Google para os scopes  | Antes do lançamento, a pedido   |
| Moodboards e extensão do navegador (RF-084, RF-085) | Funcionalidade própria, com participação do cliente; não bloqueia o fluxo do projeto | Vaga 3                          |
| Partilha da Biblioteca com pessoas fora do OS       | O caso real é o dos fornecedores do cliente, que o Brand Hub cobre                   | Brand Hub (2F)                  |
| Mover ficheiros e pastas                            | Mudar o nome e voltar a carregar cobre o uso inicial                                 | Quando a equipa o pedir         |
| Provas aprovadas copiadas para a Biblioteca         | A prova aprovada já está acessível no projeto                                        | 2E.2 ou quando a equipa o pedir |
| Antivírus dos ficheiros (SEC-30)                    | Sem serviço gratuito adequado; já adiado no 1B e no 2D.1                             | Antes do lançamento             |
| Ficheiros acima de 50 MB, quota acima de 900 MB     | Limites do plano gratuito                                                            | Plano pago (lançamento)         |

## 4. Dados e acesso

| Tabela                 | Campos                                                                                                                                                                                                                                  |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `library_folders`      | organização, cliente, projeto, `parent_id`, `root_id`, `depth` (0 a 3), nome (1 a 120), `visibility` (só na raiz), criada por, criada e atualizada em                                                                                   |
| `library_files`        | organização, cliente, projeto, `folder_id`, `root_id`, nome (1 a 200), `storage_path`, `kind` (`image`, `video`, `document`, `other`), `mime_type`, `size_bytes`, `status` (`uploading`, `ready`, `rejected`), carregado por, criado em |
| `project_update_files` | atualização, ficheiro, organização, cliente, projeto (chave: atualização + ficheiro)                                                                                                                                                    |

- `CHECK`: a raiz (`parent_id` nulo) tem visibilidade e `depth = 0`; uma subpasta não tem visibilidade. Nome de pasta único entre irmãs (índice sobre `coalesce(parent_id, project_id)` e `lower(name)`).
- As chaves estrangeiras compostas com `client_id` e `project_id` impedem misturar clientes, como nas provas.
- **RLS forçado; escrita só por serviços.** A equipa lê pelas políticas `app.can_read_project`. O cliente lê pelas vistas `portal_library_folders` e `portal_library_files` (decisor e operacional, raiz visível, ficheiro pronto, projeto não cancelado) e `portal_update_files` (anexos de atualizações visíveis cujo ficheiro está numa pasta visível).
- **Storage:** bucket privado `library`, 50 MB, caminho `organização/cliente/projeto/ficheiro`, sem políticas em `storage.objects`; só links assinados.

## 5. Testes

- **Unitários:**
  - deteção do tipo pelos primeiros bytes e pela extensão (todos os tipos aceites, ZIP com extensão Office, ficheiro desconhecido, SVG com texto antes da etiqueta);
  - caminhos de "Carregar pasta" (normalização, `..` e caminhos absolutos recusados, profundidade máxima);
  - nomes únicos no ZIP;
  - componentes (lista e grelha, filtros, seletor de anexos).
- **Base de dados:**
  - criar, mudar o nome e apagar pastas; nome repetido recusado; profundidade máxima;
  - carregar, confirmar e recusar ficheiros; quota excedida;
  - "Carregar pasta" cria as subpastas uma única vez;
  - visibilidade herdada pelas subpastas e ficheiros nas vistas do portal;
  - operacional carrega só para pastas visíveis e apaga só os seus; decisor só lê; cliente financeiro sem acesso;
  - freelancer do projeto escreve; fora do projeto, não; financeiro só lê;
  - manifesto do ZIP só com ficheiros legíveis e dentro do teto;
  - anexos: atualização visível recusa ficheiro interno; o anexo sai do portal quando a pasta deixa de ser visível;
  - RLS das tabelas e das vistas, e isolamento entre organizações.
- **Ponta a ponta:** a equipa cria uma pasta, carrega um ficheiro e torna a pasta visível; anexa o ficheiro a uma atualização visível; o cliente vê a pasta e o anexo no portal e descarrega a pasta em ZIP; axe nas páginas novas.

## 6. Critérios de aceitação

1. O cliente nunca vê uma pasta interna, nem os seus ficheiros, nem anexos que venham dela.
2. Uma pasta inteira carrega com a sua estrutura e descarrega num ZIP com a mesma estrutura.
3. Nenhum ficheiro fica disponível sem a verificação do tipo e do tamanho, e nenhum carregamento passa a quota da organização.
4. Os testes de ponta a ponta e o axe passam em CI e em staging.
