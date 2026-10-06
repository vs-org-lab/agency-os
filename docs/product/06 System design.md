# 06 — System design

## Stack e decisões

A v2 troca a arquitetura de microsserviços em Kubernetes da v1 por um monólito modular em Next.js com serviços geridos. Para uma operação de uma pessoa com freelancers, é a mesma segurança e o mesmo isolamento por domínio, com uma fração do custo e do tempo de manutenção.

| Camada | Escolha | Porquê |
| --- | --- | --- |
| Aplicação | Next.js (App Router) com TypeScript | Equipa, portal e API no mesmo código; renderização no servidor para velocidade |
| Interface | Tailwind CSS, shadcn/ui e os tokens do separador 05 | Componentes prontos e acessíveis, ajustados à marca |
| Organização do código | Monólito modular: um módulo por domínio, com fronteiras e testes próprios | Pode ser separado em serviços mais tarde sem reescrever |
| API | Ações de servidor para a interface; API REST versionada para integrações e para o servidor MCP | A mesma regra de autorização serve a interface, a API e o agente |
| Base de dados | PostgreSQL gerido na UE, com segurança ao nível da linha (RLS), por exemplo Supabase ou Neon | Isolamento entre clientes garantido também na base de dados |
| Acesso a dados | Drizzle ORM com migrações versionadas | Consultas tipadas e migrações revistas |
| Autenticação | Serviço gerido com link mágico, palavra-passe, MFA e sessões revogáveis | Não se escreve autenticação de raiz |
| Ficheiros | Armazenamento de objetos compatível com S3, na UE, com URLs assinadas e de curta duração | Ficheiros grandes (vídeo) sem passar pelo servidor da aplicação |
| Eventos e tarefas | Fila gerida com repetições e agendamentos (por exemplo Inngest ou Trigger.dev) | Automações fiáveis sem montar infraestrutura de filas |
| Automações externas | n8n alojado na UE, a receber os eventos do OS por webhook | Fluxos mudam sem novo deploy da aplicação |
| Tempo real | Subscrições da base de dados ou um serviço de websockets | Comentários e aprovações aparecem sem recarregar |
| Email | Serviço transacional com SPF, DKIM e DMARC configurados | Emails a clientes não caem no spam |
| Pagamentos | Stripe: cartão, SEPA e débito direto | Tokenização: o OS nunca vê dados de cartão |
| Faturação | Software certificado pela AT, com API | Obrigação legal em Portugal; o OS nunca numera faturas |
| Assinatura eletrónica | Serviço com dados na UE e trilho de auditoria | Validade legal sem construir assinatura |
| IA | API da Anthropic (Claude) para mapas, estratégias e leitura de comprovativos | Mesma família de modelos do agente |
| Brand Hubs | Projeto Next.js estático separado, publicado por deploy, com domínio do cliente por CNAME | Os sites dos clientes não partilham servidor com o OS |
| Alojamento | Plataforma gerida com região UE para a aplicação e a base de dados | Deploy automático, sem servidores para manter |
| Observabilidade | Sentry, registos estruturados e monitor de disponibilidade | Erros e falhas de integração detetados em minutos |

Os nomes de produtos são recomendações. A escolha final de cada serviço deve confirmar região UE, acordo de tratamento de dados (DPA) e preço antes de assinar.

## Arquitetura

Tudo passa pelo mesmo núcleo, onde vivem as regras de autorização: a interface da equipa, o portal, o site, os Brand Hubs e o agente nunca tocam na base de dados diretamente.

&#91;embedded content: arquitetura · 5 consumidores, 1 núcleo com 8 domínios, 3 camadas de dados, 6 serviços externos\]

Os Brand Hubs são publicados a partir do núcleo como sites estáticos, por isso a seta vai do núcleo para eles. Os serviços externos são chamados por tarefas em fila, para que uma falha de um fornecedor seja repetida sem bloquear a interface.

## Modelo de dados

Todas as tabelas com dados de um cliente têm organização e cliente, e uma política de RLS que as filtra. Nada se apaga fisicamente: os registos são arquivados, e os documentos guardam todas as versões.

