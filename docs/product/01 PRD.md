# 01 — PRD

## Âmbito e módulos

O Agency OS tem 22 módulos. Todos fazem parte da versão final; a coluna Vaga diz quando cada um é construído.

| Código | Módulo | O que resolve | Vaga |
| --- | --- | --- | --- |
| M01 | Candidaturas | Qualifica cada lead do site em A, B ou C | B1 |
| M02 | CRM e pipeline | Empresas, contactos, negócios e o pipeline 0.1 a 4.4 | B1 |
| M03 | Diagnóstico e estratégia | Aurion Core: briefing da call, auditoria com prova, Índice Orbit e roadmap | B1 |
| M04 | Documentos | Propostas Figma, contratos, assinatura, versões e comentários | B1 |
| M05 | Faturação e pagamentos | Marcos, emissão certificada por API, cobrança e conciliação | B1 |
| M21 | Configurações e auditoria | Modelos, integrações, marca do portal, registo de auditoria | B1 |
| M06 | Salas e portal | O espaço de cada cliente e a vista "Ver como cliente" | B2 |
| M07 | Processo e tarefas | Fases, passos encadeados, modelos de processo, tarefas | B2 |
| M08 | Aprovações e proofing | Aprovações com comentários posicionados em imagem, vídeo, PDF e sites | B2 |
| M09 | Biblioteca | Ficheiros por pasta, filtros, download em ZIP, Dropbox e Drive, moodboards | B2 |
| M10 | Brand Hub | Editor, publicação, downloads por secção, alojamento no domínio do cliente | B2 |
| M11 | Agenda | Calendário global e por sala, ligado ao Google Calendar | B2 |
| M20 | Equipa e freelancers | Utilizadores, acesso por projeto, custo e carga | B2 |
| M12 | Retainers | Níveis, limites mensais, consumo e pedidos extra | B3 |
| M13 | Resultado e garantia | Linha de base, meta, condições do cliente e estado da garantia | B3 |
| M14 | Relatórios e QBR | Relatório mensal, QBR trimestral, painéis da equipa | B3 |
| M15 | Adoção | Academia por cliente: tutoriais, manuais, sessões de formação | B3 |
| M16 | Dinheiro | Receitas, despesas, subscrições, leitura de comprovativos | B3 |
| M17 | Saúde e marcos | Health score e as caixas de celebração nos marcos | B3 |
| M18 | Agente de IA | Servidor MCP para o Claude ler e operar o OS | B4 |
| M19 | Indicações e pedidos | Crédito por indicação e pedidos de serviço no portal | B4 |
| M22 | Escala | Multi-empresa, app móvel, OS vendido a outras agências | B4 |

## Perfis e limites

Há cinco perfis internos e três de cliente; o agente de IA nunca tem mais permissões do que a pessoa que o ligou.

| Perfil | Quem é | Vê | Pode |
| --- | --- | --- | --- |
| Fundador (admin) | Dono da Aurion | Tudo | Tudo, incluindo permissões, faturação e cofre |
| Gestor de projeto | Quem coordena salas | As salas que gere | Processos, documentos, aprovações, tarefas, atualizações |
| Freelancer | Executa trabalho por projeto | Só os projetos atribuídos, sem valores | As suas tarefas, ficheiros e comentários |
| Financeiro | Pode ser o fundador ou o contabilista | Faturas, pagamentos, despesas | Preparar e conciliar faturas; exportar para a contabilidade |
| Agente | Assistente de IA por MCP | O mesmo que o utilizador que o ligou | Ler e preparar; enviar ou emitir exige confirmação humana |
| Cliente: decisor | CEO ou diretor | A sua sala inteira | Aprovar, assinar, pagar, convidar colegas |
| Cliente: operacional | Equipa do cliente | A sala, sem faturas | Comentar, carregar ficheiros, acompanhar |
| Cliente: financeiro | Contabilidade do cliente | Só faturas e contratos | Descarregar e pagar faturas |
| Público | Visitante | Candidatura e Brand Hubs publicados como públicos | Candidatar-se; descarregar ativos públicos |

