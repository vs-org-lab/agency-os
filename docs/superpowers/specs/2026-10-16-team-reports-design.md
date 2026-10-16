# Sub-projeto 3E.1 — Relatórios da equipa

| Campo                   | Valor                                                                                                   |
| ----------------------- | ------------------------------------------------------------------------------------------------------- |
| Data                    | 2026-10-16                                                                                              |
| Estado                  | Aprovado (luz verde permanente do fundador)                                                             |
| Vaga                    | 3 (… → 3D Saúde e marcos → **3E.1 Relatórios da equipa** → 3E.2 Relatórios do cliente e QBR → 3F)       |
| Módulos                 | M14 (RF-131, RF-132 em CSV), S-11, S-01 (lista de clientes), C-01 (tendência da saúde), M17 (histórico) |
| Documentação de produto | `01` (M14, M17), `02` (S-01, S-11), `08`                                                                |
| Depende de              | 1A Pipeline, 1D Faturação, 3B.1 Retainers, 3D Saúde e marcos, S-12 Equipa                               |

## 1. Objetivo

O fundador vê o negócio num só ecrã: receita por mês, receita recorrente dos retainers, negócios por código do pipeline, conversão entre etapas, carga da equipa e clientes em risco, com exportação em CSV. A saúde de cada cliente passa a ter histórico diário: tendência no C-01, nível na lista de clientes do Início, e aviso à equipa quando um cliente entra em risco. O Início ganha também a etiqueta de retainer.

## 2. Divisão do 3E

- **3E.1** (este): painéis da equipa (S-11), CSV, histórico da saúde e o que o 3B.1 e o 3D adiaram para o 3E.
- **3E.2:** relatório mensal por cliente e QBR trimestral com apresentação e PDF (RF-130, AUT-25), e o PDF dos painéis.

## 3. Decisões

1. **S-11 em `/reports`, só para fundadores.** Os painéis juntam dinheiro, pipeline e equipa, e a carga da equipa já é só dos fundadores (S-12). O menu do estúdio ganha "Relatórios" para fundadores.
2. **Ano em análise.** Um seletor de ano (o de Lisboa; por defeito o corrente) define o período da receita e da conversão. Receita recorrente, pipeline, carga e clientes em risco mostram o estado de hoje.
3. **Painéis:**
   - **Receita por mês:** soma dos pagamentos conciliados, pela data de receção, por mês e por moeda, com o total do ano. Sem conversão de moedas.
   - **Receita recorrente:** soma dos valores mensais dos retainers ativos que já começaram, por moeda, e o número de retainers.
   - **Negócios por código:** negócios por código atual do pipeline, agrupados pela etapa (pré-venda, Core, Orbit, Gravity, Constellation, fora do ciclo), com os vazios omitidos.
   - **Conversão entre etapas:** das quatro passagens (pré-venda → Core, Core → Orbit, Orbit → Gravity, Gravity → Constellation), os negócios que entraram na etapa de origem no ano e, desses, os que chegaram depois à etapa seguinte, com a percentagem. Entrar numa etapa é a primeira mudança para um código dessa etapa; a pré-venda conta a criação do negócio.
   - **Carga da equipa:** para cada membro ativo, as tarefas abertas desta semana, os projetos ativos e as horas semanais, como no S-12.
   - **Clientes em risco:** os clientes cujo nível mais recente é `at_risk`, com o score de hoje e o de há 30 dias.
4. **CSV (RF-132).** Cada painel exporta em `/api/reports/<painel>.csv?year=AAAA`, só para fundadores: UTF-8 com BOM, separador vírgula, valores com ponto decimal, cabeçalhos em PT-PT. O PDF dos painéis fica para o 3E.2, com o motor dos relatórios.
5. **Histórico da saúde.** Um varrimento diário às 07:30 de Lisboa grava, para cada cliente ativo, o score e o nível do dia (`client_health_snapshots`, um por cliente e por dia; repetir no mesmo dia substitui). O cálculo é o do 3D, sem depender de quem vê.
6. **Aviso de risco.** Quando o nível do dia é `at_risk` e o anterior registado não era, a equipa do cliente (fundadores e gestores atribuídos) recebe um email com o score e a ligação ao C-01. Um cliente que fica em risco vários dias seguidos avisa uma vez.
7. **Tendência no C-01.** O cartão de saúde mostra a diferença para o registo de há 30 dias, ou o mais antigo dos últimos 30 dias: "+5 nos últimos 30 dias", "−12 nos últimos 30 dias", "Sem variação", ou nada sem registos.
8. **Início (S-01).** Na lista de clientes:
   - a etiqueta "Retainer" para clientes com um retainer ativo;
   - o nível de saúde mais recente, só para quem vê a saúde (fundador, finanças e gestor atribuído), pelo RLS do histórico.
9. **Acesso ao histórico:** RLS de leitura para quem lê a sala e lê faturação; sem escrita para `authenticated`.

## 4. Âmbito

### Incluído

- **Dados:** `client_health_snapshots` com RLS.
- **Lógica:**
  - cálculo da saúde em contexto de sistema, partilhado com o 3D;
  - varrimento diário e aviso de risco;
  - leitores dos seis painéis e do CSV;
  - tendência da saúde e campos novos da lista do Início.
- **Automação:** `health-snapshots` (`TZ=Europe/Lisbon 30 7 * * *`) e `health-at-risk` (evento `health.client.at_risk`).
- **Ecrãs:** S-11, menu "Relatórios", tendência no C-01, etiqueta de retainer e nível de saúde no S-01.
- **E2E:** o fundador abre os Relatórios, vê a receita e os negócios por código e descarrega o CSV da receita; axe no S-11.

### Excluído (registado em `docs/STATUS.md`)

| Item                             | Motivo                                                    | Quando      |
| -------------------------------- | --------------------------------------------------------- | ----------- |
| Conversão de moedas nos totais   | Exige câmbios datados de uma fonte paga ou mantida à mão  | Pedido real |
| PDF dos painéis                  | O motor de PDF dos relatórios chega no 3E.2               | 3E.2        |
| Painéis para finanças e gestores | Juntam dados da equipa e do pipeline que só o fundador vê | Pedido real |
| Previsão de receita e metas      | Não está no RF-131                                        | Pedido real |

## 5. Testes

- **Unitários:** agrupamento por mês e moeda; conversão (entradas, passagens, percentagem, divisão por zero); tendência (subida, descida, sem variação, sem registos); CSV (BOM, aspas, vírgulas no texto); painéis e lista do Início.
- **Base de dados:**
  - receita conciliada por mês, só do ano e da organização;
  - receita recorrente só de retainers ativos já começados;
  - negócios por código e conversão com mudanças de etapa no ano;
  - carga da equipa igual à do S-12;
  - histórico: um registo por cliente e dia, substituído no mesmo dia; aviso só na entrada em risco;
  - RLS do histórico (freelancer e cliente nada);
  - S-11 e CSV só para fundadores.
- **E2E:** o percurso do âmbito.

## 6. Critérios de aceitação

1. O fundador vê no S-11 os seis painéis para o ano escolhido e exporta cada um em CSV.
2. Ninguém além dos fundadores abre o S-11 ou os CSV.
3. Cada cliente ativo tem um registo de saúde por dia, e a equipa é avisada uma vez quando ele entra em risco.
4. O Início mostra a etiqueta de retainer e, a quem vê a saúde, o nível de cada cliente.
