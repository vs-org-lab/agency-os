# RD-5 — Brand Hub

Data: 2026-10-27 · Programa de redesenho 2 · Depende da RD-0 · Estado: aprovado pelo fundador (autonomia total, 2026-10-26)

## Objetivo

O Brand Hub publicado lê-se como um livro de marca editorial: páginas numeradas com títulos grandes, cores que se copiam com um clique e só as secções com conteúdo.

## Decisões

1. **Cabeçalho de página:** número na cor de destaque do hub e título em 36–64 px, peso 600 e tracking negativo. O nome acessível continua a ser "NN Título".
2. **Cores:**
   - cada amostra é um botão que copia o HEX;
   - por baixo, as linhas HEX, RGB e CMYK copiam cada uma o seu valor;
   - a confirmação "Copiado" aparece durante 1,6 s no controlo usado e é anunciada por `aria-live`;
   - o CMYK é aproximado a partir do RGB.
3. **Estratégia:** linhas de duas colunas (rótulo mono à esquerda, texto à direita) separadas por divisórias; missão e visão num corpo maior.
4. **Tipografia:** espécime "Aa" em 88 px, com nome, pesos e frase de exemplo em tamanho de título.
5. **Páginas vazias:**
   - o hub publicado omite as páginas sem conteúdo, tanto na navegação como no corpo;
   - a pré-visualização do editor (`showEmpty`) mostra-as com "Esta secção ainda não tem conteúdo.".
6. **Segurança:** mantém-se a limpeza do nome da família tipográfica e a ausência de `url()` ou posicionamento vindos do conteúdo publicado.

## Testes

- Componentes: copiar a amostra e os valores RGB/CMYK; páginas vazias omitidas no hub publicado e marcadas na pré-visualização; os testes existentes de navegação, data e conteúdo hostil continuam válidos.

## Critérios de conclusão

- Hub publicado e pré-visualização nos dois temas do hub.
- `STATUS.md` atualizado.
