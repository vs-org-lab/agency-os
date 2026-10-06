# Sub-projeto 0 — Fundação da plataforma

| Campo                   | Valor                                                                                                                            |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| Data                    | 2026-10-06                                                                                                                       |
| Estado                  | Em revisão                                                                                                                       |
| Documentação de produto | `docs/product/00`–`09` (separadores 01, 05, 06, 08 e 09)                                                                         |
| Decisões relacionadas   | [ADR 0001](../../decisions/0001-managed-services.md) a [ADR 0005](../../decisions/0005-drizzle-generates-supabase-migrations.md) |

## 1. Objetivo

Construir a base técnica sobre a qual todos os módulos do Agency OS (M01 a M22) são desenvolvidos: estrutura do código, isolamento entre clientes, autenticação, autorização, auditoria, eventos, design system, idiomas e o caminho automático até produção.

A fundação não entrega nenhum ecrã de negócio. Está concluída quando um utilizador interno e um utilizador de cliente conseguem entrar com os métodos definidos no separador 08, ver uma aplicação vazia com o layout final, e cada alteração ao código passa automaticamente pelos testes, pela análise de segurança e pelo deploy em staging.

## 2. Âmbito

### Incluído

1. Monorepo com a aplicação, o esqueleto do Brand Hub e os pacotes partilhados.
2. Modelo de dados de base: organizações, perfis, clientes, pertenças, atribuições, auditoria e eventos.
3. Isolamento entre clientes em duas barreiras: autorização na aplicação e RLS na base de dados.
4. Autenticação da equipa (palavra-passe e MFA) e dos clientes (link mágico), convites, sessões e reautenticação.
5. Matriz de acesso do separador 08 como configuração tipada e testada.
6. Registo de auditoria só de escrita e outbox de eventos ligado ao Inngest.
7. Tokens do separador 05, shadcn/ui, modo claro e escuro, layout com barra lateral de dois níveis e componentes de estado.
8. Português de Portugal e inglês com next-intl.
9. CI/CD em GitHub Actions, deploy em Vercel (preview e staging), Sentry.
10. Manifesto PWA e layout responsivo.

### Excluído (registado em `docs/STATUS.md`)

| Item                                                                                  | Entra com                                                        |
| ------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| Qualquer ecrã ou entidade de negócio (candidaturas, CRM, documentos, faturação, etc.) | Vaga 1 e seguintes                                               |
| Cofre de credenciais (SEC-20 a SEC-23)                                                | Primeiro módulo que guarde credenciais                           |
| Stripe, software de faturação, assinatura eletrónica, Figma, Google                   | Módulos M04 e M05                                                |
| Servidor MCP e OAuth do agente                                                        | M18 (Vaga 4)                                                     |
| Atribuição de freelancers por projeto                                                 | M20 (Vaga 2); a fundação atribui ao nível do cliente             |
| Ambiente de produção (projeto Supabase, deploy de `main`)                             | Critério de lançamento (secção 13)                               |
| Email transacional próprio (Resend) e domínio                                         | Critério de lançamento                                           |
| Service worker e funcionamento offline                                                | Avaliação na Vaga 2, com o portal; sem cache de dados de cliente |
| Monitor de disponibilidade                                                            | Critério de lançamento                                           |
| Passkeys                                                                              | Avaliação depois do lançamento; o TOTP cumpre o SEC-01           |

## 3. Arquitetura

### Estrutura do repositório