| Domínio | Entidade | Campos principais | Liga-se a |
| --- | --- | --- | --- |
| Base | Organização | nome, marca do portal, idioma, moeda | Todas as outras |
| Base | Utilizador | nome, email, papel, MFA, tipo (interno, freelancer, cliente) | Organização, Cliente (se for cliente) |
| Base | Permissão | papel, recurso, ação | Utilizador |
| Comercial | Candidatura | respostas, pontuação, caminho, origem, consentimento | Contacto, Negócio |
| Comercial | Cliente | nome, NIF, setor, dimensão, logótipo, domínio do portal | Contacto, Projeto, Negócio |
| Comercial | Contacto | nome, email, papel (decisor, operacional, financeiro) | Cliente |
| Comercial | Negócio | código do pipeline, responsável, prazo, valor estimado | Cliente, Chamada, Documento |
| Comercial | Chamada | data, notas, resultado, motivo | Negócio, Evento |
| Diagnóstico | Workshop | modelo, fases, passos, tipo de cada pergunta | Projeto |
| Diagnóstico | Resposta | passo, valor, autor, data | Workshop |
| Diagnóstico | Transcrição | texto, fonte, número de palavras | Workshop |
| Documentos | Documento | tipo (mapa, estratégia, proposta, contrato, apresentação), estado, visibilidade | Projeto, Versão, Aprovação |
| Documentos | Versão | número, conteúdo ou link do Figma, ficheiro, autor | Documento |
| Documentos | Comentário | texto, autor, posição (ponto, tempo, elemento), interno ou visível | Documento, Ficheiro |
| Documentos | Aprovação | item, decisão, comentário, autor, data | Documento, Fase, Ficheiro |
| Documentos | Assinatura | signatário, estado, trilho do serviço externo | Documento |
| Processo | Projeto | nome, tipo, estado, datas, pessoas | Cliente, Fase, Retainer |
| Processo | Fase | nome, ordem, exige aprovação, data de conclusão | Projeto, Passo, Marco |
| Processo | Passo | nome, estado, responsável, visível ao cliente, passo anterior ligado | Fase |
| Processo | Tarefa | título, responsável, data, subtarefas | Projeto, Passo |
| Processo | Atualização | texto, ficheiros, marco, visibilidade | Projeto |
| Biblioteca | Pasta e Ficheiro | nome, tipo, tamanho, chave de armazenamento, visibilidade | Projeto |
| Brand Hub | Hub | layout, cores, cantos, domínio, acesso | Cliente, Página, Publicação |
| Brand Hub | Página e Bloco | ordem, tipo, conteúdo, ficheiros ligados | Hub |
| Brand Hub | Publicação | instantâneo do conteúdo, data, autor, endereço | Hub |
| Dinheiro | Plano de faturação | tipo (marcos ou recorrente), moeda | Projeto, Marco |
| Dinheiro | Marco | percentagem ou valor, fase ligada, estado | Plano, Fatura |
| Dinheiro | Fatura | número e ATCUD (do software certificado), estado, valores, PDF | Cliente, Marco, Pagamento |
| Dinheiro | Pagamento | valor, meio, referência, conciliado | Fatura |
| Dinheiro | Despesa e Subscrição | valor, categoria, renovação, recibo, faturável | Cliente (se faturável) |
| Retenção | Retainer | nível, limites, regra de transporte, data de revisão | Projeto, Consumo, Pedido extra |
| Retenção | Consumo | mês, limite, usado, transportado | Retainer |
| Retenção | Pedido extra | descrição, orçamento, decisão | Retainer, Tarefa |
| Retenção | Resultado acordado | métrica, linha de base, meta, prazo, fonte | Projeto, Condição, Garantia |
| Retenção | Condição do cliente | descrição, prazo, cumprida, data | Resultado |
| Retenção | Garantia | estado, meses usados, motivo | Resultado |
| Segurança | Credencial | serviço, valor cifrado, último acesso | Cliente (cofre separado) |
| Segurança | Registo de auditoria | quem, o quê, quando, de onde, agente sim ou não | Todas, só de escrita |
| Sistema | Evento de domínio | tipo, dados, estado de envio | Fila de eventos |

