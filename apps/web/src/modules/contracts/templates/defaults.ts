import type { Locale } from '@agency-os/i18n';

const PT = `# Contrato de prestação de serviços

## Partes

Prestador: {{entidade.denominacao}}, com o número de identificação fiscal {{entidade.nif}}, sede em {{entidade.morada}}, {{entidade.pais}}, representada por {{entidade.representante}}, na qualidade de {{entidade.cargo}} (o "Prestador").

Cliente: {{cliente.denominacao}}, com o número de identificação fiscal {{cliente.nif}}, sede em {{cliente.morada}}, representada por {{cliente.signatario}}, na qualidade de {{cliente.cargo}} (o "Cliente").

## 1. Objeto

O Prestador presta ao Cliente os serviços criativos e digitais da opção "{{opcao.nome}}", escolhida pelo Cliente na proposta comercial aceite, que integra este contrato: {{opcao.resumo}}

## 2. Âmbito dos serviços

{{opcao.modulos}}

O âmbito compreende ainda:

{{opcao.ambito}}

Ficam excluídos, salvo indicação expressa na proposta: licenças de software, fotografia de stock e fontes pagas; captação de foto ou vídeo; traduções; plataformas não listadas; e qualquer trabalho fora do volume definido. Pedidos fora do âmbito são orçamentados em separado e só avançam com aprovação escrita do Cliente.

## 3. Prazos

Os prazos de cada fase constam do cronograma acordado no kick-off e contam a partir do pagamento da primeira prestação e da entrega, pelo Cliente, dos acessos e materiais pedidos. Os atrasos imputáveis ao Cliente prorrogam os prazos pelo mesmo período. Nos serviços recorrentes, os prazos aplicam-se por ciclo mensal.

## 4. Preço e pagamento

O preço dos serviços é de {{opcao.valor}}, em {{proposta.moeda}}, acrescido dos impostos aplicáveis, pago nas seguintes prestações:

{{opcao.pagamentos}}

Acompanhamento mensal: {{opcao.retainer}}

Cada prestação é faturada no momento indicado e paga no prazo de 15 dias. Um atraso superior a 10 dias úteis suspende os serviços em curso até à regularização e vence juros de mora à taxa legal. O início dos serviços depende do pagamento da primeira prestação.

## 5. Obrigações das partes

O Prestador executa os serviços com diligência e qualidade profissional, responde em até 24 horas em dias úteis, mantém o Cliente informado de qualquer imprevisto e apresenta o trabalho para aprovação nos prazos e formatos acordados.

O Cliente fornece os materiais, acessos e informações pedidos em até 5 dias úteis, designa um ponto de contacto para aprovações, responde a pedidos de aprovação em até 5 dias úteis, consolida o feedback de cada ronda e garante que os materiais que entrega são livres de direitos ou devidamente licenciados.

## 6. Revisões

As rondas de revisão incluídas são as indicadas em cada módulo ou na proposta. Uma revisão é um conjunto consolidado de feedback sobre a mesma versão de um entregável; alterar o que já foi aprovado conta como nova ronda. Revisões adicionais e alterações ao âmbito exigem acordo escrito e são orçamentadas em separado.

## 7. Garantia

{{proposta.garantia}}

## 8. Propriedade intelectual

Com o pagamento integral do preço, os direitos patrimoniais sobre os entregáveis finais produzidos para o Cliente transmitem-se para o Cliente. Ficam excluídos os ficheiros de trabalho, salvo indicação na proposta, e as ferramentas, bibliotecas e código genérico do Prestador. O Prestador pode referir o trabalho no seu portefólio, salvo oposição escrita do Cliente. Até ao pagamento integral, os entregáveis não podem ser usados nem publicados pelo Cliente.

## 9. Confidencialidade e proteção de dados

As partes guardam sigilo sobre a informação da outra parte durante o contrato e nos três anos seguintes. Quando o Prestador trate dados pessoais por conta do Cliente, fá-lo como subcontratante, nos termos do Regulamento Geral sobre a Proteção de Dados e das instruções do Cliente.

## 10. Cessação

Qualquer das partes pode cessar o contrato com 15 dias de pré-aviso escrito; nos serviços recorrentes, o contrato termina no fim do mês do pré-aviso. Qualquer das partes pode resolvê-lo de imediato por incumprimento grave não sanado em 10 dias após notificação. Em qualquer caso, são devidos os valores do trabalho já realizado.

## 11. Limitação de responsabilidade

A responsabilidade do Prestador não excede o valor pago pelo Cliente nos últimos 12 meses. O Prestador não responde por resultados comerciais, salvo garantia expressa na proposta, nem por materiais do Cliente, danos indiretos ou alterações de plataformas de terceiros.

## 12. Serviços recorrentes

Nos serviços com acompanhamento mensal, o volume de cada mês não transita para o seguinte, o mês em curso é faturado na totalidade em caso de cancelamento e a revisão de preço exige 30 dias de pré-aviso, com direito de cessação pelo Cliente.

## 13. Disposições gerais

Este contrato e a proposta aceite constituem o acordo completo das partes. As alterações são feitas por escrito. O contrato rege-se pela lei do país da sede do Prestador, sendo competente o foro da comarca da sua sede, sem prejuízo da mediação ou arbitragem.

## 14. Assinatura

As partes assinam este contrato eletronicamente na plataforma do Prestador, em {{contrato.data}}. Cada assinatura fica registada com o nome do signatário, a data, o endereço IP e a impressão digital do texto assinado.
`;

