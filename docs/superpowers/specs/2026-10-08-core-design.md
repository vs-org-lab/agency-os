# Sub-projeto 1B — Diagnóstico Aurion Core

| Campo                   | Valor                                                                                                                                      |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Data                    | 2026-10-08                                                                                                                                 |
| Estado                  | Em revisão                                                                                                                                 |
| Vaga                    | 1 (sub-projetos 1A Comercial → 1B Diagnóstico → 1C Documentos e contratos → 1D Faturação)                                                  |
| Módulos                 | M03 Diagnóstico e estratégia (redefinido pelo Aurion Core), primeira parte do M04 Documentos (apresentação Figma), parte do M21 (modelos)  |
| Documentação de produto | `docs/product/01` (M03, RF-030 a RF-033), `02` (C-07, P-07, F2), `04` (RN-03, RN-04, RN-22), `07` (AUT-08 a AUT-10), `08` (SEC-02, SEC-73) |
| Fontes externas         | Diagnóstico Aurion Core — Processo e Workshop (`References/Aurion Orbit`); referências de interface do Designer HQ (`References/Ref 01`)   |
| Depende de              | [Sub-projeto 1A — Comercial](2026-10-07-commercial-design.md)                                                                              |

## 1. Objetivo

Levar para o OS o Aurion Core: a call de 60 minutos, a auditoria com prova, o Índice Orbit, o roadmap em três faixas e a sessão de proposta. O fundador conduz tudo a partir do negócio, e o cliente vê no portal o briefing da conversa e a apresentação final, sem preencher nada.

O guião do Core substitui o M03 da documentação de produto: o diagnóstico é gratuito, não há workshop com formulário nem mapa aprovado pelo cliente, e a decisão acontece na sessão de proposta.

## 2. Âmbito

### Incluído

1. Core por negócio, criado na marcação da call (0.3).
2. Briefing pelos 4 blocos do guia de perguntas, preenchido em modo call, com transcrição colada e partilha com o cliente.
3. Auditoria nas 4 frentes (Core · Marca, Orbit · Ecossistema, Gravity · Ativação, Constellation · Autoridade), cada achado com prova.
4. Índice Orbit: pontuação de 0 a 25 por frente, por critérios da grelha, com justificação.
5. Roadmap em três faixas (30 dias, 90 dias, 12 meses), com responsável interno ou Aurion.
6. Revisão cruzada registada antes da sessão.
7. Documentos, primeira versão: apresentação Figma incorporada, com estados Rascunho e Com o cliente.
8. Portal do prospeto, com acesso dado pelo fundador: briefing partilhado e apresentações.
9. Modelos editáveis e versionados: guia do briefing e grelha do Índice Orbit.
10. Assistente de IA em modo manual: o OS monta o pedido, o fundador usa o Claude e cola o resultado.
11. Critérios de entrada da etapa 1 do pipeline, passagem automática a 1.1 e follow-up único aos 5 dias úteis.
12. Atualização da documentação de produto e ADR 0007.

### Excluído (registado em `docs/STATUS.md`)

| Item                                                         | Motivo                                                                                    | Volta quando                                |
| ------------------------------------------------------------ | ----------------------------------------------------------------------------------------- | ------------------------------------------- |
| Proposta com as três opções Orbit e preços                   | Pertence aos documentos e contratos                                                       | 1C                                          |
| Relatório Orbit em PDF desenhado                             | A apresentação Figma substitui-o; o PDF exporta-se do Figma                               | 1C, se fizer falta um PDF gerado            |
| Outros tipos de documento, versões, comentários e assinatura | M04 completo                                                                              | 1C                                          |
| Comparação com a média do setor                              | O estudo setorial ainda não existe                                                        | Publicação do estudo setorial               |
| Geração direta pela API da Anthropic                         | Custo zero até ao lançamento ([ADR 0003](../../decisions/0003-zero-cost-until-launch.md)) | Critérios de lançamento                     |
| Conservação dos dados do Core de prospetos perdidos          | Prazos definidos com o advogado (SEC-73)                                                  | Revisão de conservação com o advogado       |
| Vídeo do teste do comprador carregado no OS                  | Limite de 50 MB por ficheiro e 1 GB no plano gratuito                                     | Plano pago de armazenamento                 |
| Feriados no cálculo de dias úteis                            | O follow-up é uma sugestão, não um envio automático                                       | Primeiro módulo com prazos contratuais (1D) |

## 3. Fluxo e pipeline

### Antes da call (0.3)