```
apps/
  web/                 Next.js (App Router): estúdio, portal, API REST /api/v1, autenticação
    src/app/           Rotas
    src/modules/       Um módulo por domínio, com fronteira e testes próprios
      identity/        Sessões, convites, MFA, palavra-passe
      access/          Matriz de acesso e função authorize
      audit/           Escrita do registo de auditoria
      events/          Outbox e despacho para o Inngest
      organizations/   Organização e clientes (apenas o necessário à fundação)
    src/platform/      Infraestrutura transversal: Supabase, base de dados, logging, Sentry, segurança HTTP
  brand-hub/           Next.js com exportação estática; só esqueleto nesta fase
packages/
  db/                  Esquema Drizzle, funções SQL, políticas RLS, migrações, utilitários de teste
  ui/                  Tokens, tema e componentes shadcn/ui ajustados
  i18n/                Mensagens pt-PT e en, formatação de datas, números e moeda
  config/              Configurações partilhadas de TypeScript, ESLint e Prettier
supabase/
  config.toml          Configuração do Supabase CLI
  migrations/          Migrações SQL geradas pelo Drizzle e revistas em PR
docs/
  STATUS.md            Estado vivo do projeto
  decisions/           Registos de decisão (ADR)
  superpowers/         Specs e planos de implementação
```

**Ferramentas:** pnpm (workspaces), Turborepo, TypeScript em modo estrito, Node.js 22 LTS.

**Regra de dependência:** os módulos de `apps/web/src/modules` comunicam apenas pelas funções exportadas no seu `index.ts`. Um módulo não importa ficheiros internos de outro. Esta regra é verificada pelo ESLint.

### Acesso a dados

- A aplicação lê e escreve com **Drizzle** sobre o pooler de transações do Supabase.
- Cada pedido de utilizador corre numa transação com o papel `authenticated` e as claims do token verificado, através de `withUserContext(claims, fn)`. O RLS aplica-se sempre.
- Tarefas de sistema (despacho do outbox, convites, criação do fundador inicial) usam `withSystemContext(fn)`, com uma ligação de serviço. Esta função não está disponível em código chamado por pedidos de utilizadores; o ESLint impede a importação a partir de `src/app`.
- O cliente Supabase JavaScript é usado apenas para autenticação, sempre no servidor.

## 4. Modelo de dados

Todas as tabelas usam identificadores UUID v4 (SEC-12), `created_at` e `updated_at`. As entidades não são apagadas: `archived_at` marca o arquivo. Todas as tabelas com dados de uma organização têm `organization_id`; as que pertencem a um cliente têm também `client_id`.

| Tabela                     | Campos principais                                                                                                                                                                                  | Notas                                               |
| -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------- |
| `organizations`            | `name`, `slug`, `default_locale` (`pt-PT`, `en`), `default_currency` (`EUR`, `GBP`, `USD`), `portal_branding` (jsonb)                                                                              | Existe desde já, preparando o M22                   |
| `profiles`                 | `id` (= `auth.users.id`), `full_name`, `locale`, `kind` (`internal`, `client`)                                                                                                                     | Um por utilizador autenticado                       |
| `organization_memberships` | `organization_id`, `user_id`, `role` (`founder`, `project_manager`, `freelancer`, `finance`), `status` (`invited`, `active`, `revoked`)                                                            | Pertença da equipa                                  |
| `clients`                  | `organization_id`, `name`, `tax_id`, `sector`, `size`, `logo_path`, `portal_domain`                                                                                                                | Só os campos da fundação; o M02 acrescenta o resto  |
| `client_memberships`       | `organization_id`, `client_id`, `user_id`, `role` (`decision_maker`, `operational`, `client_finance`), `status`                                                                                    | Pertença de utilizadores do cliente                 |
| `client_staff_assignments` | `organization_id`, `client_id`, `user_id`                                                                                                                                                          | Define o âmbito "próprio" do gestor e do freelancer |
| `audit_log`                | `organization_id`, `actor_user_id`, `actor_kind` (`user`, `agent`, `system`), `action`, `resource_type`, `resource_id`, `client_id`, `metadata` (jsonb), `ip_address`, `user_agent`, `occurred_at` | Só inserção                                         |
| `domain_events`            | `organization_id`, `client_id`, `type`, `payload` (jsonb), `status` (`pending`, `dispatched`, `failed`), `attempts`, `last_error`, `dispatched_at`                                                 | Outbox                                              |

