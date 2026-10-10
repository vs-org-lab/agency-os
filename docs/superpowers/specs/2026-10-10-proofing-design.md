# Sub-projeto 2D.1 — Proofing de ficheiros

| Campo                   | Valor                                                                                                                                    |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| Data                    | 2026-10-10                                                                                                                               |
| Estado                  | Implementado (2026-10-10)                                                                                                                |
| Vaga                    | 2 (2A → 2B → 2C → **2D.1 Proofing de ficheiros** → 2D.2 Marcos e entrega → 2E … 2G)                                                      |
| Módulos                 | M08 (RF-070 a RF-073)                                                                                                                    |
| Documentação de produto | `01` (RF-070 a RF-073), `02` (P-02, F5), `03` (US-14, US-15 e o pedido extra), `04` (RN-41, RN-42), `07` (AUT-17), `08` (SEC-30, SEC-31) |
| Depende de              | [2A Projetos, salas e processo](2026-10-09-rooms-process-design.md), [2C Equipa e convites](2026-10-10-team-invitations-design.md)       |

## 1. Objetivo

A equipa carrega um entregável (imagem, PDF ou vídeo) na sala do cliente e pede-lhe aprovação. O cliente abre-o no portal, deixa comentários presos a um ponto da imagem ou da página do PDF, ou a um momento do vídeo, e aprova ou pede alterações. A equipa responde, carrega uma nova versão e volta a pedir aprovação. Cada pedido de alterações conta uma ronda; o OS avisa quando as rondas do projeto se aproximam do limite e assinala quando o ultrapassam.

## 2. Decisões

1. **Divisão do 2D.** O 2D da vaga 2 fica em dois sub-projetos: este (proofing de ficheiros, rondas) e o 2D.2 (marco de faturação ligado à fase, RN-32, AUT-16, e a entrega 2.9 → 2.10, AUT-21). O 2D.2 depende das aprovações de fase que já existem desde o 2A, não deste.
2. **Ficheiro, versões e aprovação por versão.** Um entregável tem versões numeradas; cada versão é um ficheiro em Supabase Storage. A aprovação passa a poder ser de uma fase (já existe) ou de uma versão de ficheiro (`subject_type = 'file_version'`). Uma versão nova retira o pedido pendente da anterior.
3. **Tipos aceites:** PNG, JPEG, WebP, PDF, MP4 e WebM, até 50 MB (limite do plano gratuito, ADR 0003). O tipo real é verificado pelos primeiros bytes depois do carregamento (SEC-30); um ficheiro que não confere é apagado e a versão fica recusada. O antivírus continua adiado, como no 1B.
4. **Carregamento direto ao Storage** com link assinado de carregamento, como as gravações do 1B; o servidor confirma a versão depois de verificar o ficheiro. Os ficheiros são servidos por links assinados de 15 minutos (SEC-31).
5. **Comentários presos:**
   - imagem: ponto em percentagem da largura e da altura;
   - PDF: página e ponto em percentagem, sobre a página desenhada com `pdfjs-dist` (sem custo);
   - vídeo: segundo do vídeo;
   - comentário geral, sem ponto.
     Os pontos são numerados por ordem de criação na versão.
6. **Quem comenta e quem decide:** a equipa da sala (fundador, gestor atribuído e freelancer do projeto) comenta e pode marcar um comentário como interno (nunca sai para o cliente, RN-23); o decisor e o operacional comentam; só o decisor aprova ou pede alterações (RN-41, comentário obrigatório). Comentários podem ser dados como resolvidos pela equipa.
7. **Rondas (RF-073, RN-42, AUT-17):**
   - cada pedido de alterações sobre um ficheiro do projeto conta uma ronda;
   - o projeto tem um limite de rondas (3 por defeito), que o fundador ou o gestor mudam na sala;
   - ao chegar a 80% do limite, o OS avisa a equipa do cliente e o decisor;
   - um pedido de alterações acima do limite é aceite, mas fica assinalado como ronda extra, o OS cria a tarefa "Orçamentar ronda extra" ao gestor do cliente e avisa o fundador. O orçamento da ronda extra segue pelo processo de propostas existente.
8. **Avisos:**
   - pedido de aprovação de ficheiro: aviso ao cliente (como as fases);
   - decisão do cliente: aviso à equipa do cliente (como as fases, desde o 2C);
   - comentário do cliente: aviso à equipa do cliente;
   - comentário da equipa visível ao cliente: aviso ao cliente (RN-23).
9. **Central de aprovações (P-02)** agrupa por tipo (fases, ficheiros) e mostra há quanto tempo cada pedido espera.
10. **Acesso por projeto (RN-51):** as tabelas novas seguem `app.can_read_project`; o cliente lê pelas vistas do portal só as versões com pedido de aprovação e só os comentários não internos.

