# Sub-projeto 1A — Comercial

| Campo                   | Valor                                                                                                                                                   |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Data                    | 2026-10-07                                                                                                                                              |
| Estado                  | Em revisão                                                                                                                                              |
| Vaga                    | 1 (sub-projetos 1A Comercial → 1B Diagnóstico → 1C Documentos e contratos → 1D Faturação)                                                               |
| Módulos                 | M02 CRM e pipeline, M01 Candidaturas, parte do M21 (definições comerciais)                                                                              |
| Documentação de produto | `docs/product/01` (RF-001 a RF-017), `02` (S-05 a S-08, S-12, H-01, H-02, F1), `03` (US-01 a US-03), `04` (RN-01 a RN-11), `07` (AUT-01 a AUT-07), `08` |
| Fontes externas         | Aurion Operations Playbook (pipeline universal, secção 4; marcos, secção 9); Aurion Website, Arquitetura e Copy (filtragem de leads, páginas 12 a 15)   |
| Depende de              | [Sub-projeto 0 — Fundação](2026-10-06-platform-foundation-design.md)                                                                                    |

## 1. Objetivo

Pôr a porta de entrada comercial a funcionar sem intervenção manual: um visitante candidata-se, é pontuado e encaminhado; o lead A marca a chamada sozinho no calendário do fundador; cada negócio vive num pipeline único com código, responsável e prazo; nenhum acompanhamento se perde.

O 1A está concluído quando um lead fictício percorre, em staging, o caminho candidatura → marcação → chamada → resultado (0.1 a 0.4 ou X.4), com cada passo auditado, coberto por testes e sem copiar dados à mão.

## 2. Âmbito

### Incluído

1. Candidatura pública (H-01) com pontuação, caminhos A, B e C, origem e consentimento; página própria e versão embutível.
2. Páginas de obrigado por caminho (H-02); agenda própria para o caminho A e para leads B aprovados; gestão da marcação pelo lead.
3. Ligação ao Google Calendar por utilizador (disponibilidade e criação de eventos com Google Meet).
4. CRM: clientes no estado prospeto, contactos com papel, negócios, histórico do pipeline, chamadas, acompanhamentos, linha temporal.
5. Ecrãs do estúdio: Pipeline (S-05), Negócio (S-07, sem o separador Documentos), Candidaturas (S-06, com Fila B), Angariação (S-08), Início mínimo ("Hoje").
6. Definições comerciais: Integrações, Candidatura (RF-006), Agenda, Modelos de mensagem.
7. Automações AUT-01, AUT-02, AUT-03, AUT-05, AUT-06, AUT-07 e a anonimização das candidaturas C (SEC-73).
8. Serviço de email da aplicação com adaptador SMTP (Gmail durante o desenvolvimento).

### Excluído (registado em `docs/STATUS.md`)

| Item                                                                          | Motivo                                       | Volta quando                                 |
| ----------------------------------------------------------------------------- | -------------------------------------------- | -------------------------------------------- |
| AUT-04 (autodiagnóstico por email e newsletter, no n8n)                       | Não existe n8n                               | Montagem do n8n                              |
| Autodiagnóstico de 12 perguntas                                               | Vive no site                                 | Construção do site                           |
| Centro de notificações e preferências por pessoa                              | Pertence ao Início completo (S-01)           | Vaga 2                                       |
| Sincronização do calendário nos dois sentidos para todos os eventos           | Módulo M11                                   | Vaga 2                                       |
| Transições que dependem de módulos por construir (entrada em 1.1 e seguintes) | Critérios (RN-03, RN-04) dependem de 1B a 1D | Cada critério ativa-se com o seu sub-projeto |
| Separador Documentos do negócio                                               | Módulo M04                                   | 1C                                           |
| Turnstile invisível como segunda barreira contra robôs                        | Honeypot, tempo mínimo e limite bastam       | Spam real observado                          |

## 3. Dados de referência

### Pipeline universal

34 códigos, guardados como enum `app.pipeline_code`. Origem: Operations Playbook, secção 4.

