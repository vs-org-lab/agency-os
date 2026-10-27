# Sub-projeto 1C — Proposta, contrato e assinatura

| Campo                   | Valor                                                                                                                                                                     |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Data                    | 2026-10-09                                                                                                                                                                |
| Estado                  | Aprovado (luz verde permanente do fundador, 2026-10-09)                                                                                                                   |
| Vaga                    | 1 (1A Comercial → 1B Diagnóstico → **1C Documentos e contratos** → 1D Faturação)                                                                                          |
| Módulos                 | M04 Documentos (RF-030, RF-031, RF-035, RF-036), M21 Configurações (S-13 Modelos)                                                                                         |
| Documentação de produto | `docs/product/01` (M04), `02` (F3, C-04, P-03, S-13), `04` (RN-03, RN-04, RN-22), `08` (segurança)                                                                        |
| Depende de              | [1B Diagnóstico Aurion Core](2026-10-08-core-design.md), [ADR 0007](../../decisions/0007-aurion-core.md), [ADR 0008](../../decisions/0008-simple-electronic-signature.md) |

## 1. Objetivo

Levar o negócio da sessão de proposta (1.6) à sala ativa (2.1): o cliente escolhe uma das três opções Orbit no portal, o contrato é gerado a partir de um modelo com os dados da proposta, as duas partes assinam no OS e o negócio entra em 2.1. O pagamento do primeiro marco pertence ao 1D.

## 2. Âmbito

### Incluído

1. **Entidades emissoras:** a empresa que contrata e fatura (Portugal hoje, Angola em breve), com denominação, NIF, morada, país, email e representante.
2. **Modelos de contrato** em Definições › Modelos, um por idioma, com campos, versões publicadas e pré-visualização.
3. **Proposta Orbit** no separador Core: até três opções (por defeito "Orbit essencial", "Orbit com Gravity", "Sistema completo com Constellation"), cada uma com resumo, âmbito, valor único, plano de pagamentos e retainer opcional; garantia, validade, entidade, moeda e idioma do contrato.
4. **Aceitação no portal** (P-03): o decisor vê as opções, escolhe uma, confirma os dados da empresa e do signatário e aceita; ou pede alterações por escrito.
5. **Contrato gerado** na aceitação, com o texto fixado e a impressão digital (SHA-256) desse texto.
6. **Assinatura eletrónica simples no OS** ([ADR 0008](../../decisions/0008-simple-electronic-signature.md)): o signatário do cliente assina no portal e o fundador assina pela Aurion; fica registado nome escrito, utilizador, data, IP, navegador e impressão digital.
7. **PDF assinado** com o contrato e uma página de assinaturas, guardado em bucket privado e disponível às duas partes.
8. **Pipeline:** a entrada em 2.1 exige contrato assinado (RN-04) e Core entregue nos últimos 12 meses (RN-03); a assinatura completa move o negócio para 2.1; 2.2 continua à espera do 1D.
9. **Documentos no portal e no estúdio:** a apresentação, a proposta e o contrato aparecem como cartões com estado (C-04, RF-030).
10. **Emails:** proposta disponível, contrato pronto a assinar, contrato assinado (às duas partes); alertas ao fundador (proposta aceite, alterações pedidas, cliente assinou).

### Excluído (registado em `docs/STATUS.md`)

| Item                                                                                                        | Motivo                                                                                                                 | Volta quando                            |
| ----------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- | --------------------------------------- |
| Documentos genéricos (PDF, ficheiro, link externo), versões e comentários (RF-031 em parte, RF-033, RF-034) | O fluxo comercial só precisa de apresentação, proposta e contrato                                                      | Salas do cliente (M06, Vaga 2)          |
| Assinatura avançada ou qualificada por serviço externo                                                      | A assinatura simples cobre contratos B2B de serviços ([ADR 0008](../../decisions/0008-simple-electronic-signature.md)) | Cliente que a exija ou revisão jurídica |
| Vários signatários do lado do cliente                                                                       | Um decisor assina em nome da empresa                                                                                   | Pedido real                             |
| Adendas (RN-22)                                                                                             | Não há mudanças de resultado antes de haver projetos                                                                   | Projetos (Vaga 2)                       |
| Edição do contrato depois de gerado                                                                         | O texto assinado tem de ser o gerado; corrige-se anulando e gerando de novo                                            | —                                       |
| Faturas e pagamento do primeiro marco                                                                       | 1D                                                                                                                     | 1D                                      |

