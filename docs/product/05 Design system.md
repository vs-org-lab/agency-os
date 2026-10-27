# 05 — Design system

## Princípios e referências

A interface segue o registo do Designer HQ: calma, precisa e funcional, com a cor reservada para significados. O prémio vem da precisão e do espaço, não de efeitos.

### O que observámos nas referências

- Fundo cinzento muito claro, painéis brancos, bordas finas e quase nenhuma sombra.
- Texto pequeno e denso (13 a 14 px), com títulos que se distinguem pelo peso, não pelo tamanho.
- Barra lateral com os logótipos dos clientes; dentro da sala, o menu muda e aparece "← Todos os clientes".
- Estados em etiquetas com um ponto de cor: "Com o cliente" a azul, "Assinado" e "Tudo pago" a verde, "Aprovado" a verde.
- Documentos em cartões simples: ícone, título, etiqueta de estado e uma linha de origem ("Figma", "PDF").
- Botão principal preto e sólido, um por ecrã; o resto são botões de contorno ou texto.
- Workshop com uma pergunta grande ao centro, muito espaço em branco e progresso fino no topo.
- Editor do Brand Hub em três colunas, com amostras de cor e valores hexadecimais no painel de design.

### Princípios

1. **Calma.** Superfícies neutras; a cor só aparece para estados, ações e o acento da marca.
2. **Densidade legível.** Muita informação por ecrã, com hierarquia clara e alinhamentos rigorosos.
3. **Uma ação principal por ecrã.** Um único botão sólido; tudo o resto é secundário.
4. **Estado sempre visível.** Cada documento, fase, fatura e negócio mostra o seu estado sem abrir.
5. **A marca do cliente primeiro.** No portal e no Brand Hub, quem aparece é o cliente; a Aurion assina discretamente.
6. **Movimento para orientar.** Transições curtas que mostram de onde vem e para onde vai cada coisa. Momentos expressivos só onde o cliente os vê: aprovação final, pagamento, publicação do hub.

### Onde entra a marca Aurion

Revisto a 2026-10-27 no programa de redesenho 2 ([RD-0](../specs/2026-10-27-rd-0-dark-foundation-design.md)).

- **Quase monocromático.** Botão principal, anéis, barras, indicadores e foco em branco no escuro e Ink no claro. A cor fica para o estado e para os logótipos dos clientes.
- **Aurion Gold** só no ponto do lettering e dentro dos documentos da marca. Nunca como cor de estado de aviso.
- **Ink** é a base do modo escuro, que é o modo por defeito.
- **Inter** em toda a interface, incluindo o portal. A serifa e o mono dourado dos templates ficam nos documentos gerados (proposta, contrato, relatório, fatura).

## Tokens de cor

Toda a cor da interface vem destes tokens; nenhum componente usa um valor hexadecimal direto. Todas as combinações de texto abaixo passam o contraste AA (4,5:1 ou mais), verificado no cálculo WCAG (`packages/ui/test/tokens.test.ts`). O modo por defeito é o escuro; claro e sistema trocam-se no menu de conta da barra lateral.

### Superfícies e texto

| Token | Claro | Escuro | Uso |
| --- | --- | --- | --- |
| canvas | #FAFAFA | #05090E | Fundo da aplicação |
| sidebar | #F7F8F9 | #070C12 | Barra lateral |
| surface | #FFFFFF | #0B1118 | Cartões e painéis |
| surface-muted | #F3F4F6 | #111821 | Item ativo, hover, áreas de entrada, menus |
| border | #E6E8EB | #1A232D | Hairlines e divisores |
| border-strong | #D1D5DB | #26313D | Borda em hover, campos, separadores |
| text | #0B1117 | #EDF0F3 | Texto principal |
| text-secondary | #4B5563 | #9AA4AF | Descrições, metadados |
| text-tertiary | #5F6B78 | #808B96 | Datas, contadores, texto de ajuda |

### Ação e marca

| Token | Claro | Escuro | Uso |
| --- | --- | --- | --- |
| primary | #0B1117 | #EDF0F3 | Fundo do botão principal |
| primary-foreground | #FFFFFF | #05090E | Texto do botão principal |
| accent | #0B1117 | #EDF0F3 | Foco, seleção, progresso, indicadores |
| link | #0B1117 | #EDF0F3 | Links; dentro de texto corrido são sublinhados |
| gold | #D9A441 | #F0B342 | Ponto do lettering e documentos da marca |