## 5. Autorização

### Barreira 1: aplicação

- A matriz do separador 08 vive num único ficheiro tipado, `modules/access/matrix.ts`, com todos os recursos e perfis, incluindo os de vagas futuras. Alterações passam por PR e ficam no histórico do git ([ADR 0004](../../decisions/0004-permission-matrix-as-code.md)).
- `authorize(actor, action, resource)` devolve permitido ou recusado. Nega por defeito: perfil, recurso ou ação desconhecidos são recusados.
- O âmbito "próprio" é resolvido pelas atribuições (`client_staff_assignments`); o âmbito "própria sala" pelas pertenças de cliente.
- Cada ação de servidor e cada rota da API chama `authorize` antes de qualquer leitura ou escrita (SEC-11).
- "Não existe" e "sem acesso" produzem a mesma resposta: 404 na API, ecrã "não encontrado" na interface (SEC-12).

> **Alteração face ao design conversado:** a secção 2 do design previa uma tabela `role_permissions`. O spec guarda a matriz em código: fica tipada, testada e revista em PR, o que cumpre "configuração revista e auditada" sem permitir alterações em produção fora do processo de revisão.

### Barreira 2: base de dados

Funções SQL no esquema `app`, `security definer`, `stable`, com `search_path` vazio:

| Função                           | Devolve verdadeiro quando                                                                                        |
| -------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `app.is_mfa_verified()`          | A sessão atual tem `aal2`                                                                                        |
| `app.has_org_role(org, roles[])` | O utilizador tem pertença ativa na organização com um dos papéis indicados e, sendo interno, a sessão tem MFA    |
| `app.is_org_member(org)`         | O utilizador tem qualquer pertença ativa interna na organização (com MFA)                                        |
| `app.has_client_access(client)`  | Fundador ou financeiro da organização; interno atribuído ao cliente; ou utilizador do cliente com pertença ativa |

Políticas da fundação:

| Tabela                     | Ler                                                           | Escrever                                                                                                                                          |
| -------------------------- | ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `organizations`            | Membros internos e utilizadores de clientes dessa organização | Fundador                                                                                                                                          |
| `profiles`                 | O próprio e quem partilha organização ou cliente              | O próprio (nome, idioma)                                                                                                                          |
| `organization_memberships` | O próprio; o fundador vê todas                                | Fundador                                                                                                                                          |
| `clients`                  | `has_client_access`                                           | Criar: fundador e gestor. Alterar: fundador e gestor atribuído                                                                                    |
| `client_memberships`       | Fundador, internos atribuídos e utilizadores do mesmo cliente | Criar: fundador e decisor do próprio cliente (convidar colegas). Alterar: fundador ([ADR 0006](../../decisions/0006-client-invitation-rights.md)) |
| `client_staff_assignments` | Fundador e o próprio                                          | Fundador                                                                                                                                          |
| `audit_log`                | Fundador                                                      | Nenhuma escrita direta; só através de `app.record_audit()`                                                                                        |
| `domain_events`            | Nenhum utilizador                                             | Nenhum utilizador; só o contexto de sistema                                                                                                       |

O registo de auditoria é só de escrita por três mecanismos: `UPDATE` e `DELETE` revogados a todos os papéis, um gatilho que rejeita qualquer alteração ou remoção, e inserção apenas através de função.

## 6. Autenticação e sessões

