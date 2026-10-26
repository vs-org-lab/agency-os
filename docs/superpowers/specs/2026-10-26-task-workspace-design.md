# UX-2 — Tarefas em tabela, com painel de detalhe, comentários e ficheiros

Data: 2026-10-26 · Programa de redesenho da UI e UX · Depende da UX-0 e da UX-1 · Estado: aprovado (autorização do fundador para o programa completo, 2026-10-26)

## Objetivo

Trocar a lista de tarefas por uma tabela densa e legível, com subtarefas expansíveis e um painel lateral de detalhe com comentários, ficheiros e links, como nas referências `Screenshot 2026-10-21 002350` e `002436`.

## Referência

- Separadores com contagem (Todas · Por fazer · Feitas) e o filtro "Minhas".
- Colunas: tarefa, fase, responsável, prazo, subtarefas (0/8), comentários, criada.
- A linha-mãe expande para mostrar as subtarefas, com "+ Adicionar subtarefa" na própria linha.
- O painel lateral tem dois separadores: "Detalhes" e "Comentários e ficheiros" (com contagem). Inclui comentários com o autor e a data, um campo "Escrever um comentário…", ficheiros ("+ Adicionar ficheiro", largar ficheiros no painel) e links ("+ Adicionar link").

## Hoje no OS

- As tarefas aparecem numa lista agrupada por prazo ("Esta semana"…), cada uma com os botões "Editar" e "Apagar" visíveis.
- `task_items` é uma checklist de cada tarefa, só com título e feito; não há comentários, ficheiros nem links.
- Acesso: só existe `select` sob RLS (`app.can_read_task`); as escritas passam por serviços que autorizam com `withActor` e escrevem com contexto de sistema. Os clientes nunca leem tarefas.

## Decisões

1. **Subtarefas = itens da checklist.** A tabela mostra os `task_items` como subtarefas (visto e título), com a contagem "feitas/total". Não há tabela nova nem tarefas-filhas. Motivo: a checklist já existe, tem dados e cobre o uso das referências (passos de uma entrega); uma hierarquia de tarefas com prazos e responsáveis próprios duplicaria o modelo sem uso pedido (YAGNI). Fica no STATUS como possível evolução.
2. **Tabela** (`TaskTable`, cliente), nos ecrãs de tarefas do estúdio e da sala:
   - Colunas: visto (concluir/reabrir), título, cliente (só no estúdio), fase (o nome do passo do processo, quando a tarefa veio do processo), responsável (avatar e nome), prazo (vermelho `danger` se em atraso e aberta), subtarefas `feitas/total`, comentários (ícone e número), criada.
   - Ordenação por prazo (padrão), criada e título, com o cabeçalho clicável e `aria-sort`; o parâmetro de URL `sort` mantém-se nos filtros.
   - Linhas de 40 px. A seta abre ou fecha as subtarefas com morph de altura. "+ Adicionar subtarefa" é uma linha inline com um campo que grava com Enter e cancela com Esc.
   - Filtro "Minhas" (chip) = responsável é o utilizador; usa o parâmetro `assignee` que já existe.
   - Em ecrãs estreitos (< 768 px) cada linha passa a cartão com título, prazo, responsável e contagens.
   - "Editar" e "Apagar" saem da linha e vão para o painel.
3. **Painel de detalhe** (`TaskPanel`, sobre o `SidePanel` da UX-0):
   - Abre ao clicar no título ou com Enter na linha; o estado fica na URL (`?task=<id>`), por isso um link para uma tarefa abre-a diretamente. A paleta ⌘K passa a apontar as tarefas para `?task=<id>` na lista certa.
   - Cabeçalho: título, ações "Copiar link", "Apagar" (confirmação) e "Fechar".
   - Separador **Detalhes**: título e notas editáveis no próprio sítio (gravam ao sair do campo, com notificação), responsável (`SelectField`), prazo (`DateField`), cliente e projeto (só leitura depois de criada, como hoje) e a checklist completa.
   - Separador **Comentários e ficheiros** (com contagem): lista de comentários (autor, data relativa, texto), campo de comentário (Ctrl/⌘+Enter envia), ficheiros e links.
