# 02 — Ecrãs e interações

## Navegação e layout

A navegação tem dois níveis, como no Designer HQ: o nível do estúdio e o nível da sala de cada cliente. A barra lateral muda de conteúdo quando se entra numa sala; o resto do ecrã mantém a mesma estrutura.

### A moldura comum

- **Barra lateral (240 px, recolhível):** no topo, o logótipo e o nome do espaço, o botão de tema claro ou escuro e o botão de recolher. Depois, a pesquisa (⌘K abre a paleta de comandos). No fundo, o utilizador com nome e email.
- **Barra superior:** à esquerda, o caminho (Aurion › Cliente › Secção) e o seletor de projeto ("Rebrand ▾"). À direita, "Ver como cliente" e o botão da ação principal do ecrã (por exemplo, "Novo documento").
- **Área de conteúdo:** documentos, mapas e estratégias numa coluna de leitura com 720 px no máximo. Biblioteca, painéis e quadros ocupam a largura toda.

### Nível do estúdio

A barra lateral mostra: Início, Atualizações, Tarefas, Calendário, Pipeline, Candidaturas, Angariação, Dinheiro e Relatórios. Por baixo, a lista de clientes com o logótipo de cada um e "Adicionar cliente". Em último, Definições.

### Nível da sala

Ao clicar num cliente, a barra lateral passa a mostrar "← Todos os clientes", o logótipo e o nome do cliente, e o menu da sala: Dashboard, Atualizações, Tarefas, Documentos, Biblioteca, Diagnóstico e estratégia, Brand Hub, Faturas. Retainer, Resultado e Academia aparecem só quando existem. Definições do cliente fica no fim, separado.

### Modos de foco

Dois ecrãs escondem a moldura para dar espaço ao trabalho:

- **Workshop:** separadores no topo (Workshop · Respostas · Estratégia), barra de progresso ("Fase 1 de 8 · Passo 4 de 27"), uma pergunta de cada vez ao centro, Voltar e Seguinte no fundo, e "Guardado" sempre visível.
- **Editor do Brand Hub:** três colunas (navegação do hub, tela, painel de design e ficheiros), com Editar · Pré-visualizar ao centro e Partilhar e Publicar à direita.

### O portal do cliente

Usa a mesma moldura, com o logótipo do cliente no topo e só os itens da sala que lhe são visíveis. A marca Aurion aparece apenas no rodapé da barra lateral. "Ver como cliente" mostra à equipa exatamente este ecrã.

## Ecrãs da equipa

São 27 ecrãs da equipa, cada um construído a partir de um de nove arquétipos. O arquétipo define a estrutura, os estados e os componentes; a tabela diz só o que é específico de cada ecrã.

### Arquétipos

| Arquétipo | Estrutura | Estados obrigatórios |
| --- | --- | --- |
| Lista | Filtros em chips, pesquisa, ordenação, grelha ou tabela, ação principal no topo | Vazio com ação, a carregar (esqueleto), erro com repetir, sem resultados de filtro |
| Detalhe | Cabeçalho com estado, separadores, coluna lateral de metadados | A carregar, sem permissão (sem confirmar que existe), modo de edição |
| Quadro | Colunas por estado com contador, cartões arrastáveis | Coluna vazia, movimento recusado com explicação |
| Painel | Indicadores no topo, cartões de bloco, atalhos para a lista por trás | Sem dados no período, por bloco |
| Calendário | Semana, mês e agenda; criar ao clicar num dia | Sem eventos |
| Visualizador | Documento ao centro, comentários à direita, ações no topo | A carregar, link sem acesso, versão antiga |
| Formulário | Campos com validação junto ao campo, gravação automática, pré-visualização | Erro de validação, a enviar, sucesso com referência |
| Editor | Estrutura à esquerda, tela, painel de propriedades à direita | Alterações por publicar, a publicar, publicado |
| Foco | Sem moldura, um passo de cada vez, progresso no topo | Guardado, sem ligação (guarda localmente e sincroniza) |

### Inventário