| Requisito             | Implementação                                                                                                                                                                                                                                                                                            |
| --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| SEC-01 Equipa         | Email e palavra-passe. Palavra-passe com 12 caracteres no mínimo, verificada contra a API Have I Been Pwned por k-anonimato (só os 5 primeiros caracteres do hash SHA-1 saem do sistema). MFA TOTP obrigatório: sem fator inscrito, o utilizador é levado para a inscrição antes de qualquer outro ecrã. |
| SEC-02 Clientes       | Link mágico por email. MFA TOTP opcional. Um pedido de link mágico para um email interno não envia nada; a resposta é igual para qualquer email ("se o email existir, enviámos um link"), para não revelar contas.                                                                                       |
| Sem registo público   | Os registos públicos estão desligados no Supabase Auth. O fundador inicial é criado por um script (`pnpm --filter web bootstrap:founder`). Os restantes utilizadores entram por convite.                                                                                                                 |
| SEC-03 Inatividade    | Cookie `httpOnly` assinado com a hora da última atividade, atualizado no middleware no máximo uma vez por minuto. Mais de 8 horas sem atividade numa sessão interna termina a sessão.                                                                                                                    |
| SEC-03 Reautenticação | `requireRecentMfa(15 minutos)` lê a hora da última verificação TOTP nas claims `amr` do token. Se for mais antiga, a ação devolve "verificação necessária" e a interface pede um novo código.                                                                                                            |
| SEC-04 Limites        | Limites nativos do Supabase Auth para login, links mágicos e verificações MFA.                                                                                                                                                                                                                           |
| SEC-05 Sessões        | `app.list_my_sessions()` e `app.revoke_my_session(id)` sobre `auth.sessions`, restritas ao próprio utilizador. Mudar a palavra-passe termina todas as sessões.                                                                                                                                           |
| SEC-51 Cookies        | Cookies de sessão `httpOnly`, `Secure`, `SameSite=Lax`. A autenticação corre só no servidor; o browser nunca tem acesso ao token.                                                                                                                                                                        |

Ecrãs: entrar, pedir link mágico, verificar MFA, inscrever MFA, aceitar convite, definir palavra-passe, sessões ativas.

Convites: o fundador convida membros da equipa; o fundador e o decisor convidam utilizadores do cliente ([ADR 0006](../../decisions/0006-client-invitation-rights.md)). Um convite cria a pertença com estado `invited` e passa a `active` na primeira entrada.

## 7. Auditoria e eventos

- `audit.record(context, action, resource, metadata)` escreve na mesma transação da alteração. Ações da fundação auditadas: entrada, saída, falha de MFA, inscrição de MFA, convite criado, convite aceite, pertença alterada, sessão revogada, palavra-passe alterada.
- `events.emit(tx, type, payload)` insere em `domain_events` na mesma transação (padrão outbox).
- Uma função Inngest, acionada após a confirmação de cada transação que emitiu eventos e também agendada a cada 5 minutos como rede de segurança, lê eventos pendentes com `FOR UPDATE SKIP LOCKED`, envia-os ao Inngest com o `id` do evento como chave de idempotência e marca-os como despachados. Após 10 tentativas falhadas o evento passa a `failed` e gera um alerta no Sentry.
- Nesta fase não existe nenhum consumidor de negócio. A fundação inclui um evento `identity.user.invited` e um teste de ponta a ponta do despacho.

## 8. Design system, idiomas e PWA

- **Tokens:** todas as cores, tipografia, espaços, raios e durações do separador 05, como variáveis CSS no `packages/ui`, ligadas ao Tailwind CSS v4. Nenhum componente usa valores diretos.
- **Tipografia:** Inter, Space Mono e Fraunces através de `next/font`, alojadas pela própria aplicação.
- **Componentes:** shadcn/ui inicializado no `packages/ui`, com os componentes necessários à fundação: Button, Input, Form, Label, Card, Badge, Dialog, Dropdown Menu, Sidebar, Tooltip, Sonner (notificações), Skeleton, Input OTP.
- **Temas:** claro e escuro a partir dos mesmos tokens; segue o sistema por defeito e pode ser trocado na barra lateral (RNF-08).
- **Layout:** barra lateral de dois níveis (estúdio e sala, com "← Todos os clientes"), recolhível para 64 px, barra superior de 48 px, margens de 16, 24 e 32 px. Ecrã inicial vazio no estúdio e no portal.
- **Estados:** componentes `EmptyState`, `LoadingState`, `ErrorState` e `BlockedState`, usados por todos os ecrãs futuros.
- **Movimento:** durações `fast`, `base` e `slow`; com "reduzir movimento", as transições passam a instantâneas.
- **Idiomas:** next-intl com `pt-PT` (padrão) e `en`; idioma do perfil, depois da organização. Mensagens em `packages/i18n`. A regra `react/jsx-no-literals` impede texto escrito diretamente nos componentes (RNF-05). Datas, números e moeda formatados pelo idioma (RNF-06).
- **PWA:** manifesto, ícones e cor do tema, para instalação no telemóvel. Sem service worker nesta fase.
- **Acessibilidade:** foco visível com o token `accent`, navegação por teclado em todos os ecrãs, verificação automática com axe.