- A marcação da call, pelo lead ou à mão, cria o Core do negócio: briefing vazio a partir do guia ativo e auditoria vazia a partir da grelha ativa. Nada é enviado ao cliente.
- No negócio aparece "Dar acesso ao portal": convida o contacto decisor por link mágico (SEC-02), através de `inviteClientUser`. O portal mostra só o que for partilhado.
- Pré-auditoria: achados do que é público, com prova, e o link do vídeo do teste do comprador. O fundador marca até três achados para "levar para a call" (bloco 4).

### A call

- Modo call em ecrã de foco: o briefing pelos 4 blocos, com as perguntas do guia como lembrete, notas com gravação automática e o indicador "Guardado".
- O separador Observações mostra os achados marcados, com a prova, para o bloco 4.
- Depois da call, o fundador cola a transcrição e carrega em "Partilhar briefing com o cliente".
- A sessão de proposta marca-se na própria call, como chamada marcada à mão do tipo "sessão de proposta".

### Etapa 1

O resultado "Avançar" leva o negócio a 0.4 e, na mesma transação, a 1.1. "Acompanhar" e "Recusar" mantêm o comportamento do 1A. O código 1.1 passa a chamar-se "Core iniciado".

| Código                     | Critério para entrar                                                                                                             |
| -------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| 1.1 Core iniciado          | chamada com resultado "Avançar" (automático)                                                                                     |
| 1.2 Recolha de informação  | nenhum                                                                                                                           |
| 1.3 Análise e arquitetura  | briefing com pelo menos um bloco preenchido                                                                                      |
| 1.4 Roadmap preparado      | as 4 frentes pontuadas em todos os critérios; todos os achados com prova; pelo menos 2 itens internos; revisão cruzada registada |
| 1.5 Sessão de apresentação | apresentação Figma anexada e sessão de proposta marcada                                                                          |
| 1.6 Core entregue          | apresentação partilhada com o cliente                                                                                            |

O quadro recusa uma mudança que não cumpre o critério e explica a regra em falta, como no 1A. Os critérios são avaliados dentro da transação da mudança de fase, a partir dos dados do Core, numa função pura testada à parte.

- Follow-up único: 5 dias úteis (segunda a sexta) depois de 1.6, se o negócio não saiu de 1.6, o varrimento diário cria um acompanhamento em "Hoje" com uma mensagem sugerida que cita um item do roadmap de 90 dias.
- Os acompanhamentos aos 3, 7, 14 e 30 dias do 1A já só correm em 0.4 e param quando o Core começa.
- 2.1 Orbit contratado continua com a regra `module_pending` até ao 1C e ao 1D.

### Regras de negócio atualizadas

- **RN-03** Passar a 2.1 exige um Core entregue (1.6) nos últimos 12 meses.
- **RN-04** 1.6 exige a apresentação partilhada com o cliente; deixa de existir aprovação do mapa pelo cliente.
- **RN-22** O roadmap do Core entregue é a fonte do âmbito e do resultado acordado da proposta (1C).

## 4. Dados e acesso

### Modelos

| Modelo           | Conteúdo                                                                                          | Versões                                                           |
| ---------------- | ------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| Guia do briefing | 4 blocos (título, duração, objetivo) e as perguntas de cada um                                    | Publicar cria uma versão nova; cada Core guarda a versão que usou |
| Grelha Orbit     | 4 frentes, cada uma com critérios (nome, o que se observa, pontos máximos), somando 25 por frente | Igual                                                             |

O guia inicial é o "Guia de perguntas" do guião. A grelha inicial sai da coluna "O que se audita" do guião, com 5 critérios de 5 pontos por frente:

| Frente                     | Critérios iniciais                                                                                               |
| -------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| Core · Marca               | Clareza da proposta de valor; coerência do site; coerência das propostas; coerência das redes; identidade visual |
| Orbit · Ecossistema        | Velocidade; experiência mobile; estrutura e percursos de conversão; conteúdo, vídeo e motion; redes              |
| Gravity · Ativação         | Campanhas ativas; rastreamento e eventos; formulários; tempo de resposta a leads; automações                     |
| Constellation · Autoridade | Presença dos líderes; conteúdo próprio; imprensa; prova social; posição face aos concorrentes                    |

### Tabelas

