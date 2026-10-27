# 0008 — Assinatura eletrónica simples no próprio OS

- **Data:** 2026-10-09
- **Estado:** Aceite

## Contexto

O RF-035 pede contratos enviados para assinatura eletrónica com estado por signatário. A documentação de produto recomenda um serviço de assinatura com dados na UE. Os serviços conhecidos (Yousign, Dropbox Sign, DocuSign, Documenso, DocuSeal) cobram por envio ou por utilizador acima de uma quota pequena, o que contraria a regra de custo zero até ao lançamento ([ADR 0003](0003-zero-cost-until-launch.md)). Os contratos da Aurion são contratos de prestação de serviços entre empresas, aceites por um decisor que já tem conta no portal com autenticação própria.

## Decisão

- O OS faz a assinatura eletrónica simples (eIDAS, art. 25.º): o signatário, autenticado no portal ou no estúdio, lê o texto completo, escreve o nome, confirma "Li e aceito" e assina.
- Cada assinatura guarda utilizador, nome escrito, cargo, email, data, IP, navegador e a impressão digital SHA-256 do texto assinado. O texto e as assinaturas são imutáveis.
- O PDF final junta o contrato e uma página de assinaturas com esses dados e a impressão digital, para servir de prova.
- O módulo de contratos isola a assinatura atrás de um serviço próprio, para que um serviço externo (assinatura avançada ou qualificada) possa ser ligado sem mudar o fluxo.

## Consequências

- Sem custo nem dependência externa no fluxo de contratos.
- A revisão por advogado do modelo de contrato e deste método de assinatura, para Portugal e Angola, entra nos critérios de lançamento.
- Um cliente que exija assinatura qualificada fica fora até se ligar um serviço externo.
- Spec: [docs/specs/2026-10-09-contracts-design.md](../specs/2026-10-09-contracts-design.md).
