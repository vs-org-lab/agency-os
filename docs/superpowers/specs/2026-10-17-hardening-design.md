# Endurecimento antes do primeiro cliente

| Campo     | Valor                                                                                     |
| --------- | ----------------------------------------------------------------------------------------- |
| Data      | 2026-10-17                                                                                |
| Estado    | Aprovado (luz verde permanente do fundador)                                               |
| Origem    | Triagem dos pontos menores "Antes do primeiro cliente" em `docs/STATUS.md` (cerca de 240) |
| Prevalece | `08 Segurança` em tudo o que é de segurança                                               |

## 1. Objetivo

Corrigir, antes de entrar um cliente real, os pontos adiados que lhe podem fazer dano: decisões tomadas pelo caminho errado, privilégios a mais, emails a quem já não deve receber, conteúdo errado no que o cliente vê e cabeçalhos em falta no site público. Os restantes pontos menores continuam no `STATUS.md`.

## 2. Critério da triagem

Entra o que um cliente real pode sentir ou o que abre uma porta: segurança e privilégios, dinheiro, emails a destinatários errados, dados errados no portal ou nos PDFs. Fica de fora o que é polimento, desempenho com volumes que ainda não existem, cobertura de testes e texto.

## 3. Correções

1. **Decisão genérica de aprovações (2D, ponto de 2F.1 e 3B.1).** A decisão e a retirada genéricas da sala só aceitam aprovações de `phase` e `project`. Hoje aceitam tudo menos `file_version`: um decisor podia aprovar um pedido extra do retainer sem cobrança, um documento sem mudar o seu estado ou uma publicação do Brand Hub, e o sistema tratava-os como fase. Cada sujeito tem o seu caminho próprio.
2. **Estado das propostas (1C).** `authenticated` deixa de poder alterar `status` e `sent_at` de `proposals`; um gestor atribuído podia marcar uma proposta como enviada ou aceite pela API, contra a regra de só o fundador enviar. Enviar e retirar passam a escrever em contexto de sistema depois da verificação do fundador.
3. **Cabeçalhos do site do Brand Hub (2F.2).** O site público responde com `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `Strict-Transport-Security`, `X-Frame-Options: DENY`, `Content-Security-Policy: frame-ancestors 'none'` e `Permissions-Policy` sem câmara, microfone nem localização.
4. **Email de tarefa atribuída (2C).** Só segue se o responsável ainda for membro ativo da organização; um membro removido não recebe o título da tarefa.
5. **Lembretes em projetos parados (2A).** Os lembretes de passos e aprovações não seguem para projetos pausados ou cancelados.
6. **Relatório do cliente com projetos cancelados (3E.2).** Passos, atualizações e aprovações de projetos cancelados não entram no relatório, como já não aparecem no portal.
7. **Plurais nas mensagens da saúde (3D).** "1 dia" e "1 hora", e menos de uma hora mostra "menos de 1 hora", em pt-PT e en.

## 4. Testes

Cada correção tem um teste que falha antes e passa depois (base de dados para 1, 2, 4, 5 e 6; unitário para 3 e 7), e a suíte completa fica verde.

## 5. Fora deste endurecimento

Os restantes pontos menores ficam no `STATUS.md` com a sua origem. Entre eles: pedido de pagamento sem IBAN na entidade (o cliente pode pagar por cartão), aviso ao cliente sem nova verificação depois das horas de silêncio (o email só leva a ligação), guardas do último fundador sem bloqueio de linha (corrida rara entre dois fundadores).
