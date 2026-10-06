# 0005 — Drizzle gera as migrações do Supabase

- **Data:** 2026-10-06
- **Estado:** Aceite

## Contexto

O separador 06 define Drizzle com migrações versionadas. O Supabase CLI aplica migrações a partir de `supabase/migrations`. Duas histórias de migrações separadas acabariam por divergir.

## Decisão

- O esquema Drizzle (`packages/db`) define tabelas, RLS e políticas.
- `drizzle-kit generate` escreve as migrações SQL em `supabase/migrations`.
- Funções, gatilhos e permissões que o Drizzle não exprime são migrações SQL personalizadas, geradas com `drizzle-kit generate --custom` na mesma pasta.
- As migrações são aplicadas pelo Supabase CLI (`supabase db push`), local, em CI e em staging.

## Consequências

- Uma única história de migrações, revista em PR.
- As migrações nunca são editadas depois de aplicadas em staging; uma correção é uma migração nova.
