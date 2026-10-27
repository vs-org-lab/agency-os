# Sub-projeto 2F.1 — Brand Hub: editor, publicação e portal

| Campo                   | Valor                                                                                                                                                                                                               |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Data                    | 2026-10-11                                                                                                                                                                                                          |
| Estado                  | Implementado (2026-10-12)                                                                                                                                                                                           |
| Vaga                    | 2 (… → 2E.2 Documentos da sala → **2F.1 Brand Hub: editor, publicação e portal** → 2F.2 Brand Hub: site publicado e domínio → 2G Agenda)                                                                            |
| Módulos                 | M10 (RF-090, RF-091, RF-093 em parte, RF-094), M06 (C-08), portal (P-08), M08 (aprovação do hub)                                                                                                                    |
| Documentação de produto | `01` (RF-090 a RF-096), `02` (C-08, P-08, H-03, F6), `03` (US-17, US-18), `04` (RN-80 a RN-82), `06` (Hub, Página e Bloco, Publicação), `07` (Brand Hub publicado), `08` (matriz, SEC-30 a SEC-33, SEC-40 a SEC-43) |
| Depende de              | [2E.1 Biblioteca](2026-10-10-library-design.md), [2E.2 Documentos da sala](2026-10-11-room-documents-design.md)                                                                                                     |

## 1. Objetivo

Cada cliente tem um Brand Hub: a fonte única da sua marca, com estratégia, logótipos, tipografia, cores, fotografia e recursos para descarregar. A equipa constrói-o na sala, em páginas e blocos, escolhe o aspeto do hub e publica. Publicar guarda uma versão fixa, a única que o cliente vê no portal e descarrega. O cliente decisor aprova o hub publicado, o que mais tarde permite ligá-lo ao domínio do cliente (2F.2).

## 2. Decisões

1. **Divisão do 2F.** O M10 é dividido em dois ciclos:
   - **2F.1** (este): editor, publicação em instantâneo, Brand Hub no portal com downloads e aprovação.
   - **2F.2:** site publicado (H-03) num endereço da Aurion, domínio do cliente verificado por DNS (SEC-43), modos público, palavra-passe e restrito (RF-096, SEC-42), imagens sem metadados (SEC-33) e a regra da primeira publicação num domínio (RN-81).
   - O renderizador do hub é um componente puro, que recebe o instantâneo e um resolvedor de URLs de ficheiros, para o 2F.2 o reutilizar no site.
2. **Um hub por cliente.** `brand_hubs` tem uma linha por cliente, criada por "Criar Brand Hub". A criação gera as nove páginas padrão (01 Estratégia, 02 Galeria, 03 Logótipo, 04 Tipografia, 05 Cor, 06 Fotografia, 07 Layout, 08 Objetos de marca, 09 Recursos), cada uma com blocos de partida vazios.
3. **Estratégia (RF-092).** Não há estratégia de marca no OS desde o ADR 0007: o Core substituiu o mapa e a estratégia gerados no M03. A página Estratégia usa o bloco `strategy` com seis campos (história, missão, visão, valores, voz, posicionamento) que a equipa preenche. RF-092 fica adiado até existir uma estratégia de marca aprovada no OS.
4. **Páginas.** Tipo `standard` (uma das nove, com chave fixa) ou `custom`. Título editável (1–80), ordem, e `hidden` para não publicar. Só as páginas `custom` se removem. Até 30 páginas por hub.
5. **Blocos (RF-090).** Até 40 por página, com ordem e conteúdo validado por tipo:
   - `text`: título opcional (até 120) e corpo (até 5000), em parágrafos;
   - `strategy`: os seis campos, até 2000 cada;
   - `image`: um ficheiro de imagem e legenda (até 200);
   - `gallery`: até 24 imagens;
   - `logo`: um ficheiro, nome da variante (até 80) e fundo do mosaico (`light`, `dark`, `accent`);
   - `colors`: até 24 amostras com nome (até 40), hex `#RRGGBB` e notas (até 80, para CMYK ou Pantone);
   - `typeface`: família (até 80), pesos (até 10), texto de exemplo (até 200) e ficheiro de fonte opcional;
   - `downloads`: até 50 ficheiros com rótulo.
   - Um bloco só referencia ficheiros do próprio hub, ativos e prontos; os blocos de imagem só aceitam imagens.
6. **Design do hub (RF-091).**
   - Cores: superfície, painel, texto, texto secundário, acento e divisor, em hex.
   - Cantos: `soft` ou `square`.
   - Mosaicos de logótipo: `on` ou `off`. Ligado, os blocos `logo` mostram o fundo do mosaico.
   - Layout, um de quatro:
     - `sidebar`: barra lateral numerada, como no H-03;
     - `topbar`: navegação no topo;
     - `split`: texto à esquerda e exemplos à direita;
     - `compact`: uma coluna.
   - O editor avisa quando o texto e a superfície ficam abaixo do contraste AA. O aviso não impede guardar: é a marca do cliente.