### Estados

Cada estado tem uma cor de texto e um fundo suave, usados juntos nas etiquetas com ponto.

| Token | Texto claro | Fundo claro | Texto escuro | Fundo escuro | Exemplos |
| --- | --- | --- | --- | --- | --- |
| neutral | #4B5563 | #F3F4F6 | #9AA4AF | #161D25 | Rascunho, Por fazer |
| info | #0F4C81 | #EAF1F8 | #A9C7E2 | #122030 | Com o cliente, Enviado |
| success | #1F7A45 | #E8F5EC | #5CC98C | #10261A | Aprovado, Assinado, Pago, Feito |
| warning | #A04F06 | #FDF0E1 | #F2A65A | #2E1D0D | A vencer, Perto do limite, Bloqueado |
| danger | #B42F25 | #FCE9E7 | #F2776D | #2E1311 | Vencida, Recusado, Erro |

O aviso é laranja e não amarelo, para nunca se confundir com o dourado da marca. Os estados nunca dependem só da cor: a etiqueta tem sempre o texto do estado.

### Escala de dados

A série principal é sempre `chart-1` (branco no escuro, Ink no claro) e a comparação `chart-2` (cinzento). As restantes só entram quando a série é um estado (`chart-3` sucesso, `chart-4` aviso, `chart-5` informação). Todas têm pelo menos 3:1 contra a superfície.

| Token | Claro | Escuro | Uso |
| --- | --- | --- | --- |
| chart-1 | #0B1117 | #EDF0F3 | Série principal |
| chart-2 | #7C8792 | #5D6873 | Comparação (período anterior, objetivo) |
| chart-3 | #1F7A45 | #5CC98C | Série de sucesso |
| chart-4 | #A04F06 | #F2A65A | Série de aviso |
| chart-5 | #0F4C81 | #A9C7E2 | Série informativa |

Regras: linhas de 2 px, marcadores de pelo menos 8 px com anel de 2 px da cor da superfície, uma só escala no eixo Y (nunca dois eixos), grelha discreta, legenda sempre que há duas ou mais séries, texto nos tokens de texto e nunca na cor da série, e a tabela com os mesmos números mantém-se como fonte completa dos dados. Estas cores não se usam para estados.

## Tipografia, espaço, forma e movimento

Uma família para toda a interface (Inter, também no portal) e uma para códigos (Space Mono). A serifa e o mono dos templates da marca ficam nos documentos gerados. O resto da escala é deliberadamente curta.

### Escala tipográfica

| Token | Tamanho / linha | Peso | Uso |
| --- | --- | --- | --- |
| caption | 12 / 16 px | 400 | Datas, contadores, ajuda |
| body-sm | 13 / 20 px | 400 | Tabelas, menus, cartões |
| body | 14 / 22 px | 400 | Texto corrido, formulários |
| label | 13 / 20 px | 500 | Rótulos, botões, separadores |
| title-sm | 16 / 24 px | 600 | Títulos de cartão e de secção |
| title | 20 / 28 px | 600 | Título do ecrã |
| display | 28 / 34 px | 600 | Pergunta do workshop, boas-vindas do Início |
| code | 12 / 16 px, Space Mono | 400 | Códigos do pipeline, números de fatura, valores hex |
| brand-display | 32 / 38 px, Inter | 600 | Saudação do portal e títulos de destaque |

Valores monetários e tabelas usam algarismos tabulares, para as colunas alinharem.

### Espaço e grelha

- Base de 4 px: 4, 8, 12, 16, 24, 32, 48, 64.
- Barra lateral com 240 px (64 px recolhida); barra superior com 48 px.
- Margem do conteúdo: 24 px no portátil, 32 px em ecrãs largos, 16 px no telemóvel.
- Coluna de leitura com 720 px no máximo para documentos, mapas e estratégias.
- Linhas de tabela com 40 px; modo compacto com 32 px.

### Forma

