# 08 — Segurança

## Princípios e acesso

Este separador prevalece sobre todos os outros em matéria de segurança. Uma funcionalidade que viole um requisito SEC não está concluída, seja qual for a vaga.

### Princípios

- **Privilégio mínimo:** cada pessoa, serviço e o agente têm só o acesso de que precisam.
- **Negar por defeito:** na dúvida, o acesso é recusado; um erro nunca abre acesso.
- **Defesa em profundidade:** o isolamento entre clientes é garantido na aplicação e na base de dados.
- **Nada se confia por estar "dentro":** a aplicação, as tarefas em fila, o n8n e o agente autenticam-se sempre.
- **Tudo deixa rasto:** cada ação sensível fica num registo que ninguém pode apagar.

### Autenticação

- **SEC-01** Utilizadores internos e freelancers: palavra-passe com verificação contra listas de palavras-passe expostas, mais MFA obrigatório (aplicação de códigos ou passkey).
- **SEC-02** Clientes: link mágico por email, com MFA opcional; o MFA passa a obrigatório para ver credenciais do cofre.
- **SEC-03** Sessões internas expiram após 8 horas sem atividade. Ações críticas (emitir ou anular fatura, mudar permissões, revelar credenciais, exportar dados) pedem nova verificação se a última tiver mais de 15 minutos.
- **SEC-04** Limite de tentativas no login, no envio de links mágicos e na candidatura; bloqueio temporário depois de tentativas falhadas repetidas.
- **SEC-05** Cada pessoa vê e termina as suas sessões ativas; mudar a palavra-passe termina todas.

### Matriz de acesso

L = ler, E = escrever, A = aprovar ou assinar, — = sem acesso. "Próprio" limita ao que lhe pertence ou lhe foi atribuído.

| Recurso | Fundador | Gestor | Freelancer | Financeiro | Agente | Decisor | Operacional | Cliente fin. |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Pipeline e CRM | L E | L E (próprio) | — | L | L, rascunho | — | — | — |
| Salas e processo | L E | L E (próprio) | L E (próprio, sem valores) | L | L, rascunho | L A (própria) | L E (própria) | — |
| Valores, propostas, contratos | L E A | L E (próprio) | — | L | L | L A (própria) | — | L (própria) |
| Faturas e pagamentos | L E | L | — | L E | L, rascunho de lembrete | L (própria), pagar | — | L (própria), pagar |
| Biblioteca e documentos | L E | L E (próprio) | L E (próprio) | L | L | L (visíveis), E (só "Enviado pelo cliente", ADR 0009) | L E (visíveis) | — |
| Onboarding do cliente | L E | L E (próprio) | — | — | — | L E (própria) | L E (própria) | — |
| Brand Hub: editar e publicar | L E | L E (próprio) | L E (próprio), sem publicar | — | Rascunho | L A (próprio) | L | — |
| Cofre de credenciais | L E (MFA, motivo) | L (próprio, MFA, motivo) | Acesso temporário concedido | — | — | E (própria) | E (própria) | — |
| Permissões e utilizadores | L E | — | — | — | — | Convidar colegas (própria) | — | — |
| Registo de auditoria | L | — | — | — | — | — | — | — |

A matriz é configuração revista e auditada, não regras espalhadas pelo código.

## Dados, cofre, ficheiros e Brand Hub

Um cliente nunca vê dados de outro cliente, em nenhuma circunstância. Esta é a regra mais importante do sistema e tem duas barreiras independentes.

### Isolamento de dados

- **SEC-10** Segurança ao nível da linha (RLS) em todas as tabelas com dados de cliente. Uma tabela nova com dados de cliente não chega a produção sem a sua política.
- **SEC-11** A autorização é verificada no servidor em cada ação da interface, em cada chamada da API e em cada ferramenta MCP. A interface esconder um botão não é proteção.
- **SEC-12** Identificadores aleatórios (UUID), nunca sequenciais. A resposta para "não existe" e "não tem acesso" é igual, para não revelar o que existe.
- **SEC-13** Testes automáticos de acesso cruzado entre clientes correm em cada deploy; se um falhar, o deploy para.

### Cofre de credenciais

- **SEC-20** As credenciais dos clientes vivem num cofre separado da base de dados principal, cada uma cifrada individualmente com chaves geridas por um serviço de gestão de chaves.
- **SEC-21** Os valores aparecem mascarados. Revelar exige MFA recente e um motivo escrito, e fica registado com pessoa, hora e motivo.
- **SEC-22** Não há exportação em massa do cofre.
- **SEC-23** O acesso de um freelancer a uma credencial é concedido por tempo limitado e expira sozinho.

### Ficheiros

