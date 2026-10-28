# Início do portal, primeiros passos e visita guiada

Data: 2026-10-28 · Programa de redesenho 2 · Estado: aprovado pelo fundador (autonomia total, 2026-10-26)

## Problema

O início do portal abria com o retainer, que só existe depois do projeto inicial e que muitos clientes não têm. O progresso do projeto vinha abaixo, como uma faixa de fases. Quando nada esperava pelo cliente, a lista de ações desaparecia, sem lhe dizer que estava tudo em dia. O acolhimento era um diálogo de três textos que não mostrava onde as coisas estão.

## O que o cliente procura ao abrir o portal

1. Onde está o meu projeto e o que vem a seguir.
2. Se alguma coisa espera por mim.
3. Nos primeiros dias, o que tenho de fazer para começar.
4. O que mudou desde a última vez.
5. Só depois, o plano mensal e os resultados, para quem os tem.

## Decisões

1. **Ordem do início:**
   - saudação com uma frase de estado ("O seu projeto Rebrand está na fase Produção");
   - cartão do projeto e "A sua vez", lado a lado;
   - "Primeiros passos", enquanto houver passos por fazer;
   - "Últimas atualizações" e "Documentos recentes", lado a lado;
   - o retainer, os resultados, a proposta, as apresentações e o briefing.
2. **Cartão do projeto:**
   - nome, estado (em curso, à espera da sua aprovação, concluído) e percentagem concluída;
   - barra por fase e a lista das fases, com a atual destacada;
   - fase atual e próximo passo com data;
   - "Ver o projeto" e "Linha temporal".
   - Sem projeto, diz que começa em breve e quando aparece.
3. **A sua vez:** está sempre presente. Sem nada pendente, diz "Está tudo em dia. Avisamos quando precisarmos de si."
4. **Primeiros passos:**
   - só os passos que se aplicam a quem lê, na ordem do envolvimento:
     - conhecer o portal (a visita);
     - rever e aceitar a proposta;
     - assinar o contrato;
     - pagar o primeiro pedido;
     - convidar a equipa, para o decisor.
   - Cada passo leva ao ecrã onde se faz. A lista esconde-se quando está completa ou quando o cliente a esconde (marcador `portal_getting_started`).
5. **Visita guiada:**
   - substitui o diálogo de boas-vindas e abre no primeiro acesso;
   - tem uma paragem por zona: projeto, a sua vez, aprovações, documentos, Brand Hub, atualizações e plano e resultado. Cada paragem destaca a zona no ecrã;
   - as paragens sem alvo visível ficam de fora, por exemplo a barra lateral fechada no telemóvel;
   - pode ser saltada, navega-se pelo teclado (setas, Escape, foco preso no cartão) e repete-se a partir dos primeiros passos;
   - concluir ou saltar regista o marcador `portal_onboarding`. Na pré-visualização da equipa não abre sozinha.
6. **Linha temporal no portal:** a página do projeto alterna entre "Passos" e "Linha temporal" (`?view=timeline`), com o mesmo gráfico da sala.
7. **Documentos do portal:**
   - o que espera pela revisão do cliente vem primeiro ("Para rever");
   - cada cartão mostra o projeto e a data;
   - o estado usa as palavras do cliente ("Para rever", "Aprovado"), não as da equipa ("Com o cliente").

## Fora de âmbito

- **Gestor do projeto no início** (nome e contacto de quem acompanha o cliente). O portal não tem uma vista da equipa atribuída. Revisitar quando houver mensagens no portal.
- **Próxima reunião no início.** A agenda não é lida pelo cliente. Revisitar com a agenda no portal.
- **Questionário de onboarding preenchido pelo cliente.** Não existe ainda. Quando existir, entra como passo dos primeiros passos.

## Testes

- Passos aplicáveis por papel e estado (proposta, contrato, pagamento, equipa).
- Visita: abre no primeiro acesso, salta paragens sem alvo, regista uma vez ao saltar ou concluir, recomeça a pedido, fecha com Escape.
- Cartão do projeto, estado vazio de "A sua vez", grupo "Para rever" nos documentos, alternância da linha temporal.
- Marcadores por área na base de dados.
- e2e do portal com a visita.