7. **Ficheiros do hub (SEC-30, SEC-41).**
   - Tabela própria `brand_hub_assets`. Só estes ficheiros entram no hub.
   - Carregam-se direto ao bucket `library`, em `brand-hub/organização/cliente/ficheiro`.
   - Tipos aceites:
     - imagens: PNG, JPEG, WebP, GIF, SVG;
     - fontes: WOFF2, WOFF, OTF, TTF;
     - documentos e pacotes: PDF, ZIP.
   - Cada ficheiro é verificado pelo tipo real, com o máximo de 50 MB da Biblioteca. A quota de 900 MB da organização passa a contar os ficheiros do hub.
   - Até 300 ficheiros por hub.
   - Remover um ficheiro tira-o do rascunho (`removed_at`) e dos blocos. O varrimento horário só apaga o objeto do Storage quando a publicação atual já não o usa.
8. **Rascunho e publicação (RF-094, RN-80).**
   - Cada alteração bloqueia a linha do hub, incrementa `draft_revision` e grava `draft_updated_at`.
   - "Alterações por publicar" aparece quando a revisão do rascunho difere da revisão da última publicação.
   - Publicar grava uma linha em `brand_hub_publications` com um instantâneo imutável:
     - design;
     - páginas não ocultas, por ordem, com os blocos;
     - lista dos ficheiros usados, com caminho, nome, tipo e tamanho.
   - Publicar sem alterações por publicar é recusado. Não há reverter: publicar de novo é a única forma de mudar o que o cliente vê.
9. **Pré-visualizar.** Mostra o rascunho com o mesmo renderizador do portal. Os ficheiros são servidos à equipa por links de 15 minutos.
10. **Downloads (RF-093, RN-82, SEC-32).**
    - No portal, cada página publicada com ficheiros tem "Descarregar" (por exemplo "Descarregar pacote de logótipo"). A barra lateral tem "Descarregar todos os ativos".
    - Como na Biblioteca, o servidor devolve um manifesto com links de 15 minutos, apenas da publicação atual, e o navegador monta o ZIP.
    - Nomes padronizados: `<cliente>-<página>-<nome>`, normalizados com `safeZipSegment`. O ZIP de todos os ativos tem uma pasta por página e os ficheiros não usados em nenhuma página não entram.
    - O manual completo em PDF fica para o 2F.2.
11. **Aprovação (F6 passo 4, matriz "L A").**
    - A equipa pede ao decisor a aprovação da publicação atual. `approval_subject` ganha `brand_hub_publication`.
    - Pedir alterações exige comentário (RN-41) e cria a tarefa "Rever Brand Hub" ao gestor do cliente, com prazo de 2 dias.
    - Uma publicação nova retira o pedido pendente da anterior.
    - A aprovação aparece em P-02 no grupo Brand Hub e usa os avisos de aprovação existentes.
    - O hub guarda `approved_publication_id`, que o 2F.2 usa para a RN-81.
12. **Quem faz o quê (matriz do `08`).**
    - Equipa que escreve na sala: cria, edita, publica e pede aprovação.
    - Freelancer de um projeto do cliente: edita e pré-visualiza, mas não publica nem pede aprovação.
    - Financeiro: sem acesso.
    - Decisor: lê, descarrega e decide.
    - Operacional: lê e descarrega.
    - Cliente financeiro: sem acesso.
13. **Aviso.** Cada publicação envia `lead.brand_hub_published` ("o Brand Hub foi atualizado", com o link de P-08) ao decisor e aos operacionais, com as horas de silêncio do cliente (`07`).

## 3. Âmbito

### Incluído

1. **Sala › Brand Hub (C-08)** em `/c/:cliente/hub`:
   - sem hub, "Criar Brand Hub";
   - editor em três colunas:
     - navegação das páginas: adicionar página própria, renomear, ocultar, subir, descer e remover;
     - tela com os blocos: adicionar, editar, subir, descer e remover;
     - painel com os separadores Design e Ficheiros;
   - Editar e Pré-visualizar ao centro; Partilhar (copia o link do portal) e Publicar à direita;
   - estado "Alterações por publicar" e data da última publicação;
   - Pedir aprovação, e o estado da aprovação.
   - No telemóvel, as colunas passam a separadores.
2. **Portal › Brand Hub (P-08)** em `/portal/hub`:
   - a última publicação no layout e nas cores do hub, com "Brand Hub · Atualizado em";
   - downloads por página e de todos os ativos;
   - para o decisor com um pedido pendente, Aprovar e Pedir alterações.
3. **Entradas Brand Hub** no menu da sala e no menu do portal, e o grupo Brand Hub em P-02.
4. **Email** `lead.brand_hub_published`, e o assunto "Brand Hub" nos avisos de aprovação.
5. **Inngest:**
   - `brand-hub-published-notice`;
   - `brand-hub-asset-sweep`, que fecha os carregamentos abandonados e apaga do Storage os ficheiros removidos que a publicação atual já não usa.

### Excluído (registado em `docs/STATUS.md`)