## 9. Segurança da aplicação web

- Cabeçalhos definidos no middleware: Content-Security-Policy com nonce por pedido, `Strict-Transport-Security`, `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy` e `frame-ancestors 'none'` (SEC-50, SEC-51).
- Toda a entrada validada no servidor com Zod, mesmo quando já validada no browser (SEC-52).
- Segredos só em variáveis de ambiente; `.env.example` documenta cada uma; `.env.local` está no `.gitignore`.
- Sentry configurado sem dados pessoais (`sendDefaultPii: false`) e com limpeza de cabeçalhos de autenticação e cookies.

## 10. CI/CD e ambientes

### Ambientes

| Ambiente        | Supabase                        | Vercel                     | Origem                                             |
| --------------- | ------------------------------- | -------------------------- | -------------------------------------------------- |
| Desenvolvimento | `Agency-OS-Dev` (eu-west-1)     | Previews de PR             | Branches `feature/*`, `fix/*`, `chore/*`, `docs/*` |
| Staging         | `Agency-OS-Staging` (eu-west-1) | Deploy de staging (`dub1`) | Merge em `develop`                                 |
| Produção        | A criar no lançamento           | Produção (`dub1`)          | Merge em `main`; desligado até ao lançamento       |

### Pipeline de pull request

Concorrência por branch, com cancelamento da execução anterior.

1. Instalação com cache do pnpm e do Turborepo.
2. `typecheck`, `lint`, `format:check`.
3. Testes unitários (Vitest).
4. Testes de base de dados: `supabase start` no runner, aplicação das migrações, testes de RLS, de acesso cruzado, de cobertura de políticas e de auditoria.
5. `build`.
6. Segurança: Semgrep, TruffleHog e `pnpm audit --audit-level high`.
7. Título do PR validado contra Conventional Commits.
8. Deploy de preview na Vercel através da CLI; o URL é publicado no PR.

### Pipeline de `develop`

1. `supabase db push` para staging (migrações antes do código).
2. Deploy de staging na Vercel.
3. Upload de source maps para o Sentry.
4. Testes de ponta a ponta com Playwright e axe contra staging.

### Outros

- Dependabot ativo para npm e GitHub Actions.
- Segredos guardados em GitHub Environments (`preview`, `staging`) e nas variáveis da Vercel.

## 11. Testes

| Tipo                   | Ferramenta           | Onde corre                                                                               | O que cobre                                                                                                                           |
| ---------------------- | -------------------- | ---------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| Unitários              | Vitest               | Local e CI                                                                               | Matriz de acesso, `authorize`, política de palavra-passe, cliente HIBP (simulado), inatividade, reautenticação, formatação por idioma |
| Base de dados          | Vitest + postgres.js | CI (Supabase no runner); local contra o projeto dev, cada teste numa transação revertida | Cada política RLS, acesso cruzado entre dois clientes para cada tabela, auditoria só de escrita, funções de sessão                    |
| Cobertura de políticas | Vitest               | CI                                                                                       | Falha se uma tabela com `organization_id` ou `client_id` não tiver RLS ativo e pelo menos uma política                                |
| Integração             | Vitest               | CI                                                                                       | Outbox: emissão na transação, despacho idempotente, falha e repetição (Inngest simulado)                                              |
| Ponta a ponta          | Playwright           | Staging                                                                                  | Entrada da equipa com palavra-passe e TOTP, entrada de cliente por link mágico, convite, sessões, troca de tema e idioma              |
| Acessibilidade         | axe (Playwright)     | Staging                                                                                  | Todos os ecrãs da fundação; falhas graves bloqueiam                                                                                   |

