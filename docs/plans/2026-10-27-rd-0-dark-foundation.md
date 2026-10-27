# Plano — RD-0 Fundação escura

Spec: [RD-0](../specs/2026-10-27-rd-0-dark-foundation-design.md) · Branch: `feat/rd-0-dark-foundation`

## Tarefas

1. **Tokens** (`packages/ui/src/styles/tokens.css`)
   - Paleta escura monocromática e equivalente claro; token `--sidebar` e mapeamento `--color-sidebar` em `globals.css`.
   - Verificar contraste ≥ 4,5:1 de texto secundário e terciário sobre `surface` e `canvas`.
2. **Controlos nativos** (`globals.css`, camada `base`)
   - `accent-color`, `select`/`option`, campos de data e barras de scroll com as superfícies do tema.
3. **Tema por defeito** (`packages/ui/src/theme/theme-provider.tsx`)
   - Teste: o fornecedor passa `defaultTheme="dark"`; depois a alteração.
4. **Lettering** (`packages/ui/src/brand/wordmark.tsx`, exportado em `@agency-os/ui/brand`)
   - Teste: rótulo acessível quando há `title`, decorativo sem ele, ponto com a cor `gold`; depois o componente.
5. **Seletores com indicador partilhado**
   - `ThemeToggle` e `LocaleSwitcher` com rótulos de texto e indicador `layoutId`.
   - Mesmos papéis e nomes acessíveis; teclado com setas mantido.
6. **Menu de conta** (`apps/web/src/components/shell/account-menu.tsx`)
   - Teste: o botão abre o popover; mostra tema, idioma e "Terminar sessão"; Esc fecha e devolve o foco; depois o componente e a ligação no `app-sidebar.tsx`.
7. **Ícones animados**
   - `NAVIGATION_ICON_MOTION` (ícone → movimento) e atributo `data-icon-motion` no ícone de cada item; keyframes e regras em `globals.css`.
   - Teste: o mapa cobre todos os ícones de navegação; depois a implementação.
8. **Utilitários de movimento:** `rd-rise` e `rd-lift` em `globals.css`, com "reduzir movimento".
9. **E2E:** `preferences.spec.ts` abre o menu de conta antes de cada mudança.
10. **Verificação:** typecheck, lint, Prettier, testes unitários; arranque local em escuro; `STATUS.md`.
