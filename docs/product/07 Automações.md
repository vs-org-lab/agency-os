# 07 — Automações

## Motor e convenções

As automações correm em duas camadas: dentro do OS para tudo o que mexe em dinheiro, estados ou permissões, e no n8n para o que muda com frequência. Uma automação que altera o código do pipeline, uma fatura ou um acesso nunca vive só no n8n.

| Camada | O que corre lá | Porquê |
| --- | --- | --- |
| OS (fila de eventos) | Pontuação, mudanças de estado, faturação, aprovações, bloqueios, garantia | Determinístico, testado e auditado, dentro das regras de autorização |
| n8n | Mensagens internas, enriquecimento de contactos, relatórios auxiliares, ligações a ferramentas novas | Muda sem novo deploy; um erro aqui não corrompe dados |

### Convenções

- **Nome dos eventos:** domínio.entidade.ação, no passado (candidatura.submetida, documento.aprovado, fatura.paga).
- **Código:** cada automação tem um código AUT-xx, um responsável, o evento, a condição, a ação e o estado do pipeline que muda.
- **Uma vez só:** cada execução tem uma chave única; um evento repetido não faz a ação duas vezes.
- **Falhas:** até 5 repetições com intervalo crescente; depois vai para uma fila de falhas e o fundador recebe um alerta.
- **Controlo:** cada automação pode ser desligada por cliente, e o histórico de execuções está em Definições › Automações.
- **Horas de silêncio:** nenhum email a clientes entre as 20h e as 8h no fuso do cliente; ficam para a manhã seguinte.
- **Agrupar:** várias notificações do mesmo projeto em menos de 10 minutos seguem num só email.

## Catálogo

São 30 automações, pela ordem em que acontecem na vida de um cliente. A coluna Camada diz onde cada uma corre.

| Código | Evento | Condição | Ação | Pipeline | Camada |
| --- | --- | --- | --- | --- | --- |
| AUT-01 | candidatura.submetida | — | Pontua, atribui caminho, cria contacto e negócio | 0.1 → 0.2 | OS |
| AUT-02 | candidatura.caminho\_a | — | Mostra o calendário; email com link de marcação; avisa o fundador | 0.2 | OS |
| AUT-03 | candidatura.caminho\_b | — | Põe na Fila B e avisa o fundador; lembra se não for revista em 24h | 0.2 | OS |
| AUT-04 | candidatura.caminho\_c | — | Envia o autodiagnóstico; inscreve na newsletter se houver consentimento | — | n8n |
| AUT-05 | chamada.marcada | — | Cria o evento com o resumo da candidatura; lembretes 24h e 1h antes | 0.3 | OS |
| AUT-06 | chamada.terminada | 2h sem resultado registado | Lembra o fundador de registar o resultado | — | OS |
| AUT-07 | negocio.sem\_resposta | 3, 7, 14 e 30 dias | Cria tarefa de acompanhamento com mensagem sugerida | — | OS |
| AUT-08 | diagnostico.pago | Pagamento confirmado | Cria a sala com o processo Diagnóstico; envia o questionário; propõe datas para o workshop | 1.1 | OS |
| AUT-09 | mapa.enviado | — | Email ao decisor; lembretes aos 3 e 7 dias | 1.5 | OS |
| AUT-10 | mapa.aprovado | — | Bloqueia o mapa; cria o documento; pré-preenche a proposta | 1.6 | OS |
| AUT-11 | proposta.aceite | — | Gera o contrato e envia-o para assinatura | — | OS |
| AUT-12 | contrato.assinado | Todos assinaram | Prepara a fatura do primeiro marco e o link de pagamento | 2.1 | OS |
| AUT-13 | fatura.paga | Primeiro marco | Convida o cliente para o portal; arranca o processo; agenda o kickoff; cria a tarefa do kit de boas-vindas | 2.2 | OS |
| AUT-14 | passo.concluido | Há passo seguinte ligado | Envia o passo seguinte ao cliente | — | OS |
| AUT-15 | aprovacao.pedida | — | Email ao decisor; lembrete aos 2 dias; alerta interno aos 5 | — | OS |
| AUT-16 | aprovacao.aprovada | Fase com marco de faturação | Marca a fase como feita; prepara a fatura do marco | 2.4 a 2.9 | OS |
| AUT-17 | revisao.registada | 80% das rondas usadas | Avisa a equipa e o cliente | — | OS |
| AUT-18 | fatura.emitida | — | Envia ao contacto financeiro com o link de pagamento | — | OS |
| AUT-19 | fatura.vencida | 1, 7, 15 e 30 dias | Lembretes ao cliente; aos 15 dias alerta o fundador; aos 30 sugere pausa | X.1 sugerido | OS |
| AUT-20 | pagamento.recebido | Valor e referência coincidem | Concilia, atualiza Dinheiro, envia confirmação | — | OS |
| AUT-21 | projeto.entregue | Aprovação final | Fatura final; pedido de testemunho; tarefa da caixa de celebração; proposta de ativação | 2.9 → 2.10 | OS |
| AUT-22 | retainer.consumo | 80% e 100% de um limite | Avisa o cliente e a equipa | — | OS |
| AUT-23 | retainer.pedido\_acima | Limite atingido | Cria pedido extra para aprovação do cliente | — | OS |
| AUT-24 | retainer.revisao | 60 dias antes da data | Tarefa de revisão com proposta de renovação | 4.4 | OS |
| AUT-25 | trimestre.terminado | Retainer ativo | Prepara o rascunho do relatório e agenda o QBR | 4.3 | OS |
| AUT-26 | resultado.prazo | Prazo atingido | Avalia meta e condições; ativa a garantia ou regista o resultado | — | OS |
| AUT-27 | condicao.falhada | Acessos não entregues em 5 dias úteis | Regista a condição como falhada e avisa o cliente | — | OS |
| AUT-28 | hub.publicado | — | Atualiza o site; renova os ZIPs; avisa o cliente | — | OS |
| AUT-29 | contrato.aniversario | 1 ano de parceria | Tarefa da caixa de celebração de renovação | — | OS |
| AUT-30 | indicacao.paga | Projeto do indicado pago | Aplica o crédito na conta de quem indicou | — | OS |

