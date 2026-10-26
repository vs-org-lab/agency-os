# UX-1 — Superfícies da equipa

Data: 2026-10-26 · Programa de redesenho da UI e UX · Depende da UX-0 (Fundação de interação) · Estado: aprovado (autorização do fundador para o programa completo, 2026-10-26)

## Objetivo

Aproximar as superfícies de trabalho da equipa das referências (Designer HQ, `References/Ref 01 (4–7, 13–15, 2–3)`), usando as peças da UX-0: um cabeçalho por ecrã, controlos que aplicam logo, ações em painéis em vez de formulários sempre abertos, e o processo da sala lido de relance.

## Diagnóstico (capturas de 2026-10-26, organização E2E com o cliente "Estúdio Demo")

| Ecrã                                       | Problema                                                                                                                                          | Referência                                                                                                         |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| Todas as páginas da sala                   | Cabeçalho duplicado: nome do cliente em `h1` e a secção em `h2` por baixo; ações soltas ("Novo documento" no corpo, "Ver como cliente" como link) | Ref 6/13: migalhas "Estúdio › Cliente › Documentos", um título, ações no canto superior direito                    |
| Tarefas (estúdio e sala), filtros em geral | Formulário GET com selects nativos e botão "Filtrar"                                                                                              | S2: separadores com contagem (Todas · Por fazer · Feitas) e filtros que aplicam logo                               |
| Passos do processo, datas e responsáveis   | Cada passo é um formulário com select nativo, data `mm/dd/yyyy` e botões, todos visíveis ao mesmo tempo                                           | Ref 5: linha compacta com círculo de estado, nome e etiqueta; o detalhe abre ao clicar                             |
| Sala › Dashboard                           | Cartão "Saúde" no topo com quatro "Sem dados"                                                                                                     | Ref 5: o processo é o primeiro bloco; o projeto à direita                                                          |
| Sala › Documentos                          | Comercial depois dos documentos; cartões sem ícone nem etiqueta de estado                                                                         | Ref 6/14: proposta, contrato e faturas em primeiro, cartões com ícone, etiqueta com ponto e linha de origem        |
| Sala › Biblioteca                          | "Nova pasta" dentro de um cartão; pesquisa com botão; carregar só dentro da pasta                                                                 | Ref 3: barra única (pesquisa, tipos, ordenação, grelha/lista, Nova pasta, Carregar) e pastas em chips com contagem |
| Sala › Retainer                            | Formulário "Registar consumo" sempre aberto; barras pretas                                                                                        | S1: anéis por franquia com "X restantes · Y de Z usados"                                                           |
| Início                                     | Clientes numa coluna estreita por baixo dos eventos; só "Nova tarefa" como criação                                                                | Ref 4: clientes em largura total com progresso e última atividade; ações rápidas de criação                        |
| Barra lateral                              | Clientes com iniciais em cinzento                                                                                                                 | Ref 4: logótipo de cada cliente                                                                                    |

## Decisões

1. **Cabeçalho da sala.** `RoomHeader` passa a compor o `PageHeader` da UX-0: o `h1` é o título da secção (no Dashboard, o nome do cliente, com o avatar); o cliente fica nas migalhas da barra superior, que já o mostram; "Ver como cliente" é um botão `outline` com o ícone `Eye`; a ação principal da secção vai para `actions`.
2. **Filtros que aplicam logo.** Novo `FilterBar` (cliente): separadores segmentados de estado com contagem e `Select` do shadcn para cliente e responsável; cada mudança faz `router.replace` com os parâmetros, dentro de `startTransition`, sem botão "Filtrar". Os parâmetros de URL atuais mantêm-se (links e e2e continuam a funcionar). As contagens vêm da mesma consulta que já carrega a lista (uma contagem agrupada por estado no servidor).
3. **Select e data.** Entram `Select` do shadcn (já existe em `packages/ui`) e um `DatePicker` novo (`Popover` + `Calendar` do shadcn sobre `react-day-picker` 10.0.2, MIT), com locale da sessão e formato `dd/MM/yyyy` em pt-PT. Substituem os `<select>` e `<input type="date">` nativos nos ecrãs desta fase: passos, fases, formulário de tarefa, filtros, retainer. Os restantes ecrãs trocam quando forem redesenhados. O valor submetido continua `yyyy-MM-dd` num `input type="hidden"`, para as server actions não mudarem.
4. **Processo da sala.** No separador "Passos":
   - Coluna de fases: stepper vertical com círculo (vazio, em curso com anel `accent`, feito com visto), nome e data de conclusão ou prevista; a fase selecionada desliza com o indicador partilhado.
   - Coluna de passos: linhas compactas de 40 px com círculo de estado clicável (marca feito ou reabre, com confirmação só quando reabrir um passo já enviado ao cliente), nome, ícone de olho quando é visível ao cliente, avatar do responsável, data curta e etiqueta de estado. "+ Adicionar passo" como linha inline, se o processo o permitir hoje.
   - Clicar no nome abre um `SidePanel` com os controlos que hoje estão na linha: estado, responsável (`Select`), data (`DatePicker`), visível ao cliente, encadeado. Ações de fase ("Pedir aprovação", data prevista) ficam no cabeçalho da coluna de passos.
   - As listas reordenam e mudam de estado com morph (`layout` do `motion`).