const EN = `# Services agreement

## Parties

Provider: {{entidade.denominacao}}, tax number {{entidade.nif}}, registered at {{entidade.morada}}, {{entidade.pais}}, represented by {{entidade.representante}}, as {{entidade.cargo}} (the "Provider").

Client: {{cliente.denominacao}}, tax number {{cliente.nif}}, registered at {{cliente.morada}}, represented by {{cliente.signatario}}, as {{cliente.cargo}} (the "Client").

## 1. Subject

The Provider provides the Client with the creative and digital services of the "{{opcao.nome}}" option, chosen by the Client in the accepted commercial proposal, which forms part of this agreement: {{opcao.resumo}}

## 2. Scope of services

{{opcao.modulos}}

The scope further comprises:

{{opcao.ambito}}

Unless the proposal says otherwise, the following are excluded: software licences, stock photography and paid fonts; photo or video shoots; translations; platforms not listed; and any work beyond the agreed volume. Out-of-scope requests are quoted separately and only go ahead with the Client's written approval.

## 3. Timelines

The timelines of each phase follow the schedule agreed at kick-off and start from the payment of the first instalment and the Client's delivery of the requested access and materials. Delays caused by the Client extend the timelines by the same period. For recurring services, timelines apply per monthly cycle.

## 4. Price and payment

The price of the services is {{opcao.valor}}, in {{proposta.moeda}}, plus applicable taxes, paid in the following instalments:

{{opcao.pagamentos}}

Monthly support: {{opcao.retainer}}

Each instalment is invoiced when due and paid within 15 days. A delay of more than 10 business days suspends the ongoing services until payment and bears statutory late interest. Services start once the first instalment is paid.

## 5. Obligations of the parties

The Provider performs the services diligently and to a professional standard, replies within 24 hours on business days, keeps the Client informed of anything unforeseen and submits the work for approval in the agreed timelines and formats.

The Client provides the requested materials, access and information within 5 business days, appoints one contact for approvals, answers approval requests within 5 business days, consolidates the feedback of each round and ensures the materials it supplies are rights-free or properly licensed.

## 6. Revisions

The revision rounds included are those stated in each module or in the proposal. A revision is one consolidated set of feedback on the same version of a deliverable; changing what was already approved counts as a new round. Extra revisions and scope changes require written agreement and are quoted separately.

## 7. Guarantee

{{proposta.garantia}}

## 8. Intellectual property

Upon full payment of the price, the economic rights in the final deliverables produced for the Client transfer to the Client. Working files, unless the proposal says otherwise, and the Provider's tools, libraries and generic code are excluded. The Provider may reference the work in its portfolio unless the Client objects in writing. Until full payment, the Client may not use or publish the deliverables.

## 9. Confidentiality and data protection

The parties keep the other party's information confidential during the agreement and for three years after it. Where the Provider processes personal data on the Client's behalf, it does so as a processor under the General Data Protection Regulation and the Client's instructions.

## 10. Termination

Either party may end the agreement with 15 days' written notice; for recurring services, the agreement ends at the end of the month of the notice. Either party may terminate it immediately for a serious breach not remedied within 10 days of notice. In every case, the amounts for work already performed remain due.

## 11. Limitation of liability

The Provider's liability does not exceed the amount paid by the Client in the last 12 months. The Provider is not liable for business results, unless the proposal expressly guarantees them, nor for the Client's materials, indirect damage or changes to third-party platforms.

## 12. Recurring services

For services with monthly support, each month's volume does not carry over, the current month is invoiced in full on cancellation and price reviews require 30 days' notice, with the Client entitled to terminate.

## 13. General provisions

This agreement and the accepted proposal are the parties' entire agreement. Changes are made in writing. The agreement is governed by the law of the country of the Provider's registered office, whose courts have jurisdiction, without prejudice to mediation or arbitration.

## 14. Signature

The parties sign this agreement electronically on the Provider's platform, on {{contrato.data}}. Each signature is recorded with the signer's name, the date, the IP address and the fingerprint of the signed text.
`;

export const DEFAULT_CONTRACT_TEMPLATES: Record<Locale, string> = { 'pt-PT': PT, en: EN };
