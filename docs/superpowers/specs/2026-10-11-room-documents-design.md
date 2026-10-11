# Sub-projeto 2E.2 — Documentos da sala

| Campo                   | Valor                                                                                                                                                              |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Data                    | 2026-10-11                                                                                                                                                         |
| Estado                  | Aprovado (aprovação permanente do fundador)                                                                                                                        |
| Vaga                    | 2 (… → 2E.1 Biblioteca → **2E.2 Documentos da sala** → 2F Brand Hub → 2G Agenda)                                                                                   |
| Módulos                 | M04 (RF-030, RF-031 em parte, RF-033, RF-034), M06 (C-04, C-05), M08 (aprovação de documentos)                                                                     |
| Documentação de produto | `01` (RF-030 a RF-034), `02` (C-04, C-05, P-02, P-03), `04` (RN-20, RN-21, RN-23, RN-41), `08` (matriz, SEC-30, SEC-31)                                            |
| Depende de              | [2D.1 Proofing](2026-10-10-proofing-design.md), [2D.2 Marcos e entrega](2026-10-10-milestones-delivery-design.md), [2E.1 Biblioteca](2026-10-10-library-design.md) |

## 1. Objetivo

Cada projeto tem um separador Documentos onde a equipa reúne o que entrega ao cliente para ler e aprovar: uma apresentação do Figma, um PDF, um ficheiro ou um link externo. Cada documento tem versões, comentários e um estado visível (Rascunho, Com o cliente, Aprovado). O cliente abre-o no portal, comenta e, se a equipa pedir, aprova ou pede alterações. O separador mostra também, em cartões, o estado da proposta, do contrato e das faturas do cliente.

## 2. Decisões

1. **Tabelas próprias.** Os documentos da sala ficam em `project_documents`, `project_document_versions` e `project_document_comments`, por projeto. As apresentações do Core (tabela `documents`, por negócio, desde o 1B) mantêm o seu fluxo e aparecem no separador como cartões só de leitura.
2. **Tipos (RF-031):** `figma` (link de partilha do Figma, mostrado incorporado), `pdf` (ficheiro PDF, mostrado página a página), `file` (qualquer tipo aceite pela Biblioteca, para descarregar) e `link` (link externo `https`). O contrato gerado continua no fluxo do 1C.
3. **Versões (RF-033, RN-20).** Cada documento aponta para a versão atual. "Substituir" (PDF, ficheiro) e "Mudar link" (Figma, link) criam uma versão nova; as anteriores continuam acessíveis à equipa e, as que já estiveram com o cliente, também ao cliente. Uma versão nunca muda depois de criada.
4. **Estados:**
   - `draft` (Rascunho): só a equipa vê;
   - `with_client` (Com o cliente): partilhado, o cliente vê a versão atual;
   - `approved` (Aprovado): o decisor aprovou a versão atual.
   - "Retirar para rascunho" só antes da aprovação (RN-21). Uma versão nova de um documento aprovado volta a rascunho e a versão aprovada fica no histórico; uma versão nova de um documento com o cliente fica com o cliente, e o pedido de aprovação pendente é retirado.
   - "Remover" só para documentos que nunca foram aprovados.
5. **Aprovação.** A equipa pede aprovação de um documento com o cliente. `approvals` ganha o sujeito `document_version`. Só o decisor decide; pedir alterações exige comentário (RN-41) e cria a tarefa "Rever documento" ao gestor do cliente. A aprovação aparece em P-02 no grupo Documentos e usa os avisos de aprovação existentes (pedido ao cliente, decisão à equipa).
6. **Comentários (RF-034, RN-23).** Por documento, ligados à versão em que foram escritos. A equipa pode marcar um comentário como interno, que nunca sai. Um comentário visível da equipa chega ao cliente por email; um comentário do cliente chega à equipa do cliente. Sem pontos presos (isso é do proofing).
7. **Ficheiros.** PDF e ficheiros carregam-se direto ao Storage, no bucket `library`, com o caminho `documents/organização/cliente/projeto/documento/versão`. A verificação do tipo real e o tamanho (50 MB) reutilizam a Biblioteca; a versão `pdf` só aceita PDF que abra. A quota de 900 MB da organização passa a contar também estas versões. São servidos por `GET /api/documents/versions/[versionId]`, que verifica o acesso e redireciona para um link de 15 minutos (SEC-31).
8. **Links.** Figma: aceita os links de partilha `figma.com/file`, `/design`, `/proto` e `/deck`, mostrados pelo embed oficial (`embed.figma.com`), como no 1B. Link externo: só `https`, aberto num separador novo com `rel="noopener noreferrer"`.
9. **Quem faz o quê (matriz do `08`):** equipa que escreve na sala e freelancer do projeto (`projectEditor`) criam, mudam, partilham, retiram, removem, pedem aprovação e comentam; financeiro lê; decisor lê, comenta e decide; operacional lê e comenta; cliente financeiro não vê. Os cartões comerciais (proposta, contrato, faturas) só aparecem a quem lê o pipeline.
10. **Avisos (emails):** `lead.document_shared` (documento partilhado, com o link de P-03), `lead.document_comment` (comentário da equipa) e `founder.document_comment` (comentário do cliente, à equipa do cliente), com as horas de silêncio do cliente.

