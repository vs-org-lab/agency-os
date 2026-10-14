# Sub-projeto 2F.3 — Brand Hub: domínio do cliente e manual em PDF

| Campo                   | Valor                                                                                                     |
| ----------------------- | --------------------------------------------------------------------------------------------------------- |
| Data                    | 2026-10-14                                                                                                |
| Estado                  | Aprovado (luz verde permanente do fundador)                                                               |
| Vaga                    | 2 (… → 2F.2 Brand Hub: site publicado e acessos → **2F.3 Brand Hub: domínio do cliente e manual em PDF**) |
| Módulos                 | M10 (RF-093, RF-095), H-03                                                                                |
| Documentação de produto | `02` (H-03, F6), `03` (US-18), `04` (RN-81, RN-82), `06` (Publicação do Brand Hub), `08` (SEC-43)         |
| Depende de              | [2F.2 Brand Hub: site publicado e acessos](2026-10-14-brand-hub-site-design.md)                           |

## 1. Objetivo

O Brand Hub publicado pode passar a viver num subdomínio do cliente, por exemplo `marca.cliente.com`, sem perder a ligação ao OS: cada nova publicação aparece logo nesse endereço. O domínio só é ligado depois de o cliente provar, com um registo DNS, que o controla. A primeira ligação exige o hub aprovado pelo cliente. O site e o portal passam a oferecer o manual completo da marca em PDF.

## 2. Decisões

1. **Um domínio por hub, sempre um subdomínio.**
   - O endereço é um nome de anfitrião com pelo menos três partes (`marca.cliente.com`), em minúsculas, até 253 caracteres, com partes válidas de 1 a 63 caracteres.
   - Um domínio raiz (`cliente.com`) fica de fora: obriga a registos A em vez de CNAME e a mais suporte por cliente.
   - O mesmo nome não pode estar em dois hubs.
   - O endereço `*.vercel.app/<slug>/` do 2F.2 continua a funcionar depois de o domínio estar ligado.
2. **Estados do domínio (`brand_hub_domains.status`):**
   - **`pending`:** a equipa indicou o endereço. O OS mostra os dois registos a criar no DNS do cliente:
     - `TXT _agency-os.<endereço>` com um código aleatório de 32 caracteres;
     - `CNAME <endereço>` para `cname.vercel-dns.com`.
   - **`verified`:** o OS leu o TXT com o código certo (SEC-43).
   - **`connected`:** o OS juntou o domínio ao projeto Vercel do site, que emite o certificado HTTPS automaticamente.
   - Mudar o endereço apaga o anterior (também na Vercel, se estava ligado) e recomeça em `pending` com um código novo.
3. **Verificação DNS (SEC-43):**
   - Ao carregar em "Verificar", o OS consulta o TXT com `node:dns/promises` (`resolveTxt`), sem cache própria.
   - Sucesso grava `verified_at`. Falha mantém `pending` e mostra o motivo: registo não encontrado, ou código diferente.
   - No máximo 10 verificações por hub em 15 minutos, com o `consumeThrottle` (tipo novo `hub_domain_check`).
4. **Ligação e RN-81:**
   - "Ligar domínio" exige o estado `verified`, o hub publicado e uma publicação aprovada pelo cliente (`approved_publication_id` não nulo).
   - Sem aprovação, o painel explica que é preciso pedir a aprovação do cliente primeiro.
   - Depois da primeira ligação, as publicações seguintes chegam ao domínio sem nova aprovação, como no endereço da Aurion.
   - Ligar chama a API da Vercel (`POST /v10/projects/{projeto}/domains`). Se a Vercel recusar (domínio usado noutra conta, limite atingido), o estado fica `verified` e o painel mostra o erro.
   - Enquanto o CNAME não estiver certo, o painel do domínio ligado mostra "a aguardar DNS". O estado vem da Vercel (`GET /v6/domains/{endereço}/config`, campo `misconfigured`), lido quando o painel abre.
   - "Remover domínio" retira-o da Vercel e apaga a linha.
