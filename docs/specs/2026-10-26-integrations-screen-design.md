# UX-4 — Ecrã de integrações

Data: 2026-10-26 · Programa de redesenho da UI e UX · Estado: aprovado (autorização do fundador para o programa completo, 2026-10-26)

## Objetivo

Transformar "Integrações" num mapa claro do que o OS liga e do que pode vir a ligar, como na referência `Screenshot 2026-10-21 003030` (grupos, cartões com estado e um botão claro, lista de ligações ativas).

## Decisões

1. **Grupos** (cada um com título e uma linha a explicar quem é afetado):
   - **A sua conta** — Google Calendar (ligação OAuth existente, por utilizador): estado, conta ligada, "Ligar" / "Voltar a ligar" / "Desligar" (ações existentes, com MFA recente como hoje).
   - **Estúdio** — serviços configurados no servidor, só leitura: Pagamentos (Stripe), Email (SMTP), Transcrição (Groq), Leitura de recibos, Domínios do Brand Hub, Eventos (Inngest). Cada cartão mostra "Ativo", "Modo de teste" (fornecedor `fake`/`capture`) ou "Por configurar", e uma linha do que faz no OS. Nunca mostra chaves, URLs nem segredos; só o tipo de fornecedor.
   - **Ideias para ligar** — cartões sem ação, com o selo "Em breve" e uma frase do valor: IA por MCP (Claude e ChatGPT a lerem clientes, fases, tarefas e agenda com as permissões de quem liga), Slack (avisos da equipa), Google Drive e Dropbox (importar para a Biblioteca), Figma (provas a partir de frames). Nenhum botão falso.
2. **Ligações ativas** — lista no fim: serviço, conta, desde quando, "Desligar" quando se aplica (hoje só o Google Calendar).
3. **Visual**: cartões com ícone em mosaico (`lucide`, sem logótipos de marcas), ponto de estado com cor do token e texto (nunca só cor), botão principal sólido só em "Ligar"; grelha de 1 coluna em telemóvel, 2 em `md`, 3 em `lg`. `PageHeader` da UX-0.
4. **Acesso**: igual a hoje (só fundadores). O estado dos serviços do estúdio vem de uma função de servidor que lê os esquemas de ambiente já existentes e devolve só `{ key, status }`.

## Fora de âmbito

- Implementar MCP, Slack, Drive, Dropbox ou Figma.

## Testes

- Unidade: o estado dos serviços (`active` / `test` / `missing`) para combinações de ambiente, sem fugas de valores.
- Ecrã: três grupos e lista de ligações; "Em breve" sem botões; Google ligado mostra "Desligar".
- E2E: o teste das integrações (se existir) continua a passar; a11y sem violações sérias.

## Critérios de conclusão

- Ecrã novo, `STATUS.md` atualizado.