| Etapa             | Códigos                                                                                                                                                                                                                                       |
| ----------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0 · Pré-venda     | 0.1 Candidatura recebida · 0.2 Candidatura qualificada · 0.3 Descoberta agendada · 0.4 Descoberta realizada                                                                                                                                   |
| 1 · Core          | 1.1 Core contratado · 1.2 Recolha de informação · 1.3 Análise e arquitetura · 1.4 Roadmap preparado · 1.5 Sessão de apresentação · 1.6 Core entregue                                                                                          |
| 2 · Orbit         | 2.1 Orbit contratado · 2.2 Kickoff realizado · 2.3 Descoberta criativa/técnica · 2.4 Arquitetura aprovada · 2.5 Produção em curso · 2.6 QA interno · 2.7 Apresentação e feedback · 2.8 Ajustes finais · 2.9 Lançamento · 2.10 Orbit concluído |
| 3 · Gravity       | 3.1 Gravity contratado · 3.2 Setup de tracking · 3.3 Campanhas configuradas · 3.4 Aprendizagem/otimização · 3.5 Relatório inicial · 3.6 Gravity em regime contínuo                                                                            |
| 4 · Constellation | 4.1 Constellation ativo · 4.2 Ciclo mensal · 4.3 QBR · 4.4 Renovação/expansão                                                                                                                                                                 |
| X · Fora de ciclo | X.1 Em pausa · X.2 Bloqueado · X.3 Encerrado, concluído · X.4 Encerrado, perdido                                                                                                                                                              |

Os nomes apresentados vivem nos catálogos de mensagens (pt-PT e en); o código guarda só o identificador.

### Regras de transição

As transições são uma matriz tipada no módulo de domínio, testada célula a célula (34 × 34), no mesmo modelo da matriz de acesso.

1. **Avançar:** só para o código seguinte da mesma etapa.
2. **Mudar de etapa:** só pelas ligações 0.4 → 1.1, 0.4 → 2.1 (RN-03), 1.6 → 2.1, 2.10 → 3.1, 2.10 → 4.1, 3.6 → 4.1 e 4.4 → 4.1.
3. **Recuar:** um código dentro da mesma etapa, só pelo fundador e com motivo obrigatório (correção de engano).
4. **Estados X:** X.1 a X.4 a partir de qualquer código fora de X. Reabrir X.1 ou X.2 devolve o código anterior, lido do histórico. X.3 e X.4 são finais.
5. **Critérios de entrada:** 0.2 → 0.3 exige uma chamada marcada; 0.3 → 0.4 exige a chamada feita com resultado registado; X.4 exige motivo.
6. **Critérios de módulos futuros:** as transições para 1.1, 2.1 e as seguintes devolvem a regra `module_pending` com o nome do módulo em falta. Os critérios de RN-03 e RN-04 ligam-se a esta matriz no sub-projeto que os torna verificáveis (1B: mapa aprovado; 1C: contrato assinado; 1D: pagamento e fatura).

Cada recusa devolve um código de regra e uma mensagem em linguagem simples, traduzida, que cita a regra (separador 04).

### Candidatura

Uma pergunta por ecrã. Origem: Aurion Website, Arquitetura e Copy, páginas 12 e 13. Configuração inicial da versão 1 do formulário:

| #   | Pergunta                                                 | Opções e pontos                                                                                                                      |
| --- | -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | Nome e email profissional                                | Texto; aviso se o email for de um fornecedor pessoal                                                                                 |
| 2   | Empresa e website                                        | Texto                                                                                                                                |
| 3   | Qual é a sua função?                                     | CEO, fundador ou sócio 3 · Diretor 2 · Outra 0                                                                                       |
| 3b  | Se "Outra": o decisor final vai participar?              | Sim 0 · Não eliminatório                                                                                                             |
| 4   | Setor                                                    | Consultoria 2 · Energia 2 · Tecnologia 2 · Outro 0                                                                                   |
| 5   | Faturação anual ou investimento levantado                | Até €1M 0 · €1M a €5M 1 · €5M a €20M 2 · Mais de €20M 3                                                                              |
| 6   | O que quer resolver primeiro?                            | Gerar reuniões com decisores · Reconstruir marca e site · Integrar ferramentas e automatizar · Outro (sem pontos; orienta a chamada) |
| 7   | Investimento previsto                                    | Menos de €10k eliminatório · €10k a €25k 1 · €25k a €50k 2 · Mais de €50k 3                                                          |
| 8   | Quando quer começar?                                     | Este trimestre 2 · Nos próximos 6 meses 1 · Estou a explorar 0                                                                       |
| 9   | O que lhe custa não resolver isto nos próximos 12 meses? | Texto livre, sem pontos; destacado antes de cada chamada                                                                             |
| —   | Consentimento de tratamento de dados                     | Caixa obrigatória; guarda a data e a versão do texto                                                                                 |

