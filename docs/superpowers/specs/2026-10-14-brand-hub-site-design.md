# Sub-projeto 2F.2 — Brand Hub: site publicado e acessos

| Campo                   | Valor                                                                                                                 |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------- |
| Data                    | 2026-10-14                                                                                                            |
| Estado                  | Aprovado (aprovação permanente do fundador; segundo projeto Vercel e divisão em 2F.2 e 2F.3 aprovados a 2026-10-14)   |
| Vaga                    | 2 (… → 2G Agenda → **2F.2 Brand Hub: site publicado e acessos** → 2F.3 Brand Hub: domínio do cliente e manual em PDF) |
| Módulos                 | M10 (RF-093 em parte, RF-095 em parte, RF-096), H-03                                                                  |
| Documentação de produto | `02` (H-03, F6), `06` (Brand Hubs, Publicação do Brand Hub), `08` (SEC-32, SEC-33, SEC-40, SEC-41, SEC-42)            |
| Depende de              | [2F.1 Brand Hub: editor, publicação e portal](2026-10-11-brand-hub-editor-design.md)                                  |

## 1. Objetivo

Cada Brand Hub publicado passa a ter um site próprio fora do OS. A equipa do cliente e os fornecedores dele abrem-no num endereço da Aurion, veem a última publicação com o design do hub e descarregam os ficheiros. A equipa da Aurion escolhe quem entra: qualquer pessoa, quem souber a palavra-passe, ou só os utilizadores do cliente com sessão no OS.

## 2. Decisões

1. **Divisão do resto do M10:**
   - **2F.2** (este): o site, os três modos de acesso, os downloads no site e as imagens sem metadados.
   - **2F.3:** o domínio do cliente com verificação DNS (SEC-43), a primeira publicação num domínio exigir o hub aprovado (RN-81) e o manual completo em PDF (RF-093).
2. **Um site estático para todos os hubs (`06`, SEC-40).**
   - `apps/brand-hub` é uma exportação estática do Next.js, num segundo projeto Vercel (Hobby, sem custo), separado do projeto do OS.
   - A mesma página serve todos os hubs: o endereço é `https://<site>/<slug>/` e uma regra de reescrita da Vercel envia qualquer caminho para ela.
   - No navegador, a página lê o `slug` do caminho e pede a publicação à API pública do OS. O site não tem servidor nem acesso à base de dados e só mostra o que foi publicado.
   - Enquanto a Aurion não tiver domínio próprio, o endereço é o `*.vercel.app` do projeto.
3. **Renderizador partilhado.**
   - O `HubView` e os tipos e esquemas do instantâneo (blocos, design, páginas) passam do módulo `brand-hub` da web para um pacote `@agency-os/brand-hub-view`.
   - A web (P-08 e pré-visualização) e o site usam o mesmo componente; o resultado é igual em ambos.
4. **Endereço do hub.** Cada hub tem um `slug` único:
   - 3–60 caracteres `a-z`, `0-9` e `-`;
   - gerado do nome do cliente ao criar o hub, ou ao primeiro acesso ao painel Partilha num hub já existente;
   - editável pela equipa que publica.
   - O site só existe depois da primeira publicação.
5. **Modos de acesso (RF-096, SEC-42):**
   - **`public`:** qualquer pessoa com o endereço vê o hub.
   - **`password`:**
     - a equipa define uma palavra-passe de 10 a 128 caracteres; o OS guarda só o hash (scrypt com sal);
     - o site pede a palavra-passe e envia-a ao OS, que devolve um token;
     - no máximo 5 tentativas falhadas por hub e por IP em 15 minutos, contadas com o `consumeThrottle` do 1A.
   - **`restricted`:**
     - o site envia o visitante para `/<locale>/hub-access/<slug>` no OS;
     - a página exige sessão;
     - só aceita o decisor ou o operacional desse cliente, ou quem edita o hub;
     - devolve o visitante ao site com o token no fragmento do endereço (`#token=`), que não chega a registos de servidor;
     - o regresso só é aceite para a origem configurada do site.
   - **Tokens:**
     - HMAC-SHA256 com o segredo `BRAND_HUB_TOKEN_SECRET`, que só o OS conhece;
     - levam o hub, o modo, a versão de acesso e a validade (7 dias com palavra-passe, 12 horas restrito);
     - mudar o modo ou a palavra-passe sobe a `access_version` do hub e invalida os tokens anteriores;
     - o site guarda o token no `localStorage` por `slug` e envia-o no cabeçalho `Authorization`; nunca o verifica.
6. **API pública do OS (só leitura, CORS):**
   - `GET /api/public/hubs/[slug]`:
     - **200** com o instantâneo, o nome do cliente, a data da publicação e links de 15 minutos para cada ficheiro da publicação;
     - **401** com o modo (`password`, `restricted`) e o nome do cliente quando falta um token válido;
     - **404** quando o hub não existe ou nunca foi publicado.
   - `GET /api/public/hubs/[slug]/zip?page=` devolve o manifesto do ZIP, com a mesma autorização e os nomes padronizados do 2F.1 (RN-82, SEC-32).
   - `POST /api/public/hubs/[slug]/unlock` recebe `{ password }` e devolve `{ token }`, ou 401 ou 429.
   - CORS apenas para as origens em `BRAND_HUB_SITE_ORIGINS`, só com `GET`, `POST` e o cabeçalho `Authorization`.
   - As respostas levam `Cache-Control: no-store`.
