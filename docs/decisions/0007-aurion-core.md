# 0007 — O Aurion Core gratuito substitui o diagnóstico pago

- **Data:** 2026-10-08
- **Estado:** Aceite

## Contexto

A documentação de produto descrevia o M03 como um diagnóstico pago depois da venda: workshop com construtor de perguntas, mapa (manter, mudar, integrar, criar) gerado por IA e aprovado pelo cliente no portal. O guião "Diagnóstico Aurion Core — Processo e Workshop" define outro modelo: um diagnóstico gratuito, em dois dias úteis, que começa na call marcada pela candidatura.

## Decisão

- O diagnóstico é o Aurion Core, gratuito. A call Core é a chamada marcada no 1A (0.3 e 0.4); o resultado "Avançar" leva o negócio a 1.1 "Core iniciado".
- Não há workshop com formulário: quem conduz a call preenche o briefing pelos 4 blocos do guia de perguntas, e o cliente vê-o no portal depois de partilhado.
- A auditoria cobre as 4 frentes (Core, Orbit, Gravity, Constellation), cada achado com prova, pontuadas no Índice Orbit de 0 a 25 por frente. O roadmap ordena os achados em três faixas (30 dias, 90 dias, 12 meses).
- Não há aprovação do mapa pelo cliente. A decisão acontece na sessão de proposta, apresentada a partir do Figma; a apresentação fica no portal.
- A etapa 1 do pipeline tem critérios de entrada (briefing, auditoria com prova, revisão cruzada, apresentação e sessão de proposta).
- A geração por IA corre em modo manual até ao lançamento: o OS monta o pedido e o fundador usa o Claude ([ADR 0003](0003-zero-cost-until-launch.md)).

## Consequências

- O 1B não constrói o construtor de workshop (RF-020) nem a aprovação do mapa (RF-026). O guia de perguntas e a grelha do Índice Orbit são modelos editáveis e versionados.
- A proposta com as três opções Orbit e o contrato passam para o 1C, que usa o roadmap do Core entregue como fonte do âmbito.
- Se a conversão do Core descer abaixo de 25%, o guião prevê que volte a ser pago; o pipeline e os critérios mantêm-se.
- Spec: [docs/specs/2026-10-08-core-design.md](../specs/2026-10-08-core-design.md).
