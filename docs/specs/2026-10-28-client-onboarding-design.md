# Onboarding do cliente adaptado ao briefing e ao âmbito

Data: 2026-10-28 · Programa de redesenho 2 · Estado: aprovado pelo fundador (autonomia total, 2026-10-26)

## Problema

Depois da reunião em que se preenche o briefing, a equipa pede ao cliente, por email e um a um, os ficheiros e os acessos de que precisa. Os pedidos dependem do que o cliente disse (já tem identidade visual?) e do que contratou (redes sociais, anúncios, site). O portal não sabia nada disto e mostrava a todos os clientes os mesmos primeiros passos.

## Objetivo

O modelo de briefing passa a definir o que se pede ao cliente e em que condições. Assim que o briefing é preenchido, o cliente vê no portal só os pedidos que se aplicam a ele, responde ou envia ficheiros ali mesmo, e a equipa acompanha o progresso na sala.

## Decisões

1. **Respostas estruturadas no briefing:**
   - os pedidos e as perguntas estruturadas vêm do modelo de briefing **ativo**, para que um modelo publicado agora chegue também aos clientes cujo Core começou numa versão anterior;
   - uma pergunta do modelo pode ter, além da nota livre, uma resposta "Sim / Não" ou de escolha (2 a 8 opções);
   - a resposta grava-se na nota da pergunta (`core_briefing_notes.answer`), no modo chamada e no separador Core.
2. **Pedidos de onboarding no modelo de briefing:**
   - cada pedido (até 20) tem um título, uma explicação e um tipo:
     - `upload`: enviar ficheiros;
     - `text`: responder por escrito;
     - `access`: dar acesso;
     - `confirm`: confirmar que está feito;
   - e uma condição:
     - sempre;
     - uma resposta do briefing ("Já tem identidade visual?" = Sim);
     - um módulo do contrato aceite (A vídeo, B redes sociais, C anúncios, D web, E automações).
   - O modelo valida que uma condição de resposta aponta para uma pergunta com resposta estruturada e para um valor que existe.
3. **Sem palavras-passe.** Os pedidos de acesso pedem que o cliente convide o email da agência como colaborador. O modelo sugerido já vem escrito assim, e nenhum campo do portal pede credenciais.
4. **Avaliação viva.**
   - Os pedidos são calculados a cada leitura a partir do briefing mais recente do cliente, das respostas e dos módulos do contrato aceite desse negócio. Corrigir uma resposta corrige os pedidos.
   - O que fica guardado é a resposta do cliente a cada pedido (`client_onboarding_responses`).
5. **Durante a reunião,** a equipa vê no separador Core e no modo chamada a lista "Pedidos ao cliente" que o briefing gera nesse momento.
6. **No portal:**
   - os pedidos entram nos primeiros passos e têm uma página própria (`/portal/onboarding`);
   - o decisor e os operacionais respondem: enviam ficheiros, escrevem a resposta ou confirmam;
   - um pedido feito pode ser revisto e voltar a ser respondido.
7. **Ficheiros enviados:**
   - vão para a pasta raiz "Enviado pelo cliente" da biblioteca do projeto atual, visível ao cliente e criada na primeira vez, com a verificação de tipo e tamanho da biblioteca (SEC-30);
   - o decisor pode escrever só nessa pasta ([ADR 0009](../decisions/0009-client-onboarding-uploads.md));
   - sem projeto, o pedido de ficheiros espera pelo projeto.
8. **Na sala:** o painel do cliente mostra o progresso do onboarding, quem respondeu e quando, e permite pedir de novo um pedido já respondido.
9. **Modelos existentes:** o editor oferece "Usar pedidos sugeridos", que junta pedidos por módulo (redes sociais, anúncios, web) e um pedido de identidade visual. Este último fica ligado a uma pergunta Sim/Não, se o modelo a tiver.

## Também nesta entrega (adiados da entrega anterior)

- **A sua equipa** no início do portal: as pessoas da agência atribuídas ao cliente, com o papel e o email (vista `portal_client_team`).
- **Próxima reunião** no início do portal: o próximo evento da agenda com o cliente convidado, com a ligação da chamada (vista `portal_agenda_events`).
- **Progresso** no portal: resumo no topo (resultado e mês do retainer) e secções com título.
- **Papel na pré-visualização:** a equipa escolhe ver o portal como decisor, operacional ou financeiro do cliente (`app.preview_role`); quem pode pré-visualizar (fundador e gestor atribuído) já lê a faturação.

## Testes

- Esquema do modelo: condições inválidas recusadas; modelos antigos sem pedidos continuam válidos.
- Avaliação dos pedidos por resposta, módulo e "sempre".
- RLS: respostas do onboarding lidas pela equipa da sala e pelos membros do cliente; vistas da equipa e da agenda só para o cliente certo; pré-visualização por papel.
- Serviço: só membros respondem; resposta escrita obrigatória no tipo `text`; uploads só na pasta do cliente; a equipa pede de novo.
- Componentes: editor de pedidos, resposta estruturada, página de onboarding.