**O que o Agency OS não é:**

- **Um programa de contabilidade.** Prepara e concilia; a contabilidade oficial fica com o contabilista, a partir das exportações.
- **Um emissor de faturas.** A emissão é feita por software certificado pela AT, ligado por API.
- **Uma ferramenta de design.** Os ficheiros vivem no Figma e noutras ferramentas; o OS incorpora-os e organiza-os.
- **Um agendador de redes sociais.** O OS gere a aprovação dos conteúdos; a publicação fica numa ferramenta dedicada.
- **Um cliente de email.** Envia emails automáticos e notificações, mas a conversa diária com o cliente vive nos comentários e nas atualizações.

## Requisitos funcionais

Cada requisito é uma capacidade obrigatória da versão final. O código do módulo indica a vaga de construção.

### M01 · Candidaturas

- **RF-001** Formulário público com uma pergunta por ecrã, as 9 perguntas do documento do site, incorporável no site e com página própria.
- **RF-002** Pontuação automática de 0 a 13 com dois eliminatórios (investimento abaixo de €10k; decisor ausente), que atribui o caminho A, B ou C.
- **RF-003** Página de obrigado por caminho; a do caminho A mostra o calendário de marcação.
- **RF-004** Guarda a origem (UTM, página de entrada) e o consentimento com data e hora.
- **RF-005** Os leads B aparecem numa fila de revisão; um clique envia-os para A ou C.
- **RF-006** Pesos, limites e perguntas configuráveis sem alterar código.

### M02 · CRM e pipeline

- **RF-010** Ficha de empresa com contactos e papel de cada um (decisor, operacional, financeiro).
- **RF-011** Um único pipeline com os códigos 0.1 a 4.4, em vista de quadro e de lista.
- **RF-012** Cada negócio mostra sempre três campos: código atual, responsável do próximo passo e prazo.
- **RF-013** Linha temporal por empresa com todos os eventos: candidatura, chamadas, documentos, faturas, aprovações.
- **RF-014** Chamadas ligadas ao calendário, com o resumo da candidatura e a resposta à pergunta 9.
- **RF-015** Resultado da chamada registado (avança, recusa, acompanhar), com motivo.
- **RF-016** Lembretes de acompanhamento aos 3, 7, 14 e 30 dias, cada um com uma sugestão de mensagem.
- **RF-017** Área de angariação: lista de empresas-alvo, notas de abordagem e modelos de mensagem por setor.

### M03 · Diagnóstico e estratégia

> O Aurion Core substitui o diagnóstico pago descrito nos requisitos seguintes ([ADR 0007](../decisions/0007-aurion-core.md)). Em vigor: briefing da call pelos 4 blocos do guia de perguntas, partilhado com o cliente; auditoria nas 4 frentes com prova em cada achado; Índice Orbit de 0 a 25 por frente; roadmap em três faixas com responsável interno ou Aurion; revisão cruzada; apresentação Figma no portal; guia e grelha editáveis e versionados; assistente de IA em modo manual até ao lançamento. RF-020, RF-021 (workshop), RF-026 (aprovação do mapa) e RF-027 (mapa a preencher a proposta) deixam de se aplicar; a proposta usa o roadmap do Core entregue (1C).

- **RF-020** Construtor de workshop com fases e passos, e estes tipos de pergunta: texto livre, escolher traços (até N), escala hoje/meta, mapa de posicionamento em dois eixos, escolha múltipla e carregamento de ficheiros.
- **RF-021** Modo workshop em ecrã inteiro, para conduzir a sessão com o cliente: progresso por fase e passo, gravação automática, voltar atrás.
- **RF-022** Colar ou carregar a transcrição da chamada, que passa a ser a primeira fonte do rascunho.
- **RF-023** Separador Respostas com todas as notas e a transcrição, editáveis.
- **RF-024** Gerar com IA, a partir das respostas e da transcrição: o mapa (manter, mudar, integrar, criar, com porquê e impacto em euros) e, em projetos de marca, a estratégia (história, missão, visão, valores, voz, posicionamento). Opção de trazer um documento próprio em vez de gerar.
- **RF-025** O rascunho é editável; gerar de novo cria nova versão sem mexer na versão enviada ao cliente.
- **RF-026** Enviar ao cliente para aprovação. Depois de aprovado, fica bloqueado tal como o cliente o leu.
- **RF-027** O mapa aprovado aparece em Documentos e preenche a proposta: âmbito, resultado acordado e linha de base.
- **RF-028** Modelos de workshop guardáveis (Diagnóstico Aurion, Estratégia de marca).