- **SEC-30** Cada ficheiro carregado é verificado (tipo real, tamanho, antivírus) antes de ficar disponível.
- **SEC-31** Os ficheiros são servidos a partir de um domínio separado da aplicação, por URLs assinadas que expiram em 15 minutos.
- **SEC-32** Os ZIPs de download são gerados com links que expiram, e só incluem ficheiros visíveis para quem pede.
- **SEC-33** As imagens publicadas em Brand Hubs são publicadas sem os metadados de localização e de dispositivo.

### Brand Hubs publicados

- **SEC-40** Os sites são estáticos e não têm acesso à base de dados. Só contêm o que foi publicado.
- **SEC-41** Um ficheiro só entra num site publicado se estiver marcado como parte do hub.
- **SEC-42** O modo palavra-passe guarda só o hash da palavra-passe; o modo restrito valida o acesso com um token emitido pelo OS.
- **SEC-43** Um domínio do cliente só é ligado depois de verificado por registo DNS.

### Aplicação web

- **SEC-50** Política de segurança de conteúdo restrita: iframes só de domínios do Figma e do serviço de assinatura; nenhum script de terceiros sem revisão.
- **SEC-51** HTTPS obrigatório com HSTS; cookies de sessão httpOnly, seguros e SameSite.
- **SEC-52** Toda a entrada é validada no servidor, mesmo quando já foi validada no navegador; consultas sempre parametrizadas.

## IA, RGPD, faturação e incidentes

A IA e o agente são os pontos novos de risco da v2; as regras abaixo tratam-nos como qualquer outro utilizador, com menos permissões.

### IA e agente

- **SEC-60** Cada pedido ao modelo leva só os dados necessários a essa tarefa (por exemplo, as respostas e a transcrição de um cliente, nunca a base inteira).
- **SEC-61** O contrato da API de IA tem de excluir o uso dos dados para treino e prever um acordo de tratamento de dados.
- **SEC-62** O conteúdo dos clientes (transcrições, documentos, comentários) é tratado como dado, nunca como instrução: o agente não segue ordens escritas dentro desses conteúdos.
- **SEC-63** O resultado da IA é sempre rascunho, revisto por uma pessoa antes de chegar ao cliente.
- **SEC-64** O agente liga-se por OAuth, por utilizador, com permissões iguais às desse utilizador, tokens revogáveis e limite de pedidos.
- **SEC-65** As ações proibidas ao agente (RN-90) não existem como ferramenta no servidor MCP; não dependem de o agente "obedecer".

### RGPD

- **SEC-70** Cada finalidade de tratamento tem base legal documentada (contrato, consentimento na candidatura, obrigação legal na faturação).
- **SEC-71** Acordos de tratamento de dados com todos os subcontratantes. Quando um serviço trata dados fora da UE, a transferência fica coberta por cláusulas contratuais-tipo ou mecanismo equivalente.
- **SEC-72** Os titulares podem pedir acesso, correção, portabilidade e apagamento. As faturas e o que a lei obriga a guardar ficam pelo prazo legal, mesmo depois de um pedido de apagamento.
- **SEC-73** Prazos de conservação definidos por categoria, com apagamento ou anonimização automáticos (por exemplo, candidaturas do caminho C sem relação comercial). Os prazos finais são definidos com o advogado.
- **SEC-74** As transcrições de chamadas contêm dados pessoais: o cliente é informado no contrato, e a gravação só acontece com o seu acordo. O OS só grava depois de o fundador confirmar a autorização do cliente (fica registado quem confirmou e quando); o áudio fica num bucket privado, é apagado depois da transcrição e nunca fica mais de 7 dias.
- **SEC-75** Uma violação de dados pessoais é notificada à CNPD no prazo de 72 horas, quando aplicável.

### Faturação

- **SEC-80** O OS nunca atribui numeração fiscal nem altera uma fatura emitida (RN-30, RN-31).
- **SEC-81** As chaves da API do software de faturação e do Stripe vivem no cofre de segredos da aplicação, nunca no código.
- **SEC-82** Os avisos de pagamento só são aceites com assinatura válida e são processados uma única vez.

### Incidentes e correção

- **SEC-90** Plano de resposta com cinco fases: detetar, conter, eliminar, recuperar e rever; cada incidente fica documentado com a causa e a correção.
- **SEC-91** Prazos de correção por gravidade:

| Gravidade | Exemplo | Prazo |
| --- | --- | --- |
| Crítica | Um cliente consegue ver dados de outro; credenciais expostas | 48 horas, com a funcionalidade desligada até lá |
| Alta | Falha de autorização sem exposição de terceiros; aviso de pagamento processado duas vezes | 7 dias |
| Média | Desvio de boas práticas com impacto limitado | 30 dias |
| Baixa | Melhoria sem risco imediato | 90 dias |

- **SEC-92** Teste de reposição das cópias de segurança a cada trimestre e teste de intrusão externo uma vez por ano e depois de cada mudança estrutural.
