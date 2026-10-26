# UX-0 — Fundação de interação

Data: 2026-10-26 · Programa de redesenho da UI e UX (UX-0 a UX-6) · Estado: aprovado (autorização do fundador para o programa completo, 2026-10-26)

## Objetivo

Dar ao OS a base de interação de que dependem todos os redesenhos seguintes: movimento com morph, criação por botões identificados, estados vazios com ação, notificações, carregamento com a forma do conteúdo, paleta de comandos e painel lateral. Esta fase não redesenha ecrãs; troca padrões e cria as peças que a UX-1 a UX-6 vão usar.

## Origem

Análise das referências em `References/` (Designer HQ, 19 capturas `Ref 01` e 6 capturas `Screenshot`) e da lista de componentes guardada pelo fundador (bencho, dqnamo, 21st.dev, Obsidian UI). Problemas encontrados no OS atual:

- A criação está escondida em `<details>` em 12 sítios; a referência usa sempre um botão principal no canto superior direito ("+ New task", "+ New document").
- O `EmptyState` é uma caixa tracejada só com texto.
- O Sonner está instalado mas nenhum ecrã o usa.
- Quase não há `loading.tsx`; as rotas mostram o ecrã anterior até chegar o novo.
- A paleta ⌘K está no inventário do design system mas não existe.
- Não há movimento entre estados: separadores, menu ativo e listas mudam de golpe.

## Decisão de movimento (opção A)

Entra a biblioteca `motion` (MIT), carregada com `LazyMotion` e `domAnimation` e usada só através de componentes `m.*` (modo `strict`), para manter o custo em cerca de 15 KB.

A regra 2 de "Bibliotecas de UI" e a tabela de movimento do `05 Design system.md` passam a:

| Token | Duração | Uso |
| --- | --- | --- |
| fast | 120 ms | Hover, pressionar |
| base | 180 ms | Menus, popovers, tooltips, separadores |
| slow | 240 ms | Painéis laterais, diálogos, troca de pergunta no workshop |
| morph | 300 ms, mola sem ressalto | Elementos partilhados: indicador de separador, item ativo do menu, botão que abre o seu painel, listas que se reordenam, números que rolam |
| moment | 600 ms a 1,2 s | Só momentos do cliente: aprovação final, pagamento, publicação do hub |

- Nos ecrãs de trabalho o movimento é sempre funcional: mostra de onde vem e para onde vai cada coisa. Nada anima em ciclo, nada atrasa uma ação.
- No portal: micro-interações e um momento por evento.
- `MotionConfig reducedMotion="user"` na raiz de cada área; com "reduzir movimento" ativo, os morphs passam a troca instantânea e os números aparecem já no valor final.
- Só se animam `transform` e `opacity` (e `height` no Collapsible, com `overflow: hidden`). Nunca `filter: blur` em listas.

## Peças

Todas vivem em `packages/ui` (genéricas) ou em `apps/web/src/components/ui` (com dependência da aplicação), usam só tokens e entram no `INVENTORY.md` com origem, versão e licença. Componentes sem licença publicada (bencho, dqnamo, autores do 21st.dev com licença "unknown") são implementação própria inspirada no padrão; componentes MIT podem ser copiados e ajustados.

### 1. Movimento base (`packages/ui/src/motion/`)

- `MotionProvider`: `LazyMotion` + `MotionConfig` com as transições dos tokens; montado nos layouts da área de trabalho, do portal e da autenticação.
- `transitions.ts`: `fast`, `base`, `slow`, `morph` como objetos de transição do `motion`, e as mesmas durações expostas como variáveis CSS em `tokens.css` (`--duration-*`, `--ease-out`) para o que continua em CSS.

### 2. Separadores e menu com indicador partilhado

- `Tabs` (`packages/ui`) ganha um indicador com `layoutId` por instância (`useId`), que desliza entre o separador anterior e o novo.
- O item ativo da barra lateral (`app-sidebar.tsx`) usa o mesmo padrão: o fundo ativo desliza para o novo item.
- Teclado e ARIA ficam os do Radix; o indicador é `aria-hidden`.

### 3. Cabeçalho de página e criação