O desenvolvimento segue TDD: cada comportamento começa por um teste que falha.

## 12. Critérios de aceitação

1. `pnpm install`, `pnpm build`, `pnpm test` e `pnpm lint` passam numa cópia limpa do repositório.
2. Um utilizador de um cliente não consegue ler, alterar nem apagar nenhum dado de outro cliente, em nenhuma tabela, verificado por teste automático.
3. Um utilizador interno sem MFA verificado não lê nenhuma tabela interna, verificado por teste na base de dados.
4. Nenhum registo de auditoria pode ser alterado ou apagado por nenhum papel, verificado por teste.
5. O fundador inicial entra com palavra-passe e TOTP; um membro convidado define palavra-passe, inscreve TOTP e entra; um utilizador de cliente entra por link mágico. Tudo verificado em staging com Playwright.
6. Uma ação crítica simulada pede novo código TOTP quando a última verificação tem mais de 15 minutos.
7. Uma sessão interna sem atividade há mais de 8 horas é terminada.
8. O ecrã de sessões lista as sessões ativas e termina uma sessão escolhida.
9. Todos os ecrãs funcionam em pt-PT e en, em modo claro e escuro, a 360 px e a 1440 px, sem falhas graves no axe.
10. Um evento emitido numa transação revertida não é despachado; um evento confirmado é despachado uma única vez.
11. Um PR com um teste a falhar, um segredo no código ou uma vulnerabilidade alta não pode ser integrado com a CI verde.
12. Um merge em `develop` aplica as migrações e faz deploy em staging sem passos manuais.
13. Um erro provocado em staging aparece no Sentry em menos de 5 minutos.

## 13. Critérios de lançamento

Antes de o primeiro dado real de cliente entrar no sistema:

| Item                                                                 | Motivo                                                                                    |
| -------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| Criar o projeto Supabase de produção em eu-west-1, no plano Pro      | Backups diários e RPO de 24 horas (RNF-04); verificação nativa de palavras-passe expostas |
| Plano Vercel Pro                                                     | Termos de uso comercial                                                                   |
| Domínio, Resend com SPF, DKIM e DMARC, SMTP próprio no Supabase Auth | Entrega fiável de links mágicos e convites                                                |
| Ativar o pipeline de `main` com aprovação do fundador                | Separador 09, passo 6                                                                     |
| GitHub Team e proteção de `main`                                     | Quando houver mais pessoas com acesso ao repositório                                      |
| Monitor de disponibilidade                                           | RNF-02 e RNF-11                                                                           |
| Rever os DPA de Supabase, Vercel, Inngest e Sentry                   | SEC-71                                                                                    |

## 14. Riscos

| Risco                                                                     | Mitigação                                                                                              |
| ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| O plano Free do Supabase pausa projetos após 7 dias sem uso               | Reativação manual; o pipeline de `develop` mantém o staging ativo enquanto houver desenvolvimento      |
| Limite de 2 000 minutos/mês de GitHub Actions                             | Cache, cancelamento de execuções antigas, testes de ponta a ponta só em `develop`                      |
| O email interno do Supabase só envia para membros da organização Supabase | Testes de ponta a ponta obtêm links através da API de administração; utilizadores de teste são membros |
| Mudança do comportamento das claims `amr` ou `aal` no Supabase            | Testes unitários e de ponta a ponta sobre a reautenticação detetam a regressão                         |