### M04 · Documentos

- **RF-030** Documentos de cada projeto em cartões, com estado visível: Rascunho, Com o cliente, Aprovado, Assinado, Pago.
- **RF-031** Tipos de documento: Figma incorporado, PDF, ficheiro, documento gerado (contrato) e link externo.
- **RF-032** O Figma incorporado tem navegação de diapositivos, ecrã inteiro e "Abrir no Figma", e avisa quando o link não está público.
- **RF-033** Ações: Retirar para rascunho, Substituir, Mudar link, Remover; cada mudança guarda uma versão.
- **RF-034** Comentários por documento; o que a equipa escreve chega ao cliente por email e o cliente responde no portal.
- **RF-035** Contrato gerado a partir de modelo, com campos preenchidos (cliente, âmbito, valores, marcos, garantia), enviado para assinatura eletrónica, com estado por signatário. A assinatura é eletrónica simples, feita no próprio OS ([ADR 0008](../decisions/0008-simple-electronic-signature.md)).
- **RF-036** A proposta aceite no portal gera o contrato automaticamente.

### M05 · Faturação e pagamentos

- **RF-040** Plano de faturação por projeto: por marcos (por exemplo 40/30/30) ou recorrente (retainer).
- **RF-041** O OS prepara a fatura e o software certificado emite-a por API, devolvendo número, ATCUD e PDF.
- **RF-042** Estados da fatura: Rascunho, Emitida, Enviada, Paga, Vencida, Anulada. Mudanças manuais ficam auditadas.
- **RF-043** Link de pagamento por fatura (cartão, SEPA) e débito direto para retainers.
- **RF-044** Conciliação automática pelo aviso do serviço de pagamentos; manual quando o pagamento é por transferência.
- **RF-045** Lembretes de cobrança antes e depois do vencimento, e um botão "Cobrar" na própria fatura.
- **RF-046** Faturação em EUR, GBP, USD e AOA (kwanza), com as regras de IVA configuradas com o contabilista. Os clientes angolanos são faturados no Portal do Contribuinte da AGT; o OS regista essas faturas, não as emite.

### M06 · Salas e portal

- **RF-050** Início da equipa: saudação com data, ações rápidas (novo cliente, evento, tarefas), quatro indicadores (clientes, projetos ativos, à espera de si, por receber), Hoje, Próximos eventos e a lista de clientes com progresso e última atividade.
- **RF-051** Sala de cliente com menu fixo: Dashboard, Atualizações, Tarefas, Documentos, Biblioteca, Diagnóstico e estratégia, Brand Hub, Faturas, Definições.
- **RF-052** Seletor de projeto dentro da sala, quando o cliente tem mais de um.
- **RF-053** Botão "Ver como cliente" que mostra a sala exatamente como o cliente a vê.
- **RF-054** Portal num subdomínio da Aurion e, mais tarde, no domínio do cliente; entrada por link mágico enviado por email, com MFA opcional.
- **RF-055** Feed de atualizações por projeto, com texto, ficheiros e marcos, visível ao cliente e notificado.
- **RF-056** Cada item tem visibilidade própria: interno ou visível ao cliente.

### M07 · Processo e tarefas