| Item                                                        | Motivo                                                                    | Volta quando                                       |
| ----------------------------------------------------------- | ------------------------------------------------------------------------- | -------------------------------------------------- |
| Site publicado, domínio do cliente, modos de acesso, SEC-33 | Ciclo próprio, com alojamento e DNS                                       | 2F.2                                               |
| Manual completo em PDF (RF-093)                             | Exige gerar PDF a partir do hub                                           | 2F.2                                               |
| Estratégia aprovada a preencher o hub (RF-092, US-17)       | Não há estratégia de marca no OS desde o ADR 0007                         | Estratégia de marca no Core                        |
| Exportação do site como pacote estático                     | Depende do site do 2F.2                                                   | 2F.2 ou pedido real                                |
| Ferramentas próprias nas páginas (RF-090)                   | Sem caso concreto                                                         | Pedido real                                        |
| Reverter para uma publicação anterior                       | Publicar de novo cobre o caso                                             | Pedido real                                        |
| Edição simultânea por duas pessoas com fusão                | Cada alteração é atómica no servidor; a última gravação de um bloco ganha | Equipa com mais de uma pessoa a editar o mesmo hub |
| Páginas do hub rascunhadas pelo agente (RF-170)             | O servidor MCP é da Vaga 3                                                | Servidor MCP                                       |

## 4. Dados e acesso

| Tabela                   | Campos                                                                                                                                                                                          |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `brand_hubs`             | organização, cliente (único), `design` (jsonb), `draft_revision`, `draft_updated_at`, `published_publication_id`, `approved_publication_id`, criado por, timestamps                             |
| `brand_hub_pages`        | hub, organização, cliente, `kind` (`standard`, `custom`), `standard_key` (as nove chaves), título (1–80), `position`, `hidden`, timestamps                                                      |
| `brand_hub_blocks`       | página, hub, organização, cliente, `type` (os oito tipos), `position`, `content` (jsonb), timestamps                                                                                            |
| `brand_hub_assets`       | hub, organização, cliente, nome (nome seguro da Biblioteca), `mime_type`, `size_bytes`, `storage_path`, `upload_status` (`uploading`, `ready`, `rejected`), `removed_at`, criado por, criado em |
| `brand_hub_publications` | hub, organização, cliente, `number`, `revision`, `snapshot` (jsonb), publicado por, publicado em                                                                                                |

- FKs compostas com `client_id`; `unique (hub_id, standard_key)`; `unique (hub_id, number)`. Uma página `standard` tem `standard_key` e uma `custom` não.
- O conteúdo dos blocos e do design é validado no serviço por esquemas zod e nunca é confiado ao navegador.
- **RLS forçado; escrita só por serviços.**
  - A equipa que escreve na sala e o freelancer de um projeto do cliente leem pela política `app.can_edit_brand_hub`; o financeiro não lê.
  - O cliente lê só pelas vistas:
    - `portal_brand_hub_publications`: a publicação atual de cada hub, para o decisor e o operacional de um cliente ativo;
    - `portal_brand_hub_assets`: os ficheiros que constam dessa publicação.
  - O cliente nunca lê o rascunho.
- A quota (`fitsStorage`) passa a somar os ficheiros do hub que carregam, prontos ou removidos e ainda não apagados.

## 5. Testes

- **Unitários:**
  - esquemas dos blocos e do design (limites, hex, referências);
  - nomes padronizados dos downloads;
  - contraste do design;
  - componentes: renderizador nos quatro layouts e nos oito blocos, editor, painel de design, Ficheiros, ações por permissão, P-08 e o grupo Brand Hub em P-02.
- **Base de dados:**
  - criar o hub com as nove páginas, uma única vez por cliente;
  - páginas e blocos:
    - criar, editar, reordenar e remover;
    - limites;
    - um bloco que referencia um ficheiro de outro hub ou removido é recusado;
  - ficheiros:
    - verificados e recusados;
    - quota;
    - remover tira o ficheiro dos blocos;
    - o varrimento guarda os ficheiros da publicação atual;
  - publicar:
    - o instantâneo fica fixo depois de editar;
    - publicar sem alterações é recusado;
    - "Alterações por publicar";
    - o freelancer não publica;
  - manifesto de downloads só com a publicação atual;
  - aprovação:
    - pedir, aprovar e pedir alterações (comentário obrigatório, tarefa);
    - uma publicação nova retira o pedido;
  - aviso de publicação com as horas de silêncio;
  - RLS e vistas:
    - o cliente não lê o rascunho;
    - o cliente financeiro, o financeiro da equipa e o freelancer de outro cliente não têm acesso;
    - isolamento das cinco tabelas.
- **Ponta a ponta:**
  - a equipa cria o hub, preenche a estratégia, carrega um logótipo, muda o acento e publica;
  - o cliente vê o hub no portal, descarrega o pacote de logótipo e aprova;
  - axe no editor e em P-08.

## 6. Critérios de aceitação

1. O cliente só vê a última publicação. As alterações por publicar nunca lhe chegam.
2. Uma publicação nunca muda depois de feita, e os seus ficheiros continuam descarregáveis enquanto for a atual.
3. Os downloads só contêm ficheiros do hub que constam da publicação atual, com nomes padronizados.
4. O freelancer edita mas não publica. O financeiro e o cliente financeiro não veem o hub.
5. Os testes de ponta a ponta e o axe passam em CI e em staging.