5. **Saúde.** O cartão só aparece completo quando há pelo menos um indicador com dados; sem dados, passa a uma linha discreta dentro do cartão do projeto ("Saúde: ainda sem dados suficientes").
6. **Documentos da sala.** Linha "Comercial" primeiro (proposta, contrato, faturas), depois os documentos do projeto; cartões com ícone Lucide do tipo, título, etiqueta de estado com ponto e linha de origem (PDF, Figma, ficheiro); "+ Novo documento" no cabeçalho; estado vazio v2 com a ação. Hover: borda forte em 120 ms.
7. **Biblioteca.** Barra única: pesquisa que aplica com debounce de 250 ms (sem botão), chips de tipo, `Select` de ordenação, alternador grelha/lista, "Nova pasta" (`outline`, `CreateDialog`) e "Carregar" (principal, só dentro de uma pasta). Pastas em chips com ícone e contagem. Dentro de uma pasta, arrastar ficheiros para qualquer ponto da área mostra uma camada de largada (borda `accent` tracejada, ícone e "Largue para carregar") e usa o fluxo de carregamento atual (`requestUploads` → `confirmUpload`); o progresso de cada ficheiro aparece numa lista fixa no fundo, com morph à saída.
8. **Retainer (equipa).** `AllowanceRing` (`packages/ui`): anel SVG de 40 px com o consumo, número grande "X restantes" com `AnimatedNumber` e "Y de Z usados"; a cor passa a `warning` a partir de 80% e `danger` acima de 100%. Faixa de anéis por tipo + anel do período ("N dias para o fecho"). "Registar consumo" passa a botão + `CreateDialog`. O mesmo componente serve o portal na UX-3.
9. **Início.**
   - Ações de criação com o padrão `liq-create` (implementação própria): o botão principal "+ Novo" faz morph para um menu com "Nova tarefa", "Novo alvo de angariação" e "Novo evento", conforme as permissões; cada item navega para o fluxo existente (`/tasks?new=1`, `/acquisition?new=1`, `/calendar?new=1`). As rotas que ainda não honram `?new=1` passam a honrar (abrem o `CreateDialog` respetivo).
   - Indicadores com `AnimatedNumber`.
   - "Clientes" passa para largura total por baixo de "Hoje" e "Próximos eventos": avatar, nome, etiqueta de retainer, barra de progresso das fases, fase atual e última atividade.
   - "Hoje" vazio fica compacto (estado vazio sem linhas fantasma e com altura mínima).
10. **Logótipo do cliente.** A coluna `clients.logo_path` existe mas nenhuma interface a usa. Fica fora desta fase porque exige bucket, políticas de armazenamento e validação de ficheiros (08). Nesta fase o avatar mostra as iniciais sobre um fundo calculado de forma determinística a partir do id, a partir de seis tons de estado suaves já existentes (`info-bg`, `success-bg`, …) e nunca do dourado. Registado como adiado.

## Fora de âmbito

- Tabela de tarefas, subtarefas, painel de detalhe, comentários e ficheiros por tarefa: UX-2.
- Portal: UX-3. Editor do Brand Hub e workshop: UX-6.
- Plano/gantt da sala: UX-6, com o componente gantt.

## Segurança

Nenhuma leitura ou escrita nova no servidor além das contagens por estado (mesma consulta, mesmo contexto de utilizador) e de honrar `?new=1` (só abre o diálogo se o utilizador já tiver permissão para criar, como hoje nas tarefas). O carregamento por arrastar usa o fluxo atual com as mesmas validações.

## Testes

- Componentes: `FilterBar` (muda a URL sem botão; mantém os outros parâmetros), `DatePicker` (formato pt-PT, valor `yyyy-MM-dd` no campo oculto, teclado), `AllowanceRing` (limiares 80% e 100%, texto acessível), linha de passo (círculo marca feito; reabrir passo enviado pede confirmação), menu "+ Novo" (só itens permitidos; teclado e foco), camada de largada (aparece no `dragenter` e some no `dragleave`/`drop`).
- E2E: atualizar os cenários das tarefas, da sala e da biblioteca que usavam "Filtrar", selects nativos ou os controlos dos passos.
- Acessibilidade: axe nos ecrãs alterados.

## Critérios de conclusão

- Nenhum ecrã da sala com cabeçalho duplicado; uma ação principal por ecrã.
- Nenhum botão "Filtrar"; nenhum `<select>` ou `<input type="date">` nativo nos ecrãs desta fase.
- Passos editados no painel lateral; saúde sem "Sem dados" em bloco.
- `STATUS.md` atualizado, incluindo o logótipo do cliente como adiado, com o motivo e o gatilho (fase de armazenamento de ficheiros do cliente ou pedido do fundador).
