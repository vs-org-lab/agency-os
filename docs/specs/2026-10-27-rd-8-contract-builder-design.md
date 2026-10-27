# RD-8 — Construtor de contrato

Data: 2026-10-27 · Programa de redesenho 2 · Depende da RD-6 · Estado: aprovado pelo fundador (decisão "Construtor modular", 2026-10-27; autonomia total, 2026-10-26)

## Objetivo

O contrato passa a ser montado por módulos, como no `AURION_Contrato_Template`. Cada opção da proposta escolhe os serviços (módulos A–E) com os seus parâmetros. A modalidade de pagamento sai de uma de três predefinições. O contrato gerado na aceitação inclui só as cláusulas dos módulos escolhidos, o que o torna curto. A assinatura e o fluxo de aceitação não mudam.

## Decisões

1. **Módulos.** Cada opção da proposta guarda `modules`, uma lista de `{ code, params }`, numa coluna `jsonb` nova (`proposal_options.modules`, por defeito `[]`). Os parâmetros validados por módulo são:

   | Módulo | Serviço                 | Parâmetros                                                                                                    |
   | ------ | ----------------------- | ------------------------------------------------------------------------------------------------------------- |
   | A      | Vídeo e motion graphics | vídeos por mês, rondas de revisão                                                                             |
   | B      | Gestão de redes sociais | plataformas (Instagram, LinkedIn, TikTok, Facebook, YouTube), publicações no feed por mês, stories por semana |
   | C      | Tráfego pago            | plataformas (Meta Ads, Google Ads, TikTok Ads), orçamento de media mensal, fee de gestão                      |
   | D      | Web, software e apps    | tipo de solução, tecnologias, hosting incluído, código fonte entregue                                         |
   | E      | Automação e IA          | ferramentas, meses de manutenção                                                                              |

2. **Cláusulas:**
   - um novo campo de template, `{{opcao.modulos}}`, escreve para cada módulo escolhido o título "Módulo X — Serviço", os compromissos do template da marca e os parâmetros preenchidos;
   - com dois ou mais módulos junta-se a cláusula "Solução integrada" (gestor dedicado, dashboard partilhado, check-ins quinzenais);
   - sem módulos, o campo fica vazio e vale o âmbito da proposta (`{{opcao.ambito}}`), como até aqui.
3. **Pagamento.** O editor da proposta oferece três predefinições que preenchem o plano de pagamento existente:
   - **A** — 50% na assinatura, 50% na entrega;
   - **B** — 33% / 33% / 34%;
   - **C** — retainer mensal: uma prestação única na assinatura (o valor pontual, de setup, continua obrigatório) e liga o acompanhamento mensal com 6 meses por defeito.

   O plano continua editável depois de aplicada a predefinição.

4. **Template por defeito:**
   - passa a seguir a estrutura curta da marca: partes, objeto, âmbito com módulos e exclusões, prazos, preço e pagamento, revisões, propriedade intelectual, confidencialidade e dados, cessação, responsabilidade, retainer, disposições gerais;
   - os templates já publicados continuam válidos, porque o campo novo é opcional.
5. **Construtor no editor:**
   - na opção da proposta, a secção "Módulos" mostra os cinco módulos como cartões que se ligam e desligam;
   - cada cartão ligado abre os seus parâmetros;
   - por baixo fica a pré-visualização das cláusulas que o contrato vai incluir.
6. **PDF.** O contrato segue o estilo da marca da RD-6 (título em serifa, filetes, eyebrows).

## Fora de âmbito

- **Editar cláusulas por contrato.** O template publicado continua a ser a fonte única do texto jurídico.
  - Revisitar se o fundador precisar de exceções por cliente.

## Segurança

- Os parâmetros são validados no servidor com zod: listas fechadas para plataformas e ferramentas, texto limitado a 120 caracteres, números inteiros não negativos e valores monetários pelo validador existente.
- O texto do módulo é escrito pelo servidor a partir da biblioteca de cláusulas; o cliente nunca envia texto de cláusula.

## Testes

- Domínio:
  - validação dos parâmetros;
  - cláusulas por módulo;
  - cláusula de solução integrada com dois módulos;
  - campo vazio sem módulos;
  - predefinições de pagamento.
- Base de dados: a proposta guarda e devolve os módulos; o contrato gerado na aceitação inclui as cláusulas dos módulos da opção aceite.
- Componentes: ligar um módulo mostra os parâmetros e a pré-visualização; aplicar uma predefinição preenche o plano.

## Critérios de conclusão

- Migração aplicada em dev, testes verdes e `STATUS.md` atualizado.
