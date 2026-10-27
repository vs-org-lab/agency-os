# RD-0 — Fundação escura

Data: 2026-10-27 · Programa de redesenho 2 (RD-0 a RD-9) · Estado: aprovado pelo fundador (2026-10-27)

## Objetivo

Pôr o OS no registo visual aprovado na maquete (Design canvas "Agency OS — Direção visual RD"): escuro por defeito, quase monocromático, com todos os componentes legíveis no escuro, e a barra lateral com o lettering da marca, ícones animados e o menu de conta com tema e idioma.

## Direção de cor (substitui a do spec do programa)

- Escada de superfícies tingida de Ink: `canvas` #05090E, `surface` #0B1118, `surface-muted` #111821, barra lateral #070C12; hairlines #1A232D e #26313D.
- Texto #EDF0F3, secundário #9AA4AF, terciário #7C8792 (≥ 4,5:1 sobre `surface`).
- Botão principal, anéis, barras, indicadores e anel de foco em branco (`primary`/`accent` #EDF0F3); no claro, o equivalente em Ink.
- Cor só para estado: sucesso, aviso, perigo e informação, em tons contidos. Os logótipos dos clientes mantêm a sua cor.
- Dourado só no ponto do lettering e dentro dos documentos da marca.
- Gráficos: série principal em branco (Ink no claro), comparação em cinzento; as cores de estado só quando a série é um estado.

## Decisões

1. **Tokens:** `tokens.css` passa à paleta acima no escuro e ao equivalente monocromático no claro; novo token `--sidebar`. Nenhum componente usa hex direto.
2. **Tema por defeito:** `defaultTheme="dark"`; "Sistema" e "Claro" continuam disponíveis.
3. **Controlos nativos no escuro:** `select`, `option`, `checkbox`, `radio`, campos de data e barras de scroll herdam as superfícies e o `accent-color` do tema, para que nenhum controlo nativo fique claro sobre fundo escuro.
4. **Lettering:** `BrandWordmark` em `packages/ui/src/brand`, com os contornos de `References/Brand/Asset 4.svg` (sem a fonte "Refinity"), `currentColor` e o ponto em `--gold`. Entra no topo da barra lateral ao lado do símbolo; o nome da organização passa para o `title`.
5. **Menu de conta:** o rodapé da barra lateral passa a um botão com avatar, nome e email que abre um popover com:
   - Tema (Escuro, Claro, Sistema) e Idioma (Português, English), em separadores com indicador partilhado (`layoutId`);
   - "Terminar sessão".
     Os rádios mantêm os nomes acessíveis atuais. No modo compacto da barra só aparece o avatar.
6. **Ícones animados:** cada item de navegação recebe um movimento ao pairar, só com `transform` e com "reduzir movimento" respeitado:
   - subir: Início, Atualizações, Documentos, Faturas, Biblioteca, Colegas;
   - rodar: Definições, Brand Hub;
   - abanar: Agenda;
   - crescer: Pipeline, Relatórios;
   - desenhar o visto: Tarefas, Aprovações, Academia;
   - pulsar: Aquisição;
   - ponteiro: Plano e resultados;
   - recuar: o "Voltar" da sala.
7. **Movimento comum:** classes utilitárias em `globals.css` para entrada em cascata dos painéis (`rd-rise`) e elevação de cartões clicáveis (`rd-lift`), usadas a partir da RD-1.

## Fora de âmbito

Recomposição dos ecrãs (RD-1 em diante); substituição dos `select` nativos por seletores próprios em cada formulário (feita no redesenho de cada ecrã).

## Testes

- Unitários: `BrandWordmark` (rótulo acessível e ponto); menu de conta (abre, rádios de tema e idioma, terminar sessão, foco devolvido); mapa de movimento dos ícones; `ThemeProvider` com escuro por defeito.
- E2E: `preferences.spec.ts` abre o menu de conta antes de mudar tema e idioma; a verificação axe continua verde nos ecrãs existentes.

## Critérios de conclusão

- Escuro por defeito com a nova paleta; nenhum controlo nativo claro no escuro.
- Lettering, menu de conta e ícones animados na barra lateral.
- Direção de cor do spec do programa atualizada; `STATUS.md` atualizado.