- **RF-060** Processo por projeto em fases (com data de conclusão) e passos (estado, responsável, visibilidade).
- **RF-061** Duas vistas do processo: Passos e Plano (cronograma).
- **RF-062** Passos encadeados: quando um passo termina, o seguinte é enviado sozinho (por exemplo, o questionário depois da assinatura).
- **RF-063** Modelos de processo reutilizáveis: Diagnóstico, Construção, Identidade de marca, Website, Retainer.
- **RF-064** Painel do projeto: estado, fase atual, datas de início e fim, pessoas e uma linha temporal semanal.
- **RF-065** Tarefas internas com cliente, responsável, data e subtarefas, numa vista global e numa vista por sala.
- **RF-066** Uma fase que exige aprovação do cliente não avança sem ela.

### M08 · Aprovações e proofing

- **RF-070** Pedido de aprovação sobre documento, ficheiro, fase ou mapa, reunido numa central de aprovações no portal.
- **RF-071** Comentários posicionados: ponto na imagem ou no PDF, tempo no vídeo, elemento na página de um site.
- **RF-072** Aprovar ou pedir alterações, com comentário obrigatório no segundo caso; histórico com autor e data.
- **RF-073** Limite de rondas de revisão por projeto, com aviso ao cliente e à equipa quando se aproxima.

### M09 · Biblioteca

- **RF-080** Pastas por projeto, filtros (pastas, imagens, vídeo, documentos), pesquisa, ordenação e vista de grelha ou lista.
- **RF-081** Carregar ficheiros e pastas inteiras; descarregar tudo ou uma pasta num ZIP.
- **RF-082** Importar do Dropbox e do Google Drive.
- **RF-083** Visibilidade por pasta; os links de partilha expiram.

* **RF-084** Moodboards por cliente, com imagens no seu formato original, onde o cliente participa e escolhe direções.
* **RF-085** Extensão do navegador para guardar imagens de qualquer site diretamente num moodboard.

### M10 · Brand Hub

- **RF-090** Editor de páginas e blocos: Estratégia, Galeria, Logótipo, Tipografia, Cor, Fotografia, Layout, objetos de marca e Recursos, mais páginas e ferramentas próprias.
- **RF-091** Painel de design: cores (superfície, painel, texto, texto secundário, acento, divisor), cantos suaves ou retos, mosaicos de logótipo, e quatro layouts.
- **RF-092** A estratégia aprovada no M03 entra no Brand Hub sem cópia manual.
- **RF-093** Downloads por secção (por exemplo, pacote de logótipo), "Descarregar todos os ativos" e o manual completo.
- **RF-094** Modos Editar e Pré-visualizar; Publicar; alterações por publicar assinaladas; Partilhar link.
- **RF-095** Publicação como site alojado e ligação a um domínio do cliente, mantendo a sincronização com o OS.
- **RF-096** Acesso ao Brand Hub publicado: público, com palavra-passe ou só para utilizadores do cliente.

### M11 · Agenda

- **RF-100** Calendário global e por sala, com eventos de prazo, chamada e entrega, sincronizado com o Google Calendar.

### M12 · Retainers

- **RF-110** Retainer com nível e limites mensais (peças de conteúdo, campanhas, horas de manutenção, automações novas) e regra de transporte de saldo até 20%.
- **RF-111** Consumo do mês visível para a equipa e para o cliente, por limite.
- **RF-112** Pedido acima do limite gera um pedido extra com orçamento, que o cliente aprova antes de o trabalho começar.
- **RF-113** Alerta de revisão anual do retainer 60 dias antes da data.

### M13 · Resultado e garantia

- **RF-120** Resultado acordado por projeto: métrica, linha de base, meta, prazo e fonte dos dados.
- **RF-121** Condições do cliente (acessos, aprovações dentro do prazo, orçamento de media) com registo de cumprimento datado.
- **RF-122** Evolução do resultado, registada à mão ou por integração, mostrada num gráfico no portal.
- **RF-123** Estado da garantia: não ativada, ativada, meses usados (até 3) e encerrada.

### M14 · Relatórios e QBR

- **RF-130** Relatório mensal por cliente a partir de modelo, e QBR trimestral com apresentação.
- **RF-131** Painéis da equipa: receita, receita recorrente, negócios por código do pipeline, conversão entre etapas, carga da equipa.
- **RF-132** Exportação em PDF e CSV.

### M15 · Adoção