- `PageHeader` (`packages/ui`): título, descrição opcional, área de contexto (seletor de projeto, etiquetas) e área de ações à direita. Uma só ação principal sólida, as restantes `outline`/`ghost` (princípio 3).
- `CreateDialog` (`apps/web/src/components/ui`): o botão principal abre um diálogo cuja animação nasce do botão (origem da transformação calculada a partir do retângulo do gatilho), com o formulário existente dentro. Fecha ao concluir com sucesso e dispara a notificação.
- `CreateSheet`: igual, mas num painel lateral, para formulários longos (mais de 5 campos ou com secções).
- Regra: criar um item de topo é sempre um botão identificado ("+ Nova tarefa", "+ Novo projeto"); criar um filho dentro de uma lista é uma linha inline ("+ Adicionar subtarefa"). Editar é um botão "Editar" que abre o mesmo diálogo em modo de edição.

Conversão dos `<details>`:

| Ecrã | Hoje | Passa a |
| --- | --- | --- |
| Tarefas (`/tasks`, `c/[clientId]/tasks`) | `<details>` "Nova tarefa", aberto com `?new=1` | `PageHeader` + `CreateSheet`; `?new=1` abre o painel |
| Sala do cliente | "Novo projeto" | `PageHeader` + `CreateSheet` |
| Proofing da sala | "Novo ficheiro" | Botão "+ Novo ficheiro" + `CreateDialog` |
| Aquisição | "Adicionar" e "Editar" por alvo | Botão principal + `CreateDialog`; "Editar" na linha abre o mesmo diálogo |
| Negócio | "Adicionar contacto" e "Editar contactos" | Botão + `CreateDialog` |
| Organização | "Adicionar" entidade e "Editar" | Botão + `CreateDialog` |
| Modelos | "Novo modelo", "Novo" e "Editar" | Botões + `CreateSheet` (editores longos) |
| Tarefa (lista) | "Editar" | Botão "Editar" + `CreateDialog` em modo de edição |
| Contrato no negócio | "Ler" e "Anular" | "Ler" passa a `Collapsible`; "Anular" passa a botão destrutivo + diálogo de confirmação |
| Modelos: guia, grelha, editores por idioma e por processo; ajuda do editor de contrato | Divulgação | Ficam como divulgação, com o `Collapsible` animado |

- `Collapsible` (`packages/ui`, sobre o Radix Collapsible): altura animada com o token `slow`, chevron que roda, mesmo marcador acessível que hoje.
- Os textos dos botões são os rótulos que os `<summary>` já usam, para não mexer nas traduções nem nos seletores das e2e mais do que o necessário.

### 4. Estado vazio v2

API composta, inspirada no `cnippet-empty` (MIT) e no visual do `empty-state` de Serafim (MIT):

- `Empty` (contentor), `EmptyMedia` (até três ícones Lucide em leque; o do meio à frente, os laterais rodados ±6° e a 60% de opacidade; no hover do contentor abrem ligeiramente com o token `morph`), `EmptyTitle`, `EmptyDescription`, `EmptyActions`.
- Variante `rows`: atrás do texto, 4 a 6 linhas fantasma com a forma da lista daquele ecrã, a desvanecer para o fundo (inspirada no `empty-state-04`, MIT). Estática; sem marquee em ecrãs de trabalho.
- `EmptyState` atual fica como atalho sobre a nova API (mesmas props + `icons?: ReactNode[]`, `variant?: 'plain' | 'rows'`), por isso os 26 usos existentes continuam a compilar e ganham o novo visual. O texto tem sempre a ação para começar, segundo a tabela de estados do `05`.
- Sem borda tracejada; superfície `surface`, borda `border`, raio 12 px.

### 5. Notificações

- `Toaster` (Sonner) montado nos layouts da área de trabalho e do portal, no canto inferior direito, com os tokens (superfície, borda, raio 12 px, sem sombra forte) e empilhamento expandido no hover.
- `notify` (`apps/web/src/components/ui/notify.ts`): `success`, `error`, `info`, com referência opcional ("Tarefa criada", "Fatura FT 2026/014 emitida") e ação opcional "Anular".
- Nesta fase, os `CreateDialog`/`CreateSheet` notificam ao concluir. A adoção nos restantes formulários (hoje com `FormMessage`) acontece em cada redesenho de ecrã; `FormMessage` continua para erros junto ao campo.

### 6. Carregamento

- `loading.tsx` com skeleton da forma do conteúdo para: Início, Tarefas, Pipeline, Negócio, Dinheiro, Relatórios, Agenda, Atualizações, sala do cliente e as suas sub-rotas principais (tarefas, documentos, biblioteca, retainer, hub), e portal (início, documentos, biblioteca, faturas).
- Peças reutilizáveis em `packages/ui/src/components/states/skeletons.tsx`: `SkeletonHeader`, `SkeletonRows`, `SkeletonCards`, `SkeletonPanel`.
- O `Skeleton` existente ganha um brilho suave em CSS, desligado com "reduzir movimento".