| Código | Ecrã | Rota | Arquétipo | O que tem de específico | Vaga |
| --- | --- | --- | --- | --- | --- |
| S-01 | Início | / | Painel | Saudação com data; ações rápidas; 4 indicadores (clientes, projetos ativos, à espera de si, por receber); Hoje; Próximos eventos; clientes com barra de progresso, última atividade e etiqueta de retainer | B2 |
| S-02 | Atualizações | /updates | Lista | Feed de tudo o que os clientes fizeram: aprovações, comentários, pagamentos, assinaturas | B2 |
| S-03 | Tarefas | /tasks | Lista | Agrupadas por Hoje, Esta semana e Mais tarde; filtros por cliente e responsável | B2 |
| S-04 | Calendário | /calendar | Calendário | Eventos de todas as salas, com cor por cliente | B2 |
| S-05 | Pipeline | /pipeline | Quadro | Uma coluna por código 0.1 a 4.4; cartão com empresa, valor, próximo passo e prazo | B1 |
| S-06 | Candidaturas | /applications | Lista | Pontuação, caminho e origem; separador "Fila B" para revisão | B1 |
| S-07 | Negócio | /pipeline/:id | Detalhe | Separadores Resumo, Candidatura, Chamadas, Documentos, Linha temporal | B1 |
| S-08 | Angariação | /acquisition | Lista | Empresas-alvo por setor, notas de abordagem, modelos de mensagem com botão de copiar | B1 |
| S-09 | Dinheiro | /money | Painel | Seletor de ano; entrou, em aberto e saiu; faturas; despesas; subscrições por data | B3 |
| S-10 | Fatura | /money/invoices/:id | Detalhe | Linhas, estado, PDF certificado, pagamentos, botão Cobrar | B1 |
| S-11 | Relatórios | /reports | Painel | Receita, receita recorrente, conversão por etapa do pipeline, carga da equipa | B3 |
| S-12 | Definições | /settings | Formulário | Organização, equipa, marca do portal, integrações, chaves de API | B1 |
| S-13 | Modelos | /settings/templates | Lista | Processos, workshops, contratos, emails, com pré-visualização | B1 |
| S-14 | Auditoria | /settings/audit | Lista | Só leitura; filtros por pessoa, ação, cliente e datas | B1 |
| C-01 | Dashboard da sala | /c/:cliente | Painel | Processo com fases à esquerda e passos à direita, vistas Passos e Plano; cartão do projeto (estado, fase, datas, pessoas); linha temporal semanal | B2 |
| C-02 | Atualizações | /c/:cliente/updates | Lista | Escrever atualização com ficheiros e marco; visibilidade por entrada | B2 |
| C-03 | Tarefas | /c/:cliente/tasks | Lista | Só as tarefas desta sala | B2 |
| C-04 | Documentos | /c/:cliente/docs | Lista | Cartões com tipo, estado e origem (Proposta · Com o cliente; Contrato · Assinado; Faturas · Tudo pago); "Novo documento" | B1 |
| C-05 | Documento | /c/:cliente/docs/:id | Visualizador | Figma ou PDF com navegação de diapositivos e ecrã inteiro; comentários à direita, enviados ao cliente por email; Retirar para rascunho, Substituir, Mudar link, Abrir no Figma, Remover | B1 |
| C-06 | Biblioteca | /c/:cliente/library | Lista | Pastas com contador; filtros Pastas, Imagens, Vídeo, Documentos; Ligar Dropbox, Descarregar tudo, Nova pasta, Carregar pasta, Carregar | B2 |
| C-07 | Core | /pipeline/:negocio (separador Core) e /pipeline/:negocio/core/call | Foco | Briefing por blocos com modo call, transcrição, auditoria com prova, Índice Orbit, roadmap, revisão cruzada, apresentação Figma, assistente; critérios da etapa 1 | B1 |
| C-08 | Brand Hub | /c/:cliente/hub | Editor | Páginas e blocos; painel Design (cores, cantos, mosaicos, layout) e Ficheiros; Editar, Pré-visualizar, Partilhar, Publicar | B2 |
| C-09 | Faturas | /c/:cliente/invoices | Lista | Plano de faturação do projeto e estado de cada fatura | B1 |
| C-10 | Retainer | /c/:cliente/retainer | Painel | Limites do mês e consumo por barra; pedidos extra | B3 |
| C-11 | Resultado | /c/:cliente/outcome | Painel | Linha de base, meta, prazo, gráfico de evolução, condições do cliente, estado da garantia | B3 |
| C-12 | Academia | /c/:cliente/academy | Lista | Tutoriais, manuais e sessões de formação | B3 |
| C-13 | Definições do cliente | /c/:cliente/settings | Formulário | Contactos e papéis, acessos ao portal, domínio do portal e do Brand Hub, cofre de credenciais | B1 |
| C-14 | Relatórios | /c/:cliente/reports | Lista e editor | Relatório mensal e QBR por período, dados do período, textos da equipa, pré-visualização do PDF e partilha como documento da sala | B3 |