5. **Integração com a Vercel:**
   - `platform/vercel-domains.ts`: `addDomain`, `removeDomain` e `domainConfigured`, com `fetch` e o token no cabeçalho.
   - Configuração do OS: `BRAND_HUB_VERCEL_PROJECT_ID`, `BRAND_HUB_VERCEL_TEAM_ID` e `BRAND_HUB_VERCEL_TOKEN`. Sem as três, a ligação de domínios fica indisponível e o painel diz isso.
   - `DOMAIN_PROVIDER=fake` (como `CALENDAR_PROVIDER=fake`) troca o DNS e a Vercel por uma versão em memória, para o e2e e o dev:
     - endereços em `*.verified.test` passam a verificação;
     - todos os outros falham;
     - ligar e remover nunca falham.
6. **O site no domínio do cliente:**
   - No navegador, o site compara o seu anfitrião com `NEXT_PUBLIC_SITE_HOST`, o anfitrião do projeto.
     - É igual: o `slug` vem do caminho, como no 2F.2.
     - É diferente: o hub está na raiz e o site pede `GET /api/public/domains/[anfitrião]`.
   - Essa rota responde como `GET /api/public/hubs/[slug]` (200, 401 ou 404) e acrescenta o `slug` ao corpo, também no 401. Só aceita domínios no estado `connected`.
   - O resto do site (ZIP, desbloqueio, entrada restrita, manual) usa esse `slug` com as rotas do 2F.2. O token continua guardado por `slug`.
7. **CORS e regresso restrito:**
   - As origens aceites passam a ser as de `BRAND_HUB_SITE_ORIGINS` mais `https://<domínio>` de cada domínio `connected`, lidas da base de dados.
   - A página `/[locale]/hub-access/[slug]` aceita como regresso a origem do site ou o domínio ligado desse hub, e nenhum outro.
8. **Manual completo em PDF (RF-093):**
   - Rota `GET /api/public/hubs/[slug]/manual`, com a mesma autorização do ZIP. Devolve um link de 15 minutos para o PDF da publicação atual.
   - O PDF é gerado com `pdf-lib`, a partir da publicação (RN-80), na primeira vez que alguém o pede. Fica guardado em `hubs/<hub>/manual/<publicação>.pdf` no bucket `library`; os pedidos seguintes reutilizam-no.
   - **Conteúdo:**
     - capa com o nome do cliente, "Manual de marca" e a data da publicação;
     - índice com as páginas numeradas;
     - uma secção por página, com título e número.
   - **Blocos:**
     - **texto:** título e corpo;
     - **estratégia:** os seis campos com rótulo;
     - **cores:** amostra desenhada com nome, HEX, RGB e notas;
     - **tipografia:** família, pesos e frase de exemplo em Helvetica;
     - **logótipo, imagem e galeria:** a imagem embebida se for JPEG ou PNG, à largura da página, com legenda; SVG, WebP e outros aparecem pelo nome do ficheiro, com a nota "incluído no pacote de downloads";
     - **downloads:** lista dos ficheiros.
   - O título das secções usa a cor de destaque do hub.
   - As imagens embebidas somam no máximo 40 MB por manual; acima disso, as seguintes aparecem só pelo nome.
   - O nome do ficheiro segue o padrão do RN-82: `<cliente>-manual-de-marca.pdf`.
   - No site, a área de downloads ganha "Manual completo (PDF)". No portal (P-08), o mesmo botão usa a ação `hubManualAction(clientId)`, com a autorização do `hubZipAction` do 2F.1.
9. **Onde se gere o domínio.** No separador Partilha do editor (2F.2), por quem pode publicar. O ecrã C-13 (Definições do cliente) não existe ainda e ganha o domínio quando for construído.

## 3. Âmbito

### Incluído