- **RF-140** Academia por cliente: tutoriais em vídeo, manuais e listas de verificação de formação.
- **RF-141** Registo das sessões de formação, com participantes e materiais.

### M16 · Dinheiro

- **RF-150** Visão por ano: o que entrou, o que está em aberto e o que saiu.
- **RF-151** Despesas e subscrições com data de renovação e recibo anexado.
- **RF-152** Leitura automática de comprovativos (OCR), apresentada como proposta editável e confirmada por uma pessoa.
- **RF-153** Despesa faturável ao cliente, com o comprovativo original ligado à fatura.

### M17 · Saúde e marcos

- **RF-160** Health score por cliente, a partir de pagamentos em dia, tempo de aprovação, tempo de resposta e evolução do resultado.
- **RF-161** Marcos de celebração: a entrega de um projeto e a renovação anual criam a tarefa da caixa (monumento, carta, espumante ou alternativa sem álcool, manual impresso quando houver marca).

### M18 · Agente de IA

- **RF-170** Servidor MCP do OS que permite ao agente ler salas, projetos, passos e ficheiros; criar tarefas, mudar prazos, preparar cobranças e rascunhar atualizações e páginas do Brand Hub.
- **RF-171** Tudo o que o agente escreve fica em rascunho ou pede confirmação. O agente nunca envia nada ao cliente nem emite faturas sozinho.
- **RF-172** O agente tem as permissões do utilizador que o ligou, e cada ação fica auditada em nome desse utilizador e do agente.

### M19 · Indicações e pedidos

- **RF-180** Indicações registadas, com crédito na conta de quem indicou (percentagem do primeiro projeto do indicado).
- **RF-181** Pedidos de novo serviço feitos no portal entram no pipeline como 0.1, com origem "cliente".

### M20 · Equipa e freelancers

- **RF-190** Utilizadores internos e freelancers, com acesso por projeto, custo por hora e carga semanal.

### M21 · Configurações e auditoria

- **RF-200** Organização, marca do portal, modelos (emails, contratos, processos, workshops), integrações, chaves de API e registo de auditoria consultável.

### M22 · Escala

- **RF-210** Várias empresas na mesma instalação, com dados isolados entre si.
- **RF-211** App móvel, começando por uma aplicação web instalável para aprovações, mensagens e notificações.
- **RF-212** O OS pode ser vendido a outras agências com a marca delas (white-label).

## Requisitos não funcionais

Estes requisitos aplicam-se a todos os módulos; um módulo que falhe um deles não está concluído.

| Código | Área | Requisito |
| --- | --- | --- |
| RNF-01 | Velocidade | As páginas principais carregam em menos de 1 segundo numa ligação normal; ações comuns respondem em menos de 300 ms |
| RNF-02 | Disponibilidade | 99,9% em produção, medido por mês |
| RNF-03 | Dados | Dados guardados na União Europeia |
| RNF-04 | Cópias | Cópias diárias encriptadas; perda máxima de 24 horas (RPO) e reposição em menos de 4 horas (RTO) |
| RNF-05 | Idiomas | Português de Portugal e inglês em toda a interface, emails e documentos gerados |
| RNF-06 | Moedas e formatos | EUR, GBP, USD e AOA (apresentado como "Kz"); datas, números e moeda no formato do idioma escolhido |
| RNF-07 | Acessibilidade | WCAG 2.2 nível AA em todos os ecrãs, incluindo o portal e o Brand Hub |
| RNF-08 | Temas | Modo claro e escuro em todos os ecrãs, a partir dos mesmos tokens |
| RNF-09 | Dispositivos | Ecrãs da equipa otimizados para computador; portal e aprovações usáveis num telemóvel |
| RNF-10 | Auditoria | Toda a ação sobre dados de cliente, dinheiro, permissões ou cofre fica registada e não pode ser apagada |
| RNF-11 | Observabilidade | Erros, lentidão e falhas de integração geram alerta em minutos |
| RNF-12 | Consistência | Toda a interface usa o design system (separador 05); nenhum ecrã inventa componentes próprios |