Pontuação máxima 13. **Caminho A:** 9 a 13 pontos, sem eliminatórios. **Caminho B:** 6 a 8. **Caminho C:** 5 ou menos, ou qualquer eliminatório (RN-10). Perguntas, opções, pontos, eliminatórios e limites são editáveis nas Definições; guardar cria uma versão nova do formulário, e cada candidatura guarda a versão com que foi pontuada.

## 4. Arquitetura

Novo módulo `apps/web/src/modules/commercial`, com a mesma estrutura dos módulos da fundação: funções de domínio puras, serviços que recebem as suas dependências (contextos de base de dados, portas de email e de calendário, relógio) e um `server.ts` que as compõe.

| Unidade                               | Responsabilidade                                                                                       |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `pipeline/codes.ts`, `transitions.ts` | Códigos, etapas e matriz de transições; função pura `evaluateTransition`                               |
| `pipeline/service.ts`                 | Aplicar uma transição: valida, grava o código e o histórico, linha temporal, auditoria, evento         |
| `applications/scoring.ts`             | Função pura: versão do formulário + respostas → pontuação, caminho, eliminatórios acionados            |
| `applications/submit.ts`              | Submissão pública: proteção contra robôs, validação, transação única                                   |
| `booking/slots.ts`                    | Função pura de horários livres (horário, ocupado, chamadas, intervalo, antecedência, horizonte, fusos) |
| `booking/service.ts`                  | Marcar, remarcar e cancelar, com bloqueio por anfitrião                                                |
| `calendar/port.ts`                    | Porta `CalendarPort` (disponibilidade, criar, mudar e apagar evento); adaptadores Google e falso       |
| `follow-ups/`                         | Sequência 3/7/14/30 dias e mensagens sugeridas a partir dos modelos                                    |
| `acquisition/`                        | Empresas-alvo e conversão em prospeto                                                                  |
| `modules/email`                       | Porta `EmailPort`; adaptadores SMTP e de captura; modelos tipados pt-PT e en (HTML e texto)            |

Rotas novas:

- `app/[locale]/(public)/apply`, `apply/thanks`, `apply/book/[token]`, `apply/booking/[token]`: moldura pública própria, sem a moldura do estúdio.
- `app/[locale]/(workspace)/pipeline`, `pipeline/[dealId]`, `applications`, `acquisition`, `settings/integrations`, `settings/application`, `settings/booking`, `settings/templates`.
- `app/api/integrations/google/callback`: retorno do OAuth.

A regra de ESLint que impede `withSystemContext` em `apps/web/src/app` mantém-se: as rotas públicas chamam o módulo comercial, que é o único a escrever em contexto de sistema.

## 5. Modelo de dados

Todas as tabelas novas têm `organization_id`; as que pertencem a um cliente têm também `client_id` com chave estrangeira composta (cliente, organização), RLS FORCE e privilégios revogados e concedidos por coluna, como na fundação. Nada se apaga fisicamente.

