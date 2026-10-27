# Plano — RD-8 Construtor de contrato

Spec: [RD-8](../specs/2026-10-27-rd-8-contract-builder-design.md) · Branch: `feat/rd-1-home` (sobre a RD-0)

1. Testes de `parseModules`, `moduleClauses` e `PAYMENT_PRESETS`; depois o domínio `contracts/domain/modules.ts` com a biblioteca de cláusulas (pt-PT e en).
2. Campo `{{opcao.modulos}}` no template e na renderização, com teste; dados de exemplo com módulos.
3. Coluna `proposal_options.modules` (migração `20261027191139_proposal_option_modules`); a proposta valida, guarda e lê os módulos; a aceitação passa-os ao contrato.
4. Teste de componente; depois `ModuleBuilder` e `PaymentPresets` no editor da opção; traduções.
5. `ContractText` para ler o contrato no ecrã (negócio, portal e pré-visualização do template); `###` no PDF.
6. Template por defeito com a estrutura curta da marca.
7. Verificação: typecheck, lint, Prettier, unitários; migração aplicada em dev e testes de base de dados quando não houver e2e a correr; `STATUS.md`.
