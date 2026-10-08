# 04 — Regras de negócio

## Regras por domínio

As regras são verificadas no servidor, nunca só na interface. Quando uma ação é recusada por uma regra, a mensagem cita a regra em linguagem simples.

### Pipeline

- **RN-01** Cada relação comercial tem exatamente um código ativo: 0.1 a 4.4, ou X.1 a X.4.
- **RN-02** As transições seguem a ordem do pipeline. Os estados X (pausa, bloqueado, concluído, perdido) podem ser aplicados a partir de qualquer estado; reabrir X.1 ou X.2 devolve o estado anterior.
- **RN-03** Ninguém entra diretamente num projeto: passar a 2.1 só é permitido a clientes com um Core entregue (1.6) nos últimos 12 meses.
- **RN-04** Cada código só é deixado quando o seu critério se cumpre: 1.3 exige briefing preenchido; 1.4 exige as 4 frentes pontuadas, prova em todos os achados, pelo menos 2 itens internos e revisão cruzada; 1.5 exige apresentação anexada e sessão de proposta marcada; 1.6 exige a apresentação partilhada com o cliente; 2.1 exige contrato assinado e primeiro pagamento; 2.9 exige aprovação final e fatura final emitida.

### Candidaturas

- **RN-10** Os eliminatórios prevalecem sobre a pontuação.
- **RN-11** Uma candidatura repetida com o mesmo email atualiza o contacto e volta a ser pontuada; o histórico guarda todas as versões.

### Documentos e diagnóstico

- **RN-20** Um documento aprovado ou assinado não muda. Uma alteração cria uma nova versão, e a anterior continua acessível.
- **RN-21** "Retirar para rascunho" só é possível antes de o documento ser aprovado ou assinado.
- **RN-22** O roadmap do Core entregue é a fonte do âmbito e do resultado acordado. Mudar o resultado depois do contrato exige uma adenda assinada.
- **RN-23** Um comentário da equipa num documento visível ao cliente é enviado ao cliente por email; comentários internos ficam marcados e nunca saem.

### Faturação

- **RN-30** Nenhuma fatura é emitida fora do software certificado. O OS nunca atribui numeração fiscal.
- **RN-31** Uma fatura emitida não se edita nem se apaga; corrige-se com nota de crédito, também emitida pelo software certificado.
- **RN-32** Um marco de faturação só gera fatura quando a fase ligada está aprovada.
- **RN-33** Um pagamento é conciliado automaticamente só quando o valor e a referência coincidem; caso contrário, vai para revisão.
- **RN-34** Fatura vencida há 15 dias: lembrete ao cliente e alerta ao fundador. Há 30 dias: o fundador pode pausar o projeto (X.1).

### Processo e aprovações

- **RN-40** Uma fase marcada "exige aprovação" bloqueia a seguinte até ser aprovada.
- **RN-41** Pedir alterações exige comentário.
- **RN-42** Rondas de revisão acima do limite do contrato geram um pedido extra.
- **RN-43** Um passo ligado é enviado quando o anterior termina. Se o anterior voltar a "em curso", o passo já enviado não é retirado ao cliente, mas fica assinalado.

### Visibilidade

- **RN-50** Tudo o que é criado é interno por defeito; tornar visível ao cliente é sempre uma ação explícita.
- **RN-51** Freelancers nunca veem valores, faturas, contratos, nem dados de projetos a que não estão atribuídos.

### Retainers

- **RN-60** Os limites mensais dependem do nível. Até 20% do limite não usado passa para o mês seguinte, e só para esse.
- **RN-61** Trabalho acima do limite só começa depois de o cliente aprovar o pedido extra.
- **RN-62** Com pagamento em atraso há mais de 30 dias, novos pedidos ficam suspensos.

### Resultado e garantia

- **RN-70** O resultado acordado tem uma métrica, uma linha de base, uma meta, um prazo e uma fonte de dados, todos definidos no mapa aprovado.
- **RN-71** A garantia só se ativa quando: o prazo terminou, a meta não foi atingida e todas as condições do cliente foram cumpridas (acessos em 5 dias úteis, aprovações dentro do prazo, orçamento de media acordado).
- **RN-72** A garantia dá até 3 meses de trabalho sem custo, limitado ao âmbito ligado ao resultado; nunca inclui orçamento de media.
- **RN-73** A garantia termina quando a meta é atingida ou os 3 meses são usados.

### Brand Hub

- **RN-80** Só a versão publicada é visível e descarregável no site do hub.
- **RN-81** A primeira publicação num domínio do cliente exige o hub aprovado pelo cliente.
- **RN-82** Cada download é um ZIP gerado a partir da versão publicada, com nomes de ficheiro padronizados.

### Agente e indicações

- **RN-90** O agente nunca envia comunicações a clientes, emite ou anula faturas, aceita ou assina documentos, altera permissões, nem acede ao cofre.
- **RN-91** Toda a ação de escrita do agente fica pendente até uma pessoa a confirmar.
- **RN-95** O crédito por indicação é uma percentagem configurável do primeiro projeto do indicado, aplicado só depois de esse projeto estar pago.

## Pipeline 0.1 a 4.4

O pipeline é o mesmo para todos os clientes; cada etapa só se deixa quando o critério de passagem se cumpre (RN-04).

&#91;embedded content: pipeline · 5 etapas, 30 estados, 4 critérios de passagem\]

Um projeto concluído (2.10) pode passar diretamente para a Parceria (4.1) quando o cliente contrata o sistema completo. A renovação (4.4) volta a 4.1 por mais um ciclo.
