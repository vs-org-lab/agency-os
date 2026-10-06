# 09 — Qualidade e entrega

## Definição de concluído, testes e auditoria

Uma funcionalidade só está concluída quando passa os quatro filtros abaixo: funcional, técnico, segurança e design. Os agentes de auditoria verificam os três últimos em cada alteração.

### Definição de concluído

- Os critérios de aceitação das histórias ligadas passam em teste automático.
- As regras de negócio citadas (RN) estão no servidor, com testes.
- Nenhuma falha de segurança crítica ou alta em aberto; os requisitos SEC aplicáveis estão verificados.
- O ecrã usa só componentes e tokens do design system, funciona em modo claro e escuro, e tem os estados vazio, a carregar, erro e bloqueado.
- Passa WCAG 2.2 AA (teclado, foco, contraste, leitor de ecrã).
- Textos em português e inglês, sem texto escrito diretamente no código.
- Eventos, automações e registos de auditoria da funcionalidade estão a funcionar.
- Documentação atualizada: requisito, ecrã e automação correspondentes.

### Testes

| Tipo | O que cobre | Quando corre | Bloqueia o deploy |
| --- | --- | --- | --- |
| Tipos e regras de estilo | Erros de tipo, código fora das regras | Cada alteração | Sim |
| Unitários | Pontuação, pipeline, faturação, retainers, garantia | Cada alteração | Sim |
| Isolamento (RLS) | Tentativas de acesso cruzado entre clientes, para cada tabela | Cada alteração | Sim |
| Integração | Avisos de pagamento, software de faturação, assinatura, fila de eventos (com serviços simulados) | Cada alteração | Sim |
| Ponta a ponta | Os fluxos F1 a F8 do separador 02, em navegador | Antes de cada deploy | Sim |
| Acessibilidade | Verificação automática nos ecrãs principais | Antes de cada deploy | Sim, em falhas graves |
| Segurança estática e de dependências | Código e bibliotecas com vulnerabilidades conhecidas | Cada alteração | Sim, em crítico e alto |
| Teste de intrusão | Ataque externo controlado | Uma vez por ano e depois de mudanças estruturais | — |

### Agentes de auditoria

Quatro agentes revêem cada alteração antes de chegar a produção. Podem ser subagentes no Claude Code, revisão humana, ou as duas coisas. Nenhum agente aprova sozinho uma passagem para produção com falhas críticas ou altas em aberto.

| Agente | Verifica | Pode bloquear |
| --- | --- | --- |
| Segurança | Requisitos SEC: autorização no servidor, RLS, cofre, ficheiros, avisos de pagamento, agente e MCP, segredos fora do código | Sim |
| Engenharia backend | Regras RN, transações na faturação, processamento único de eventos, migrações, desempenho das consultas | Sim |
| Engenharia frontend | Design system, estados, acessibilidade, nenhuma autorização só no navegador, "Ver como cliente" sem fugas | Sim |
| Design e conteúdo | Tokens e componentes corretos, glossário, voz da marca nos textos e emails, modo escuro | Só em falhas visíveis ao cliente |

### Caminho até produção

1. Cada alteração nasce num ramo próprio, ligado a uma história (US) ou requisito (RF).
2. Os testes automáticos correm; se algum que bloqueia falhar, a alteração para.
3. Os quatro agentes revêem e registam as falhas encontradas, com gravidade e requisito.
4. Uma pessoa revê e aprova.
5. A alteração vai para o ambiente de testes e corre os testes ponta a ponta.
6. A passagem para produção é aprovada pelo fundador; as migrações de base de dados correm antes do código novo.
