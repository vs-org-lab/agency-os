# Quadro de tarefas

Data: 2026-11-09 · Estado: aprovado pelo fundador (autonomia total, 2026-11-09)

## Problema

As tarefas (S-03 e C-03) são uma tabela ordenada por prazo. Serve para planear o dia, mas não mostra o que já está a ser feito nem o que está parado. Uma tarefa só tem dois estados, aberta e concluída, por isso "estou a tratar disto" não fica registado em lado nenhum.

## Objetivo

Uma vista em quadro com três colunas, Por fazer, Em curso e Concluídas, ao lado da tabela, com a passagem de uma coluna para outra a arrastar ou pelo teclado. A tabela continua a ser a vista por defeito.

## Decisões

1. **"Em curso" é uma data, não um estado novo.** A tabela `tasks` ganha `started_at` (com fuso, opcional). Uma tarefa está:

   | Coluna     | Regra                                       |
   | ---------- | ------------------------------------------- |
   | Por fazer  | `status = 'open'` e `started_at` vazio      |
   | Em curso   | `status = 'open'` e `started_at` preenchido |
   | Concluídas | `status = 'done'`                           |

   O enum `task_status` não muda. As consultas que hoje leem `status = 'open'` (Início, avisos de tarefa, pesquisa, kickoff) continuam a tratar uma tarefa em curso como aberta, que é o que querem dizer.

2. **Mudar de coluna.**
   - Para Por fazer: aberta, sem `started_at` nem `completed_at`.
   - Para Em curso: aberta, `started_at` mantém-se se já existia ou passa a agora, sem `completed_at`.
   - Para Concluídas: concluída, `completed_at` agora, `started_at` mantém-se.
   - Quem pode: as mesmas pessoas que concluem a tarefa hoje (quem pode escrever na sala, ou o fundador e os gestores de projeto nas tarefas do estúdio, e a pessoa atribuída).
   - Reabrir pela caixa de verificação da tabela devolve a tarefa à coluna de onde veio: Em curso se tinha `started_at`, Por fazer se não.

3. **A vista.**
   - Seletor Lista e Quadro no topo, como no Pipeline, guardado no endereço (`view=board`) e mantendo os filtros de cliente e de responsável.
   - No quadro, o filtro de estado não aparece, porque as colunas são os estados.
   - A coluna Concluídas mostra só as tarefas concluídas nos últimos 14 dias, para não crescer sem fim, com uma ligação para a lista de concluídas.
   - Por fazer e Em curso ordenam por prazo (sem prazo no fim); Concluídas pela conclusão mais recente.

4. **O cartão.**
   - Caixa de verificação para concluir ou reabrir, título que abre o painel da tarefa.
   - A marca do cliente (`ClientAvatar`) com o nome, só nas tarefas do estúdio (S-03); "Estúdio" quando a tarefa não tem cliente.
   - O prazo por urgência: em atraso a vermelho (`danger`), hoje e amanhã a laranja (`warning`), os restantes em texto secundário; nas concluídas, sem cor.
   - Responsável (avatar), subtarefas feitas sobre o total e comentários, quando existem.
   - Um botão "Mover" com as outras colunas, a alternativa ao arrastar para o teclado e os leitores de ecrã.
   - Quem não pode mudar a tarefa vê o cartão sem pega, sem "Mover" e sem caixa de verificação ativa.

5. **Feedback.** A mudança aparece logo e é confirmada pelo servidor; se falhar, o cartão volta à coluna de origem e o aviso de erro das tarefas diz porquê. Arrastar pelo teclado é anunciado em português.

6. **Na tabela.** Uma tarefa em curso mostra a etiqueta "Em curso" junto ao título.

7. **Ecrã estreito.** Abaixo de 768 px as colunas ficam empilhadas na vertical, sem deslocamento horizontal.

## Fora de âmbito

- **Ordem manual dentro da coluna.** A ordem é por prazo. Revisitar se a equipa pedir prioridades sem prazo.
- **Colunas configuráveis** (por exemplo "Em revisão"). Revisitar quando houver um fluxo de revisão interno que não passe pelo proofing.
- **Cursores e presença em tempo real.** Gastam o tempo real do Supabase de forma contínua; não compensa para uma equipa pequena.

## Testes

- Domínio: coluna de uma tarefa; montagem das colunas (ordem, janela de 14 dias); urgência do prazo.
- Serviço (base de dados): cada passagem entre colunas e as datas que deixa; quem pode e quem não pode; reabrir devolve a Em curso quando havia `started_at`.
- Componente: o quadro mostra as três colunas com as contagens; "Mover" chama a ação e mostra a mudança; uma falha devolve o cartão e anuncia o erro; sem permissão não há controlos.
- e2e: abrir o quadro nas tarefas do estúdio e passar uma tarefa para Em curso com "Mover".

## Critérios de conclusão

- Migração da coluna `started_at` aplicada no dev; testes verdes.
- `STATUS.md` atualizado.