- **Raios:** 6 px em campos, 8 px em botões, 12 px em cartões e painéis, 16 px em diálogos; etiquetas totalmente arredondadas.
- **Bordas:** 1 px com o token border em todos os cartões.
- **Sombras:** nenhuma em cartões. Só menus, popovers e diálogos têm uma sombra suave, para se separarem do fundo.
- **Ícones:** Lucide, 16 px na interface e 20 px na navegação, traço de 1,5 px.

### Movimento

| Token | Duração | Uso |
| --- | --- | --- |
| fast | 120 ms | Hover, pressionar, mudar de separador |
| base | 180 ms | Menus, popovers, tooltips |
| slow | 240 ms | Painéis laterais, diálogos, troca de fase no workshop |
| morph | 300 ms, mola sem ressalto | Elementos partilhados: indicador de separador, item ativo do menu, botão que abre o seu painel, listas que se reordenam, números que rolam |
| moment | 600 ms a 1,2 s | Só momentos do cliente: aprovação final, pagamento, publicação do hub |

Todas as transições usam ease-out; o morph usa uma mola sem ressalto. Só se animam transform e opacity (e a altura nas secções que abrem). A animação vem da biblioteca Motion, carregada a pedido. Com "reduzir movimento" ativo no sistema, as transições passam a instantâneas, os números aparecem no valor final e os momentos passam a uma mudança de estado sem animação.

## Componentes e estados

Quase todos os componentes vêm de bibliotecas prontas e são ajustados aos tokens. Só três são construídos de raiz, porque não existem prontos: o mapa de posicionamento, o comentário posicionado e o editor do Brand Hub.

### Inventário

| Componente | Uso no OS | Base |
| --- | --- | --- |
| Botão | Principal (sólido), secundário (contorno), fantasma, destrutivo, link; tamanhos sm e md | shadcn/ui Button |
| Etiqueta de estado | Ponto + texto, nos tons do estado | shadcn/ui Badge, ajustado |
| Cartão de documento | Ícone, título, etiqueta, linha de origem; borda forte em hover | shadcn/ui Card |
| Barra lateral | Os dois níveis (estúdio e sala), recolhível | shadcn/ui Sidebar |
| Paleta de comandos | ⌘K: navegar, procurar clientes, negócios e tarefas, criar | shadcn/ui Command (cmdk) |
| Tabela | Listas, faturas, candidaturas, auditoria | shadcn/ui Table + TanStack Table |
| Quadro | Pipeline e tarefas em quadro | dnd-kit |
| Separadores segmentados | Passos · Plano; Workshop · Respostas · Estratégia; Editar · Pré-visualizar | shadcn/ui Tabs ou Toggle Group |
| Diálogo, painel lateral, popover, menu, tooltip | Confirmações, detalhes rápidos, ações | shadcn/ui |
| Formulários | Validação junto ao campo, gravação automática | shadcn/ui Form + React Hook Form + Zod |
| Notificações breves | Confirmações com referência ("Fatura FT 2026/014 emitida") | Sonner |
| Progresso | Barra fina de 4 px; segmentada no workshop | shadcn/ui Progress |
| Escolha de traços | Chips selecionáveis com limite de escolhas e "palavra sua" | shadcn/ui Toggle, ajustado |
| Escala hoje/meta | Deslizador com dois valores por traço | shadcn/ui Slider |
| Mapa de posicionamento | Dois eixos, pontos "hoje" e "meta" arrastáveis | **Construído de raiz** (SVG) |
| Carregamento de ficheiros | Arrastar e largar, pastas inteiras, progresso | react-dropzone |
| Visualizador | Figma incorporado, PDF, vídeo, imagem | iframe do Figma, react-pdf, vídeo nativo |
| Comentário posicionado | Ponto na imagem ou PDF, tempo no vídeo | **Construído de raiz** sobre o visualizador |
| Editor do Brand Hub | Páginas, blocos, painel de design | **Construído de raiz**, com componentes shadcn por dentro |
| Gráficos | Relatórios e dinheiro: linhas mensais e barras empilhadas | **Construído de raiz** (SVG, sem dependência), com a escala de dados |
| Calendário | Seletores de data e vistas de semana e mês | shadcn/ui Calendar e uma biblioteca de agenda |

### Criar e editar

