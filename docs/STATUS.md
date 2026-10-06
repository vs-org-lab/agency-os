# Estado do projeto

Última atualização: 2026-10-06

Este ficheiro é o registo vivo do que foi feito, do que está em curso e do que foi deliberadamente adiado. É lido no início de cada sessão de trabalho e atualizado em cada tarefa concluída ou decisão de âmbito.

## Em curso

| Item                                   | Referência                                                                                                                       | Estado                                                                                                                               |
| -------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| Sub-projeto 0 — Fundação da plataforma | [Spec](superpowers/specs/2026-10-06-platform-foundation-design.md), [Plano](superpowers/plans/2026-10-06-platform-foundation.md) | Em execução no branch `feat/platform-foundation` (PR #3, rascunho): Tasks 1–18 concluídas; Task 19 à espera de credenciais de deploy |

## Feito

| Data       | Item                                                                                                                                                                                                      | Referência                                                                                                           |
| ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| 2026-10-06 | Repositório inicializado; branches `main` e `develop`; template de PR                                                                                                                                     | Commit inicial                                                                                                       |
| 2026-10-06 | Plugins e skills do Claude Code instalados; workflow definido                                                                                                                                             | [CLAUDE.md](../CLAUDE.md)                                                                                            |
| 2026-10-06 | Contas criadas: Supabase (dev e staging em eu-west-1), Vercel, Sentry (EU), Inngest                                                                                                                       | [ADR 0001](decisions/0001-managed-services.md), [ADR 0002](decisions/0002-region-ireland.md)                         |
| 2026-10-06 | Stack e serviços geridos decididos                                                                                                                                                                        | [ADR 0001](decisions/0001-managed-services.md) a [ADR 0005](decisions/0005-drizzle-generates-supabase-migrations.md) |
| 2026-10-06 | Design da fundação aprovado em conversa (4 secções)                                                                                                                                                       | [Spec](superpowers/specs/2026-10-06-platform-foundation-design.md)                                                   |
| 2026-10-06 | Spec da fundação aprovado pelo fundador                                                                                                                                                                   | PR #1                                                                                                                |
| 2026-10-06 | Ativos da marca utilizáveis copiados para `assets/brand` (símbolo, wordmark vetorizado claro e escuro, paleta). `wordmark_black.svg` e `Asset 7.svg` excluídos: usam a fonte "Refinity Personal Use Only" | `assets/brand/`                                                                                                      |
| 2026-10-06 | Documentação de produto copiada para `docs/product/`, passa a ser a fonte versionada                                                                                                                      | `docs/product/`                                                                                                      |
| 2026-10-06 | Plano da fundação aprovado; execução nativa                                                                                                                                                               | PR #2                                                                                                                |

| 2026-10-06 | Task 1: monorepo pnpm + Turborepo, TypeScript 6, ESLint 9, Prettier, Vitest | `feat/platform-foundation` |
| 2026-10-06 | Task 2: aplicação Next.js 16, tokens do separador 05 (testados, contraste AA), tema claro/escuro, componentes shadcn, símbolo da marca | `feat/platform-foundation` |
| 2026-10-06 | Task 3: pt-PT e en com next-intl, resolução de idioma, formatação de moeda, catálogos de mensagens | `feat/platform-foundation` |
| 2026-10-06 | Task 4: esquema da fundação (8 tabelas, RLS ativo desde a criação), chaves estrangeiras compostas entre cliente e organização, infraestrutura de testes | `feat/platform-foundation` |
| 2026-10-06 | Task 5: políticas RLS e funções de acesso; privilégios revogados e concedidos por coluna (as predefinições do Supabase davam TRUNCATE a `anon` e `authenticated`) | `feat/platform-foundation` |
| 2026-10-06 | Task 6: registo de auditoria só de escrita (UPDATE, DELETE e TRUNCATE bloqueados para todos os papéis) | `feat/platform-foundation` |
| 2026-10-06 | Task 7: contextos de base de dados de utilizador e de sistema, cliente Supabase no servidor com cookies httpOnly | `feat/platform-foundation` |
| 2026-10-06 | Task 8: outbox de eventos com despacho único e concorrente para o Inngest | `feat/platform-foundation` |
| 2026-10-06 | Task 9: matriz de acesso do separador 08 em código, com 80 testes célula a célula | `feat/platform-foundation` |
| 2026-10-06 | Task 10: cabeçalhos de segurança com CSP por nonce, expiração por 8 h de inatividade, claim `user_kind` no token | `feat/platform-foundation` |
| 2026-10-06 | Task 11: política de palavra-passe (12 caracteres) e verificação Have I Been Pwned | `feat/platform-foundation` |
| 2026-10-06 | Task 12: entrada com palavra-passe, link mágico, MFA TOTP, reautenticação | `feat/platform-foundation` |
| 2026-10-06 | Task 13: convites, aceitação, definição de palavra-passe, script do fundador | `feat/platform-foundation` |
| 2026-10-06 | Task 14: sessões ativas e alteração de palavra-passe | `feat/platform-foundation` |
| 2026-10-06 | Task 15: moldura da aplicação (estúdio, sala, portal), estados, 404 traduzido | `feat/platform-foundation` |
| 2026-10-06 | Task 16: manifesto PWA, ícones, esqueleto estático do Brand Hub | `feat/platform-foundation` |
| 2026-10-06 | Task 17: Sentry sem dados pessoais, logging estruturado | `feat/platform-foundation` |
| 2026-10-06 | Task 18: CI no PR (tipos, lint, unitários, RLS, build, auditoria, segredos, Semgrep, título), Dependabot; verificado que um teste a falhar bloqueia | PR #3 |

## Adiado

| Item                                                     | Motivo                                           | Volta quando                           |
| -------------------------------------------------------- | ------------------------------------------------ | -------------------------------------- |
| Ecrãs e entidades de negócio                             | Fora do âmbito da fundação                       | Vaga 1                                 |
| Cofre de credenciais (SEC-20 a SEC-23)                   | Nenhum módulo da fundação guarda credenciais     | Primeiro módulo que guarde credenciais |
| Stripe, faturação certificada, assinatura, Figma, Google | Integrações de negócio                           | M04 e M05 (Vaga 1)                     |
| Servidor MCP e OAuth do agente                           | Módulo M18                                       | Vaga 4                                 |
| Atribuição de freelancers por projeto                    | Projetos só existem com o M07                    | M20 (Vaga 2)                           |
| Service worker e offline                                 | Risco de guardar dados de cliente no dispositivo | Avaliação na Vaga 2                    |
| Passkeys                                                 | O TOTP cumpre o SEC-01                           | Depois do lançamento                   |
| Docker no ambiente local                                 | Preferência por fluxo só na cloud                | Não previsto                           |

## Critérios de lançamento

Nenhum dado real de cliente entra no sistema antes de todos estarem cumpridos ([ADR 0003](decisions/0003-zero-cost-until-launch.md)).

- [ ] Projeto Supabase de produção em eu-west-1, plano Pro
- [ ] Plano Vercel Pro
- [ ] Domínio, Resend com SPF, DKIM e DMARC, SMTP próprio no Supabase Auth
- [ ] Ativar os templates de email em `supabase/templates` (convite e link mágico com `token_hash`)
- [ ] Pipeline de `main` ativo, com aprovação do fundador
- [ ] GitHub Team e proteção de `main`
- [ ] Monitor de disponibilidade
- [ ] DPA revistos: Supabase, Vercel, Inngest, Sentry, Resend

## Questões em aberto

| Questão                                                                                                                                                                                                                                            | Dono     |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| O nome da agência pode mudar. O código não usa o nome: vem de `app.name` e de `portal_branding`. Logótipo e cores mantêm-se                                                                                                                        | Fundador |
| Na paleta, "Aurion INK" tem o código `#0f2a42`, igual ao Orbit Navy, mas a cor visível é quase preta. A interface segue o separador 05 (`text` `#0B1117`)                                                                                          | Fundador |
| O spec (secção 6) previa que o gestor atribuído pudesse convidar utilizadores do cliente, mas a matriz do separador 08 dá "—" ao gestor em utilizadores. A aplicação segue o 08 (só o fundador e o decisor convidam). Confirmar a regra pretendida | Fundador |
| "Core Cream" (`#fdf2de`) não existe nos tokens do separador 05; fica fora da interface até ser definido o seu uso                                                                                                                                  | Fundador |
