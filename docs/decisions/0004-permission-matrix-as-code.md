# 0004 — Matriz de acesso em código

- **Data:** 2026-10-06
- **Estado:** Aceite

## Contexto

O separador 08 exige que a matriz de acesso seja "configuração revista e auditada, não regras espalhadas pelo código".

## Decisão

A matriz vive num único ficheiro tipado (`apps/web/src/modules/access/matrix.ts`), lido pela função `authorize`. Cada alteração passa por PR, revisão e testes, e fica no histórico do git.

## Alternativas rejeitadas

- **Tabela `role_permissions` na base de dados:** permitiria alterar permissões em produção sem revisão nem testes, e perderia a verificação de tipos.

## Consequências

- Mudar uma permissão exige um deploy.
- As políticas RLS garantem o isolamento entre organizações e clientes; a matriz decide as ações permitidas dentro desse limite.
