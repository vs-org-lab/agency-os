# 03 — User stories

## Personas

Seis pessoas usam o OS. As histórias abaixo referem-se a elas pelo nome do perfil.

| Persona | Contexto | O que quer do OS | O que não pode acontecer |
| --- | --- | --- | --- |
| Fundador | Vende, conduz diagnósticos, decide, coordena freelancers; trabalha muito a partir do Claude | Saber em 10 segundos o que precisa dele hoje; nunca inventar um preço nem copiar dados à mão | Perder um follow-up, uma fatura por cobrar ou um prazo de aprovação |
| Gestor de projeto | Futura contratação para coordenar salas | Mover projetos sem perguntar ao fundador onde está cada coisa | Ver valores ou dados de clientes que não gere |
| Freelancer | Designer, developer ou editor de vídeo num projeto | Saber o que entregar, até quando, com os ficheiros certos | Falar diretamente com o cliente sem passar pela Aurion |
| Cliente: decisor | CEO ou sócio de uma consultora, empresa de energia ou startup | Ver o estado num olhar, aprovar no telemóvel, ter a marca num link | Ter de procurar emails para saber o que foi acordado |
| Cliente: operacional | Diretor de marketing ou equipa interna | Comentar, carregar acessos e ficheiros, aprender a usar o que foi entregue | Ficar dependente da Aurion para tarefas simples |
| Cliente: financeiro | Contabilidade do cliente | Descarregar faturas certificadas e pagar | Receber faturas por canais dispersos |

## Histórias por módulo

Cada história tem critérios de aceitação no formato Dado · Quando · Então. Uma história só está pronta quando todos os critérios passam em teste automático.

### Candidaturas e pipeline

**US-01** Como fundador, quero que cada candidatura chegue já pontuada, para só falar com quem pode comprar.

- Dado uma candidatura com investimento abaixo de €10k, quando é submetida, então o caminho é C, sem olhar à pontuação.
- Dado uma candidatura com 9 pontos ou mais e sem eliminatórios, quando é submetida, então o visitante vê o calendário e o negócio fica em 0.2.
- Dado uma candidatura submetida, então a origem (UTM e página) e o consentimento ficam guardados com data.

**US-02** Como fundador, quero rever os leads B num só sítio, para decidir em segundos.

- Dado um lead B, quando clico em "Aprovar", então recebe o link de marcação; quando clico em "Enviar para C", então recebe o autodiagnóstico.

**US-03** Como fundador, quero ver cada negócio com código, responsável e prazo, para nunca perder um acompanhamento.

- Dado um negócio sem atividade há 3 dias depois da chamada, então aparece em "Hoje" com uma mensagem sugerida.
- Dado um negócio arrastado para outro código no quadro, quando a transição não é permitida, então o cartão volta ao lugar com a regra explicada.

### Diagnóstico e estratégia

**US-04** Como fundador, quero conduzir o workshop no ecrã partilhado, para o cliente responder comigo em tempo real.

- Dado o modo workshop, quando avanço para o passo seguinte, então a resposta anterior fica guardada sem clicar em guardar.
- Dado uma perda de ligação, então as respostas ficam guardadas no navegador e sincronizam quando a ligação volta.

**US-05** Como fundador, quero gerar o mapa a partir das respostas e da transcrição, para não escrever do zero.

- Dado respostas e transcrição, quando clico "Escrever o mapa", então recebo um rascunho com as secções manter, mudar, integrar e criar, cada item com porquê e impacto em euros.
- Dado um mapa já enviado ao cliente, quando gero de novo, então é criada uma nova versão e a versão enviada não muda.

**US-06** Como cliente decisor, quero aprovar o mapa no portal, para fechar o diagnóstico sem trocar emails.

- Dado um mapa enviado, quando aprovo, então fica bloqueado, com data e autor, e aparece em Documentos.
- Dado um mapa aprovado, quando a equipa tenta editá-lo, então o OS pede para criar uma nova versão.

### Documentos e faturação

**US-07** Como fundador, quero incorporar a proposta do Figma, para o cliente a ver com o design certo.

- Dado um link do Figma, quando o colo, então a proposta aparece com navegação de diapositivos.
- Dado um link que não está público, então o OS avisa antes de enviar ao cliente.

