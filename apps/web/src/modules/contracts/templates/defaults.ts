import type { Locale } from '@agency-os/i18n';

const PT = `# Contrato de prestação de serviços

## Partes

Primeira contraente: {{entidade.denominacao}}, com o número de identificação fiscal {{entidade.nif}}, sede em {{entidade.morada}}, {{entidade.pais}}, representada por {{entidade.representante}}, na qualidade de {{entidade.cargo}} (a "Aurion").

Segunda contraente: {{cliente.denominacao}}, com o número de identificação fiscal {{cliente.nif}}, sede em {{cliente.morada}}, representada por {{cliente.signatario}}, na qualidade de {{cliente.cargo}} (o "Cliente").

## 1. Objeto

A Aurion presta ao Cliente os serviços da opção "{{opcao.nome}}", escolhida pelo Cliente na proposta aceite: {{opcao.resumo}}

## 2. Âmbito

O âmbito resulta do diagnóstico Aurion Core entregue ao Cliente e compreende:

{{opcao.ambito}}

Tudo o que não constar desta lista fica fora do âmbito e, se pedido, é orçamentado em separado.

## 3. Preço e pagamento

O preço dos serviços é de {{opcao.valor}}, em {{proposta.moeda}}, acrescido dos impostos aplicáveis, pago nas seguintes prestações:

{{opcao.pagamentos}}

Cada prestação é faturada no momento indicado e paga no prazo de 15 dias a contar da fatura. O atraso no pagamento suspende os trabalhos da prestação seguinte.

## 4. Acompanhamento mensal

{{opcao.retainer}}

O acompanhamento mensal, quando aplicável, é faturado no início de cada mês e renova-se apenas por acordo escrito das partes.

## 5. Prazos e entrega

Os prazos de cada fase constam do roadmap acordado e contam a partir do pagamento da primeira prestação e da entrega, pelo Cliente, dos acessos e materiais pedidos. Os atrasos do Cliente prorrogam os prazos pelo mesmo período.

## 6. Garantia

{{proposta.garantia}}

## 7. Propriedade intelectual

Com o pagamento integral do preço, os direitos patrimoniais sobre os trabalhos finais entregues transmitem-se para o Cliente. A Aurion mantém os direitos sobre ferramentas, métodos e materiais prévios, e pode referir o trabalho no seu portefólio, salvo oposição escrita do Cliente.

## 8. Confidencialidade e proteção de dados

As partes guardam sigilo sobre a informação da outra parte a que tenham acesso. Quando a Aurion trate dados pessoais por conta do Cliente, fá-lo como subcontratante, nos termos do Regulamento Geral sobre a Proteção de Dados e de acordo com as instruções do Cliente.

## 9. Duração e cessação

O contrato vigora até à conclusão dos serviços e ao pagamento integral do preço. Qualquer das partes pode resolvê-lo por incumprimento grave da outra, não sanado no prazo de 15 dias após notificação escrita. Em caso de cessação, são devidos os valores correspondentes aos trabalhos já realizados.

## 10. Lei aplicável e foro

O contrato rege-se pela lei do país da sede da Aurion. Para qualquer litígio é competente o foro da comarca da sede da Aurion, com renúncia a qualquer outro.

## 11. Assinatura

As partes assinam este contrato eletronicamente na plataforma da Aurion, em {{contrato.data}}. Cada assinatura fica registada com o nome do signatário, a data, o endereço IP e a impressão digital do texto assinado.
`;

const EN = `# Services agreement

## Parties

First party: {{entidade.denominacao}}, tax number {{entidade.nif}}, registered at {{entidade.morada}}, {{entidade.pais}}, represented by {{entidade.representante}}, as {{entidade.cargo}} ("Aurion").

Second party: {{cliente.denominacao}}, tax number {{cliente.nif}}, registered at {{cliente.morada}}, represented by {{cliente.signatario}}, as {{cliente.cargo}} (the "Client").

## 1. Subject

Aurion provides the Client with the services of the "{{opcao.nome}}" option, chosen by the Client in the accepted proposal: {{opcao.resumo}}

## 2. Scope

The scope results from the Aurion Core diagnosis delivered to the Client and comprises:

{{opcao.ambito}}

Anything not on this list is out of scope and, if requested, is quoted separately.

## 3. Price and payment

The price of the services is {{opcao.valor}}, in {{proposta.moeda}}, plus applicable taxes, paid in the following instalments:

{{opcao.pagamentos}}

Each instalment is invoiced when due and paid within 15 days of the invoice. Late payment suspends the work of the following instalment.

## 4. Monthly support

{{opcao.retainer}}

Monthly support, where applicable, is invoiced at the start of each month and is renewed only by written agreement of the parties.

## 5. Timelines and delivery

The timelines of each phase follow the agreed roadmap and start from the payment of the first instalment and the Client's delivery of the requested access and materials. Delays caused by the Client extend the timelines by the same period.

## 6. Guarantee

{{proposta.garantia}}

## 7. Intellectual property

Upon full payment of the price, the economic rights in the final deliverables transfer to the Client. Aurion keeps the rights to its tools, methods and pre-existing materials, and may reference the work in its portfolio unless the Client objects in writing.

## 8. Confidentiality and data protection

The parties keep confidential the other party's information they access. Where Aurion processes personal data on the Client's behalf, it does so as a processor under the General Data Protection Regulation and the Client's instructions.

## 9. Term and termination

The agreement remains in force until the services are completed and the price is paid in full. Either party may terminate it for a serious breach by the other party not remedied within 15 days of written notice. On termination, the amounts for work already performed remain due.

## 10. Governing law and jurisdiction

The agreement is governed by the law of the country of Aurion's registered office. The courts of the district of Aurion's registered office have exclusive jurisdiction over any dispute.

## 11. Signature

The parties sign this agreement electronically on Aurion's platform, on {{contrato.data}}. Each signature is recorded with the signer's name, the date, the IP address and the fingerprint of the signed text.
`;

export const DEFAULT_CONTRACT_TEMPLATES: Record<Locale, string> = { 'pt-PT': PT, en: EN };