## 3. Âmbito

### Incluído

1. **Sala (equipa), por projeto:** secção "Para aprovação" com os ficheiros, a versão atual, o estado do pedido e os comentários; carregar ficheiro, carregar nova versão, pedir aprovação, retirar o pedido, comentar, responder em linha e resolver; limite de rondas do projeto.
2. **Visualizador** (equipa e portal) de imagem, PDF (páginas) e vídeo, com os pontos dos comentários e a lista ao lado; no telemóvel, a lista fica por baixo.
3. **Portal:** P-02 agrupada; o visualizador com comentários, aprovar e pedir alterações; o aviso de ronda extra antes de enviar.
4. **Rondas** contadas por projeto, com o aviso a 80% e a ronda extra.
5. **Emails:** `lead.proof_comment` (comentário da equipa), `founder.proof_comment` e `founder.extra_round` para a equipa, `lead.rounds_warning` e `founder.rounds_warning` a 80%.

### Excluído (registado em `docs/STATUS.md`)

| Item                                                          | Motivo                                                           | Volta quando                 |
| ------------------------------------------------------------- | ---------------------------------------------------------------- | ---------------------------- |
| Comentários sobre elementos de um site                        | Exige um script no site do cliente ou um proxy                   | Brand Hub e sites (2F)       |
| Aprovação de documentos (proposta, estratégia) e do mapa Core | Já têm fluxo próprio no 1B e no 1C                               | Biblioteca e documentos (2E) |
| Orçamento automático da ronda extra                           | O pedido extra usa as propostas existentes, iniciado pela equipa | Vaga 3                       |
| Antivírus dos ficheiros (SEC-30)                              | Sem serviço gratuito adequado; já adiado no 1B                   | Antes do lançamento          |
| Ficheiros acima de 50 MB e transcodificação de vídeo          | Limite do plano gratuito                                         | Plano pago (lançamento)      |

## 4. Dados e acesso

| Tabela           | Campos principais                                                                                                                                                 |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `proof_files`    | organização, cliente, projeto, fase (opcional), título, criado por, arquivado em                                                                                  |
| `proof_versions` | ficheiro, número, caminho no Storage, tipo (`image`, `pdf`, `video`), tipo MIME, tamanho, páginas (PDF), estado (`uploading`, `ready`, `rejected`), carregada por |
| `proof_comments` | versão, autor, corpo, âncora (ponto, página e ponto, ou segundo), número, interno, resolvido em, resposta a                                                       |

- `projects` ganha `revision_limit` (inteiro, 3 por defeito) e `approvals` ganha `extra_round` (booleano). O enum `approval_subject` ganha `file_version`.
- **Leitura da equipa:** `app.can_read_project` nas três tabelas.
- **Leitura do cliente:** vistas `portal_proof_files`, `portal_proof_versions` e `portal_proof_comments` (decisor e operacional), com versões que tiveram pedido de aprovação e comentários não internos.
- **Escrita** só por serviços: carregar e pedir aprovação (fundador e gestor atribuído), comentar (equipa da sala e cliente decisor ou operacional), decidir (decisor).
- **Storage:** bucket privado `proofs`, 50 MB, tipos da decisão 3; caminho `organização/cliente/projeto/ficheiro/versão`.

## 5. Testes

- **Unitários:** verificação do tipo pelos primeiros bytes; cálculo das rondas e do limiar de 80%; normalização das âncoras; componentes do visualizador (pontos numerados, comentário geral, aviso de ronda extra).
- **Base de dados:**
  - RLS e isolamento das três tabelas e das vistas (o operacional não vê comentários internos; o freelancer fora do projeto não vê nada);
  - carregar, confirmar e recusar uma versão;
  - pedido de aprovação de versão, retirado quando chega uma versão nova;
  - comentar com âncora, interno e resolvido;
  - decisão com comentário obrigatório, ronda contada, aviso a 80% uma única vez, ronda extra com tarefa e aviso.
- **Ponta a ponta:** a equipa carrega uma imagem e pede aprovação; o cliente comenta num ponto e pede alterações; a equipa carrega a versão 2; o cliente aprova; axe nas páginas novas.

## 6. Critérios de aceitação

1. Um ficheiro chega ao cliente só com pedido de aprovação, e cada comentário fica preso ao sítio certo da imagem, da página do PDF ou do momento do vídeo.
2. Nenhum comentário interno chega ao cliente.
3. Pedir alterações exige comentário e conta uma ronda; a ronda acima do limite fica assinalada e gera a tarefa de orçamento.
4. Um ficheiro com tipo falsificado nunca fica disponível.
5. Os testes de ponta a ponta e o axe passam em CI e em staging.