| Tabela                | Campos principais                                                                                                                                                 |
| --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `core_templates`      | organização, tipo (`briefing`, `orbit_grid`), versão, definição, ativo                                                                                            |
| `core_engagements`    | organização, cliente, negócio (único), guia, grelha, transcrição, link do teste do comprador, briefing partilhado em, revisão cruzada (por, em, notas), narrativa |
| `core_briefing_notes` | Core, bloco, pergunta (opcional), texto, autor, atualizado em                                                                                                     |
| `core_findings`       | Core, frente, título, descrição, prova (tipo, ficheiro ou link, nota), impacto, esforço, faixa, responsável, levar para a call, ordem, autor                      |
| `core_scores`         | Core, frente, critério, pontos, justificação                                                                                                                      |
| `documents`           | organização, cliente, negócio, tipo (`figma_presentation`), título, link, estado (`draft`, `with_client`), partilhado em, autor                                   |
| `calls` (alteração)   | tipo (`discovery`, `proposal_session`); as chamadas existentes ficam `discovery`                                                                                  |

- Impacto e esforço: `low`, `medium`, `high`. A faixa é proposta a partir deles e pode ser alterada: alto impacto com baixo esforço → 30 dias; alto impacto com esforço médio ou alto → 90 dias; o resto → 12 meses.
- A pontuação da frente é a soma dos seus critérios; uma frente está pontuada quando todos os critérios têm pontos.
- Todas as tabelas novas têm RLS forçado e privilégios concedidos por coluna, como no 1A, e entram nos testes de isolamento entre clientes.

### Acesso

| Quem                           | O que pode                                                                                            |
| ------------------------------ | ----------------------------------------------------------------------------------------------------- |
| Fundador                       | Tudo, em todos os clientes                                                                            |
| Gestor de projeto              | Ler e escrever o Core dos clientes atribuídos (`can_write_pipeline`)                                  |
| Finanças                       | Ler (`can_read_pipeline`)                                                                             |
| Utilizador do cliente (portal) | Ler as notas do briefing depois de partilhado e os documentos `with_client` do seu cliente; nada mais |

Achados, pontuações, transcrição, narrativa e revisão cruzada nunca chegam ao portal.

### Provas carregadas

- Imagens PNG, JPEG ou WebP e PDF, até 10 MB, validados pelo conteúdo do ficheiro e não pela extensão.
- Guardadas num bucket privado do Supabase Storage (`core-evidence`), com caminho `organização/cliente/core/uuid`. As políticas do Storage recusam acesso direto; o servidor verifica a permissão e devolve links assinados com validade de 5 minutos.
- Links de prova e do teste do comprador: só `https`. O vídeo abre num separador novo e não é incorporado.

## 5. Ecrãs

| Ecrã                  | Rota                                   | Conteúdo                                                                                                                                                         |
| --------------------- | -------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Negócio › Core        | `/pipeline/[dealId]?tab=core`          | Secções Briefing, Auditoria, Índice Orbit, Roadmap, Revisão cruzada, Apresentação e Assistente; checklist dos critérios da etapa 1                               |
| Modo call             | `/pipeline/[dealId]/core/call`         | Ecrã de foco: separadores Briefing · Observações · Transcrição, progresso "Bloco 2 de 4", perguntas do bloco como lembrete, notas com gravação automática        |
| Apresentação          | `/pipeline/[dealId]/documents/[docId]` | Figma incorporado com ecrã inteiro e "Abrir no Figma"; Retirar para rascunho, Substituir link, Remover; aviso "Precisa de 'Qualquer pessoa com o link pode ver'" |
| Portal › Início       | `/portal`                              | Para o prospeto: briefing partilhado e apresentações; estado vazio enquanto nada for partilhado                                                                  |
| Portal › Apresentação | `/portal/documents/[docId]`            | O Figma incorporado em ecrã inteiro                                                                                                                              |
| Definições › Modelos  | `/settings/templates`                  | Acrescenta Guia do briefing e Grelha Orbit, com edição, pré-visualização e publicação de versões                                                                 |

- O roadmap mostra três colunas (30 dias, 90 dias, 12 meses) com cada achado, o responsável (Interno ou Aurion) e o total de itens internos face ao mínimo de 2.
- A revisão cruzada regista quem a fez e as notas. Avisa, sem bloquear, quando quem revê é o autor da maioria dos achados.
- O link Figma é aceite só em `figma.com`; o OS converte-o para `embed.figma.com` com `embed-host`. A navegação de slides é a do próprio Figma.

## 6. Assistente de IA (modo manual)

Uma porta `CoreAssistant` com dois pedidos, iguais no modo manual e no futuro adaptador da API:

| Pedido                           | Entrada                                                  | Resultado colado de volta                                                              |
| -------------------------------- | -------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| Briefing a partir da transcrição | Guia do briefing, transcrição, respostas da candidatura  | Texto com um título por bloco; o OS distribui pelas notas de cada bloco, como rascunho |
| Narrativa da sessão              | Achados, pontuações, roadmap, números dados pelo cliente | Os quatro momentos da sessão (onde estão, o que custa, o que proponho, decisão)        |