7. **Imagens sem metadados (SEC-33).**
   - Ao confirmar um ficheiro do hub, as imagens JPEG, PNG e WebP perdem os metadados (EXIF, XMP, IPTC, texto PNG) antes de ficarem prontas. O ficheiro é regravado no Storage e o tamanho é atualizado.
   - O processamento é próprio, sem dependências: segmentos APP1, APP13 e COM do JPEG; blocos `eXIf`, `tEXt`, `iTXt` e `zTXt` do PNG; blocos `EXIF` e `XMP ` do WebP.
   - GIF e SVG ficam como estão.
   - Os ficheiros carregados antes deste ciclo são tratados uma vez, por uma função que corre com o deploy.
8. **Painel Partilha no editor.**
   - Novo separador ao lado de Design e Ficheiros, só para quem publica.
   - Mostra o endereço do site, com Copiar, e o `slug`.
   - Permite escolher o modo e, no modo palavra-passe, definir a palavra-passe.
   - Avisa quando o hub ainda não foi publicado.
   - O botão Partilhar do 2F.1 continua a copiar o link do portal.
9. **Configuração e alojamento.**
   - O OS ganha:
     - `BRAND_HUB_SITE_URL`, o endereço base mostrado no editor;
     - `BRAND_HUB_SITE_ORIGINS`;
     - `BRAND_HUB_TOKEN_SECRET`, gerado e guardado como segredo, nunca mostrado.
   - O site ganha `NEXT_PUBLIC_OS_URL`.
   - O staging publica o site num job próprio do `deploy-staging`, com o id do segundo projeto em `BRAND_HUB_VERCEL_PROJECT_ID`.

## 3. Âmbito

### Incluído

1. Pacote `@agency-os/brand-hub-view`; a web passa a usá-lo, sem mudar o comportamento do 2F.1.
2. Colunas novas no hub (`slug`, `access_mode`, `password_hash`, `access_version`), painel Partilha e o serviço que muda o acesso, com auditoria.
3. API pública, tokens, desbloqueio por palavra-passe com limite de tentativas e a página `hub-access` para o modo restrito.
4. Site `apps/brand-hub`: a página do hub com o `HubView`, a palavra-passe, a entrada restrita, os downloads por página e de todos os ativos, os estados "não encontrado" e "a carregar", e o axe.
5. Imagens sem metadados ao confirmar, e o tratamento único dos ficheiros já existentes.
6. Segundo projeto Vercel, segredos e o job de staging do site.

### Excluído (registado em `docs/STATUS.md`)

| Item                                                      | Motivo                                                              | Volta quando             |
| --------------------------------------------------------- | ------------------------------------------------------------------- | ------------------------ |
| Domínio do cliente, verificação DNS, RN-81, manual em PDF | Ciclo próprio                                                       | 2F.3                     |
| Endereço do site num domínio da Aurion                    | A Aurion ainda não tem domínio (critérios de lançamento)            | Domínio da Aurion        |
| Exportação do site como pacote estático para o cliente    | Depende do 2F.3                                                     | 2F.3 ou pedido real      |
| Site noutros idiomas                                      | O conteúdo do hub é o do cliente; a interface do site fica em pt-PT | Cliente com outro idioma |

## 4. Dados e acesso

| Tabela       | Campos novos                                                                                                                                                            |
| ------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `brand_hubs` | `slug` (único, `^[a-z0-9-]{3,60}$`), `access_mode` (`public`, `password`, `restricted`; por omissão `restricted`), `password_hash` (só em `password`), `access_version` |

- `CHECK`: `password_hash` presente se e só se o modo é `password`.
- O `password_hash` nunca sai do servidor: nenhuma vista o expõe, e as leituras da equipa por RLS deixam de o selecionar (a política continua, a coluna fica fora dos leitores).
- A API pública lê em contexto de sistema e decide a autorização sozinha: hub publicado, e modo `public` ou token válido para a `access_version` atual.

## 5. Testes

- **Unitários:**
  - remoção de metadados com amostras JPEG, PNG e WebP (os metadados saem e a imagem continua válida);
  - `slug`;
  - tokens: assinatura, validade, versão e adulteração;
  - página do site: os três estados de acesso, palavra-passe errada, regresso com `#token=`, downloads e axe.
- **Base de dados:**
  - `slug` único e gerado;
  - mudar o modo e a palavra-passe: só quem publica, com auditoria, sobe a versão;
  - API pública:
    - 404 para um hub não publicado;
    - 401 com o modo;
    - 200 com token ou em modo público;
    - os ficheiros do rascunho nunca aparecem;
  - desbloqueio com a palavra-passe certa e errada, e o limite de tentativas;
  - `hub-access`: aceita o decisor e o operacional desse cliente; recusa outro cliente, o financeiro do cliente e a origem de regresso não configurada;
  - confirmação de imagem sem metadados.
- **Ponta a ponta** (o site servido localmente a partir de `out/`):
  - a equipa publica um hub em modo palavra-passe;
  - o visitante abre o site, é recusado com uma palavra-passe errada, entra com a certa, vê a missão e descarrega o pacote de logótipo;
  - em modo restrito, o decisor entra pelo OS e volta ao site;
  - axe no site.

## 6. Critérios de aceitação

1. O site mostra só a publicação atual e nunca toca na base de dados.
2. Um hub com palavra-passe ou restrito não mostra nada, nem nomes de ficheiros, sem um token válido. Mudar o acesso invalida os tokens anteriores.
3. Nenhuma imagem de um hub mantém metadados de localização ou de dispositivo.
4. O site está publicado em staging, num projeto Vercel separado do OS.