| Tabela                 | Campos principais                                                                                                                                                                                                                                        | Notas                                                                                                |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `clients` (alteração)  | `lifecycle` (`prospect`, `active`, `former`), `website`, `revenue_band`                                                                                                                                                                                  | Valor por defeito `active` para os existentes; prospetos não aparecem nas salas nem na barra lateral |
| `contacts`             | cliente, nome, email, telefone, função, papel (`client_role`), utilizador do portal (opcional)                                                                                                                                                           | Email único por cliente, em minúsculas                                                               |
| `application_forms`    | versão, perguntas e opções (jsonb validado), limites A/B, ativa, autor                                                                                                                                                                                   | Uma única versão ativa por organização                                                               |
| `applications`         | contacto, negócio, versão do formulário, respostas, pontuação, caminho, eliminatórios, origem (UTM, página de entrada, referrer, fuso do navegador), consentimento (data, versão do texto), `anonymized_at`                                              | Candidatura repetida cria uma linha nova e atualiza o contacto (RN-11)                               |
| `deals`                | cliente, título, `pipeline_code`, próximo passo, responsável (pessoa ou cliente), prazo, valor estimado e moeda, origem (`application`, `acquisition`, `referral`, `client_request`), motivo de perda                                                    | Um negócio aberto por cliente (índice único parcial fora de X.3 e X.4)                               |
| `deal_stage_changes`   | negócio, de, para, motivo, autor, data                                                                                                                                                                                                                   | Só de escrita: UPDATE, DELETE e TRUNCATE bloqueados para todos os papéis                             |
| `calls`                | negócio, início, fim, fuso do lead, anfitrião, id do evento Google, link Meet, estado (`scheduled`, `cancelled`, `completed`, `no_show`), estado de sincronização, resultado (`advance`, `decline`, `follow_up`), motivo, notas, hash do token de gestão | Uma chamada `scheduled` por negócio                                                                  |
| `follow_ups`           | negócio, data, dia da sequência, mensagem sugerida, estado (`open`, `done`, `dismissed`), responsável                                                                                                                                                    | Único por (negócio, dia da sequência, chamada)                                                       |
| `message_templates`    | tipo (`follow_up`, `acquisition`, `email`), setor, dia, idioma, nome, assunto, corpo                                                                                                                                                                     | O 1C acrescenta modelos de contrato                                                                  |
| `acquisition_targets`  | empresa, setor, website, notas de abordagem, estado (`to_contact`, `contacted`, `replied`, `converted`, `discarded`), cliente criado                                                                                                                     | Sem `client_id` até à conversão                                                                      |
| `timeline_entries`     | cliente, negócio, tipo, resumo, referência ao item, autor, data                                                                                                                                                                                          | Escrita na mesma transação da ação; só de escrita                                                    |
| `calendar_connections` | utilizador, fornecedor, conta Google, calendário, id do segredo no Vault, estado, última verificação                                                                                                                                                     | O _refresh token_ fica cifrado no Supabase Vault; nenhum papel de utilizador lê o segredo            |
| `commercial_settings`  | horário semanal, duração, intervalo, antecedência mínima, horizonte, fuso, anfitrião, URL do autodiagnóstico, meses até anonimizar                                                                                                                       | Uma linha por organização                                                                            |
| `submission_throttle`  | chave (hash de IP ou de email), tipo, janela, contagem                                                                                                                                                                                                   | Sem acesso para utilizadores                                                                         |
| `captured_emails`      | destinatário, modelo, assunto, corpo                                                                                                                                                                                                                     | Só escrita pelo adaptador de captura, ativo em testes e previews; vazia em staging e produção        |

### Acesso

| Papel      | Pipeline, CRM, candidaturas, angariação                                                  | Definições comerciais |
| ---------- | ---------------------------------------------------------------------------------------- | --------------------- |
| Fundador   | Ler e escrever                                                                           | Ler e escrever        |
| Gestor     | Ler e escrever nos clientes atribuídos (`client_staff_assignments`), incluindo prospetos | —                     |
| Financeiro | Ler                                                                                      | —                     |
| Freelancer | —                                                                                        | —                     |
| Clientes   | —                                                                                        | —                     |

As duas barreiras da fundação aplicam-se: `authorize()` com o recurso `pipeline` da matriz e RLS em cada tabela. Ligar ou desligar o Google Calendar exige MFA recente (15 minutos). Todas as tabelas novas entram nos testes de isolamento e de papéis que correm antes de cada deploy (SEC-13).

