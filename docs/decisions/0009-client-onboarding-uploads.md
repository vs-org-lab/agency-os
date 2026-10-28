# 0009 — Onboarding do cliente e pré-visualização por papel

- **Data:** 2026-10-28
- **Estado:** Aceite

## Contexto

O onboarding adaptado ao briefing ([spec](../specs/2026-10-28-client-onboarding-design.md)) pede ao cliente ficheiros (identidade visual, vídeo, fotografia), respostas e acessos. Quem responde no início é normalmente o decisor. A matriz do separador 08, que prevalece em segurança, dá ao decisor só leitura da biblioteca. A escrita fica com o operacional, em pastas visíveis ao cliente.

A pré-visualização do portal ("Ver como cliente") lia sempre como decisor. A equipa precisa também de confirmar o que vê um operacional ou o financeiro do cliente.

## Decisão

1. Novo recurso na matriz, **"Onboarding do cliente"**:
   - fundador e gestor: L E (próprio). Leem as respostas e pedem de novo;
   - decisor e operacional: L E (própria). Respondem aos pedidos;
   - restantes papéis: sem acesso.
2. **Ficheiros do onboarding.**
   - O decisor escreve na biblioteca **só** na pasta raiz que recebe os ficheiros do onboarding (`library_folders.client_uploads`). O servidor cria-a, visível ao cliente, no projeto atual.
   - Cada ficheiro passa pela verificação de tipo e tamanho da biblioteca (SEC-30).
   - Nas outras pastas o decisor continua só a ler.
3. **As respostas do onboarding** (`client_onboarding_responses`) são escritas pelo serviço do onboarding depois de confirmar o membro da sala. Ninguém escreve na tabela diretamente.
4. **Nenhum pedido pede credenciais.** Os pedidos de acesso pedem que o cliente convide o email da agência.
5. **A pré-visualização** lê como o papel escolhido (`app.preview_role`: decisor, operacional ou financeiro). Continua só numa transação só de leitura e só para quem pode pré-visualizar (fundador e gestor atribuído, que também leem a faturação).

## Alternativas rejeitadas

- **Dar ao decisor escrita em toda a biblioteca:** alarga o acesso além do necessário para o onboarding.
- **Guardar os ficheiros do onboarding fora da biblioteca:** duplica o armazenamento, a verificação e as transferências, e a equipa teria de procurar os ficheiros noutro sítio.

## Consequências

- A matriz do separador 08 ganha a linha do onboarding, e a biblioteca anota a exceção do decisor.
- A pasta "Enviado pelo cliente" aparece ao cliente e à equipa na biblioteca do projeto, com os ficheiros enviados.
