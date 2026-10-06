# Estado do projeto

Última atualização: 2026-10-06

Este ficheiro é o registo vivo do que foi feito, do que está em curso e do que foi deliberadamente adiado. É lido no início de cada sessão de trabalho e atualizado em cada tarefa concluída ou decisão de âmbito.

## Em curso

| Item | Referência | Estado |
| --- | --- | --- |
| Sub-projeto 0 — Fundação da plataforma | [Spec](superpowers/specs/2026-10-06-platform-foundation-design.md), [Plano](superpowers/plans/2026-10-06-platform-foundation.md) | Spec aprovado; plano em revisão (21 tarefas) |

## Feito

| Data | Item | Referência |
| --- | --- | --- |
| 2026-10-06 | Repositório inicializado; branches `main` e `develop`; template de PR | Commit inicial |
| 2026-10-06 | Plugins e skills do Claude Code instalados; workflow definido | [CLAUDE.md](../CLAUDE.md) |
| 2026-10-06 | Contas criadas: Supabase (dev e staging em eu-west-1), Vercel, Sentry (EU), Inngest | [ADR 0001](decisions/0001-managed-services.md), [ADR 0002](decisions/0002-region-ireland.md) |
| 2026-10-06 | Stack e serviços geridos decididos | [ADR 0001](decisions/0001-managed-services.md) a [ADR 0005](decisions/0005-drizzle-generates-supabase-migrations.md) |
| 2026-10-06 | Design da fundação aprovado em conversa (4 secções) | [Spec](superpowers/specs/2026-10-06-platform-foundation-design.md) |
| 2026-10-06 | Spec da fundação aprovado pelo fundador | PR #1 |
| 2026-10-06 | Ativos da marca recebidos em `References/Brand` (paleta, símbolo, wordmark, estratégia) | Ver questões em aberto |

## Adiado

| Item | Motivo | Volta quando |
| --- | --- | --- |
| Ecrãs e entidades de negócio | Fora do âmbito da fundação | Vaga 1 |
| Cofre de credenciais (SEC-20 a SEC-23) | Nenhum módulo da fundação guarda credenciais | Primeiro módulo que guarde credenciais |
| Stripe, faturação certificada, assinatura, Figma, Google | Integrações de negócio | M04 e M05 (Vaga 1) |
| Servidor MCP e OAuth do agente | Módulo M18 | Vaga 4 |
| Atribuição de freelancers por projeto | Projetos só existem com o M07 | M20 (Vaga 2) |
| Service worker e offline | Risco de guardar dados de cliente no dispositivo | Avaliação na Vaga 2 |
| Passkeys | O TOTP cumpre o SEC-01 | Depois do lançamento |
| Docker no ambiente local | Preferência por fluxo só na cloud | Não previsto |

## Critérios de lançamento

Nenhum dado real de cliente entra no sistema antes de todos estarem cumpridos ([ADR 0003](decisions/0003-zero-cost-until-launch.md)).

- [ ] Projeto Supabase de produção em eu-west-1, plano Pro
- [ ] Plano Vercel Pro
- [ ] Domínio, Resend com SPF, DKIM e DMARC, SMTP próprio no Supabase Auth
- [ ] Pipeline de `main` ativo, com aprovação do fundador
- [ ] GitHub Team e proteção de `main`
- [ ] Monitor de disponibilidade
- [ ] DPA revistos: Supabase, Vercel, Inngest, Sentry, Resend

## Questões em aberto

| Questão | Dono |
| --- | --- |
| O nome da agência pode mudar. O código não usa o nome: vem de `app.name` e de `portal_branding`. Logótipo e cores mantêm-se | Fundador |
| `wordmark_black.svg` usa texto com a fonte "Refinity Personal Use Only": licença só pessoal e não desenha sem a fonte instalada. Precisa de versão vetorizada e licença comercial antes de ser usado. A fundação usa só o símbolo (`logouu.svg`) | Fundador |
| Na paleta, "Aurion INK" tem o código `#0f2a42`, igual ao Orbit Navy, mas a cor visível é quase preta. A interface segue o separador 05 (`text` `#0B1117`) | Fundador |
| "Core Cream" (`#fdf2de`) não existe nos tokens do separador 05; fica fora da interface até ser definido o seu uso | Fundador |
| Documentação de produto (`Documents/Tecnical`) dentro ou fora do repositório | Fundador |