## 6. Candidatura pública

1. **Moldura pública:** marca Aurion, pt-PT e en, claro e escuro, utilizável a 360 px. `/apply?embed=1` esconde o cabeçalho.
2. **Embutir:** o cabeçalho `frame-ancestors` das rotas `/apply` aceita as origens da variável `APPLY_EMBED_ORIGINS`, definida por ambiente; o resto da aplicação mantém `frame-ancestors 'none'`. A origem do site muda raramente e o proxy não lê a base de dados em cada pedido.
3. **Rascunho:** as respostas ficam no `sessionStorage` até à submissão.
4. **Proteção contra robôs, sem captcha:** campo honeypot (a submissão é aceite em silêncio e descartada), tempo mínimo de 3 segundos entre o carregamento e a submissão, limite de 5 submissões por hora por IP e 3 por dia por email, guardados como hash com sal (SEC-04).
5. **Submissão** (ação de servidor → `submitApplication`):
   1. Validação com Zod contra a versão ativa do formulário (SEC-52).
   2. Pontuação pela função pura.
   3. Numa única transação: encontrar ou criar o cliente (prospeto) e o contacto pelo email; gravar a candidatura; ligar ao negócio aberto do cliente ou criar um negócio em 0.1; aplicar a transição 0.1 → 0.2 (A e B) ou → X.4 com motivo "caminho C" pelo serviço do pipeline; linha temporal, auditoria e evento `commercial.application.submitted`.
6. **Obrigado:** redireciona para `/apply/thanks?ref=<token>`, assinado com HMAC (`PUBLIC_LINK_SECRET`), válido 2 horas, com a candidatura e o caminho. Sem token válido, mostra a versão genérica.
   - **A:** "Está dentro do perfil." e a agenda.
   - **B:** "Recebemos a sua candidatura. Respondemos em 24 horas úteis."
   - **C:** "Obrigado pela honestidade das respostas." e o link do autodiagnóstico, quando configurado.

## 7. Agenda

1. **Horários livres:** horário semanal das definições (por defeito segunda a sexta, 10h–18h, Europe/Lisbon), duração 45 minutos, intervalo 15 minutos, antecedência mínima 24 horas, horizonte 14 dias. Subtrai os períodos ocupados do calendário do anfitrião (pedido de disponibilidade do Google) e as chamadas já marcadas. Mostrados no fuso do visitante, que o pode mudar.
2. **Marcar:** bloqueio consultivo por anfitrião na transação; verificação de novo do horário; grava a chamada e aplica 0.2 → 0.3; cria o evento no Google com Google Meet e o lead como convidado. Se o Google falhar, a chamada fica `pending_sync` e o evento é criado pela fila de tarefas; o lead recebe a confirmação.
3. **Sem ligação ao Google** (desligada ou revogada): a página A mostra a mensagem do caminho B e o fundador recebe um alerta. O lead nunca vê um erro.
4. **Gerir:** o email de confirmação leva um link `/apply/booking/<token>` (token aleatório de 32 bytes, guardado como hash) para remarcar ou cancelar até 2 horas antes.
5. **Lead B aprovado:** recebe um link `/apply/book/<token>`, assinado com HMAC e válido 14 dias, que abre a mesma agenda. O link deixa de funcionar quando o negócio sai de 0.2.
6. **Ligação ao Google:** OAuth 2.0 com PKCE e `state`; permissões `calendar.events`, `calendar.freebusy`, `openid` e `email`. App Google externa publicada em produção sem verificação (aviso de app não verificada aceite uma vez pelo fundador; o acesso não expira). O _refresh token_ é guardado no Vault por uma função `security definer`; o token de acesso vive só em memória; desligar revoga o token na Google. Credenciais em `GOOGLE_CLIENT_ID` e `GOOGLE_CLIENT_SECRET`. Os previews usam o adaptador falso (`CALENDAR_PROVIDER=fake`), porque a Google exige URIs de retorno fixos.