## Portal do cliente e Brand Hub

O cliente tem 11 ecrãs no portal e há 3 ecrãs públicos. Todos usam os mesmos arquétipos, com menos ações e linguagem sem jargão.

### Portal

| Código | Ecrã | Rota | Arquétipo | O que tem de específico | Vaga |
| --- | --- | --- | --- | --- | --- |
| P-01 | Início | /portal | Painel | Fase atual e próximo passo; aprovações pendentes; faturas por pagar; últimas atualizações | B2 |
| P-02 | Aprovações | /portal/approvals | Lista | Tudo o que espera decisão, agrupado por tipo, com prazo | B2 |
| P-03 | Documento | /portal/docs/:id | Visualizador | Ler, comentar, aprovar, pedir alterações ou assinar, conforme o tipo | B1 |
| P-04 | Biblioteca | /portal/library | Lista | Só as pastas visíveis; descarregar pasta ou tudo | B2 |
| P-05 | Atualizações | /portal/updates | Lista | O feed do projeto, com ficheiros | B2 |
| P-06 | Faturas | /portal/invoices | Lista | PDF certificado e botão Pagar nas faturas enviadas ou vencidas | B1 |
| P-07 | Core | /portal | Leitura | O briefing partilhado e as apresentações com o cliente | B1 |
| P-08 | Brand Hub | /portal/hub | Visualizador | O hub da marca dentro do portal, com downloads | B2 |
| P-09 | Academia | /portal/academy | Lista | Tutoriais e manuais da equipa do cliente | B3 |
| P-10 | Resultado e retainer | /portal/progress | Painel | Evolução do resultado acordado; consumo do retainer no mês | B3 |
| P-11 | Definições | /portal/settings | Formulário | Convidar colegas e definir o papel de cada um (só o decisor) | B2 |

### Ecrãs públicos

| Código | Ecrã | Rota | O que tem de específico | Vaga |
| --- | --- | --- | --- | --- |
| H-01 | Candidatura | /apply | O formulário de uma pergunta por ecrã, embutível no site | B1 |
| H-02 | Obrigado A, B, C | /apply/thanks | Uma versão por caminho; a A inclui o calendário | B1 |
| H-03 | Brand Hub publicado | domínio do hub | Ver abaixo | B2 |

### O Brand Hub publicado (H-03)

É um site próprio, gerado pelo OS a partir do editor (C-08), que o cliente usa como fonte única da sua marca.

- **Estrutura:** barra lateral com logótipo, "Brand Hub · Atualizado em" e as secções numeradas (01 Estratégia, 02 Galeria, 03 Logótipo, 04 Tipografia, 05 Cor, 06 Fotografia, 07 Layout, 08 objetos de marca, 09 Recursos), cada uma com subsecções. Ao centro, a secção em coluna larga, com texto à esquerda e exemplos à direita.
- **Downloads:** um botão por secção (por exemplo "Descarregar pacote de logótipo") e "Descarregar todos os ativos" fixo no fundo da barra lateral. Cada download é um ZIP gerado na hora, com a versão publicada dos ficheiros.
- **Sincronização:** publicar no OS atualiza o site; alterações por publicar não aparecem.
- **Domínio:** começa num endereço da Aurion e pode passar para um subdomínio do cliente (por exemplo marca.cliente.com), sem perder a ligação ao OS.
- **Acesso:** público, protegido por palavra-passe ou restrito a utilizadores do cliente.

## Interações-chave

Oito fluxos cobrem o percurso completo de um cliente. Cada passo indica o ecrã onde acontece e, entre parênteses, o código do pipeline que muda.

