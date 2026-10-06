# 0006 — Quem convida utilizadores do cliente

- **Data:** 2026-10-07
- **Estado:** Aceite

## Contexto

O spec da fundação (secção 6) previa que o gestor de projeto atribuído pudesse convidar utilizadores do cliente. A matriz de acesso do separador 08, que prevalece em segurança, não dá ao gestor nenhuma permissão sobre "Permissões e utilizadores": só o fundador gere utilizadores e o decisor convida colegas da própria sala.

## Decisão

- Convidam utilizadores do cliente: o fundador (qualquer cliente) e o decisor do cliente (só o próprio cliente).
- Alteram pertenças de cliente (papel, revogação, arquivo): só o fundador.
- A regra vale na aplicação (`authorize`) e na base de dados (políticas `client_memberships_insert` e `client_memberships_update`).

## Alternativas rejeitadas

- **O gestor atribuído também convida:** mais conveniente no dia a dia, mas dá a quem não é sócio da agência o poder de abrir acessos a dados de clientes, contra o princípio de privilégio mínimo do separador 08.

## Consequências

- O gestor pede ao fundador ou ao decisor do cliente que convide novos contactos.
- Se a operação crescer, a regra pode ser revista acrescentando a permissão `invite` ao gestor na matriz e na política, num único PR revisto.