## 8. Ecrãs do estúdio

Arquétipos e estados do separador 02, componentes do separador 05, pt-PT e en, claro e escuro, WCAG 2.2 AA.

| Ecrã                         | Conteúdo                                                                                                                                                                                                                                                                                                                                                                                                                |
| ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Pipeline `/pipeline`         | Quadro com colunas por código, agrupadas por etapa e recolhíveis; faixa dos estados X; cartão com empresa, valor, próximo passo, responsável e prazo (vencido assinalado). Arrastar valida no servidor; uma recusa devolve o cartão com a regra explicada; menu "Mover para…" como alternativa por teclado; motivo pedido para X.4 e para recuar. Vista de lista com filtros por etapa, responsável e prazo, e pesquisa |
| Negócio `/pipeline/:id`      | Cabeçalho com código, "Mover para…" e os três campos de rastreio editáveis. Separadores Resumo (empresa, contactos e papéis, valor, origem), Candidatura (respostas, pontuação por pergunta, pergunta 9 em destaque), Chamadas (marcar à mão, link Meet, registar resultado e motivo), Linha temporal. Coluna lateral com acompanhamentos abertos e mensagem sugerida com botão de copiar                               |
| Candidaturas `/applications` | Lista com pontuação, caminho, origem e data; separador Fila B com "Aprovar para A" e "Enviar para C"; candidatura anonimizada mostra só pontuação, caminho e data                                                                                                                                                                                                                                                       |
| Angariação `/acquisition`    | Empresas-alvo por setor, estado e notas; modelos de mensagem por setor com botão de copiar; "Converter" cria prospeto, contacto e negócio em 0.1 com origem `acquisition`                                                                                                                                                                                                                                               |
| Início `/`                   | "Hoje": acompanhamentos vencidos, Fila B por rever e chamadas do dia, ordenados por urgência, cada um com ligação direta                                                                                                                                                                                                                                                                                                |
| Definições                   | Integrações (Google Calendar e estado); Candidatura (editor, pré-visualização da pontuação, versões); Agenda; Modelos de mensagem                                                                                                                                                                                                                                                                                       |

A barra lateral do estúdio passa a ter Início, Pipeline, Candidaturas e Angariação. Itens e rotas sem permissão não aparecem e respondem 404.

## 9. Automações e email

Eventos novos: `commercial.application.submitted`, `commercial.deal.stage_changed`, `commercial.call.booked`, `commercial.call.rescheduled`, `commercial.call.cancelled`, `commercial.call.completed`. Escritos na transação da mudança e despachados pelo outbox existente.

| Código | Gatilho                            | Ação                                                                                                                                                        |
| ------ | ---------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| AUT-01 | `commercial.application.submitted` | Pontuação e criação já feitas na transação; a função trata os efeitos seguintes                                                                             |
| AUT-02 | Caminho A                          | Email ao lead com o link de marcação; alerta ao fundador                                                                                                    |
| AUT-03 | Caminho B                          | Alerta ao fundador; 24 horas depois, novo alerta se o lead continuar em Fila B                                                                              |
| AUT-05 | `commercial.call.booked`           | Cria o evento Google se pendente; lembretes ao lead 24 horas e 1 hora antes, só se a chamada continuar marcada para a mesma hora                            |
| AUT-06 | Fim da chamada + 2 horas           | Alerta ao fundador se o resultado não estiver registado                                                                                                     |
| AUT-07 | Diário                             | Negócios em 0.4 ou com resultado "acompanhar" cuja última entrada na linha temporal tem 3, 7, 14 ou 30 dias: cria o acompanhamento com a mensagem do modelo |
| SEC-73 | Diário                             | Anonimiza candidaturas C sem relação comercial depois do prazo configurado (por defeito 12 meses; prazo final com o advogado)                               |

