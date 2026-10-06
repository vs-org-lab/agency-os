# 0002 — Região padrão: Irlanda

- **Data:** 2026-10-06
- **Estado:** Aceite

## Contexto

O RNF-03 exige dados guardados na União Europeia. A base de dados e a aplicação devem estar na mesma região para cumprir o RNF-01 (ações comuns abaixo de 300 ms).

## Decisão

- Supabase em `eu-west-1` (Irlanda) para desenvolvimento, staging e produção.
- Vercel com funções em `dub1` (Dublin).

## Alternativas rejeitadas

- **Frankfurt (`eu-central-1` e `fra1`):** igualmente válida; os projetos foram criados na Irlanda e não há vantagem que justifique mudar.
- **Londres (`eu-west-2`):** fora da União Europeia.

## Consequências

- Todos os novos serviços (Sentry, Inngest, email) devem usar região ou armazenamento na UE quando disponível.