### 7. Números que rolam

- `AnimatedNumber` sobre `@number-flow/react` (MIT): formatação `Intl` com o locale da sessão, algarismos tabulares, sem animação no primeiro render do servidor nem com "reduzir movimento".
- Adoção nesta fase: os contadores da barra lateral (`navigation-counter.tsx`). Os KPIs entram com a UX-1 e a UX-3.

### 8. Painel lateral

- `SidePanel` (`packages/ui`, sobre o `Sheet` existente): largura 480 px (100% no telemóvel), cabeçalho com título, ações (copiar link, apagar, fechar) e separadores opcionais, corpo com scroll próprio, entrada com o token `slow`.
- Usado pelo `CreateSheet` nesta fase; a UX-2 usa-o para o detalhe da tarefa.

### 9. Paleta de comandos ⌘K

- `cmdk` (MIT) no `CommandDialog` do shadcn, só na área de trabalho (equipa interna). O portal não tem paleta.
- Abre com ⌘K / Ctrl+K e pelo campo "Procurar" no topo da barra lateral.
- Grupos:
  - **Ir para:** os itens de navegação a que o utilizador tem acesso (mesma fonte que `navigation.ts`).
  - **Criar:** as ações de criação a que tem acesso ("Nova tarefa" abre `/tasks?new=1`, "Novo alvo de aquisição", etc.).
  - **Procurar:** clientes, negócios e tarefas pelo nome ou título.
- A procura é uma server action com `withUserContext` (RLS aplica-se; nunca `withSystemContext`), consulta com 2 a 80 caracteres, `ilike` com escape de `%` e `_`, no máximo 5 resultados por tipo, devolve só `id`, título e uma linha de contexto. Debounce de 200 ms no cliente; o pedido anterior é descartado. Só utilizadores `internal` com sessão aal2 (mesmo guard das páginas da área de trabalho).
- Teclado completo (setas, Enter, Esc), leitor de ecrã com `aria-activedescendant` do `cmdk`, foco devolvido ao gatilho ao fechar.

### 10. Botão de ação e inventário

- `action-button.tsx` e `hold-to-confirm.tsx` passam a usar as variáveis de duração dos tokens.
- `INVENTORY.md` regista: `motion`, `@number-flow/react`, `cmdk`, Radix Collapsible, e os padrões próprios (estado vazio, `CreateDialog`).

## Fora de âmbito

- Redesenho de ecrãs (Início, sala, documentos, biblioteca): UX-1.
- Botão de criação com morph para menu (padrão `liq-create`) no Início e na Agenda: UX-1, sobre o `CreateDialog`.
- Tabela de tarefas, subtarefas e detalhe em painel: UX-2.
- Componentes de domínio da lista guardada (comparação antes e depois, gantt, dropzone, time-scrubber, dynamic island, thinking orbs, etc.): entram na fase do ecrã que os usa.

## Segurança

- A procura da paleta é a única leitura nova: passa pelo RLS via `withUserContext`, valida a entrada com Zod, não devolve campos além do título e do contexto e não regista a consulta em logs (08: dados pessoais nos logs).
- Nenhuma dependência nova executa código no servidor além do `cmdk`, que é só cliente. As três dependências são MIT, verificadas no npm, com versão fixada.

## Testes

- Unitários (Vitest + Testing Library) para cada peça: teclado, ARIA, foco devolvido, "reduzir movimento" (mock de `matchMedia`), `EmptyState` retrocompatível, `notify`, formatação do `AnimatedNumber`.
- DB test para a procura da paleta: um utilizador interno só vê clientes, negócios e tarefas que o RLS lhe permite; um cliente recebe `forbidden`; escape de `%` e `_`.
- E2E: atualizar os passos que abriam `<summary>` para abrirem o botão; um cenário novo: ⌘K → procurar o cliente → Enter navega para a sala. A verificação de acessibilidade (axe) passa nos ecrãs alterados.

## Critérios de conclusão

- Nenhum `<details>` usado para criar ou editar; todos os de divulgação usam o `Collapsible`.
- Todas as rotas listadas têm `loading.tsx`.
- Separadores e menu ativo com indicador partilhado; "reduzir movimento" verificado.
- `05 Design system.md` e `INVENTORY.md` atualizados; `STATUS.md` atualizado.
- Typecheck, lint, testes unitários e de base de dados, e2e no CI verdes.
