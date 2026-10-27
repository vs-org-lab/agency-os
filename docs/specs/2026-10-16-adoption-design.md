# Sub-projeto 3F — Adoção

| Campo                   | Valor                                        |
| ----------------------- | -------------------------------------------- |
| Data                    | 2026-10-16                                   |
| Estado                  | Aprovado (luz verde permanente do fundador)  |
| Vaga                    | 3 (… → 3E Relatórios e QBR → **3F Adoção**)  |
| Módulos                 | M15 (RF-140, RF-141), C-12, P-09             |
| Documentação de produto | `01` (M15), `02` (C-12, P-09), `08` (SEC-50) |
| Depende de              | 1B Salas, 2B Biblioteca, 2C Portal           |

## 1. Objetivo

Cada cliente tem uma Academia: os tutoriais em vídeo, os manuais e as listas de verificação de formação que a equipa prepara para a equipa do cliente usar o que foi entregue. A equipa publica cada item quando está pronto; o cliente vê-os no portal e marca os passos das listas de verificação à medida que os cumpre. A equipa regista também as sessões de formação, com a data, os participantes e os materiais usados, e o cliente vê esse histórico.

## 2. Decisões

1. **Academia por cliente, não por projeto.** Os itens e as sessões pertencem ao cliente e ficam na sala (C-12) e no portal (P-09) enquanto o cliente existir.
2. **Tipos de item:**
   - **Tutorial:** um vídeo da Biblioteca do cliente (reproduzido no próprio OS, com ligação assinada) ou uma ligação externa (YouTube, Vimeo, Loom ou outra), aberta num separador novo.
   - **Manual:** um ficheiro da Biblioteca do cliente (PDF ou outro) ou uma ligação externa.
   - **Lista de verificação:** até 30 passos de texto, por ordem.
   - Cada item tem título (até 120 caracteres), descrição opcional (até 1000) e posição.
3. **Sem vídeo incorporado de terceiros.** O SEC-50 só permite iframes do Figma e do serviço de assinatura, por isso as ligações externas abrem fora do OS e só os vídeos da Biblioteca tocam na página.
4. **Ficheiros que o cliente já vê.** Um tutorial ou manual da Biblioteca só pode usar um ficheiro pronto de uma pasta visível ao cliente, como os anexos das atualizações (RF-055). O portal descarrega-o pela ligação da Biblioteca que já existe, sem um caminho de acesso novo.
5. **Rascunho e publicado.** Um item novo é rascunho; "Publicar" mostra-o ao cliente e "Retirar" esconde-o de novo. Um item publicado pode ser editado; uma lista de verificação publicada pode ganhar passos, e apagar um passo apaga também o que o cliente marcou nele.
6. **Passos marcados pelo cliente.** Qualquer membro ativo do cliente com acesso à sala no portal marca e desmarca os passos das listas publicadas; fica registado quem marcou e quando. A equipa vê o progresso (passos feitos de quantos) no C-12 e também pode marcar.
7. **Sessões de formação (RF-141):**
   - data (dia de Lisboa), título (até 120 caracteres), duração em minutos (opcional, até 600) e resumo (até 2000 caracteres), visível ao cliente;
   - participantes: membros do cliente e da equipa escolhidos de listas, e convidados escritos à mão (até 10 nomes, 80 caracteres cada);
   - materiais: itens da Academia usados na sessão;
   - o cliente vê as sessões no P-09, mais recentes primeiro, com os materiais publicados (os rascunhos não aparecem).
8. **Quem faz o quê.**
   - **Criar, editar, publicar, retirar, apagar itens e registar sessões:** quem escreve na sala do cliente (`can_write_rooms`).
   - **Ver a Academia na sala:** quem lê a sala (`can_read_rooms`).
   - **Cliente:** só itens publicados e sessões, por vistas de portal (`app.is_client_member` com acesso à sala).
9. **Ecrãs.**
   - **C-12 Academia** em `/c/:cliente/academy`, separador da sala depois de Relatórios: a lista dos itens com tipo, estado e progresso, "Novo item", a edição no próprio cartão, e a secção de sessões com "Registar sessão".
   - **P-09 Academia** em `/portal/academy`, no menu do portal para quem vê a sala: tutoriais, manuais e listas de verificação publicados, por posição, e as sessões de formação.
10. **Sem automações novas.** O 07 não define nenhuma para a Adoção; o aviso ao cliente quando um item é publicado fica excluído (abaixo).

## 3. Âmbito

### Incluído

- **Dados:**
  - `academy_items` (cliente, tipo `tutorial`/`manual`/`checklist`, título, descrição, posição, estado `draft`/`published`, ficheiro da Biblioteca ou ligação, publicado em);
  - `academy_checklist_steps` (item, posição, texto até 200 caracteres) e `academy_step_checks` (passo, membro do cliente ou da equipa, quando);
  - `training_sessions` (cliente, data, título, duração, resumo), `training_session_participants` (utilizador ou nome escrito) e `training_session_materials` (item);
  - RLS: leitura da equipa por `can_read_rooms`, sem escrita para `authenticated`; vistas de portal `security_barrier` para itens publicados, passos, marcações e sessões.
- **Lógica:** validação das ligações (`https` apenas), escolha dos ficheiros elegíveis, publicação, marcação de passos, sessões com participantes e materiais.
- **Ecrãs:** C-12, P-09, separador da sala e menu do portal.
- **E2E:** a equipa cria e publica uma lista de verificação; o cliente marca um passo no portal; a equipa vê o progresso e regista uma sessão; axe no C-12 e no P-09.

### Excluído (registado em `docs/STATUS.md`)

| Item                                             | Motivo                                                           | Quando            |
| ------------------------------------------------ | ---------------------------------------------------------------- | ----------------- |
| Vídeo incorporado do YouTube, Vimeo ou Loom      | O SEC-50 limita os iframes ao Figma e ao serviço de assinatura   | Revisão do SEC-50 |
| Aviso ao cliente quando um item é publicado      | O 07 não o define; o cliente vê a Academia no portal             | Pedido real       |
| Ligação das sessões à Agenda                     | As sessões registam o que aconteceu; a marcação faz-se na Agenda | Pedido real       |
| Progresso por pessoa e questionários             | O RF-140 pede listas de verificação, não avaliação               | Pedido real       |
| Modelos de Academia reutilizáveis entre clientes | Cada cliente tem materiais próprios no início                    | Pedido real       |

## 4. Testes

- **Unitários:** validação das ligações e dos textos; progresso de uma lista; C-12 (lista, estados, formulários, sessões) e P-09 (itens publicados, passos, sessões); menu da sala e do portal.
- **Base de dados:**
  - RLS das tabelas e das vistas de portal (equipa da sala, freelancer de outra sala e cliente de outro cliente sem nada; cliente só vê publicados);
  - só ficheiros prontos de pastas visíveis ao cliente;
  - publicar, retirar, editar e apagar com as marcações dos passos;
  - o cliente marca e desmarca passos de listas publicadas e não de rascunhos;
  - sessões com participantes do cliente, da equipa e convidados, e materiais da mesma Academia;
  - só quem escreve na sala altera.
- **E2E:** o percurso do âmbito.

## 5. Critérios de aceitação

1. A equipa da sala cria tutoriais, manuais e listas de verificação, publica-os e retira-os.
2. O cliente vê no portal só os itens publicados e marca os passos das listas; a equipa vê quem marcou e o progresso.
3. A equipa regista sessões de formação com data, participantes e materiais, e o cliente vê-as no portal.
4. Nenhum vídeo de terceiros é incorporado e nenhum ficheiro que o cliente não vê na Biblioteca chega à Academia.