- Criar um item de topo é sempre um botão principal identificado no cabeçalho ("+ Nova tarefa"), que abre um diálogo (formulários curtos) ou um painel lateral (formulários longos). Ao concluir, o painel fecha e aparece uma notificação.
- Criar um filho dentro de uma lista é uma linha inline ("+ Adicionar subtarefa").
- Editar é um botão "Editar" que abre o mesmo diálogo. Secções que abrem e fecham servem só para divulgar informação, nunca para esconder formulários.

### Estados que todo o componente tem de ter

| Estado | Como se mostra |
| --- | --- |
| Hover | Borda ou fundo um tom acima, em 120 ms |
| Foco | Anel de 2 px com o token accent, sempre visível ao navegar com o teclado |
| Desativado | Opacidade a 50% e motivo num tooltip quando não é óbvio |
| A carregar | Esqueleto com a forma do conteúdo; botões mantêm o texto e mostram um indicador |
| Vazio | Até três ícones em leque, uma frase sobre o que aparece ali e a ação para começar; nas listas grandes, linhas fantasma atrás do texto |
| Erro | O que aconteceu e o que fazer, junto ao sítio do erro, com "Tentar de novo" |
| Bloqueado | Ícone de cadeado e o motivo ("Aprovado pelo cliente a 16/04; crie uma nova versão para alterar") |

## Bibliotecas de UI

O OS não cria componentes de raiz quando já existem prontos. Mas misturar várias bibliotecas completas dá uma interface incoerente, por isso cada biblioteca tem um papel definido: uma é a base, as outras entram só onde acrescentam.

| Biblioteca | Papel | Onde usar | Onde não usar |
| --- | --- | --- | --- |
| [shadcn/ui](https://ui.shadcn.com/) | **Base de todo o OS.** Os componentes são copiados para o repositório e ajustados aos tokens | Todos os ecrãs da equipa e do portal | — |
| [Base UI](https://base-ui.com/) | Primitivos acessíveis sem estilo | Componentes que o shadcn não tem, estilizados com os tokens | Nunca dois primitivos diferentes para o mesmo componente |
| [Animate UI](https://animate-ui.com/) | Versões animadas de componentes ao estilo shadcn | Micro-interações no portal: separadores, acordeões, contadores | Ecrãs de trabalho densos |
| [Magic UI](https://magicui.design/) | Componentes animados de efeito | Momentos do cliente (aprovação final, pagamento, publicação) e o site | Ecrãs de trabalho |
| [Aceternity UI](https://ui.aceternity.com/) | Efeitos visuais fortes | Site da Aurion e montras do Brand Hub | Qualquer ecrã do OS |
| [React Bits](https://reactbits.dev/) | Texto e fundos animados | Site e capas do portal, com moderação | Qualquer ecrã de trabalho |
| [Uiverse](https://uiverse.io/) | Peças da comunidade em HTML e CSS | Inspiração ou peças isoladas (loaders, interruptores), reescritas com os tokens | Copiar sem rever código e licença |
| [HeroUI](https://heroui.com/) | Sistema de design completo e próprio | Não usar: duplicaria a base | Todo o OS |
| [daisyUI](https://daisyui.com/) | Plugin de Tailwind com temas próprios | Protótipos rápidos fora do OS | Todo o OS: os temas chocam com os tokens |

### Regras

1. **Uma base.** shadcn/ui com Tailwind e os tokens deste documento. Tudo o que vem de fora adapta-se aos tokens; nunca o contrário.
2. **Animação com lugar certo.** Nos ecrãs de trabalho: transições e morphs funcionais até 300 ms, que mostram de onde vem e para onde vai cada coisa; nada anima em ciclo nem atrasa uma ação. No portal: micro-interações e um momento de celebração por evento. Efeitos fortes ficam no site.
3. **Copiar, não instalar tudo.** Traz-se só o componente necessário, não a biblioteca inteira.
4. **Origem registada.** Cada componente importado vive em components/ui ou components/motion, com a origem, a versão e a licença registadas num ficheiro de inventário.
5. **Licenças verificadas.** Cada componente é verificado antes de entrar, com atenção às versões pagas e a licenças que restringem o uso em produtos vendidos, porque o OS pode vir a ser vendido (M22).
6. **Acessibilidade obrigatória.** Um componente só entra se funcionar com teclado, tiver foco visível, ler bem num leitor de ecrã e respeitar "reduzir movimento".