- **Uma vez só:** chave de idempotência por evento; acompanhamentos únicos por negócio, chamada e dia da sequência.
- **Falhas:** até 5 repetições com intervalo crescente; depois Sentry e alerta ao fundador, que não pode ser desligado.
- **Email:** `EmailPort` com adaptadores `smtp` (Gmail agora, Resend no lançamento) e `capture` (testes e previews). Modelos tipados pt-PT e en, HTML e texto, com uma única ação por email. Remetente "Vladimir, Aurion". Horas de silêncio (20h–8h no fuso do destinatário) para emails não pedidos; a confirmação de marcação e os lembretes de chamada saem à hora. Uma falha de envio é repetida pela fila e nunca faz falhar a ação do utilizador.

## 10. Erros e segurança

- Recusas de regra citam a regra em linguagem simples; "não existe" e "sem acesso" têm a mesma resposta (SEC-12).
- Toda a entrada pública é validada no servidor; consultas parametrizadas (SEC-52).
- IP e email do limite de submissões guardados só como hash com sal.
- O token de gestão da marcação é guardado como hash; os links assinados expiram.
- Os segredos novos (`PUBLIC_LINK_SECRET`, `GOOGLE_CLIENT_SECRET`, SMTP) vivem nas variáveis de ambiente de cada ambiente e nos segredos do GitHub, nunca no código.
- Base legal da candidatura: consentimento com data e versão do texto (SEC-70).

## 11. Testes

| Nível               | Cobertura                                                                                                                                                                                                                                              |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Unitários           | Pontuação (todos os casos da tabela, eliminatórios, limites); matriz de transições 34 × 34; horários livres (mudança de hora em Lisboa, Angola, intervalos, antecedência, horizonte); tokens assinados; deteção de email pessoal; limite de submissões |
| Base de dados e RLS | Tabelas novas nos testes de isolamento e de papéis; histórico do pipeline e linha temporal só de escrita; Vault inacessível a utilizadores; índice de negócio aberto único                                                                             |
| Integração          | Submissão e marcação completas contra a base de dados, com adaptadores falsos de email e de calendário; idempotência das funções Inngest                                                                                                               |
| Ponta a ponta       | Candidatura A → marcação → negócio em 0.3 no quadro; candidatura C → X.4; Fila B nos dois sentidos; transição proibida devolve o cartão com a regra; axe em todos os ecrãs novos; páginas públicas a 360 px                                            |
| Teste real          | Em staging, pelo fundador: candidatura com o próprio email, marcação, evento no Google Calendar com Meet, emails recebidos                                                                                                                             |

## 12. Critérios de aceitação

1. Candidaturas A, B e C chegam ao caminho certo, com pontuação, versão do formulário, origem e consentimento guardados.
2. Um lead A marca a chamada sozinho; o evento aparece no calendário do fundador com Google Meet; o negócio fica em 0.3.
3. A Fila B aprova para A (o lead recebe o link de marcação) e envia para C (o negócio passa a X.4).
4. O pipeline recusa transições inválidas, explica a regra, e o histórico guarda todas as mudanças.
5. Os acompanhamentos aos 3, 7, 14 e 30 dias aparecem em "Hoje" com a mensagem sugerida.
6. As automações correm uma única vez por evento; uma falha persistente gera alerta.
7. Cada papel vê só o que a matriz permite, provado por testes de RLS e de autorização.
8. Testes de ponta a ponta e axe passam em staging.
9. O teste real do fundador em staging passa.

## 13. Riscos

| Risco                                                                | Mitigação                                                                                                                                                  |
| -------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A Google revoga o acesso ou muda as regras para apps não verificadas | Alerta ao fundador, fallback para a mensagem B, ligação por utilizador fácil de refazer; verificação ou Google Workspace antes do lançamento se necessário |
| Envio por Gmail limitado ou marcado como spam                        | Volume baixo; troca para Resend com domínio autenticado nos critérios de lançamento                                                                        |
| Marcações em duplicado                                               | Bloqueio por anfitrião e nova verificação do horário dentro da transação                                                                                   |
| Spam na candidatura                                                  | Honeypot, tempo mínimo, limites por IP e email; Turnstile invisível como reserva                                                                           |
| Limites A/B/C desajustados ao mercado                                | Configuráveis sem código; revisão prevista depois das primeiras 30 candidaturas                                                                            |