**US-08** Como cliente decisor, quero aceitar a proposta e assinar o contrato no portal, para começar sem burocracia.

- Dado uma proposta aceite, então o contrato é gerado com o âmbito, os valores, os marcos e a garantia preenchidos.
- Dado o contrato assinado por todos, então a fatura do primeiro marco é preparada e o link de pagamento é enviado.

**US-09** Como financeiro, quero que as faturas saiam certificadas sem as fazer à mão, para cumprir a lei sem esforço.

- Dado uma fatura preparada, quando é emitida, então o número, o ATCUD e o PDF vêm do software certificado.
- Dado uma falha do software certificado, então a fatura fica em Rascunho com o erro visível, e nada é enviado ao cliente.

**US-10** Como cliente financeiro, quero pagar a fatura com um clique, para não copiar dados bancários.

- Dado uma fatura Enviada, quando pago com cartão ou SEPA, então o estado passa a Paga sem intervenção da equipa.

### Salas, processo e aprovações

**US-11** Como fundador, quero abrir o Início e ver o que precisa de mim, para começar o dia sem procurar.

- Dado aprovações recebidas, faturas vencidas ou passos atrasados, então aparecem em "Hoje", ordenados por urgência.

**US-12** Como gestor de projeto, quero ver a sala exatamente como o cliente a vê, para não expor nada por engano.

- Dado "Ver como cliente", então nenhum item interno, valor de custo ou tarefa interna aparece.

**US-13** Como gestor de projeto, quero que um passo seja enviado sozinho quando o anterior termina, para o projeto não parar à espera de mim.

- Dado dois passos ligados, quando o primeiro fica Feito, então o segundo é enviado ao cliente e aparece no feed.

**US-14** Como cliente decisor, quero comentar diretamente sobre a imagem ou o vídeo, para explicar o que quero mudar.

- Dado um vídeo, quando comento, então o comentário fica no segundo exato em que o vídeo estava.
- Dado um pedido de alterações sem comentário, então o botão fica bloqueado.

**US-15** Como fundador, quero que uma fase com aprovação não avance sem ela, para nunca construir sobre algo que o cliente não aceitou.

- Dado uma fase por aprovar, quando tento marcar a fase seguinte como em curso, então o servidor recusa e explica porquê.

### Biblioteca e Brand Hub

**US-16** Como cliente operacional, quero descarregar uma pasta inteira, para não descarregar ficheiro a ficheiro.

- Dado uma pasta visível, quando clico em "Descarregar", então recebo um ZIP com o conteúdo atual.

**US-17** Como fundador, quero criar o Brand Hub a partir da estratégia aprovada, para não copiar texto.

- Dado uma estratégia aprovada, quando crio o hub, então as páginas de estratégia vêm preenchidas.

**US-18** Como cliente decisor, quero o Brand Hub no domínio da minha empresa, para a minha equipa e os meus fornecedores terem uma fonte única.

- Dado um domínio do cliente configurado, quando a equipa publica, então o site atualiza nesse domínio.
- Dado "Descarregar todos os ativos", então recebo um ZIP com os ficheiros da versão publicada.

### Retenção

**US-19** Como cliente decisor, quero ver quanto do retainer já usei este mês, para pedir sem surpresas.

- Dado o limite atingido, quando faço um pedido, então recebo um pedido extra com orçamento para aprovar antes do trabalho.

**US-20** Como fundador, quero acompanhar o resultado acordado e as condições do cliente, para saber se a garantia se aplica.

- Dado o prazo atingido sem a meta, e todas as condições do cliente cumpridas, então a garantia passa a Ativada e começa a contagem dos meses.
- Dado uma condição do cliente falhada, então fica registada com data e a garantia mostra o motivo de não se aplicar.

**US-21** Como fundador, quero ser lembrado da caixa de celebração na entrega, para o gesto nunca falhar.

- Dado um projeto entregue, então é criada a tarefa da caixa com a lista de itens e a morada do cliente.

### Agente

**US-22** Como fundador, quero perguntar ao Claude o que precisa de mim, para gerir o estúdio sem abrir o OS.

- Dado o agente ligado, quando pergunto, então a resposta vem dos dados reais do OS, com links para cada item.
- Dado um pedido para enviar algo ao cliente, então o agente prepara o rascunho e pede confirmação antes de enviar.