### F1 · Da candidatura à chamada

1. O visitante preenche a candidatura (H-01). O OS pontua e atribui o caminho (0.1 → 0.2).
2. Caminho A: a página de obrigado (H-02) mostra o calendário; a marcação cria o evento (0.3).
3. Caminho B: o negócio entra na Fila B (S-06); o fundador aprova para A ou envia para C.
4. Caminho C: o visitante recebe o autodiagnóstico; o contacto fica guardado para a newsletter.
5. Antes da chamada, o evento mostra o resumo da candidatura e a resposta à pergunta 9.
6. Depois da chamada, o fundador regista o resultado no negócio (S-07) (0.4).

### F2 · Aurion Core: da call à sessão de proposta

1. A call Core é marcada (0.3); o OS cria o Core do negócio. O fundador decide quando dar acesso ao portal ao decisor.
2. Antes da call: pré-auditoria do que é público, com prova, e três achados escolhidos para o bloco 4.
3. Na call, o fundador preenche o briefing em modo call (C-07) e partilha-o; o cliente vê-o no portal (P-07). "Avançar" leva o negócio a 1.1.
4. Auditoria completa nas 4 frentes, Índice Orbit e roadmap (1.2 → 1.3 → 1.4, com revisão cruzada).
5. A apresentação Figma é anexada e a sessão de proposta marcada (1.5).
6. Depois da sessão, a apresentação é partilhada com o cliente (1.6). Sem decisão em 5 dias úteis, o OS sugere um follow-up sobre um item do roadmap.

### F3 · Da proposta à sala ativa

1. A equipa incorpora a proposta do Figma em Documentos (C-04) e envia-a.
2. O cliente lê a proposta em P-03 e clica Aceitar.
3. O contrato é gerado com os dados do mapa e da proposta e enviado para assinatura.
4. Assinado por todos, o OS prepara a fatura do primeiro marco e envia o link de pagamento (2.1).
5. Paga a fatura, o processo de construção arranca, o cliente é convidado para o portal e o kickoff é marcado (2.2).

### F4 · Passos encadeados

1. No modelo de processo, um passo é ligado ao anterior (por exemplo, "Enviar questionário de arranque" depois de "Contrato assinado").
2. Quando o anterior fica Feito, o OS envia o passo seguinte ao cliente, sem intervenção.
3. O passo aparece no portal (P-01) e no feed de atualizações.

### F5 · Aprovação de um entregável

1. A equipa pede aprovação de um ficheiro, documento ou fase.
2. O cliente abre o item em P-02, comenta sobre pontos da imagem, do PDF, do vídeo ou do site.
3. Pede alterações (comentário obrigatório) ou aprova.
4. Aprovado, a fase fica Feita; se for um marco de faturação, a fatura seguinte é preparada (2.4 a 2.9).
5. Ao atingir o limite de rondas, a equipa e o cliente são avisados antes da ronda seguinte.

### F6 · Brand Hub, do rascunho ao domínio do cliente

1. Com a estratégia aprovada, "Criar Brand Hub" gera as páginas com a estratégia já preenchida (C-08).
2. A equipa adiciona logótipos, tipografia, cores e ficheiros, escolhe o layout e as cores do hub.
3. Pré-visualizar mostra o hub como o cliente o verá; Publicar põe-no no ar (H-03).
4. O cliente aprova o hub; na entrega, o domínio do cliente é ligado.
5. Qualquer alteração futura publicada no OS atualiza o site.

### F7 · Pedido acima do limite do retainer

1. O cliente pede uma peça a mais no portal.
2. O OS verifica o consumo do mês (C-10) e, se o limite foi atingido, cria um pedido extra com orçamento.
3. O cliente aprova o pedido extra antes de qualquer trabalho começar; só então a tarefa é criada.

### F8 · Pedido ao agente

1. O fundador pede ao agente, no Claude: "o que precisa de mim hoje?" ou "marca a revisão do Bloom para sexta".
2. O agente lê o OS por MCP e responde, ou propõe a ação.
3. Ações que mudam dados ficam em rascunho até o fundador confirmar.
4. Executada, a ação fica no registo de auditoria em nome do fundador e do agente.