- Tabela `brand_hub_domains`, tipo de throttle `hub_domain_check`, RLS de leitura para a equipa da organização.
- Serviço de domínios: indicar, verificar, ligar, remover e o estado na Vercel; versão `fake`.
- Painel do domínio no separador Partilha, com os registos DNS para copiar, o estado e os erros.
- Rota pública por domínio; CORS e regresso restrito com domínios ligados.
- Site: deteção do domínio e botão do manual.
- Gerador do manual, rota pública e rota do portal, com cache no Storage.
- Variáveis e segredos novos no preview e no staging; e2e com a versão `fake`.

### Excluído (registado em `docs/STATUS.md`)

| Item                                             | Motivo                                                    | Quando                    |
| ------------------------------------------------ | --------------------------------------------------------- | ------------------------- |
| Domínio raiz (`cliente.com`)                     | Registos A e suporte manual; os clientes usam subdomínios | Pedido real               |
| Fontes do cliente embebidas no PDF               | Licenças e formatos variáveis; Helvetica serve o manual   | Pedido real               |
| Imagens WebP e SVG desenhadas no PDF             | `pdf-lib` só embebe JPEG e PNG                            | Pedido real               |
| Exportação do site como pacote estático          | Nenhum requisito a pede; o domínio ligado cobre o caso    | Pedido real               |
| Verificação periódica do DNS de domínios ligados | A Vercel já avisa quando o certificado falha              | Antes do primeiro cliente |

## 4. Dados e acesso

- `brand_hub_domains`:
  - `id`, `organization_id`, `hub_id` (único, `on delete cascade`);
  - `hostname` (único, CHECK do formato), `verification_code`, `status` (`pending`, `verified`, `connected`);
  - `verified_at`, `connected_at`, `created_by`, `created_at`, `updated_at`.
- RLS forçada: a equipa da organização lê; não há escrita por `authenticated`; o serviço escreve em contexto de sistema depois de autorizar com `canPublish` do 2F.1.
- O código de verificação não é segredo (fica no DNS público), mas só a equipa o lê.

## 5. Testes

- **Unitários:**
  - `domain/hostname.ts`: aceita `marca.cliente.com`, recusa `cliente.com`, IPs, `localhost`, partes longas, maiúsculas normalizadas, espaços e pontos finais.
  - `platform/vercel-domains.ts` com `fetch` simulado: pedidos certos, erro da Vercel traduzido, `misconfigured`.
  - Gerador do manual: PDF válido (reaberto com `pdf-lib`), número de páginas, capa e índice, imagens JPEG e PNG embebidas, WebP citado pelo nome, limite de 40 MB, caracteres portugueses.
  - Site: anfitrião do projeto lê o `slug` do caminho; outro anfitrião usa a rota por domínio; botão do manual.
  - Painel do domínio: cada estado, registos para copiar, RN-81 sem aprovação.
- **Base de dados:**
  - RLS e CHECK de `brand_hub_domains`; nome único entre hubs.
  - Indicar, verificar (TXT certo, errado, ausente), throttle, ligar sem aprovação recusado, ligar com aprovação, erro da Vercel mantém `verified`, mudar e remover.
  - Rota por domínio só com `connected`; CORS com domínio ligado; regresso restrito para o domínio do próprio hub e recusado para o de outro.
  - Manual: gerado uma vez e reutilizado; nova publicação gera outro; autorização igual à do ZIP.
- **E2E:** com `DOMAIN_PROVIDER=fake`, a equipa indica `marca.verified.test`, verifica, vê o bloqueio do RN-81, aprova pelo portal, liga, e o visitante descarrega o manual no site.

## 6. Critérios de aceitação

1. Um domínio só fica `verified` depois de o TXT com o código certo ser lido.
2. Ligar um domínio é recusado sem uma publicação aprovada pelo cliente.
3. Um domínio ligado mostra o hub na raiz, com os mesmos modos de acesso, e cada publicação nova aparece lá.
4. O site aceita pedidos e regressos restritos só da origem do site e dos domínios ligados.
5. O manual em PDF segue a publicação atual, é gerado uma vez por publicação e respeita o modo de acesso.
6. Sem configuração da Vercel, o OS funciona e o painel diz que a ligação de domínios está indisponível.
