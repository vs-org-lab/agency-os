# Plano — Pré-visualização do portal

Spec: [Pré-visualização do portal](../specs/2026-10-28-client-preview-design.md) · Branch: `feat/rd-1-home`

1. Testes de RLS da pré-visualização; migração com `app.can_preview_client` e o ramo de pré-visualização de `app.is_client_member`; aplicar no dev.
2. Contexto da base de dados: `preview_client` nas credenciais do servidor, nunca lido do token; transação só de leitura com `app.preview_client`.
3. Caminhos puros (secção da sala para o portal, caminhos do cookie) com testes.
4. Guarda do portal com a sessão de pré-visualização; ações do servidor sem sessão no portal durante a pré-visualização.
5. Rotas de entrada (`/c/:cliente/preview`) e saída (`/portal/preview-exit`); remover o ecrã antigo.
6. "Ver como cliente" em todas as secções da sala, para o fundador e os gestores de projeto.
7. Faixa no portal, sem acolhimento nem saudação pessoal no início.
8. e2e das salas; verificação: typecheck, lint, Prettier, unitários, testes de base de dados; `STATUS.md`.