Os eventos de domínio são escritos na mesma transação que a mudança que os origina (padrão outbox), e só depois enviados para a fila. Assim, uma mudança nunca acontece sem o seu evento, nem o contrário.

## Integrações, Brand Hub e agente

Todas as integrações entram e saem pela fila de eventos. Cada aviso recebido de fora (webhook) tem a assinatura verificada e é processado uma única vez, mesmo que chegue repetido.

### Integrações

| Serviço | Para quê | Direção | Cuidados |
| --- | --- | --- | --- |
| Stripe | Links de pagamento, SEPA, débito direto | OS → Stripe; avisos de pagamento de volta | Assinatura do aviso verificada; conciliação idempotente |
| Software de faturação certificado | Emitir faturas e notas de crédito | OS → software; número, ATCUD e PDF de volta | Se falhar, a fatura fica em Rascunho com o erro; nunca se envia ao cliente |
| Assinatura eletrónica | Contratos e adendas | OS → serviço; estado por signatário de volta | Trilho de auditoria guardado com o documento |
| Figma | Propostas e apresentações incorporadas | Só leitura, por link de incorporação | Avisa quando o link não está público; o cliente sem acesso veria um pedido de login |
| Google Calendar | Chamadas, kickoff, prazos | Nos dois sentidos | Só o calendário escolhido pelo utilizador |
| Dropbox e Google Drive | Importar ficheiros para a Biblioteca | Para dentro do OS | Permissões mínimas, só leitura |
| Email transacional | Notificações e envios a clientes | OS → serviço | Domínio autenticado; cancelamento de subscrição nos emails não essenciais |
| n8n | Fluxos que mudam muitas vezes | Recebe eventos do OS; chama a API do OS | Chave de API própria, com âmbito limitado |
| Claude API | Mapa, estratégia, leitura de comprovativos | OS → Anthropic | Só os dados necessários a cada pedido; resultado é sempre rascunho |

### Publicação do Brand Hub

1. **Publicar** guarda um instantâneo do hub: páginas, blocos, cores e a lista dos ficheiros nessa versão.
2. O OS gera um site estático a partir do instantâneo e publica-o na plataforma de alojamento, num endereço da Aurion.
3. **Domínio do cliente:** o cliente cria um registo CNAME (por exemplo marca.cliente.com) a apontar para o site; o certificado HTTPS é emitido automaticamente. O site continua ligado ao OS: cada nova publicação atualiza-o.
4. **Downloads:** "Descarregar" numa secção ou "Descarregar todos os ativos" gera um ZIP a partir dos ficheiros do instantâneo, guardado em cache até à publicação seguinte.
5. **Acesso:** público; protegido por palavra-passe; ou restrito a utilizadores do cliente, com verificação no OS.
6. **Exportação total (opcional):** o cliente pode receber o site como pacote estático para alojar onde quiser. Nesse caso perde a sincronização com o OS, e isso é explicado antes de exportar.

### Servidor MCP

O OS expõe um servidor MCP para o agente (Claude) trabalhar dentro do estúdio, sempre em nome de um utilizador.

| Tipo | Ferramentas | Comportamento |
| --- | --- | --- |
| Leitura | Listar clientes; ver sala; o que precisa de mim hoje; ver projeto, passos e documentos; procurar ficheiros; ver faturas em aberto | Responde a partir dos dados reais, com links para cada item |
| Escrita com rascunho | Criar tarefa; mudar prazo; escrever atualização; preparar lembrete de cobrança; preencher páginas do Brand Hub; colocar imagens num moodboard | Fica em rascunho até o utilizador confirmar no OS ou no próprio chat |
| Proibido | Enviar a clientes, emitir ou anular faturas, aceitar ou assinar, mudar permissões, aceder ao cofre | Não existe ferramenta; o pedido é recusado com explicação |

A ligação é feita por OAuth, por utilizador, com permissões iguais às desse utilizador. Cada chamada tem limite de frequência e fica no registo de auditoria.
