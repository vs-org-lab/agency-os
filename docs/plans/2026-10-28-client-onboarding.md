# Plano — Onboarding do cliente adaptado ao briefing

Spec: [Onboarding do cliente](../specs/2026-10-28-client-onboarding-design.md) · ADR: [0009](../decisions/0009-client-onboarding-uploads.md) · Branch: `feat/rd-1-home`

1. Base de dados:
   - colunas `core_briefing_notes.answer` e `library_folders.client_uploads`;
   - tabela `client_onboarding_responses` com RLS;
   - vistas do portal (`portal_onboarding_responses`, `portal_client_team`, `portal_agenda_events`);
   - `app.preview_role` em `app.is_client_member`;
   - testes de RLS; aplicar no dev.
2. Esquema do modelo de briefing:
   - respostas estruturadas e pedidos com condições, e validação das condições de resposta;
   - pedidos sugeridos e a pergunta de identidade visual no modelo por defeito;
   - testes.
3. Avaliação pura dos pedidos (resposta, módulo, sempre), com testes.
4. Diagnóstico:
   - resposta estruturada gravada (versão do Core ou modelo ativo);
   - fonte do onboarding a partir do modelo ativo, das respostas e dos módulos aceites;
   - onboarding no espaço do Core.
5. Serviço do onboarding: leitura pelo cliente e pela equipa, resposta, pedir de novo e pasta "Enviado pelo cliente". Biblioteca: o decisor escreve só nessa raiz. Testes de base de dados.
6. Editor do modelo: resposta por pergunta, secção de pedidos e "Usar pedidos sugeridos".
7. Core e modo chamada: respostas em botões junto à pergunta, separador e painel "Onboarding do cliente".
8. Portal:
   - página `/portal/onboarding` com envio de ficheiros, resposta escrita e confirmação;
   - menu e visita guiada;
   - passo e item em "A sua vez";
   - equipa e próxima reunião no início;
   - resumo no Progresso.
9. Sala: progresso do onboarding com "Pedir de novo".
10. Pré-visualização por papel: credenciais, cookie, rota e faixa com a escolha.
11. Matriz de acesso (separador 08 e código), verificação completa, `STATUS.md`.