- "Copiar pedido" copia o texto completo para o Claude; o fundador cola o resultado num campo e confirma.
- O pedido inclui as regras do guião: nada sem prova, números do cliente e não médias de mercado, nenhuma recomendação genérica.
- Um resultado colado nunca substitui notas existentes sem confirmação; se o texto não tiver os títulos esperados, fica inteiro na nota livre do bloco 1.
- O pedido não inclui dados que não façam falta: sem emails, telefones nem notas internas de outros negócios.

## 7. Emails e automações

| Momento                    | Para               | Ação                                                                            |
| -------------------------- | ------------------ | ------------------------------------------------------------------------------- |
| "Dar acesso ao portal"     | Decisor            | Convite por link mágico (template de convite existente)                         |
| Briefing partilhado        | Decisor com acesso | "O resumo da nossa conversa está no portal", botão "Ver o briefing"             |
| Apresentação partilhada    | Decisor com acesso | "A apresentação está no portal", botão "Ver a apresentação"                     |
| Sessão de proposta marcada | Decisor            | Confirmação e lembretes do 1A, com o texto "sessão de proposta"                 |
| 5 dias úteis depois de 1.6 | Equipa             | Acompanhamento em "Hoje" com mensagem sugerida                                  |
| Marcação da call           | —                  | Cria o Core do negócio (no consumidor de `commercial.call.booked`, idempotente) |

Os emails de partilha respeitam as horas de silêncio do 1A. Eventos novos: `core.briefing.shared`, `core.document.shared`.

## 8. Erros e segurança

- Mudanças de fase recusadas devolvem a regra em falta e a lista dos critérios por cumprir.
- Gravação automática com repetição; um conflito de edição em simultâneo guarda a última versão e regista o autor.
- Ficheiros: validação de tipo pelo conteúdo, tamanho máximo, nome aleatório, sem execução nem pré-visualização de PDF no estúdio além do link assinado.
- O portal nunca recebe campos internos: as consultas do portal selecionam só colunas partilháveis, e o RLS recusa o resto.
- Sem dados pessoais nos registos de erros (Sentry), como na fundação.

## 9. Testes

- **Unitários:** proposta de faixa, avaliação dos critérios da etapa 1, soma do Índice Orbit, construção e leitura dos pedidos do assistente, conversão do link Figma, dias úteis, validação de ficheiros.
- **Base de dados:** RLS e isolamento das tabelas novas (incluindo o que o portal vê antes e depois de partilhar), criação idempotente do Core, mudanças de fase com e sem critérios, autorização do Storage.
- **Ponta a ponta:** o fundador faz o Core inteiro (notas em modo call, achado com imagem, pontuação, revisão cruzada, apresentação Figma, 1.1 a 1.6) e o cliente vê o briefing e a apresentação no portal; axe nos ecrãs novos em claro e escuro.

## 10. Critérios de aceitação

1. A marcação de uma call cria o Core do negócio uma única vez.
2. O fundador conduz a call em modo call, com gravação automática, e partilha o briefing; o cliente com acesso vê-o no portal e mais nada.
3. Cada achado tem prova; as provas carregadas só abrem por link assinado e para quem tem permissão.
4. O Índice Orbit soma 25 por frente a partir da grelha, e o roadmap distribui os achados pelas três faixas.
5. O pipeline recusa 1.3 a 1.6 sem os critérios e explica o que falta; "Avançar" leva o negócio a 1.1.
6. A apresentação Figma aparece no portal só depois de partilhada.
7. O assistente produz pedidos completos e distribui o resultado colado sem apagar notas.
8. Guia e grelha editam-se em Definições › Modelos sem mexer em Cores já começados.
9. Testes de ponta a ponta e axe passam em staging, e o teste real do fundador passa.

## 11. Riscos

| Risco                                                   | Mitigação                                                                                 |
| ------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| Link Figma privado mostra um ecrã de login ao cliente   | Aviso permanente no estúdio; o fundador vê a mesma pré-visualização que o cliente         |
| Quota de 1 GB do Storage                                | Limite de 10 MB por ficheiro, só imagens e PDF; vídeo por link                            |
| Critérios da etapa 1 demasiado rígidos para casos reais | Critérios numa função pura, fácil de ajustar; o fundador pode recuar um código com motivo |
| O guião muda                                            | Guia e grelha são modelos versionados, editáveis sem código                               |