## 3. Âmbito

### Incluído

1. **Sala › Documentos (C-04)** em `/c/:cliente/docs`: seletor de projeto, cartões dos documentos com tipo, estado e versão; cartões do Core (apresentações), da proposta, do contrato e das faturas; "Novo documento" (título, tipo, link ou ficheiro).
2. **Documento (C-05)** em `/c/:cliente/docs/:id`: visualizador (Figma incorporado com ecrã inteiro e "Abrir no Figma", PDF página a página, ficheiro para descarregar, link externo); comentários à direita (por baixo no telemóvel); ações Partilhar, Retirar para rascunho, Substituir, Mudar link, Pedir aprovação, Remover; histórico de versões.
3. **Portal:** lista em `/portal/docs` e documento em `/portal/docs/:id` (P-03) com o visualizador, os comentários e, para o decisor com um pedido pendente, Aprovar e Pedir alterações; grupo Documentos em P-02; entrada Documentos no menu do portal.
4. **Emails** da decisão 10 e o assunto "documento" nos avisos de aprovação.

### Excluído (registado em `docs/STATUS.md`)

| Item                                                | Motivo                                               | Volta quando                 |
| --------------------------------------------------- | ---------------------------------------------------- | ---------------------------- |
| Aviso de link do Figma não público (RF-032)         | Exige a API do Figma com token da equipa             | Quando houver token do Figma |
| Navegação de diapositivos própria no Figma (RF-032) | O embed oficial já tem navegação e ecrã inteiro      | Se o embed deixar de bastar  |
| Comentários presos a pontos do documento            | Já existem no proofing para entregáveis              | Quando a equipa o pedir      |
| Documentos a partir de ficheiros da Biblioteca      | Carregar no próprio documento cobre o uso inicial    | Quando a equipa o pedir      |
| Assinatura de documentos genéricos                  | A assinatura eletrónica é do contrato (1C, ADR 0008) | Adendas (Vaga 3)             |

## 4. Dados e acesso

| Tabela                      | Campos                                                                                                                                                                                                                             |
| --------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `project_documents`         | organização, cliente, projeto, título (1–200), `kind` (`figma`, `pdf`, `file`, `link`), `status` (`draft`, `with_client`, `approved`), `current_version_id`, `shared_at`, `approved_at`, criado por, timestamps                    |
| `project_document_versions` | documento, organização, cliente, projeto, `number`, `url` (Figma ou link), `storage_path`, `file_name`, `mime_type`, `size_bytes`, `pages`, `upload_status` (`uploading`, `ready`, `rejected`), `shared_at`, criado por, criada em |
| `project_document_comments` | documento, versão, organização, cliente, projeto, autor, corpo (1–2000), `internal`, criado em                                                                                                                                     |

- `approval_subject` ganha `document_version`. `update_kind` não muda: os documentos não entram no feed.
- FKs compostas com `client_id` e `project_id`, como nas provas; `unique (document_id, number)`; uma versão `figma` ou `link` tem `url`, uma `pdf` ou `file` tem `storage_path`.
- **RLS forçado; escrita só por serviços.** A equipa lê pelas políticas `app.can_read_project`. O cliente lê pelas vistas `portal_project_documents` (documentos `with_client` ou `approved`, projeto não cancelado, decisor ou operacional), `portal_project_document_versions` (só versões com `shared_at`, prontas) e `portal_project_document_comments` (não internos, das versões visíveis ao cliente).
- A quota (`fitsStorage`) soma as versões prontas e as que ainda carregam.

## 5. Testes

- **Unitários:** validação dos links (Figma e `https`); regras de estado (o que cada estado permite); componentes (cartões, visualizador por tipo, comentários, ações por permissão, grupo Documentos em P-02).
- **Base de dados:**
  - criar documentos de cada tipo; ficheiro e PDF verificados e recusados; quota;
  - partilhar, retirar (recusado depois da aprovação), remover (recusado se já aprovado);
  - versão nova: em rascunho mantém rascunho; com o cliente retira o pedido pendente; aprovado volta a rascunho e a versão aprovada continua visível ao cliente;
  - pedir aprovação, aprovar, pedir alterações (comentário obrigatório, tarefa "Rever documento");
  - comentários internos fora do portal; avisos para o cliente e para a equipa;
  - RLS das tabelas e das vistas; isolamento; freelancer de outro projeto e cliente financeiro sem acesso;
  - cartões comerciais só para quem lê o pipeline.
- **Ponta a ponta:** a equipa cria um documento PDF, partilha-o e pede aprovação; o cliente abre-o no portal, comenta e aprova; o estado aparece Aprovado na sala; axe nas páginas novas.

## 6. Critérios de aceitação

1. Um documento aprovado nunca muda: qualquer alteração é uma versão nova, e a versão aprovada continua acessível.
2. O cliente só vê documentos partilhados, só as versões que lhe foram mostradas e nunca comentários internos.
3. Pedir alterações exige comentário e chega à equipa como tarefa.
4. Os testes de ponta a ponta e o axe passam em CI e em staging.
