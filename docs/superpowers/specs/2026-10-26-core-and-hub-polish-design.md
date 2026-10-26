# UX-6 — Core, Brand Hub e cronograma

Data: 2026-10-26 · Programa de redesenho da UI e UX · Estado: aprovado (autorização do fundador para o programa completo, 2026-10-26)

## Objetivo

Fechar o programa com os componentes guardados que ainda não têm lugar: pontuação do Core com deslizador, estados de IA mais vivos, paleta e proporções no Brand Hub, cronograma do projeto e um carregamento com a marca.

## Decisões

1. **Pontuação da grelha Orbit com deslizador** (padrão `slider-06` da 21st.dev e `wake-slider` do bencho, implementação própria em `packages/ui/src/components/score-slider.tsx`): substitui o campo numérico de pontos por critério. Mostra o valor e o máximo, marcas por ponto, polegar com morph ao arrastar, teclado (setas ±1, Home/End, PageUp/PageDown), `role="slider"` com `aria-valuemin/max/now/text`; mantém um `<input type="hidden" name="points-…">` para a server action atual. "Sem pontuação" continua possível (botão "Limpar").
2. **IA a pensar** (padrão `@yogesharc/thinking-orbs`, implementação própria `ThinkingOrbs`): três orbes com movimento suave enquanto o assistente do Core gera; com "reduzir movimento" fica um ponto estático com o texto "A pensar…". Texto gerado aparece com `ScrambleText` (padrão dqnamo `scramble-text`) só no título do resultado e uma vez; nunca no corpo nem em texto que o leitor de ecrã lê duas vezes (`aria-live` recebe o texto final).
3. **Paleta do Brand Hub** (padrão bencho `palette`): o painel de design mostra as cores como amostras grandes lado a lado; clicar abre um `Popover` com o seletor nativo e o hex; mostra o contraste do texto sobre cada cor (AA/AAA) calculado no cliente. Mesmo formato de dados.
4. **Proporção dos ativos** (padrão bencho `aspect`): no painel de ativos, a pré-visualização das imagens tem um seletor segmentado 1:1 · 4:5 · 16:9 · Original que só muda a moldura da pré-visualização (não grava).
5. **Cronograma** (padrão `gantt` da 21st.dev, implementação própria e leve em SVG/CSS grid): separador "Cronograma" no processo da sala, só leitura: uma linha por fase com barra do início ao fim (datas existentes do projeto e das fases/passos; sem datas → fica fora com nota), linha de hoje, zoom Semana/Mês, teclado para percorrer linhas. Sem arrastar.
6. **Carregamento com a marca** (padrão dqnamo `logo-trace-loader`): o `RouteLoading` do portal mostra o monograma do estúdio a ser traçado (stroke-dashoffset, token `slow`) por cima dos esqueletos; com "reduzir movimento" fica estático. Equipa continua só com esqueletos.

## Fora de âmbito

- Editar datas no cronograma, guardar a proporção escolhida.

## Testes

- `ScoreSlider` (teclado, aria, hidden input, limpar), `ThinkingOrbs`/`ScrambleText` (reduzir movimento, `aria-live` com o texto final), paleta (contraste calculado para cores conhecidas), proporção (moldura), cronograma (posições para datas conhecidas, linha de hoje, fases sem datas), loader (estático com reduzir movimento).
- E2E: o fluxo do Core continua a passar com o deslizador (atualizar o passo que preenche os pontos).

## Critérios de conclusão

- Componentes nos ecrãs, `STATUS.md` e `INVENTORY.md` atualizados.
