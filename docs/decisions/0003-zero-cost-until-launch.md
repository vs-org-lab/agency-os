# 0003 — Custo zero até ao lançamento

- **Data:** 2026-10-06
- **Estado:** Aceite

## Contexto

Durante o desenvolvimento não há dados reais de clientes. Os planos pagos trazem sobretudo garantias de produção: cópias de segurança, uso comercial, suporte e proteção de branches em repositórios privados.

## Decisão

- Supabase Free (dois projetos: dev e staging), Vercel Hobby com deploy pelo GitHub Actions, Inngest Free, Sentry Developer, GitHub Free com repositório privado.
- Os controlos de segurança que no Supabase só existem no plano Pro são implementados na aplicação: verificação de palavras-passe expostas (Have I Been Pwned) e expiração por inatividade.
- Os upgrades pagos são critérios de lançamento, registados em `docs/STATUS.md`.

## Consequências

- Nenhum dado real de cliente entra no sistema antes de cumpridos os critérios de lançamento.
- A proteção de `main` não é imposta pelo GitHub até ao upgrade para o plano Team; o processo de branch e PR é seguido por disciplina e pela CI.
- O CodeQL não está disponível em repositórios privados no plano Free; a análise estática usa Semgrep.
- Os controlos implementados na aplicação mantêm-se depois do upgrade, como segunda camada.
