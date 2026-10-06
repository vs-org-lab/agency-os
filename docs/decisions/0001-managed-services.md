# 0001 — Serviços geridos: Supabase, Vercel e Inngest

- **Data:** 2026-10-06
- **Estado:** Aceite

## Contexto

O separador 06 define Next.js, PostgreSQL com RLS na UE e serviços geridos, mas deixa em aberto os fornecedores. A operação é de uma pessoa com freelancers; o custo de manutenção pesa mais do que o controlo fino da infraestrutura.

## Decisão

- **Supabase** para PostgreSQL, autenticação, armazenamento de ficheiros e tempo real.
- **Vercel** para alojar a aplicação Next.js.
- **Inngest** para tarefas em fila e agendadas.
- **Sentry** para erros e desempenho.

## Alternativas rejeitadas

- **Neon, Better Auth e Cloudflare R2:** mais controlo e menos dependência de um fornecedor, mas a autenticação passa a ser código próprio e há três fornecedores e três acordos de tratamento de dados.
- **Alojamento próprio (Coolify ou VPS):** custo mensal mais baixo, mas exige manter servidores, cópias de segurança e cumprir sozinho o RPO e o RTO do RNF-04.

## Consequências

- As políticas RLS usam diretamente a identidade do Supabase Auth.
- Um único acordo de tratamento de dados cobre base de dados, autenticação e ficheiros.
- Dependência do Supabase; mitigada pelo uso de PostgreSQL standard e de Drizzle, que permitem migrar a base de dados.