## 3. Fluxo

1. **Antes do primeiro contrato:** o fundador regista a entidade emissora (Definições › Organização) e revê o modelo de contrato (Definições › Modelos), que vem com um texto base marcado "rever com o advogado".
2. **Proposta (1.5 e 1.6):** no separador Core, secção "Proposta", o fundador escolhe a entidade, a moeda (a do negócio por defeito), o idioma do contrato (o do lead), a validade (30 dias por defeito) e a garantia, e preenche as opções. O âmbito de cada opção é uma lista de linhas; o fundador pode puxar os achados da Aurion na faixa de 90 dias do roadmap (cada linha aponta para o achado).
3. **Envio:** com o negócio em 1.6 e o portal ativo, "Enviar ao cliente" fixa a proposta (deixa de ser editável) e avisa o decisor por email. "Retirar" volta a rascunho enquanto não for aceite.
4. **Aceitação (portal, decisor):** em "Proposta", o decisor vê as opções lado a lado (valor, pagamentos, retainer, âmbito), escolhe uma, confirma denominação, NIF e morada da empresa e o seu nome e cargo como signatário, e aceita. Fora da validade, a proposta aparece expirada e não aceita. "Pedir alterações" envia uma mensagem ao fundador e a proposta mantém-se.
5. **Contrato:** a aceitação gera o contrato a partir do modelo ativo do idioma, fixa o texto e a sua impressão digital e leva o decisor à página de assinatura.
6. **Assinatura do cliente (portal):** o texto completo, o nome escrito tal como confirmado, a caixa "Li e aceito este contrato" e "Assinar". O fundador recebe o alerta.
7. **Assinatura da Aurion (estúdio):** o fundador revê e assina pela entidade emissora da mesma forma. A ordem das assinaturas não importa.
8. **Concluído:** com as duas assinaturas, o OS gera o PDF assinado, move o negócio para 2.1 (ator sistema), regista na cronologia e envia o contrato às duas partes.
9. **Anular:** antes da assinatura completa, o fundador pode anular o contrato com motivo; a proposta volta a "Enviada" para nova aceitação ou é retirada.

## 4. Dados e acesso

| Tabela                | Campos principais                                                                                                                                                                                               |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `legal_entities`      | organização, denominação, NIF, morada, país (`PT`, `AO`), email, representante (nome, cargo), por defeito, arquivada em                                                                                         |
| `contract_templates`  | organização, idioma, versão, texto, ativo, publicado por, criado em                                                                                                                                             |
| `proposals`           | organização, cliente, negócio, entidade, moeda, idioma, validade, garantia, estado (`draft`, `sent`, `accepted`, `withdrawn`), enviada em, aceite em e por, opção aceite, dados do cliente para o contrato      |
| `proposal_options`    | proposta, posição (1 a 3), nome, resumo, âmbito (linhas com achado opcional), valor único, plano de pagamentos (designação e percentagem, soma 100), retainer mensal e meses                                    |
| `proposal_requests`   | proposta, autor, mensagem, criado em (pedidos de alteração)                                                                                                                                                     |
| `contracts`           | organização, cliente, negócio, proposta, opção, modelo (versão), entidade, idioma, texto, impressão digital, estado (`awaiting_signatures`, `signed`, `void`), caminho do PDF, assinado em, anulado em e motivo |
| `contract_signatures` | contrato, parte (`client`, `studio`), utilizador, nome escrito, cargo, email, assinado em, IP, navegador, impressão digital assinada                                                                            |

- RLS forçado e privilégios por coluna em todas. Equipa: leitura por `app.can_read_pipeline`, escrita por `app.can_write_pipeline`; entidades e modelos: leitura por fundador, gestor e finanças, escrita só pelo fundador.
- Portal: o decisor lê a proposta enviada ou aceite e o contrato do seu cliente através de vistas com só as colunas partilháveis (como no 1B); nunca lê rascunhos, pedidos de alteração de outros, nem contratos de outros clientes.
- Aceitar, pedir alterações e assinar do lado do cliente passam por serviços que verificam a pertença e o papel `decision_maker` antes de escrever em contexto de sistema; a escrita direta nas tabelas não é concedida a utilizadores do cliente.
- Contratos assinados e assinaturas são imutáveis: sem privilégio de `UPDATE` nas colunas de texto, impressão digital e assinatura; o estado só muda pelos serviços.
- Bucket privado `contracts` (PDF, 10 MB), acesso só por URL assinada de curta duração gerada pelo servidor depois de verificar o acesso.
- Eventos novos: `contracts.proposal.sent`, `contracts.proposal.accepted`, `contracts.proposal.change_requested`, `contracts.contract.client_signed`, `contracts.contract.signed`.

