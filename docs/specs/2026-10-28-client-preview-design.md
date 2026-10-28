# Pré-visualização do portal ("Ver como cliente")

Data: 2026-10-28 · Programa de redesenho 2 · Estado: aprovado pelo fundador (autonomia total, 2026-10-26)

## Problema

"Ver como cliente" abria sempre o mesmo ecrã: as fases e as atualizações do projeto. Em Documentos, Brand Hub, Retainer ou Academia, a equipa não via o que o cliente vê nesse ecrã: os documentos partilhados, as aprovações pendentes, o consumo do retainer, os materiais da academia. A pré-visualização era um ecrã à parte, mantido em paralelo com o portal, e desatualizava-se com ele.

## Objetivo

A pré-visualização é o próprio portal, lido como o decisor do cliente o lê, em todos os ecrãs. A equipa entra pela secção em que está, navega pelo portal inteiro e sai para a sala.

## Decisões

1. **O portal real, não uma cópia.** Não há ecrãs de pré-visualização. A equipa abre as rotas `/portal/...`, com o menu, os ecrãs e os carregadores do cliente. Qualquer melhoria no portal aparece na pré-visualização.
2. **Entrada pela secção.** "Ver como cliente" passa a estar em todos os ecrãs da sala e abre o ecrã do portal correspondente:

   | Sala                                | Portal                       |
   | ----------------------------------- | ---------------------------- |
   | Atualizações                        | Atualizações (mesmo projeto) |
   | Documentos, Relatórios              | Documentos                   |
   | Biblioteca                          | Biblioteca                   |
   | Brand Hub                           | Brand Hub                    |
   | Academia                            | Academia                     |
   | Retainer, Resultado                 | Progresso                    |
   | Painel, Tarefas, Agenda, Resultados | Início do portal             |

3. **Quem pode pré-visualizar.** O fundador, e o gestor de projeto atribuído ao cliente (`app.can_preview_client`). Finanças e freelancers não, porque o decisor vê faturas, valores e projetos fora do seu âmbito.
4. **Na base de dados, só leitura.**
   - `app.is_client_member` aceita também quem pode pré-visualizar, como decisor e só para o cliente indicado em `app.preview_client`;
   - essa aceitação só vale numa transação só de leitura. Uma aprovação, um comentário ou uma decisão nunca passam, nem por engano da aplicação;
   - a identidade no token continua a ser a da pessoa da equipa, e as restantes regras de acesso não mudam.
5. **Na aplicação.**
   - Um cookie `portal_preview` com o cliente, `httpOnly`, válido por 2 horas e limitado aos caminhos do portal (`/portal` e `/en/portal`). Fora do portal não é enviado.
   - O guarda do portal confirma a permissão na base de dados e devolve uma sessão de pré-visualização: as credenciais da equipa com `preview_client`, que o contexto da base de dados transforma numa transação só de leitura.
   - As ações do servidor pedidas a partir do portal durante a pré-visualização não recebem sessão, por isso não agem em nome do cliente.
   - Uma faixa em todos os ecrãs diz "Está a ver o portal como {cliente} o vê" e oferece "Sair da pré-visualização", que limpa o cookie e volta à sala.
   - No início do portal não aparece o acolhimento do primeiro acesso, e a saudação não usa o nome da pessoa da equipa.

## Fora de âmbito

- **Escolher o papel da pré-visualização** (operacional, financeiro). Começa pelo decisor, que vê mais. Revisitar se a equipa precisar de confirmar o que um operacional não vê.

## Testes

- RLS: a pré-visualização lê as vistas do portal do cliente indicado, só numa transação só de leitura, só para o fundador e o gestor atribuído, sempre como decisor; os membros do cliente não mudam.
- Contexto da base de dados: credenciais de pré-visualização ficam só de leitura e mantêm a identidade da equipa.
- Carregador real (documentos do portal) com credenciais de pré-visualização.
- Caminhos: secção da sala para o ecrã do portal; cookie em cada prefixo de idioma.
- e2e: da sala às atualizações do portal, com a faixa, sem conteúdo interno, e saída para a sala.

## Critérios de conclusão

- Migração `20261028111253_client_preview` aplicada no dev; testes de RLS verdes.
- `STATUS.md` atualizado.