4. **Comentários** (`task_comments`):
   - `id`, `organization_id`, `task_id` (cascata), `author_id`, `body` (1–5000 caracteres), `created_at`.
   - Leitura: quem pode ler a tarefa (`app.can_read_task` através da tarefa). Escrita: o serviço autoriza com `withActor` e pede o mesmo acesso de leitura; só utilizadores internos.
   - O autor apaga o seu comentário; o fundador apaga qualquer um. Não há edição (YAGNI).
   - Aviso por email ao responsável quando outro membro comenta, pelo outbox existente, com um link para `?task=<id>` e sem o texto do comentário no email (08: minimizar dados em canais externos).
5. **Ficheiros** (`task_files`):
   - Ligação `task_id` ↔ `library_file_id` (único por par, cascata nos dois sentidos).
   - Só em tarefas com projeto: escolher um ficheiro da biblioteca do projeto (`attachableFiles`, que já aplica a visibilidade) ou carregar um novo, que entra numa pasta "Tarefas" da biblioteca do projeto (criada à primeira vez, visibilidade interna) pelo fluxo de carregamento atual e fica ligado à tarefa.
   - Largar ficheiros no separador usa a camada de largada da UX-1.
   - Em tarefas sem projeto, o bloco mostra o motivo ("Os ficheiros vivem na biblioteca de um projeto").
   - Ao abrir um ficheiro usa-se o URL assinado da biblioteca (`libraryFileUrl`), com as regras de leitura da biblioteca.
6. **Links** (`task_links`):
   - `id`, `task_id`, `url` (só `https://`, até 2000 caracteres, validado com `URL`), `title` (opcional, até 200), `created_by`, `created_at`.
   - Abrem num separador novo com `rel="noopener noreferrer"`. Quem adicionou ou o fundador remove.
7. **Pré-visualização ao passar o rato** (padrão `hover-preview`, implementação própria sobre o Radix HoverCard): no título de uma linha com ficheiros, mostra até três miniaturas (imagens) ou ícones do tipo, depois de 300 ms; nunca em toque nem com o teclado (aí o painel faz esse papel).
8. **Contagens na tabela:** a consulta da lista devolve `items_done`, `items_total`, `comments` e `files` por tarefa com subconsultas agregadas na mesma consulta (sem N+1).

## Segurança (08)

- As três tabelas novas: `force row level security`, `revoke all` de `anon`, `authenticated` e `service_role`, e só `grant select` a `authenticated`. As políticas de `select` usam `app.can_read_task` através da tarefa, como `task_items`.
- As escritas acontecem só em serviços: autorizam com `withActor` (internos, com sessão aal2 nas rotas da área de trabalho) e verificam que o utilizador lê a tarefa antes de escrever com contexto de sistema. O ficheiro ligado tem de pertencer ao mesmo projeto da tarefa e ser legível pelo utilizador.
- Validação com Zod em todas as entradas. O texto dos comentários é mostrado como texto, nunca como HTML. Os links são só `https`.
- Auditoria (`recordAudit`) ao apagar comentários de outra pessoa, ficheiros e links.
- Sem dados de clientes novos: comentários e links são internos.

## Fora de âmbito

- Registo de tempo ("Track time" da referência), barra de IA ("Work with ChatGPT"), tarefas-filhas com prazo e responsável, menções com @ e reações.

## Testes

- Base de dados: RLS das três tabelas (o cliente não lê; o freelancer só lê nas tarefas que lhe estão atribuídas ou nas salas a que tem acesso; outra organização não lê); serviços (comentar sem acesso → `forbidden`; ligar um ficheiro de outro projeto → `invalid_input`; link `http://` ou `javascript:` → `invalid_input`; o autor apaga o seu comentário e outro membro não-fundador não apaga); contagens agregadas corretas.
- Componentes: tabela (ordenação com `aria-sort`, expandir subtarefas, adicionar subtarefa com Enter e cancelar com Esc, atraso em `danger`, cartão abaixo de 768 px); painel (abre por `?task=`, separadores com contagem, Ctrl+Enter envia, apagar pede confirmação); pré-visualização (não abre com o teclado).
- E2E: criar tarefa → abrir o painel → comentar → adicionar link → anexar um ficheiro da biblioteca → fechar e reabrir pelo link.

## Critérios de conclusão

- Tarefas do estúdio e da sala em tabela; nenhum botão "Editar"/"Apagar" na linha.
- Painel com detalhes, comentários, ficheiros e links, aberto pela URL.
- Migração com RLS e testes de base de dados verdes; `STATUS.md` com a UX-2 feita e as tarefas-filhas registadas como evolução possível.
