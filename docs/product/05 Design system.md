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

- **Aurion Blue** é o acento interativo: links, foco, seleção, progresso.
- **Aurion Gold** é raro: marcos atingidos, celebrações, o selo da garantia. Nunca como cor de estado de aviso, para não ser confundido.
- **Ink e Navy** são a base do modo escuro.
- **Fraunces** aparece só em títulos que o cliente vê (boas-vindas do portal, documentos gerados pela Aurion). A interface de trabalho usa só Inter.

## Tokens de cor

Toda a cor da interface vem destes tokens; nenhum componente usa um valor hexadecimal direto. Todas as combinações de texto abaixo passam o contraste AA (4,5:1 ou mais), verificado no cálculo WCAG. O modo segue o sistema por defeito e pode ser trocado na barra lateral.

### Superfícies e texto

| Token | Claro | Escuro | Uso |
| --- | --- | --- | --- |
| canvas | #FBFBFB | #0A0F15 | Fundo da aplicação |
| surface | #FFFFFF | #11171E | Cartões, painéis, barra lateral |
| surface-muted | #F4F5F7 | #0D1319 | Cabeçalhos de tabela, áreas de entrada, item ativo do menu |
| border | #E7E8EB | #232C36 | Bordas e divisores |
| border-strong | #D3D6DB | #2F3A46 | Borda em hover, campos com foco perdido |
| text | #0B1117 | #ECEFF3 | Texto principal |
| text-secondary | #5B6672 | #9AA5B1 | Descrições, metadados |
| text-tertiary | #6B7480 | #7D8894 | Datas, contadores, texto de ajuda |

### Ação e marca

| Token | Claro | Escuro | Uso |
| --- | --- | --- | --- |
| primary | #0B1117 | #ECEFF3 | Fundo do botão principal |
| primary-foreground | #FFFFFF | #0B1117 | Texto do botão principal |
| accent | #0A7FD1 | #4FA8EC | Foco, seleção, barras de progresso (Aurion Blue) |
| link | #0A6FB8 | #4FA8EC | Links e texto interativo |
| gold | #D9A441 | #F0B342 | Marcos, celebrações, selo da garantia; nunca texto sobre fundo claro |

### Estados

Cada estado tem uma cor de texto e um fundo suave, usados juntos nas etiquetas com ponto.

| Token | Texto claro | Fundo claro | Texto escuro | Fundo escuro | Exemplos |
| --- | --- | --- | --- | --- | --- |
| neutral | #5B6672 | #F4F5F7 | #9AA5B1 | #161D25 | Rascunho, Por fazer |
| info | #0A6FB8 | #E7F2FB | #6CB6EE | #0E2A3F | Com o cliente, Enviado, Em curso |
| success | #1F7A45 | #E8F5EC | #4CC27F | #12301F | Aprovado, Assinado, Pago, Feito |
| warning | #A04F06 | #FDF0E1 | #F2A65A | #3A2410 | A vencer, Perto do limite, Bloqueado |
| danger | #B42F25 | #FCE9E7 | #F2776D | #3A1714 | Vencida, Recusado, Erro |

O aviso é laranja e não amarelo, para nunca se confundir com o dourado da marca. Os estados nunca dependem só da cor: a etiqueta tem sempre o texto do estado.

## Tipografia, espaço, forma e movimento

Uma família para trabalhar (Inter), uma para códigos (Space Mono) e uma para os títulos que o cliente vê (Fraunces). O resto da escala é deliberadamente curta.

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
| brand-display | 32 / 38 px, Fraunces | 500 | Boas-vindas do portal e documentos gerados pela Aurion |

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
| moment | 600 ms a 1,2 s | Só momentos do cliente: aprovação final, pagamento, publicação do hub |

Todas as transições usam ease-out. Com "reduzir movimento" ativo no sistema, as transições passam a instantâneas e os momentos passam a uma mudança de estado sem animação.

## Componentes e estados

Quase todos os componentes vêm de bibliotecas prontas e são ajustados aos tokens. Só três são construídos de raiz, porque não existem prontos: o mapa de posicionamento, o comentário posicionado e o editor do Brand Hub.

### Inventário

| Componente | Uso no OS | Base |
| --- | --- | --- |
| Botão | Principal (sólido), secundário (contorno), fantasma, destrutivo, link; tamanhos sm e md | shadcn/ui Button |
| Etiqueta de estado | Ponto + texto, nos tons do estado | shadcn/ui Badge, ajustado |
| Cartão de documento | Ícone, título, etiqueta, linha de origem; borda forte em hover | shadcn/ui Card |
| Barra lateral | Os dois níveis (estúdio e sala), recolhível | shadcn/ui Sidebar |
| Paleta de comandos | ⌘K: navegar, procurar, criar | shadcn/ui Command |
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
| Gráficos | Relatórios, resultado acordado, dinheiro | shadcn/ui Charts (Recharts) |
| Calendário | Seletores de data e vistas de semana e mês | shadcn/ui Calendar e uma biblioteca de agenda |

### Estados que todo o componente tem de ter

| Estado | Como se mostra |
| --- | --- |
| Hover | Borda ou fundo um tom acima, em 120 ms |
| Foco | Anel de 2 px com o token accent, sempre visível ao navegar com o teclado |
| Desativado | Opacidade a 50% e motivo num tooltip quando não é óbvio |
| A carregar | Esqueleto com a forma do conteúdo; botões mantêm o texto e mostram um indicador |
| Vazio | Ícone, uma frase sobre o que aparece ali e a ação para começar |
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
2. **Animação com lugar certo.** Nos ecrãs de trabalho: só transições funcionais até 240 ms. No portal: micro-interações e um momento de celebração por evento. Efeitos fortes ficam no site.
3. **Copiar, não instalar tudo.** Traz-se só o componente necessário, não a biblioteca inteira.
4. **Origem registada.** Cada componente importado vive em components/ui ou components/motion, com a origem, a versão e a licença registadas num ficheiro de inventário.
5. **Licenças verificadas.** Cada componente é verificado antes de entrar, com atenção às versões pagas e a licenças que restringem o uso em produtos vendidos, porque o OS pode vir a ser vendido (M22).
6. **Acessibilidade obrigatória.** Um componente só entra se funcionar com teclado, tiver foco visível, ler bem num leitor de ecrã e respeitar "reduzir movimento".