## Emails e notificações

Cada email pede uma única ação, com um botão que abre o sítio exato no portal. O remetente é uma pessoa ("Vladimir, Aurion"), não "noreply", e a voz é a da marca: direta, curta, sem pontos de exclamação.

### Para clientes

| Momento | Destinatário | Assunto (exemplo) | Botão |
| --- | --- | --- | --- |
| Link de marcação (caminho A) | Candidato | A sua chamada com a Aurion | Escolher horário |
| Questionário do diagnóstico | Decisor | Bloom: 20 minutos antes do workshop | Responder |
| Mapa enviado | Decisor | Bloom: o mapa do diagnóstico está pronto | Ver o mapa |
| Proposta enviada | Decisor | Bloom: proposta e investimento | Ver a proposta |
| Contrato para assinar | Signatários | Bloom: contrato pronto para assinar | Assinar |
| Fatura emitida | Financeiro | Fatura FT 2026/014: Bloom, marco 1 de 3 | Pagar |
| Fatura vencida | Financeiro, com cópia ao decisor | Fatura FT 2026/014 vencida há 7 dias | Pagar |
| Boas-vindas ao portal | Decisor e operacionais | Bloom: o seu espaço de projeto está ativo | Entrar |
| Aprovação pedida | Decisor | Bloom: 1 decisão à sua espera | Rever |
| Comentário da equipa | Quem está no documento | Bloom: nova nota na Estratégia | Ver comentário |
| Nova atualização | Todos os da sala que a querem | Bloom: atualização da semana | Ver |
| Retainer a 80% | Decisor | Bloom: 80% do retainer usado em outubro | Ver consumo |
| Brand Hub publicado | Decisor e operacionais | Bloom: o Brand Hub foi atualizado | Abrir o hub |

### Para a equipa

Notificações dentro do OS e, para o que é urgente, por email: candidatura A ou B recebida, lead B por rever há 24 horas, aprovação ou comentário do cliente, pagamento recebido, fatura vencida há 15 dias, falha de integração, automação em falha.

Cada pessoa escolhe, por tipo de notificação, se a recebe no OS, por email, ou nas duas; as falhas de integração e de automação não se podem desligar.
