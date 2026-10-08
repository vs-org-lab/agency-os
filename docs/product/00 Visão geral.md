# Agency OS — Documentação Técnica v2

Oct 6, 2026 · @Vladimir

## Visão e princípios

O Agency OS v2 é o sistema interno da Aurion e o espaço onde cada cliente acompanha o seu projeto, da candidatura no site até à renovação. Substitui a versão 1, que foi desenhada para uma agência criativa genérica e não para o modelo de negócio que a Aurion tem hoje.

**Para quem:** a equipa Aurion (fundador, gestor de projeto, freelancers) e os clientes (decisor, operacional e financeiro de cada empresa).

### O que mudou face à v1

| Tema | v1 | v2 |
| --- | --- | --- |
| Modelo de negócio | Agência criativa com muitos clientes | Consultora de alto valor: poucos clientes, venda que começa num diagnóstico |
| Processo | Uma lista de estados por entidade | Um único pipeline (0.1 a 4.4) e o método das quatro peças |
| Discovery | Formulário de onboarding | Workshop de diagnóstico com transcrição da chamada e mapa gerado por IA |
| Entrega de marca | Repositório de ficheiros | Brand Hub publicado, com download por secção e alojável no domínio do cliente |
| Documentos visuais | PDF anexado | Propostas e apresentações incorporadas a partir do Figma |
| Faturação | Emissão própria de faturas | Emissão por software certificado pela AT, via API |
| Automação | Motor de regras próprio | Eventos do OS executados pelo n8n; motor próprio só quando compensar |
| Interface | Componentes desenhados de raiz | Bibliotecas prontas, com shadcn/ui como base |
| IA | Nenhuma | Agente ligado por MCP que lê e opera o OS |
| Âmbito | Tudo de uma vez | O mesmo âmbito final, construído em quatro vagas |

### Princípios

1. **Uma sala por cliente.** Tudo o que pertence a um cliente vive no mesmo espaço: processo, documentos, ficheiros, discovery, Brand Hub, faturas.
2. **O cliente vê só o que lhe é destinado.** A equipa vê o projeto inteiro; o botão "Ver como cliente" mostra exatamente o que o cliente vê.
3. **Uma aprovação fecha o documento.** O que o cliente aprovou fica como ele o leu. Mudar exige uma nova versão.
4. **Premium pela calma, não pelo efeito.** Interface funcional, densa em informação e sem decoração. As animações ficam para os momentos que o cliente vê.
5. **Comprar antes de construir.** Componentes de UI, assinatura eletrónica, faturação e pagamentos usam serviços existentes. Constrói-se só o que diferencia a Aurion.
6. **Tudo é rastreável.** Cada ação muda um estado, gera um evento e fica no registo de auditoria.

## Mapa da documentação

Nove documentos, cada um num separador. Em caso de conflito, prevalece o de cima na coluna "Prevalece em".

| Separador | O que cobre | Prevalece em |
| --- | --- | --- |
| 08 Segurança | Acesso, isolamento entre clientes, cofre, ficheiros, IA, RGPD, incidentes | Tudo o que toca segurança |
| 01 PRD | Módulos, requisitos funcionais e não funcionais, perfis | O que o sistema faz |
| 04 Regras de negócio | Pipeline, transições, regras de cada domínio | Como o sistema se comporta |
| 06 System design | Arquitetura, stack, modelo de dados, integrações | Como é construído |
| 02 Ecrãs e interações | Navegação, ecrãs da equipa e do cliente, fluxos | Onde cada coisa vive |
| 03 User stories | Personas e histórias com critérios de aceitação | Quando está pronto, funcionalmente |
| 07 Automações | Catálogo de automações, emails e notificações | O que acontece sozinho |
| 05 Design system | Tokens, tipografia, componentes, bibliotecas de UI | Como se vê |
| 09 Qualidade e entrega | Definição de concluído, testes, agentes de auditoria | Quando está pronto, tecnicamente |

Cada requisito tem um código (RF, RNF, RN, US, AUT, SEC) e os documentos referem-se uns aos outros por esses códigos. Uma alteração num requisito obriga a atualizar todos os documentos que o citam.

## Ordem de construção

O âmbito é o da versão final, sem MVP. O que muda é a ordem: primeiro o que traz dinheiro, depois o que o entrega, depois o que o mantém, por fim o que o multiplica.

&#91;embedded content: ordem de construção · 4 vagas, 3 critérios de passagem\]

Cada vaga só começa quando a anterior passa o seu critério em uso real, não em testes. Os requisitos do PRD indicam a vaga de cada módulo.

## Glossário

Estes termos são os únicos usados na interface, nos emails e no código. Um termo da coluna "Evitar" na interface é um defeito.

| Termo | Definição | Evitar |
| --- | --- | --- |
| Sala | O espaço de um cliente: processo, documentos, biblioteca, discovery, Brand Hub, faturas | Conta, área de cliente |
| Projeto | Um trabalho contratado dentro de uma sala; uma sala pode ter vários | Job |
| Pipeline | A sequência única de estados de 0.1 a 4.4 por onde passa cada relação comercial | Funil |
| Peça | Uma das quatro etapas do método: Diagnóstico, Construção, Adoção, Acompanhamento | Fase do método |
| Fase | Um bloco do processo de um projeto (ex.: Estratégia, Design, Entrega) | Sprint |
| Passo | Uma ação dentro de uma fase, visível ou não para o cliente | Item |
| Tarefa | Trabalho interno atribuído a uma pessoa, com data | Ticket |
| Candidatura | O formulário do site, com pontuação e caminho A, B ou C | Lead form |
| Diagnóstico | A primeira peça, gratuita: o Aurion Core (call, auditoria, Índice Orbit, roadmap, sessão de proposta) | Discovery, na interface em português |
| Roadmap | O resultado do Core: achados com prova em três faixas (30 dias, 90 dias, 12 meses), internos ou Aurion | Relatório, mapa |
| Proposta | Documento comercial, normalmente um Figma incorporado | Orçamento |
| Marco | Um ponto do projeto que dispara aprovação e, quando aplicável, fatura | Milestone |
| Retainer | Contrato mensal contínuo com limites de âmbito | Avença |
| Pedido extra | Trabalho acima do limite do retainer, orçado à parte | Extra grátis |
| Resultado acordado | A meta, a linha de base e o prazo definidos a partir do roadmap do Core | KPI |
| Índice Orbit | Pontuação de 0 a 25 por frente (Core, Orbit, Gravity, Constellation), justificada por prova | Score |
| Garantia | Trabalho sem custo, até 3 meses, se o resultado acordado não for atingido e o cliente tiver cumprido as condições | Reembolso |
| Brand Hub | O site publicado com estratégia, identidade e downloads de uma marca | Manual em PDF |
| Biblioteca | Os ficheiros de uma sala, organizados em pastas | Drive |
| Atualização | Uma entrada do feed do projeto, visível para o cliente | Post |
| Agente | O assistente de IA ligado ao OS por MCP | Bot |