## 5. Modelo de contrato

- Texto simples com campos `{{…}}`; cabeçalhos com `#`, listas com `-`. Campos disponíveis: `entidade.denominacao`, `entidade.nif`, `entidade.morada`, `entidade.pais`, `entidade.representante`, `entidade.cargo`, `cliente.denominacao`, `cliente.nif`, `cliente.morada`, `cliente.signatario`, `cliente.cargo`, `opcao.nome`, `opcao.resumo`, `opcao.ambito`, `opcao.valor`, `opcao.pagamentos`, `opcao.retainer`, `proposta.garantia`, `proposta.moeda`, `contrato.data`.
- Publicar recusa campos desconhecidos e chavetas por fechar. Cada publicação cria uma versão nova e ativa; os contratos guardam a versão usada.
- Valores no formato do idioma do contrato e com o símbolo da moeda (incluindo Kz). `opcao.retainer` sem retainer diz "Não aplicável" / "Not applicable".
- O texto base em pt-PT e en cobre partes, objeto e âmbito, preço e pagamento, retainer, prazos e entrega, garantia, propriedade intelectual, confidencialidade e proteção de dados, duração e cessação, lei aplicável e foro, e assinaturas. Fica marcado para revisão por advogado antes do primeiro cliente real (critério de lançamento).

## 6. Erros e segurança

- Só o decisor do cliente aceita e assina; só o fundador assina pela Aurion e anula contratos; gestores preparam propostas dos seus clientes mas não as enviam nem assinam.
- A proposta enviada não muda; aceitar uma proposta expirada, retirada ou já aceite é recusado.
- O nome escrito tem de coincidir (sem distinguir maiúsculas nem espaços a mais) com o signatário confirmado.
- A assinatura guarda a impressão digital do texto mostrado; se o contrato tiver mudado, a assinatura é recusada.
- Aceitar e assinar são idempotentes; pedidos repetidos não criam contratos nem assinaturas duplicadas.
- O PDF e os textos nunca aparecem nos registos; os emails levam links para o portal, nunca o contrato em anexo.

## 7. Testes

- **Unitários:** composição do modelo (campos, listas, valores e moedas, retainer ausente), validação do modelo, soma dos pagamentos, impressão digital, comparação do nome, regras do pipeline para 2.1 e 2.2, PDF (texto e página de assinaturas).
- **Base de dados:** RLS e isolamento das tabelas novas e das vistas do portal, papéis (gestor, finanças, decisor, operacional), envio, aceitação, expiração, pedido de alteração, geração, assinaturas pelas duas ordens, conclusão com mudança para 2.1, anulação, idempotência.
- **Ponta a ponta:** o fundador cria entidade e proposta, envia; o decisor aceita uma opção e assina; o fundador assina; o negócio está em 2.1 e o PDF descarrega nas duas pontas; axe nas páginas novas.

## 8. Critérios de aceitação

1. Uma proposta com três opções é enviada ao decisor e aceite no portal, gerando o contrato da opção escolhida.
2. O contrato usa o modelo ativo do idioma e os dados da entidade, do cliente e da opção.
3. Cliente e Aurion assinam no OS; o PDF assinado tem a página de assinaturas com nomes, datas, IPs e impressão digital.
4. A assinatura completa move o negócio para 2.1; 2.2 continua bloqueado à espera do 1D.
5. Utilizadores sem papel não aceitam, não assinam e não veem propostas ou contratos de outros clientes.
6. Testes de ponta a ponta e axe passam em CI e staging.

## 9. Riscos

| Risco                                                        | Mitigação                                                                                                                                            |
| ------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| Validade jurídica da assinatura simples em Portugal e Angola | eIDAS art. 25.º e prova por registo completo; revisão por advogado nos critérios de lançamento; porta para um serviço externo se um cliente o exigir |
| Texto base do contrato inadequado                            | Marcado para revisão por advogado; o fundador edita e publica a sua versão                                                                           |
| Proposta enviada por engano                                  | "Retirar" volta a rascunho enquanto não for aceite                                                                                                   |
| Moeda da proposta diferente da faturação                     | A moeda da proposta é a do contrato e passa para o 1D                                                                                                |
